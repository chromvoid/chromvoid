#[cfg(desktop)]
use std::io::Write;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
#[cfg(desktop)]
use serde_json::Value;
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(desktop)]
use tracing::info;

use crate::app_state::AppState;
#[cfg(desktop)]
use crate::helpers::*;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;

#[tauri::command]
pub(crate) fn catalog_download(
    state: tauri::State<'_, AppState>,
    node_id: u64,
) -> RpcResult<StreamOut> {
    let reply = {
        let mut adapter = lock_or_rpc_err!(state.adapter, "Adapter");
        let req = RpcRequest::new(
            "catalog:download".to_string(),
            serde_json::json!({
                "node_id": node_id,
            }),
        );
        adapter.handle_with_stream(&req, None)
    };

    match reply {
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { .. } => RpcResult::Error {
                ok: false,
                error: "Unexpected JSON reply".to_string(),
                code: Some("INTERNAL".to_string()),
            },
            RpcResponse::Error { error, code, .. } => RpcResult::Error {
                ok: false,
                error,
                code,
            },
        },
        RpcReply::Stream(out) => {
            let mut bytes = Vec::new();
            let mut reader = out.reader;
            if let Err(e) = std::io::Read::read_to_end(&mut reader, &mut bytes) {
                return RpcResult::Error {
                    ok: false,
                    error: format!("Failed to read stream: {e}"),
                    code: Some("INTERNAL".to_string()),
                };
            }
            RpcResult::Success {
                ok: true,
                result: StreamOut {
                    meta: out.meta,
                    bytes,
                },
            }
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn catalog_download_path(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: DownloadPathArgs,
) -> Result<RpcResult<DownloadPathResult>, String> {
    let DownloadPathArgs {
        node_id,
        target_path,
        download_id,
    } = args;

    if let Ok(mut last) = state.last_activity.lock() {
        *last = std::time::Instant::now();
    }
    info!(
        "catalog_download_path: start node_id={} target_path={}",
        node_id, target_path
    );

    let adapter = state.adapter.clone();
    let app2 = app.clone();

    let out = tauri::async_runtime::spawn_blocking(move || -> Result<DownloadPathResult, (String, Option<String>)> {
        let reply = {
            let mut adapter = adapter
                .lock()
                .map_err(|_| ("Adapter mutex poisoned".to_string(), Some("INTERNAL".to_string())))?;
            let req = RpcRequest::new(
                "catalog:download".to_string(),
                serde_json::json!({ "node_id": node_id }),
            );
            adapter.handle_with_stream(&req, None)
        };

        match reply {
            RpcReply::Json(resp) => match resp {
                RpcResponse::Success { .. } => {
                    Err(("Unexpected JSON reply".to_string(), Some("INTERNAL".to_string())))
                }
                RpcResponse::Error { error, code, .. } => Err((error, code)),
            },
            RpcReply::Stream(out) => {
                let meta = out.meta;
                let total_bytes = meta.size;
                let mut reader = out.reader;

                let file = std::fs::File::create(&target_path)
                    .map_err(|e| (format!("Failed to create file: {e}"), Some("IO".to_string())))?;
                let mut writer = std::io::BufWriter::new(file);

                let mut bytes_written: u64 = 0;
                let mut buf = vec![0u8; 64 * 1024];
                let mut last_emit = std::time::Instant::now();

                loop {
                    let n = std::io::Read::read(&mut reader, &mut buf)
                        .map_err(|e| (format!("Failed to read stream: {e}"), Some("IO".to_string())))?;
                    if n == 0 {
                        break;
                    }

                    writer
                        .write_all(&buf[..n])
                        .map_err(|e| (format!("Failed to write file: {e}"), Some("IO".to_string())))?;

                    bytes_written = bytes_written.saturating_add(n as u64);

                    let now = std::time::Instant::now();
                    if now.duration_since(last_emit).as_millis() >= 120
                        || (total_bytes > 0 && bytes_written >= total_bytes)
                    {
                        last_emit = now;
                        let _ = app2.emit(
                            "download:progress",
                            serde_json::json!({
                                "downloadId": download_id.clone(),
                                "nodeId": node_id,
                                "writtenBytes": bytes_written,
                                "totalBytes": total_bytes,
                            }),
                        );
                    }
                }

                writer
                    .flush()
                    .map_err(|e| (format!("Failed to flush file: {e}"), Some("IO".to_string())))?;
                drop(writer);

                if total_bytes > 0 && bytes_written != total_bytes {
                    tracing::error!(
                        "catalog_download_path: incomplete node_id={} wrote={} expected={} target_path={}",
                        node_id, bytes_written, total_bytes, target_path
                    );
                    let _ = std::fs::remove_file(&target_path);
                    return Err((
                        format!(
                            "Download incomplete: wrote {bytes_written} of {total_bytes} bytes"
                        ),
                        Some("INCOMPLETE".to_string()),
                    ));
                }

                info!(
                    "catalog_download_path: done node_id={} bytes_written={} target_path={}",
                    node_id, bytes_written, target_path
                );
                Ok(DownloadPathResult {
                    bytes_written,
                    name: meta.name,
                    mime_type: meta.mime_type,
                })
            }
        }
    })
    .await;

    Ok(match out {
        Ok(Ok(result)) => rpc_ok(result),
        Ok(Err((msg, code))) => RpcResult::Error {
            ok: false,
            error: msg,
            code,
        },
        Err(e) => RpcResult::Error {
            ok: false,
            error: format!("Download task failed: {e}"),
            code: Some("INTERNAL".to_string()),
        },
    })
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn catalog_open_external(
    state: tauri::State<'_, AppState>,
    args: OpenExternalArgs,
) -> Result<RpcResult<Value>, String> {
    let OpenExternalArgs { node_id } = args;

    if let Ok(mut last) = state.last_activity.lock() {
        *last = std::time::Instant::now();
    }

    let adapter = state.adapter.clone();

    let out = tauri::async_runtime::spawn_blocking(
        move || -> Result<std::path::PathBuf, (String, Option<String>)> {
            let reply = {
                let mut adapter = adapter.lock().map_err(|_| {
                    (
                        "Adapter mutex poisoned".to_string(),
                        Some("INTERNAL".to_string()),
                    )
                })?;
                let req = RpcRequest::new(
                    "catalog:download".to_string(),
                    serde_json::json!({ "node_id": node_id }),
                );
                adapter.handle_with_stream(&req, None)
            };

            match reply {
                RpcReply::Json(resp) => match resp {
                    RpcResponse::Success { .. } => Err((
                        "Unexpected JSON reply".to_string(),
                        Some("INTERNAL".to_string()),
                    )),
                    RpcResponse::Error { error, code, .. } => Err((error, code)),
                },
                RpcReply::Stream(out) => {
                    let meta = out.meta;
                    let mut reader = out.reader;

                    let tmp_dir = std::env::temp_dir().join("chromvoid-open");
                    let _ = std::fs::create_dir_all(&tmp_dir);

                    let safe_name = sanitize_filename(&meta.name);
                    let ts = now_secs();
                    let file_path = tmp_dir.join(format!("{}_{}", ts, safe_name));

                    let file = std::fs::File::create(&file_path).map_err(|e| {
                        (
                            format!("Failed to create file: {e}"),
                            Some("IO".to_string()),
                        )
                    })?;
                    let mut writer = std::io::BufWriter::new(file);

                    let mut bytes_written: u64 = 0;
                    let mut buf = vec![0u8; 64 * 1024];

                    loop {
                        let n = std::io::Read::read(&mut reader, &mut buf).map_err(|e| {
                            (
                                format!("Failed to read stream: {e}"),
                                Some("IO".to_string()),
                            )
                        })?;
                        if n == 0 {
                            break;
                        }
                        writer.write_all(&buf[..n]).map_err(|e| {
                            (format!("Failed to write file: {e}"), Some("IO".to_string()))
                        })?;
                        bytes_written = bytes_written.saturating_add(n as u64);
                    }

                    writer.flush().map_err(|e| {
                        (format!("Failed to flush file: {e}"), Some("IO".to_string()))
                    })?;

                    if meta.size > 0 && bytes_written != meta.size {
                        let _ = std::fs::remove_file(&file_path);
                        return Err((
                            format!("Incomplete write: {} of {} bytes", bytes_written, meta.size),
                            Some("IO".to_string()),
                        ));
                    }

                    Ok(file_path)
                }
            }
        },
    )
    .await;

    match out {
        Ok(Ok(path)) => {
            if let Err(e) = open_path_with_system(&path) {
                return Ok(rpc_err(e, Some("OPEN_FAILED".to_string())));
            }
            Ok(rpc_ok(serde_json::json!({
                "path": path.to_string_lossy().to_string()
            })))
        }
        Ok(Err((msg, code))) => Ok(rpc_err(msg, code)),
        Err(e) => Ok(rpc_err(
            format!("Open task failed: {e}"),
            Some("INTERNAL".to_string()),
        )),
    }
}
