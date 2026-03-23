use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;

use crate::app_state::AppState;
use crate::helpers::*;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;

#[tauri::command]
pub(crate) fn catalog_secret_read(
    state: tauri::State<'_, AppState>,
    node_id: u64,
) -> RpcResult<StreamOut> {
    let reply = {
        let mut adapter = lock_or_rpc_err!(state.adapter, "Adapter");
        let req = RpcRequest::new(
            "catalog:secret:read".to_string(),
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

#[tauri::command]
pub(crate) fn catalog_secret_write_chunk(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: u64,
    offset: u64,
    chunk: Vec<u8>,
) -> RpcResult<Value> {
    let mut adapter = lock_or_rpc_err!(state.adapter, "Adapter");

    let req = RpcRequest::new(
        "catalog:secret:write".to_string(),
        serde_json::json!({
            "node_id": node_id,
            "size": chunk.len() as u64,
            "offset": offset,
        }),
    );
    let reply = adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(chunk)));

    let _ = adapter.save();
    flush_core_events(&app, adapter.as_mut());

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
