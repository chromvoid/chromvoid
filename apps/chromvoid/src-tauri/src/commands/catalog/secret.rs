use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::helpers::*;
use crate::types::*;

#[tauri::command]
pub(crate) async fn catalog_secret_read(
    state: tauri::State<'_, AppState>,
    node_id: u64,
) -> TauriRpcResult<StreamOut> {
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
                    "catalog:secret:read".to_string(),
                    serde_json::json!({
                        "node_id": node_id,
                    }),
                );
                adapter.handle_with_stream(&req, None)
            };

            catalog_secret_stream_reply(reply)
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(catalog_secret_blocking_err(error, "Catalog secret read")),
    }
}

fn catalog_secret_stream_reply(reply: RpcReply) -> RpcResult<StreamOut> {
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

#[tauri::command]
pub(crate) async fn catalog_secret_write_chunk(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: u64,
    offset: u64,
    chunk: Vec<u8>,
) -> TauriRpcResult<Value> {
    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let chunk_len = chunk.len() as u64;

    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = match adapter.lock() {
                Ok(adapter) => adapter,
                Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
            };

            let req = RpcRequest::new(
                "catalog:secret:write".to_string(),
                serde_json::json!({
                    "node_id": node_id,
                    "size": chunk_len,
                    "offset": offset,
                }),
            );
            let reply = adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(chunk)));

            let _ = adapter.save();
            flush_core_events(&app, adapter.as_mut());

            catalog_secret_json_reply(reply)
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(catalog_secret_blocking_err(error, "Catalog secret write")),
    }
}

fn catalog_secret_json_reply(reply: RpcReply) -> RpcResult<Value> {
    match reply {
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { ok: _, result } => rpc_ok(result),
            RpcResponse::Error { ok: _, error, code } => RpcResult::Error {
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

fn catalog_secret_blocking_err<T>(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> RpcResult<T> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_err(error, code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::rpc::{RpcOutputStream, RpcStreamMeta};

    #[test]
    fn catalog_secret_stream_reply_reads_stream_bytes() {
        let reply = RpcReply::Stream(RpcOutputStream {
            meta: RpcStreamMeta {
                name: "secret.txt".to_string(),
                size: 6,
                chunk_size: 6,
                mime_type: "text/plain".to_string(),
            },
            reader: Box::new(std::io::Cursor::new(b"secret".to_vec())),
        });

        match catalog_secret_stream_reply(reply) {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.bytes, b"secret");
                assert_eq!(result.meta.name, "secret.txt");
            }
            RpcResult::Error { error, .. } => panic!("unexpected stream error: {error}"),
        }
    }

    #[test]
    fn catalog_secret_json_reply_preserves_core_error() {
        let reply = RpcReply::Json(RpcResponse::error("denied", Some("DENIED")));

        match catalog_secret_json_reply(reply) {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "denied");
                assert_eq!(code.as_deref(), Some("DENIED"));
            }
            RpcResult::Success { .. } => panic!("expected core error"),
        }
    }
}
