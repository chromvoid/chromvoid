use std::io;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use bytes::{Buf, Bytes};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcInputStream;
use serde_json::json;

use dav_server::fs::{DavFile, DavMetaData, FsError, FsFuture};

use crate::core_adapter::CoreAdapter;

use super::metadata::CatalogMeta;
use super::request_io::WebDavRequestIoRuntimeState;
use super::UPLOAD_PART_BYTES;

fn upload_node_id_from_value(value: &serde_json::Value) -> Option<u64> {
    value
        .get("node_id")
        .and_then(serde_json::Value::as_u64)
        .or_else(|| value.get("nodeId").and_then(serde_json::Value::as_u64))
}

pub(super) struct CatalogDavFile<R: tauri::Runtime> {
    mode: CatalogDavFileMode<R>,
    pub(super) cursor: u64,
    pub(super) meta: CatalogMeta,
    dirty: bool,
}

enum CatalogDavFileMode<R: tauri::Runtime> {
    Read {
        buf: Vec<u8>,
    },
    Write {
        app: tauri::AppHandle<R>,
        adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
        request_io_runtime: Arc<WebDavRequestIoRuntimeState>,
        parent_path: String,
        name: String,
        staging_path: PathBuf,
    },
}

impl<R: tauri::Runtime> std::fmt::Debug for CatalogDavFileMode<R> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Read { .. } => f
                .debug_struct("CatalogDavFileMode")
                .field("mode", &"Read")
                .finish(),
            Self::Write {
                parent_path,
                name,
                staging_path,
                ..
            } => f
                .debug_struct("CatalogDavFileMode")
                .field("mode", &"Write")
                .field("parent_path", parent_path)
                .field("name", name)
                .field("staging_path", staging_path)
                .finish(),
        }
    }
}

impl<R: tauri::Runtime> std::fmt::Debug for CatalogDavFile<R> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let len = match &self.mode {
            CatalogDavFileMode::Read { buf } => buf.len() as u64,
            CatalogDavFileMode::Write { .. } => self.meta.len,
        };
        f.debug_struct("CatalogDavFile")
            .field("mode", &self.mode)
            .field("cursor", &self.cursor)
            .field("len", &len)
            .field("dirty", &self.dirty)
            .finish()
    }
}

impl<R: tauri::Runtime> CatalogDavFile<R> {
    pub(super) fn new_read(bytes: Vec<u8>, meta: CatalogMeta) -> Self {
        Self {
            mode: CatalogDavFileMode::Read { buf: bytes },
            cursor: 0,
            meta,
            dirty: false,
        }
    }

    pub(super) fn new_write(
        app: tauri::AppHandle<R>,
        adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
        request_io_runtime: Arc<WebDavRequestIoRuntimeState>,
        parent_path: String,
        name: String,
        staging_path: PathBuf,
        initial_len: u64,
        dirty: bool,
    ) -> Self {
        let meta = CatalogMeta {
            len: initial_len,
            is_dir: false,
            modified: SystemTime::now(),
        };
        Self {
            mode: CatalogDavFileMode::Write {
                app,
                adapter,
                request_io_runtime,
                parent_path,
                name,
                staging_path,
            },
            cursor: 0,
            meta,
            dirty,
        }
    }
}

impl<R: tauri::Runtime> Drop for CatalogDavFile<R> {
    fn drop(&mut self) {
        if let CatalogDavFileMode::Write { staging_path, .. } = &self.mode {
            let _ = std::fs::remove_file(staging_path);
        }
    }
}

impl<R: tauri::Runtime> DavFile for CatalogDavFile<R> {
    fn metadata(&'_ mut self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        let mut meta = self.meta.clone();
        if let CatalogDavFileMode::Read { buf } = &self.mode {
            meta.len = buf.len() as u64;
        } else {
            meta.len = self.meta.len;
        }
        Box::pin(async move { Ok(Box::new(meta) as Box<dyn DavMetaData>) })
    }

    fn write_buf(&'_ mut self, mut buf: Box<dyn Buf + Send>) -> FsFuture<'_, ()> {
        Box::pin(async move {
            let len = buf.remaining();
            let mut tmp = vec![0u8; len];
            buf.copy_to_slice(&mut tmp);
            self.write_bytes(Bytes::from(tmp)).await
        })
    }

    fn write_bytes(&'_ mut self, buf: Bytes) -> FsFuture<'_, ()> {
        Box::pin(async move {
            let (staging_path, request_io_runtime) = match &self.mode {
                CatalogDavFileMode::Read { .. } => return Err(FsError::Forbidden),
                CatalogDavFileMode::Write {
                    staging_path,
                    request_io_runtime,
                    ..
                } => (staging_path.clone(), request_io_runtime.clone()),
            };

            let cursor = self.cursor;
            let len = buf.len();
            request_io_runtime
                .spawn_blocking(move || {
                    let mut file = std::fs::OpenOptions::new()
                        .read(true)
                        .write(true)
                        .open(staging_path)
                        .map_err(|_| FsError::GeneralFailure)?;
                    file.seek(SeekFrom::Start(cursor))
                        .map_err(|_| FsError::GeneralFailure)?;
                    file.write_all(&buf).map_err(|_| FsError::GeneralFailure)
                })
                .await
                .map_err(|_| FsError::GeneralFailure)??;

            self.cursor = self.cursor.saturating_add(len as u64);
            if self.cursor > self.meta.len {
                self.meta.len = self.cursor;
            }
            self.meta.modified = SystemTime::now();
            self.dirty = true;
            Ok(())
        })
    }

    fn read_bytes(&'_ mut self, count: usize) -> FsFuture<'_, Bytes> {
        Box::pin(async move {
            match &self.mode {
                CatalogDavFileMode::Read { buf } => {
                    let start = self.cursor as usize;
                    let end = std::cmp::min(start.saturating_add(count), buf.len());
                    let out = Bytes::copy_from_slice(&buf[start..end]);
                    self.cursor = end as u64;
                    Ok(out)
                }
                CatalogDavFileMode::Write {
                    staging_path,
                    request_io_runtime,
                    ..
                } => {
                    let staging_path = staging_path.clone();
                    let request_io_runtime = request_io_runtime.clone();
                    let cursor = self.cursor;
                    let bytes = request_io_runtime
                        .spawn_blocking(move || {
                            let mut file = std::fs::File::open(staging_path)
                                .map_err(|_| FsError::GeneralFailure)?;
                            file.seek(SeekFrom::Start(cursor))
                                .map_err(|_| FsError::GeneralFailure)?;
                            let mut tmp = vec![0u8; count];
                            let n = file.read(&mut tmp).map_err(|_| FsError::GeneralFailure)?;
                            tmp.truncate(n);
                            Ok::<_, FsError>(Bytes::from(tmp))
                        })
                        .await
                        .map_err(|_| FsError::GeneralFailure)??;
                    self.cursor = self.cursor.saturating_add(bytes.len() as u64);
                    Ok(bytes)
                }
            }
        })
    }

    fn seek(&'_ mut self, pos: io::SeekFrom) -> FsFuture<'_, u64> {
        Box::pin(async move {
            let len = match &self.mode {
                CatalogDavFileMode::Read { buf } => buf.len() as i128,
                CatalogDavFileMode::Write { .. } => self.meta.len as i128,
            };
            let next: i128 = match pos {
                io::SeekFrom::Start(n) => n as i128,
                io::SeekFrom::End(n) => len + n as i128,
                io::SeekFrom::Current(n) => self.cursor as i128 + n as i128,
            };
            if next < 0 {
                return Err(FsError::Forbidden);
            }
            self.cursor = next as u64;
            Ok(self.cursor)
        })
    }

    fn flush(&'_ mut self) -> FsFuture<'_, ()> {
        Box::pin(async move {
            let (app, adapter, request_io_runtime, parent_path, name, staging_path) =
                match &self.mode {
                    CatalogDavFileMode::Read { .. } => return Ok(()),
                    CatalogDavFileMode::Write {
                        app,
                        adapter,
                        request_io_runtime,
                        parent_path,
                        name,
                        staging_path,
                    } => (
                        app.clone(),
                        adapter.clone(),
                        request_io_runtime.clone(),
                        parent_path.clone(),
                        name.clone(),
                        staging_path.clone(),
                    ),
                };

            if !self.dirty {
                return Ok(());
            }

            let size = self.meta.len;
            request_io_runtime
                .spawn_blocking(move || {
                    flush_staged_upload(app, adapter, parent_path, name, staging_path, size)
                })
                .await
                .map_err(|_| FsError::GeneralFailure)??;
            self.dirty = false;
            Ok(())
        })
    }
}

fn flush_staged_upload<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    parent_path: String,
    name: String,
    staging_path: PathBuf,
    size: u64,
) -> Result<(), FsError> {
    let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;

    let mut node_id: Option<u64> = None;

    if size == 0 {
        let req = RpcRequest::new(
            "catalog:upload".to_string(),
            json!({
                "parent_path": if parent_path == "/" { "/" } else { parent_path.as_str() },
                "name": name,
                "total_size": 0,
                "mime_type": null,
                "chunk_size": null,
                "size": 0,
                "offset": 0,
            }),
        );
        match adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(Vec::new()))) {
            chromvoid_core::rpc::RpcReply::Json(RpcResponse::Success { result, .. }) => {
                node_id = upload_node_id_from_value(&result);
                if node_id.is_none() {
                    return Err(FsError::GeneralFailure);
                }
            }
            _ => return Err(FsError::GeneralFailure),
        }
    } else {
        let mut offset = 0u64;
        while offset < size {
            let part = std::cmp::min(UPLOAD_PART_BYTES, size - offset);

            let mut file =
                std::fs::File::open(&staging_path).map_err(|_| FsError::GeneralFailure)?;
            file.seek(SeekFrom::Start(offset))
                .map_err(|_| FsError::GeneralFailure)?;
            let reader = file.take(part);

            let req = RpcRequest::new(
                "catalog:upload".to_string(),
                match node_id {
                    Some(node_id) => json!({"node_id": node_id, "size": part, "offset": offset}),
                    None => json!({
                        "parent_path": if parent_path == "/" { "/" } else { parent_path.as_str() },
                        "name": name,
                        "total_size": size,
                        "mime_type": null,
                        "chunk_size": null,
                        "size": part,
                        "offset": offset,
                    }),
                },
            );

            match adapter.handle_with_stream(&req, Some(RpcInputStream::new(Box::new(reader)))) {
                chromvoid_core::rpc::RpcReply::Json(RpcResponse::Success { result, .. }) => {
                    if node_id.is_none() {
                        node_id = upload_node_id_from_value(&result);
                        if node_id.is_none() {
                            return Err(FsError::GeneralFailure);
                        }
                    }
                    offset = offset.saturating_add(part);
                }
                _ => return Err(FsError::GeneralFailure),
            }
        }
    }

    let _ = adapter.save();
    // Emit catalog events to webview (best-effort).
    crate::helpers::flush_core_events(&app, adapter.as_mut());
    Ok(())
}
