use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::Emitter;

use crate::app_state::AppState;
use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::state_ext::lock_or_rpc_err;
use crate::types::{rpc_err, rpc_ok, RpcResult, VaultRekeyProgressEvent};
use crate::vault_background_io::VaultBackgroundIoError;

use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::vault::VaultRekeyRequest;

#[tauri::command]
pub(crate) fn vault_rekey_cancel(state: tauri::State<'_, AppState>) -> RpcResult<Value> {
    state.vault_background_io_runtime.cancel_rekey();
    rpc_ok(serde_json::json!({
        "cancelled": true,
        "operation": "vault_rekey",
    }))
}

#[tauri::command]
pub(crate) async fn vault_rekey(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    current_password: String,
    new_password: String,
) -> Result<RpcResult<Value>, String> {
    if current_password.is_empty() {
        return Ok(rpc_err(
            "current_password is required",
            Some("BAD_REQUEST".to_string()),
        ));
    }
    if new_password.is_empty() {
        return Ok(rpc_err(
            "new_password is required",
            Some("BAD_REQUEST".to_string()),
        ));
    }

    let vault_background_io_runtime = state.vault_background_io_runtime.clone();
    let (_rekey_guard, cancel_requested_bg) = match vault_background_io_runtime.begin_rekey_run() {
        Ok(run) => run,
        Err(VaultBackgroundIoError::RekeyAlreadyInProgress) => {
            return Ok(rpc_err(
                "Vault password migration is already in progress",
                Some("REKEY_ALREADY_IN_PROGRESS".to_string()),
            ))
        }
    };
    vault_background_io_runtime.cancel_low_priority();
    let adapter = state.adapter.clone();

    let out = vault_background_io_runtime
        .spawn_blocking(move || {
            vault_rekey_inner(
                app,
                adapter,
                current_password,
                new_password,
                cancel_requested_bg,
            )
        })
        .await;

    Ok(match out {
        Ok(result) => result,
        Err(error) => {
            let (error, code) = error.into_rpc_error("Vault rekey");
            rpc_err(error, code)
        }
    })
}

fn vault_rekey_inner(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    current_password: String,
    new_password: String,
    cancel_requested: Arc<std::sync::atomic::AtomicBool>,
) -> RpcResult<Value> {
    let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
    if adapter.mode() != CoreMode::Local {
        return rpc_err(
            "Vault password migration is only available for local vaults",
            Some("UNSUPPORTED_REMOTE_MODE".to_string()),
        );
    }

    let request = VaultRekeyRequest {
        current_password,
        new_password,
    };
    let mut progress = |event: chromvoid_core::vault::VaultRekeyProgress| {
        let _ = app.emit(
            "vault:rekey:progress",
            VaultRekeyProgressEvent {
                phase: event.phase,
                processed_chunks: event.processed_chunks,
                total_chunks: event.total_chunks,
                can_cancel: event.can_cancel,
            },
        );
    };
    let cancel = || cancel_requested.load(Ordering::Relaxed);

    let response = match adapter.rekey_vault(request, &cancel, &mut progress) {
        Some(response) => response,
        None => {
            return rpc_err(
                "Vault password migration is not supported by the current core adapter",
                Some("UNSUPPORTED_REMOTE_MODE".to_string()),
            )
        }
    };

    match response {
        RpcResponse::Success { result, .. } => rpc_ok(result),
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
    }
}
