#[cfg(desktop)]
use std::path::PathBuf;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;
#[cfg(desktop)]
use tauri::Emitter;
use tracing::info;

use crate::app_state::AppState;
use crate::helpers::*;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;

#[tauri::command]
pub(crate) fn catalog_upload_chunk(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: u64,
    offset: u64,
    chunk: Vec<u8>,
) -> RpcResult<Value> {
    if let Ok(mut last) = state.last_activity.lock() {
        *last = std::time::Instant::now();
    }

    let started = std::time::Instant::now();
    let chunk_len = chunk.len() as u64;
    let mut adapter = lock_or_rpc_err!(state.adapter, "Adapter");

    let req = RpcRequest::new(
        "catalog:upload".to_string(),
        serde_json::json!({
            "node_id": node_id,
            "size": chunk_len,
            "offset": offset,
        }),
    );
    let reply = adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(chunk)));

    let _ = adapter.save();
    flush_core_events(&app, adapter.as_mut());

    let dt_ms = started.elapsed().as_millis();
    if dt_ms >= 50 {
        info!(
            "catalog_upload_chunk: slow dt_ms={} node_id={} offset={} size={}",
            dt_ms, node_id, offset, chunk_len
        );
    } else {
        tracing::debug!(
            "catalog_upload_chunk: dt_ms={} node_id={} offset={} size={}",
            dt_ms,
            node_id,
            offset,
            chunk_len
        );
    }

    match reply {
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { ok: _, result } => rpc_ok(result),
            RpcResponse::Error { ok: _, error, code } => RpcResult::Error {
                ok: false,
                error,
                code,
            },
        },
        RpcReply::Stream(_) => rpc_err("Unexpected stream reply", Some("INTERNAL".to_string())),
    }
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn catalog_upload_path(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: u64,
    path: String,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    if let Ok(mut last) = state.last_activity.lock() {
        *last = std::time::Instant::now();
    }

    let adapter = state.adapter.clone();
    let app2 = app.clone();
    let last_activity = state.last_activity.clone();

    let read_cs = read_chunk_size
        .unwrap_or(4 * 1024 * 1024)
        .clamp(64 * 1024, 16 * 1024 * 1024) as usize;

    let out =
        tauri::async_runtime::spawn_blocking(move || -> Result<(), (String, Option<String>)> {
            let pb = PathBuf::from(path);
            let meta = std::fs::metadata(&pb)
                .map_err(|e| (format!("Failed to stat file: {e}"), Some("IO".to_string())))?;
            if !meta.is_file() {
                return Err((
                    "Path is not a file".to_string(),
                    Some("INVALID_PATH".to_string()),
                ));
            }

            let total_bytes = meta.len();
            let mut file = std::fs::File::open(&pb)
                .map_err(|e| (format!("Failed to open file: {e}"), Some("IO".to_string())))?;

            let mut offset: u64 = 0;
            let mut sent_bytes: u64 = 0;
            let mut buf = vec![0u8; read_cs];
            let mut last_emit = std::time::Instant::now();

            while offset < total_bytes {
                if let Ok(mut last) = last_activity.lock() {
                    *last = std::time::Instant::now();
                }

                let n = std::io::Read::read(&mut file, &mut buf)
                    .map_err(|e| (format!("Failed to read file: {e}"), Some("IO".to_string())))?;
                if n == 0 {
                    break;
                }

                let chunk = buf[..n].to_vec();
                let req = RpcRequest::new(
                    "catalog:upload".to_string(),
                    serde_json::json!({
                        "node_id": node_id,
                        "size": n as u64,
                        "offset": offset,
                    }),
                );

                let reply = {
                    let mut adapter = adapter.lock().map_err(|_| {
                        (
                            "Adapter mutex poisoned".to_string(),
                            Some("INTERNAL".to_string()),
                        )
                    })?;
                    adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(chunk)))
                };

                match reply {
                    RpcReply::Json(resp) => match resp {
                        RpcResponse::Success { .. } => {}
                        RpcResponse::Error { error, code, .. } => return Err((error, code)),
                    },
                    RpcReply::Stream(_) => {
                        return Err((
                            "Unexpected stream reply".to_string(),
                            Some("INTERNAL".to_string()),
                        ))
                    }
                }

                offset = offset.saturating_add(n as u64);
                sent_bytes = sent_bytes.saturating_add(n as u64);

                let now = std::time::Instant::now();
                if now.duration_since(last_emit).as_millis() >= 120 || sent_bytes >= total_bytes {
                    last_emit = now;
                    let _ = app2.emit(
                        "upload:progress",
                        serde_json::json!({
                            "uploadId": upload_id.clone(),
                            "nodeId": node_id,
                            "sentBytes": sent_bytes,
                            "totalBytes": total_bytes,
                        }),
                    );
                }
            }

            {
                let mut adapter = adapter.lock().map_err(|_| {
                    (
                        "Adapter mutex poisoned".to_string(),
                        Some("INTERNAL".to_string()),
                    )
                })?;
                let _ = adapter.save();
                flush_core_events(&app2, adapter.as_mut());
            }

            Ok(())
        })
        .await;

    Ok(match out {
        Ok(Ok(())) => rpc_ok(Value::Null),
        Ok(Err((msg, code))) => rpc_err(msg, code),
        Err(e) => rpc_err(
            format!("Upload task failed: {e}"),
            Some("INTERNAL".to_string()),
        ),
    })
}
