use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use dav_server::davpath::DavPath;
use dav_server::fs::{
    DavDirEntry, DavFile, DavFileSystem, DavMetaData, FsError, FsFuture, FsResult, FsStream,
    OpenOptions, ReadDirMeta,
};
use futures_util::stream;
use serde_json::json;

use chromvoid_core::rpc::types::{CatalogListResponse, NodeCreatedResponse};
use chromvoid_core::rpc::{RpcReply, RpcRequest};

use crate::core_adapter::CoreAdapter;

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
                let (node_id, is_dir, size_opt, updated_at) =
                    self.resolve_path_for_request(full_path.clone()).await?;
                if is_dir {
                    return Err(FsError::Forbidden);
                }
                let size = size_opt.unwrap_or(0);

                let adapter = self.adapter.clone();
                let request_io_runtime = self.request_io_runtime.clone();
                let bytes = request_io_runtime
                    .spawn_blocking(move || download_node_to_bytes(adapter, node_id))
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
                let app = self.app.clone();
                let request_io_runtime = self.request_io_runtime.clone();
                let staging_path = request_io_runtime
                    .spawn_blocking(move || Self::create_staging_file(&app))
                    .await
                    .map_err(|_| FsError::GeneralFailure)??;

                // Load existing content into staging when not truncating.
                let mut initial_len = 0u64;
                let mut existed = false;
                if !options.truncate {
                    if let Ok((node_id, is_dir, _size_opt, _updated_at)) =
                        self.resolve_path_for_request(full_path.clone()).await
                    {
                        if !is_dir {
                            existed = true;
                            let adapter = self.adapter.clone();
                            let staging_path = staging_path.clone();
                            let request_io_runtime = self.request_io_runtime.clone();
                            if let Some(copied) = request_io_runtime
                                .spawn_blocking(move || {
                                    download_node_to_staging(adapter, node_id, staging_path)
                                })
                                .await
                                .map_err(|_| FsError::GeneralFailure)??
                            {
                                initial_len = copied;
                            }
                        }
                    }
                }

                if options.truncate {
                    let staging_path_for_truncate = staging_path.clone();
                    let request_io_runtime = self.request_io_runtime.clone();
                    request_io_runtime
                        .spawn_blocking(move || {
                            std::fs::OpenOptions::new()
                                .write(true)
                                .truncate(true)
                                .open(&staging_path_for_truncate)
                                .map(|_| ())
                                .map_err(|_| FsError::GeneralFailure)
                        })
                        .await
                        .map_err(|_| FsError::GeneralFailure)??;
                    initial_len = 0;
                }

                let mut file = CatalogDavFile::new_write(
                    self.app.clone(),
                    self.adapter.clone(),
                    self.request_io_runtime.clone(),
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
            let adapter = self.adapter.clone();
            let request_io_runtime = self.request_io_runtime.clone();
            let res = request_io_runtime
                .spawn_blocking(move || list_catalog_dir::<R>(adapter, list_path))
                .await
                .map_err(|_| FsError::GeneralFailure)??;

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
            let (_node_id, is_dir, size_opt, updated_at) =
                self.resolve_path_for_request(full_path).await?;
            Ok(Box::new(CatalogMeta {
                len: size_opt.unwrap_or(0),
                is_dir,
                modified: Self::ms_to_system_time(updated_at),
            }) as Box<dyn DavMetaData>)
        })
    }

    fn create_dir<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            let (parent_path, name) = Self::parent_and_name(&full_path)?;
            let adapter = self.adapter.clone();
            let write_lock = self.write_lock.clone();
            let request_io_runtime = self.request_io_runtime.clone();
            request_io_runtime
                .spawn_blocking(move || {
                    create_catalog_dir::<R>(adapter, write_lock, parent_path, name)
                })
                .await
                .map_err(|_| FsError::GeneralFailure)?
        })
    }

    fn remove_dir<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            let adapter = self.adapter.clone();
            let write_lock = self.write_lock.clone();
            let request_io_runtime = self.request_io_runtime.clone();
            request_io_runtime
                .spawn_blocking(move || {
                    delete_catalog_path::<R>(adapter, write_lock, full_path, true)
                })
                .await
                .map_err(|_| FsError::GeneralFailure)?
        })
    }

    fn remove_file<'a>(&'a self, path: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let full_path = Self::dav_to_catalog_path(path)?;
            Self::guard_system_path(&full_path)?;
            let adapter = self.adapter.clone();
            let write_lock = self.write_lock.clone();
            let request_io_runtime = self.request_io_runtime.clone();
            request_io_runtime
                .spawn_blocking(move || {
                    delete_catalog_path::<R>(adapter, write_lock, full_path, false)
                })
                .await
                .map_err(|_| FsError::GeneralFailure)?
        })
    }

    fn rename<'a>(&'a self, from: &'a DavPath, to: &'a DavPath) -> FsFuture<'a, ()> {
        Box::pin(async move {
            let from_path = Self::dav_to_catalog_path(from)?;
            let to_path = Self::dav_to_catalog_path(to)?;
            Self::guard_system_path(&from_path)?;
            Self::guard_system_path(&to_path)?;

            let adapter = self.adapter.clone();
            let write_lock = self.write_lock.clone();
            let request_io_runtime = self.request_io_runtime.clone();
            request_io_runtime
                .spawn_blocking(move || {
                    rename_catalog_path::<R>(adapter, write_lock, from_path, to_path)
                })
                .await
                .map_err(|_| FsError::GeneralFailure)?
        })
    }
}

fn list_catalog_dir<R: tauri::Runtime>(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    list_path: String,
) -> FsResult<CatalogListResponse> {
    let path_val = if list_path == "/" {
        serde_json::Value::Null
    } else {
        serde_json::Value::String(list_path)
    };
    let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
    let value = CatalogDavFs::<R>::rpc_json(
        adapter.as_mut(),
        "catalog:list",
        json!({"path": path_val, "include_hidden": null}),
    )?;
    serde_json::from_value::<CatalogListResponse>(value).map_err(|_| FsError::GeneralFailure)
}

fn create_catalog_dir<R: tauri::Runtime>(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    write_lock: Arc<Mutex<()>>,
    parent_path: String,
    name: String,
) -> FsResult<()> {
    let _guard = write_lock.lock().map_err(|_| FsError::GeneralFailure)?;
    let parent_val = if parent_path == "/" {
        serde_json::Value::Null
    } else {
        serde_json::Value::String(parent_path)
    };

    let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
    let value = CatalogDavFs::<R>::rpc_json(
        adapter.as_mut(),
        "catalog:createDir",
        json!({"name": name, "parent_path": parent_val}),
    )?;
    let _ = serde_json::from_value::<NodeCreatedResponse>(value)
        .map_err(|_| FsError::GeneralFailure)?;
    let _ = adapter.save();
    Ok(())
}

fn delete_catalog_path<R: tauri::Runtime>(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    write_lock: Arc<Mutex<()>>,
    full_path: String,
    expect_dir: bool,
) -> FsResult<()> {
    let _guard = write_lock.lock().map_err(|_| FsError::GeneralFailure)?;
    let (node_id, is_dir, _size_opt, _updated_at) =
        CatalogDavFs::<R>::resolve_path_with_adapter(adapter.clone(), &full_path)?;
    if is_dir != expect_dir {
        return Err(FsError::Forbidden);
    }

    let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
    let _ = CatalogDavFs::<R>::rpc_json(
        adapter.as_mut(),
        "catalog:delete",
        json!({"node_id": node_id}),
    )?;
    let _ = adapter.save();
    Ok(())
}

fn rename_catalog_path<R: tauri::Runtime>(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    write_lock: Arc<Mutex<()>>,
    from_path: String,
    to_path: String,
) -> FsResult<()> {
    let _guard = write_lock.lock().map_err(|_| FsError::GeneralFailure)?;
    let (node_id, is_dir, _size_opt, _updated_at) =
        CatalogDavFs::<R>::resolve_path_with_adapter(adapter.clone(), &from_path)?;
    let (to_parent, to_name) = CatalogDavFs::<R>::parent_and_name(&to_path)?;

    // Check destination existence for file/dir overwrite semantics.
    if let Ok((_to_id, to_is_dir, _to_size, _to_updated)) =
        CatalogDavFs::<R>::resolve_path_with_adapter(adapter.clone(), &to_path)
    {
        if to_is_dir || is_dir {
            return Err(FsError::Exists);
        }
        // Destination is a file; we'll delete it and proceed.
        let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
        let _ = CatalogDavFs::<R>::rpc_json(
            adapter.as_mut(),
            "catalog:delete",
            json!({"node_id": _to_id}),
        )?;
        let _ = adapter.save();
    }

    // Move to new parent first.
    {
        let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
        let _ = CatalogDavFs::<R>::rpc_json(
            adapter.as_mut(),
            "catalog:move",
            json!({"node_id": node_id, "new_parent_path": to_parent, "new_name": null}),
        )?;
        let _ = adapter.save();
    }

    // Then rename if name differs.
    if let Ok((_moved_id, _is_dir2, _s2, _u2)) =
        CatalogDavFs::<R>::resolve_path_with_adapter(adapter.clone(), &to_path)
    {
        // Path already matches; nothing else.
        return Ok(());
    }

    if !to_name.is_empty() {
        let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
        let _ = CatalogDavFs::<R>::rpc_json(
            adapter.as_mut(),
            "catalog:rename",
            json!({"node_id": node_id, "new_name": to_name}),
        )?;
        let _ = adapter.save();
    }

    Ok(())
}

fn download_node_to_bytes(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    node_id: u64,
) -> Result<Vec<u8>, FsError> {
    let mut reader = {
        let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
        let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": node_id}));
        match adapter.handle_with_stream(&req, None) {
            RpcReply::Stream(out) => out.reader,
            RpcReply::Json(_) | RpcReply::RangeStream(_) => return Err(FsError::GeneralFailure),
        }
    };

    let mut buf = Vec::new();
    reader
        .read_to_end(&mut buf)
        .map_err(|_| FsError::GeneralFailure)?;
    Ok(buf)
}

fn download_node_to_staging(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    node_id: u64,
    staging_path: PathBuf,
) -> Result<Option<u64>, FsError> {
    let mut reader = {
        let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
        let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": node_id}));
        match adapter.handle_with_stream(&req, None) {
            RpcReply::Stream(out) => out.reader,
            _ => return Ok(None),
        }
    };

    let mut out = std::fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(&staging_path)
        .map_err(|_| FsError::GeneralFailure)?;
    std::io::copy(&mut reader, &mut out)
        .map(Some)
        .map_err(|_| FsError::GeneralFailure)
}
