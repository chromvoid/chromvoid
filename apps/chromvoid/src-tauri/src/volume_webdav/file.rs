use std::io;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use bytes::{Buf, Bytes};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::json;

use dav_server::fs::{DavFile, DavMetaData, FsError, FsFuture};

use crate::core_adapter::CoreAdapter;

use super::metadata::CatalogMeta;
use super::request_io::WebDavRequestIoRuntimeState;
use super::UPLOAD_PART_BYTES;

struct CatalogDavReadState {
    reader: Option<Box<dyn Read + Send>>,
    pos: u64,
}

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
        adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
        request_io_runtime: Arc<WebDavRequestIoRuntimeState>,
        node_id: u64,
        reader_state: Mutex<CatalogDavReadState>,
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
            CatalogDavFileMode::Read { .. } => self.meta.len,
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
    pub(super) fn new_read(
        adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
        request_io_runtime: Arc<WebDavRequestIoRuntimeState>,
        node_id: u64,
        meta: CatalogMeta,
    ) -> Self {
        Self {
            mode: CatalogDavFileMode::Read {
                adapter,
                request_io_runtime,
                node_id,
                reader_state: Mutex::new(CatalogDavReadState {
                    reader: None,
                    pos: 0,
                }),
            },
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
        meta.len = self.meta.len;
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
                CatalogDavFileMode::Read {
                    adapter,
                    request_io_runtime,
                    node_id,
                    reader_state,
                } => {
                    if self.cursor >= self.meta.len {
                        return Ok(Bytes::new());
                    }
                    let adapter = adapter.clone();
                    let target_pos = self.cursor;
                    let (current_pos, mut active_reader) = {
                        let mut state = reader_state.lock().map_err(|_| FsError::GeneralFailure)?;
                        (state.pos, state.reader.take())
                    };
                    let node_id = *node_id;
                    let (next_reader, next_pos, bytes) = request_io_runtime
                        .spawn_blocking(move || {
                            let (mut reader, mut pos) = match active_reader.take() {
                                Some(reader) if current_pos <= target_pos => (reader, current_pos),
                                _ => (open_download_reader(adapter.clone(), node_id)?, 0),
                            };

                            if pos < target_pos {
                                skip_reader_to(&mut reader, pos, target_pos)?;
                                pos = target_pos;
                            }

                            let mut tmp = vec![0u8; count];
                            let n = reader.read(&mut tmp).map_err(|_| FsError::GeneralFailure)?;
                            tmp.truncate(n);
                            pos = pos.saturating_add(n as u64);
                            Ok::<_, FsError>((reader, pos, Bytes::from(tmp)))
                        })
                        .await
                        .map_err(|_| FsError::GeneralFailure)??;
                    {
                        let mut state = reader_state.lock().map_err(|_| FsError::GeneralFailure)?;
                        state.reader = Some(next_reader);
                        state.pos = next_pos;
                    }
                    self.cursor = next_pos;
                    Ok(bytes)
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
                CatalogDavFileMode::Read { .. } => self.meta.len as i128,
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

fn open_download_reader(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    node_id: u64,
) -> Result<Box<dyn Read + Send>, FsError> {
    let mut adapter = adapter.lock().map_err(|_| FsError::GeneralFailure)?;
    let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": node_id}));
    match adapter.handle_with_stream(&req, None) {
        RpcReply::Stream(out) => Ok(out.reader),
        _ => Err(FsError::GeneralFailure),
    }
}

fn skip_reader_to(
    reader: &mut Box<dyn Read + Send>,
    mut current_pos: u64,
    target_pos: u64,
) -> Result<(), FsError> {
    let mut scratch = [0u8; 16 * 1024];
    while current_pos < target_pos {
        let remaining = (target_pos - current_pos) as usize;
        let to_read = std::cmp::min(remaining, scratch.len());
        let n = reader
            .read(&mut scratch[..to_read])
            .map_err(|_| FsError::GeneralFailure)?;
        if n == 0 {
            return Err(FsError::GeneralFailure);
        }
        current_pos = current_pos.saturating_add(n as u64);
    }
    Ok(())
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
