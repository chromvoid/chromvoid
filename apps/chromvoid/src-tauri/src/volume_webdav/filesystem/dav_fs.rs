use std::io::Read;
use std::time::SystemTime;

use dav_server::davpath::DavPath;
use dav_server::fs::{
    DavDirEntry, DavFile, DavFileSystem, DavMetaData, FsError, FsFuture, FsStream, OpenOptions,
    ReadDirMeta,
};
use futures_util::stream;
use serde_json::json;

use chromvoid_core::rpc::types::NodeCreatedResponse;

use super::super::file::CatalogDavFile;
use super::super::metadata::{CatalogDirEntry, CatalogMeta};
use super::CatalogDavFs;

impl<R: tauri::Runtime> DavFileSystem for CatalogDavFs<R> {
    fn open<'a>(
        &'a self,
        path: &'a DavPath,
        options: OpenOptions,
    ) -> FsFuture<'a, Box<dyn DavFile>> {
        Box::pin(async move {
            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;

            if options.read {
                if full_path == "/" {
                    return Err(FsError::Forbidden);
                }
                let (node_id, is_dir, size_opt, updated_at) = self.resolve_path(&full_path)?;
                if is_dir {
                    return Err(FsError::Forbidden);
                }
                let size = size_opt.unwrap_or(0);

                let reader = {
                    let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
                    let req = chromvoid_core::rpc::types::RpcRequest::new(
                        "catalog:download".to_string(),
                        json!({"node_id": node_id}),
                    );
                    match adapter.handle_with_stream(&req, None) {
                        chromvoid_core::rpc::RpcReply::Stream(out) => out.reader,
                        chromvoid_core::rpc::RpcReply::Json(_) => {
                            return Err(FsError::GeneralFailure)
                        }
                    }
                };

                let bytes = tokio::task::spawn_blocking(move || {
                    let mut reader = reader;
                    let mut buf = Vec::new();
                    reader
                        .read_to_end(&mut buf)
                        .map_err(|_| FsError::GeneralFailure)?;
                    Ok::<_, FsError>(buf)
                })
                .await
                .map_err(|_| FsError::GeneralFailure)??;

                let meta = CatalogMeta {
                    len: size,
                    is_dir: false,
                    modified: Self::ms_to_system_time(updated_at),
                };
                return Ok(Box::new(CatalogDavFile::<R>::new_read(bytes, meta)) as Box<dyn DavFile>);
            }

            // Write mode
            if options.write {
                if full_path == "/" {
                    return Err(FsError::Forbidden);
                }

                let (parent_path, name) = Self::parent_and_name(&full_path)?;
                let staging_path = Self::create_staging_file(&self.app)?;

                // Load existing content into staging when not truncating.
                let mut initial_len = 0u64;
                let mut existed = false;
                if !options.truncate {
                    if let Ok((node_id, is_dir, _size_opt, _updated_at)) =
                        self.resolve_path(&full_path)
                    {
                        if !is_dir {
                            existed = true;
                            let reader = {
                                let mut adapter =
                                    self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
                                let req = chromvoid_core::rpc::types::RpcRequest::new(
                                    "catalog:download".to_string(),
                                    json!({"node_id": node_id}),
                                );
                                match adapter.handle_with_stream(&req, None) {
                                    chromvoid_core::rpc::RpcReply::Stream(out) => Some(out.reader),
                                    _ => None,
                                }
                            };

                            if let Some(reader) = reader {
                                let staging_path = staging_path.clone();
                                initial_len = tokio::task::spawn_blocking(move || {
                                    let mut reader = reader;
                                    let mut out = std::fs::OpenOptions::new()
                                        .write(true)
                                        .truncate(true)
                                        .open(&staging_path)
                                        .map_err(|_| FsError::GeneralFailure)?;
                                    std::io::copy(&mut reader, &mut out)
                                        .map_err(|_| FsError::GeneralFailure)
                                })
                                .await
                                .map_err(|_| FsError::GeneralFailure)??;
                            }
                        }
                    }
                }

                if options.truncate {
                    std::fs::OpenOptions::new()
                        .write(true)
                        .truncate(true)
                        .open(&staging_path)
                        .map_err(|_| FsError::GeneralFailure)?;
                    initial_len = 0;
                }

                let mut file = CatalogDavFile::new_write(
                    self.app.clone(),
                    self.adapter.clone(),
                    parent_path,
                    name,
                    staging_path,
                    initial_len,
                    options.truncate || !existed,
                );
                if options.append {
                    file.cursor = file.meta.len;
                }

                return Ok(Box::new(file) as Box<dyn DavFile>);
            }

            Err(FsError::Forbidden)
        })
    }

    fn read_dir<'a>(
        &'a self,
        path: &'a DavPath,
        _meta: ReadDirMeta,
    ) -> FsFuture<'a, FsStream<Box<dyn DavDirEntry>>> {
        Box::pin(async move {
            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            let list_path = if full_path == "/" {
                "/".to_string()
            } else {
                full_path.clone()
            };
            let path_val = if list_path == "/" {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(list_path)
            };

            let res = {
                let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
                let value = Self::rpc_json(
                    adapter.as_mut(),
                    "catalog:list",
                    json!({"path": path_val, "include_hidden": null}),
                )?;
                serde_json::from_value::<chromvoid_core::rpc::types::CatalogListResponse>(value)
                    .map_err(|_| FsError::GeneralFailure)?
            };

            let entries: Vec<dav_server::fs::FsResult<Box<dyn DavDirEntry>>> = res
                .items
                .into_iter()
                .map(|it| {
                    let meta = CatalogMeta {
                        len: it.size.unwrap_or(0),
                        is_dir: it.is_dir,
                        modified: Self::ms_to_system_time(it.updated_at),
                    };
                    Ok(Box::new(CatalogDirEntry {
                        name: it.name.into_bytes(),
                        meta,
                    }) as Box<dyn DavDirEntry>)
                })
                .collect();

            let s: FsStream<Box<dyn DavDirEntry>> = Box::pin(stream::iter(entries));
            Ok(s)
        })
    }

    fn metadata<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, Box<dyn DavMetaData>> {
        Box::pin(async move {
            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            if full_path == "/" {
                return Ok(Box::new(CatalogMeta {
                    len: 0,
                    is_dir: true,
                    modified: SystemTime::now(),
                }) as Box<dyn DavMetaData>);
            }
            let (_node_id, is_dir, size_opt, updated_at) = self.resolve_path(&full_path)?;
            Ok(Box::new(CatalogMeta {
                len: size_opt.unwrap_or(0),
                is_dir,
                modified: Self::ms_to_system_time(updated_at),
            }) as Box<dyn DavMetaData>)
        })
    }

    fn create_dir<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let _guard = self
                .write_lock
                .lock()
                .map_err(|_| FsError::GeneralFailure)?;

            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            let (parent_path, name) = Self::parent_and_name(&full_path)?;
            let parent_val = if parent_path == "/" {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(parent_path)
            };

            let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
            let value = Self::rpc_json(
                adapter.as_mut(),
                "catalog:createDir",
                json!({"name": name, "parent_path": parent_val}),
            )?;
            let _ = serde_json::from_value::<NodeCreatedResponse>(value)
                .map_err(|_| FsError::GeneralFailure)?;
            let _ = adapter.save();
            Ok(())
        })
    }

    fn remove_dir<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let _guard = self
                .write_lock
                .lock()
                .map_err(|_| FsError::GeneralFailure)?;

            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            let (node_id, is_dir, _size_opt, _updated_at) = self.resolve_path(&full_path)?;
            if !is_dir {
                return Err(FsError::Forbidden);
            }

            let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
            let _ = Self::rpc_json(
                adapter.as_mut(),
                "catalog:delete",
                json!({"node_id": node_id}),
            )?;
            let _ = adapter.save();
            Ok(())
        })
    }

    fn remove_file<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let _guard = self
                .write_lock
                .lock()
                .map_err(|_| FsError::GeneralFailure)?;

            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            let (node_id, is_dir, _size_opt, _updated_at) = self.resolve_path(&full_path)?;
            if is_dir {
                return Err(FsError::Forbidden);
            }

            let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
            let _ = Self::rpc_json(
                adapter.as_mut(),
                "catalog:delete",
                json!({"node_id": node_id}),
            )?;
            let _ = adapter.save();
            Ok(())
        })
    }

    fn rename<'a>(&'a self, from: &'a DavPath, to: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let _guard = self
                .write_lock
                .lock()
                .map_err(|_| FsError::GeneralFailure)?;

            let from_path = Self::dav_to_catalog_path(from)?;
            let to_path = Self::dav_to_catalog_path(to)?;
            Self::guard_system_path(&from_path)?;
            Self::guard_system_path(&to_path)?;

            let (node_id, is_dir, _size_opt, _updated_at) = self.resolve_path(&from_path)?;

            let (to_parent, to_name) = Self::parent_and_name(&to_path)?;

            // Check destination existence for file/dir overwrite semantics.
            if let Ok((_to_id, to_is_dir, _to_size, _to_updated)) = self.resolve_path(&to_path) {
                if to_is_dir {
                    return Err(FsError::Exists);
                }
                if is_dir {
                    return Err(FsError::Exists);
                }
                // Destination is a file; we'll delete it and proceed.
                let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
                let _ = Self::rpc_json(
                    adapter.as_mut(),
                    "catalog:delete",
                    json!({"node_id": _to_id}),
                )?;
                let _ = adapter.save();
            }

            // Move to new parent first.
            {
                let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
                let _ = Self::rpc_json(
                    adapter.as_mut(),
                    "catalog:move",
                    json!({"node_id": node_id, "new_parent_path": to_parent, "new_name": null}),
                )?;
                let _ = adapter.save();
            }

            // Then rename if name differs.
            if let Ok((_moved_id, _is_dir2, _s2, _u2)) = self.resolve_path(&to_path) {
                // Path already matches; nothing else.
                return Ok(());
            }

            if !to_name.is_empty() {
                let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
                let _ = Self::rpc_json(
                    adapter.as_mut(),
                    "catalog:rename",
                    json!({"node_id": node_id, "new_name": to_name}),
                )?;
                let _ = adapter.save();
            }

            Ok(())
        })
    }
}
