use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;
use tracing::info;

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::helpers::*;
use crate::types::*;

#[tauri::command]
pub(crate) async fn passmanager_upload_chunk(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: u64,
    offset: u64,
    chunk: Vec<u8>,
) -> TauriRpcResult<Value> {
    touch_last_activity(&state.last_activity, "passmanager_upload_chunk");

    let started = std::time::Instant::now();
    let chunk_len = chunk.len() as u64;
    let result = passmanager_stream_write(
        app,
        state,
        "passmanager:upload",
        node_id,
        offset,
        chunk,
        "Passmanager upload",
    )
    .await;

    let dt_ms = started.elapsed().as_millis();
    if dt_ms >= 50 {
        info!(
            "passmanager_upload_chunk: slow dt_ms={} node_id={} offset={} size={}",
            dt_ms, node_id, offset, chunk_len
        );
    } else {
        tracing::debug!(
            "passmanager_upload_chunk: dt_ms={} node_id={} offset={} size={}",
            dt_ms,
            node_id,
            offset,
            chunk_len
        );
    }

    Ok(result)
}

#[tauri::command]
pub(crate) async fn passmanager_download(
    state: tauri::State<'_, AppState>,
    node_id: u64,
) -> TauriRpcResult<StreamOut> {
    Ok(passmanager_stream_read(
        state,
        "passmanager:download",
        node_id,
        "Passmanager download",
    )
    .await)
}

#[tauri::command]
pub(crate) async fn passmanager_secret_read(
    state: tauri::State<'_, AppState>,
    node_id: u64,
) -> TauriRpcResult<StreamOut> {
    Ok(passmanager_stream_read(
        state,
        "passmanager:secret:read",
        node_id,
        "Passmanager secret read",
    )
    .await)
}

async fn passmanager_stream_read(
    state: tauri::State<'_, AppState>,
    command: &'static str,
    node_id: u64,
    task_label: &'static str,
) -> RpcResult<StreamOut> {
    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let reply = {
                let mut adapter = match adapter.lock() {
                    Ok(adapter) => adapter,
                    Err(_) => {
                        return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string()))
                    }
                };
                let req = RpcRequest::new(
                    command.to_string(),
                    serde_json::json!({
                        "node_id": node_id,
                    }),
                );
                adapter.handle_with_stream(&req, None)
            };

            passmanager_stream_reply(reply)
        })
        .await
    {
        Ok(result) => result,
        Err(error) => blocking_io_rpc_err(error, task_label),
    }
}

fn passmanager_stream_reply(reply: RpcReply) -> RpcResult<StreamOut> {
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
        RpcReply::RangeStream(_) => RpcResult::Error {
            ok: false,
            error: "Unexpected range stream reply".to_string(),
            code: Some("INTERNAL".to_string()),
        },
    }
}

fn blocking_io_rpc_err<T>(error: CatalogBlockingIoError, task_label: &'static str) -> RpcResult<T> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_err(error, code)
}

#[tauri::command]
pub(crate) async fn passmanager_secret_write_chunk(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: u64,
    offset: u64,
    chunk: Vec<u8>,
) -> TauriRpcResult<Value> {
    Ok(passmanager_stream_write(
        app,
        state,
        "passmanager:secret:write",
        node_id,
        offset,
        chunk,
        "Passmanager secret write",
    )
    .await)
}

async fn passmanager_stream_write(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    command: &'static str,
    node_id: u64,
    offset: u64,
    chunk: Vec<u8>,
    task_label: &'static str,
) -> RpcResult<Value> {
    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let chunk_len = chunk.len() as u64;
    if let Err(error) = validate_upload_chunk_bounds("passmanager upload", offset, chunk_len, None)
    {
        return rpc_err(error, Some("BAD_REQUEST".to_string()));
    }

    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = match adapter.lock() {
                Ok(adapter) => adapter,
                Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
            };

            let req = RpcRequest::new(
                command.to_string(),
                serde_json::json!({
                    "node_id": node_id,
                    "size": chunk_len,
                    "offset": offset,
                }),
            );
            let reply = adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(chunk)));

            let _ = adapter.save();
            flush_core_events(&app, adapter.as_mut());

            passmanager_json_reply(reply)
        })
        .await
    {
        Ok(result) => result,
        Err(error) => blocking_io_rpc_err(error, task_label),
    }
}

fn passmanager_json_reply(reply: RpcReply) -> RpcResult<Value> {
    match reply {
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { result, .. } => rpc_ok(result),
            RpcResponse::Error { error, code, .. } => RpcResult::Error {
                ok: false,
                error,
                code,
            },
        },
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            rpc_err("Unexpected stream reply", Some("INTERNAL".to_string()))
        }
    }
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn android_otp_qr_scan_start(
    app: tauri::AppHandle,
    scan_id: String,
) -> RpcResult<Value> {
    if scan_id.trim().is_empty() {
        return rpc_err(
            "OTP QR scan id is required",
            Some("BAD_REQUEST".to_string()),
        );
    }

    match crate::mobile::android::start_otp_qr_scan(app, &scan_id) {
        Ok(()) => rpc_ok(Value::Null),
        Err(error) => rpc_err(error, Some("OTP_QR_SCAN_UNAVAILABLE".to_string())),
    }
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) fn android_otp_qr_scan_start(
    app: tauri::AppHandle,
    scan_id: String,
) -> RpcResult<Value> {
    if scan_id.trim().is_empty() {
        return rpc_err(
            "OTP QR scan id is required",
            Some("BAD_REQUEST".to_string()),
        );
    }

    match crate::mobile::ios::native_bridge::start_otp_qr_scan(app, &scan_id) {
        Ok(()) => rpc_ok(Value::Null),
        Err(error) => rpc_err(error, Some("OTP_QR_SCAN_UNAVAILABLE".to_string())),
    }
}

#[cfg(all(any(mobile, test), not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn android_otp_qr_scan_start(_scan_id: String) -> RpcResult<Value> {
    android_otp_qr_scan_unavailable()
}

#[cfg(test)]
mod stream_reply_tests {
    use super::*;
    use chromvoid_core::rpc::{RpcOutputStream, RpcStreamMeta};
    use std::io::Cursor;

    #[test]
    fn passmanager_stream_reply_reads_stream_bytes() {
        let reply = RpcReply::Stream(RpcOutputStream {
            meta: RpcStreamMeta {
                name: "entry.txt".to_string(),
                mime_type: "text/plain".to_string(),
                size: 5,
                chunk_size: 5,
            },
            reader: Box::new(Cursor::new(b"hello".to_vec())),
        });

        let result = passmanager_stream_reply(reply);

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.meta.name, "entry.txt");
                assert_eq!(result.bytes, b"hello");
            }
            RpcResult::Error { error, .. } => panic!("unexpected error: {error}"),
        }
    }

    #[test]
    fn passmanager_stream_reply_preserves_json_error() {
        let result = passmanager_stream_reply(RpcReply::Json(RpcResponse::Error {
            ok: false,
            error: "denied".to_string(),
            code: Some("DENIED".to_string()),
        }));

        match result {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "denied");
                assert_eq!(code.as_deref(), Some("DENIED"));
            }
            RpcResult::Success { .. } => panic!("unexpected success"),
        }
    }

    #[test]
    fn passmanager_json_reply_preserves_success_result() {
        let result = passmanager_json_reply(RpcReply::Json(RpcResponse::Success {
            ok: true,
            result: serde_json::json!({"node_id": 7}),
        }));

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result["node_id"], 7);
            }
            RpcResult::Error { error, .. } => panic!("unexpected error: {error}"),
        }
    }

    #[test]
    fn passmanager_json_reply_rejects_stream_result() {
        let reply = RpcReply::Stream(RpcOutputStream {
            meta: RpcStreamMeta {
                name: "entry.txt".to_string(),
                mime_type: "text/plain".to_string(),
                size: 5,
                chunk_size: 5,
            },
            reader: Box::new(Cursor::new(b"hello".to_vec())),
        });

        match passmanager_json_reply(reply) {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "Unexpected stream reply");
                assert_eq!(code.as_deref(), Some("INTERNAL"));
            }
            RpcResult::Success { .. } => panic!("unexpected success"),
        }
    }
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn android_otp_qr_scan_cancel(scan_id: String) -> RpcResult<Value> {
    if crate::mobile::android::cancel_otp_qr_scan(&scan_id) {
        rpc_ok(Value::Null)
    } else {
        rpc_err(
            "OTP QR scan session not found",
            Some("OTP_QR_SCAN_NOT_FOUND".to_string()),
        )
    }
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) fn android_otp_qr_scan_cancel(scan_id: String) -> RpcResult<Value> {
    if crate::mobile::ios::native_bridge::cancel_otp_qr_scan(&scan_id) {
        rpc_ok(Value::Null)
    } else {
        rpc_err(
            "OTP QR scan session not found",
            Some("OTP_QR_SCAN_NOT_FOUND".to_string()),
        )
    }
}

#[cfg(all(any(mobile, test), not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn android_otp_qr_scan_cancel(_scan_id: String) -> RpcResult<Value> {
    android_otp_qr_scan_unavailable()
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub(crate) fn native_otp_qr_scan_start(app: tauri::AppHandle, scan_id: String) -> RpcResult<Value> {
    android_otp_qr_scan_start(app, scan_id)
}

#[cfg(all(any(mobile, test), not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn native_otp_qr_scan_start(_scan_id: String) -> RpcResult<Value> {
    android_otp_qr_scan_unavailable()
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub(crate) fn native_otp_qr_scan_cancel(scan_id: String) -> RpcResult<Value> {
    android_otp_qr_scan_cancel(scan_id)
}

#[cfg(all(any(mobile, test), not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn native_otp_qr_scan_cancel(_scan_id: String) -> RpcResult<Value> {
    android_otp_qr_scan_unavailable()
}

#[cfg(all(any(mobile, test), not(any(target_os = "android", target_os = "ios"))))]
fn android_otp_qr_scan_unavailable() -> RpcResult<Value> {
    rpc_err(
        "Native OTP QR scanner is not available on this platform",
        Some("OTP_QR_SCAN_UNAVAILABLE".to_string()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    #[test]
    fn otp_qr_scan_start_returns_unavailable_on_unsupported_targets() {
        match android_otp_qr_scan_start("scan-1".to_string()) {
            RpcResult::Error { code, .. } => {
                assert_eq!(code.as_deref(), Some("OTP_QR_SCAN_UNAVAILABLE"));
            }
            RpcResult::Success { .. } => panic!("expected unavailable error"),
        }

        match android_otp_qr_scan_cancel("scan-1".to_string()) {
            RpcResult::Error { code, .. } => {
                assert_eq!(code.as_deref(), Some("OTP_QR_SCAN_UNAVAILABLE"));
            }
            RpcResult::Success { .. } => panic!("expected unavailable error"),
        }

        match native_otp_qr_scan_start("scan-1".to_string()) {
            RpcResult::Error { code, .. } => {
                assert_eq!(code.as_deref(), Some("OTP_QR_SCAN_UNAVAILABLE"));
            }
            RpcResult::Success { .. } => panic!("expected unavailable error"),
        }

        match native_otp_qr_scan_cancel("scan-1".to_string()) {
            RpcResult::Error { code, .. } => {
                assert_eq!(code.as_deref(), Some("OTP_QR_SCAN_UNAVAILABLE"));
            }
            RpcResult::Success { .. } => panic!("expected unavailable error"),
        }
    }
}
