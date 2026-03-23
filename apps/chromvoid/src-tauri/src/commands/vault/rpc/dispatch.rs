use serde_json::Value;
use tracing::info;

use crate::app_state::AppState;
use crate::helpers::*;
use crate::types::*;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

use super::helpers::{optional_secret_type_for_log, should_downgrade_secret_read_error};
use super::lock_transition::handle_lock_transition;

#[tauri::command]
pub(crate) async fn rpc_dispatch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: RpcDispatchArgs,
) -> Result<RpcResult<Value>, String> {
    if let Ok(mut last) = state.last_activity.lock() {
        *last = std::time::Instant::now();
    }

    let (command, mut data) = match command_and_data(args) {
        Ok(v) => v,
        Err(e) => return Ok(rpc_err(e, Some("BAD_REQUEST".to_string()))),
    };

    normalize_u64_fields(&mut data);

    if command == "catalog:rename" {
        let node_id = data
            .get("node_id")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "null".to_string());
        let new_parent_path = data
            .get("new_parent_path")
            .and_then(|v| v.as_str())
            .unwrap_or("<none>");
        let new_name = match data.get("new_name") {
            Some(v) if v.is_null() => "<null>",
            Some(v) => v.as_str().unwrap_or("<non_string>"),
            None => "<missing>",
        };

        info!(
            target: "chromvoid_lib::rpc::rename",
            node_id,
            new_parent_path,
            new_name,
            "rpc_dispatch: catalog rename request"
        );
    }

    info!(
        "rpc_dispatch: command={} data={}",
        command,
        redact_rpc_data(&command, &data)
    );
    let optional_secret_type = optional_secret_type_for_log(&command, &data);

    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let app_bg = app.clone();
    let command_bg = command.clone();
    let start = std::time::Instant::now();
    let (resp, was_unlocked, now_unlocked) = match tauri::async_runtime::spawn_blocking(move || {
        let lock_wait_start = std::time::Instant::now();
        let mut adapter = match adapter.lock() {
            Ok(g) => g,
            Err(_) => {
                return Err(rpc_err(
                    "Adapter mutex poisoned",
                    Some("INTERNAL".to_string()),
                ))
            }
        };
        let lock_wait_ms = lock_wait_start.elapsed().as_millis();
        if lock_wait_ms > 5 {
            info!(
                "rpc_dispatch: mutex wait command={} lock_wait_ms={}",
                command_bg, lock_wait_ms
            );
        }

        let was_unlocked = adapter.is_unlocked();
        let req = RpcRequest::new(command_bg.clone(), data);
        let handle_start = std::time::Instant::now();
        let resp = adapter.handle(&req);
        let handle_ms = handle_start.elapsed().as_millis();
        if handle_ms > 10 {
            info!(
                "rpc_dispatch: handle command={} handle_ms={}",
                command_bg, handle_ms
            );
        }

        let _ = adapter.save();
        flush_core_events(&app_bg, adapter.as_mut());

        let now_unlocked = adapter.is_unlocked();
        if was_unlocked != now_unlocked {
            info!(
                "rpc_dispatch: unlocked state changed: {} -> {} (command={})",
                was_unlocked, now_unlocked, command_bg
            );
        }

        match command_bg.as_str() {
            "master:setup" | "vault:unlock" | "vault:lock" | "erase:execute" => {
                let root = match storage_root.lock() {
                    Ok(p) => p.clone(),
                    Err(_) => {
                        return Err(rpc_err(
                            "Storage root mutex poisoned",
                            Some("INTERNAL".to_string()),
                        ))
                    }
                };
                emit_basic_state(&app_bg, &root, adapter.as_ref());
            }
            _ => {}
        }

        Ok::<(RpcResponse, bool, bool), RpcResult<Value>>((resp, was_unlocked, now_unlocked))
    })
    .await
    {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => return Ok(e),
        Err(e) => {
            return Ok(rpc_err(
                format!("rpc_dispatch join error: {e}"),
                Some("INTERNAL".to_string()),
            ))
        }
    };

    info!(
        "rpc_dispatch: done command={} dt_ms={}",
        command,
        start.elapsed().as_millis()
    );

    handle_lock_transition(&app, &state, was_unlocked, now_unlocked).await;

    match resp {
        RpcResponse::Success { ok: _, result } => {
            let wrapper = serde_json::json!({
                "command": command,
                "result": result,
            });
            match serde_json::from_value::<chromvoid_core::rpc::types::RpcCommandResult>(
                wrapper.clone(),
            ) {
                Ok(typed) => {
                    let typed_value = serde_json::to_value(typed).unwrap_or(wrapper);
                    Ok(rpc_ok(typed_value))
                }
                Err(_) => Ok(rpc_ok(wrapper)),
            }
        }
        RpcResponse::Error { ok: _, error, code } => {
            if should_downgrade_secret_read_error(
                &command,
                optional_secret_type.as_deref(),
                code.as_deref(),
            ) {
                tracing::info!(
                    "rpc_dispatch: optional secret missing command={} secret_type={} code={:?} optional_secret_missing=true error={}",
                    command,
                    optional_secret_type.as_deref().unwrap_or("<missing>"),
                    code,
                    error
                );
            } else {
                tracing::error!(
                    "rpc_dispatch: error command={} code={:?} error={}",
                    command,
                    code,
                    error
                );
            }
            Ok(RpcResult::Error {
                ok: false,
                error,
                code,
            })
        }
    }
}
