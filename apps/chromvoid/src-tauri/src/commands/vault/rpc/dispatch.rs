use serde_json::Value;
use tracing::info;

use crate::app_state::AppState;
use crate::core_rpc_dispatcher::{command_policy, CoreRpcDispatchError, CoreRpcDispatchOutcome};
use crate::helpers::*;
use crate::types::*;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

use super::helpers::optional_secret_type_for_log;
use super::lock_transition::handle_lock_transition;
use super::result::rpc_response_to_result;

#[cfg(any(desktop, test))]
fn should_reconcile_ssh_agent_after_success(command: &str) -> bool {
    matches!(
        command,
        "passmanager:entry:save" | "passmanager:entry:delete" | "passmanager:root:import"
    )
}

#[tauri::command]
pub(crate) async fn rpc_dispatch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: RpcDispatchArgs,
) -> Result<RpcResult<Value>, String> {
    touch_last_activity(&state.last_activity, "rpc_dispatch");

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
    let policy = command_policy(&command);
    let command_priority = policy.priority;
    let requires_split_handler = policy.requires_split_handler;
    let command_start = state.core_rpc_dispatcher.begin_command(policy);

    #[cfg(desktop)]
    if policy.cancels_low_priority {
        let cancel_epoch = state.vault_background_io_runtime.cancel_low_priority();
        if command == "vault:lock" {
            cancel_remote_media_inspection_for_lock(&state, cancel_epoch).await;
        }
    }

    #[cfg(not(desktop))]
    if policy.cancels_low_priority {
        state.vault_background_io_runtime.cancel_low_priority();
    }

    if command == "catalog:media:inspect" {
        let node_id = match data.get("node_id").and_then(|value| value.as_u64()) {
            Some(node_id) => node_id,
            None => {
                return Ok(rpc_err(
                    "node_id is required",
                    Some("EMPTY_PAYLOAD".to_string()),
                ))
            }
        };
        match crate::core_rpc_dispatcher::media_inspect::dispatch_media_inspect(
            state.core_rpc_dispatcher.clone(),
            state.adapter.clone(),
            app.clone(),
            state
                .vault_background_io_runtime
                .cancellation_epoch_handle(),
            command_start.cancellation_generation,
            node_id,
        )
        .await
        {
            Ok(Some(resp)) => {
                return rpc_response_to_result(&command, resp, optional_secret_type.as_deref())
            }
            Ok(None) => {
                // Non-local adapters keep the existing CoreAdapter RPC path.
            }
            Err(result) => return Ok(result),
        }
    }

    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let app_bg = app.clone();
    let command_bg = command.clone();
    let start = std::time::Instant::now();
    let phase = match state
        .core_rpc_dispatcher
        .run_adapter_phase(
            command_priority,
            command.clone(),
            "generic",
            command_start.cancellation_generation,
            move || {
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
                if requires_split_handler && adapter.mode() == crate::core_adapter::CoreMode::Local
                {
                    return Err(rpc_err(
                        format!("Low-priority RPC command requires split handler: {command_bg}"),
                        Some("INTERNAL".to_string()),
                    ));
                }
                if command_bg == "vault:lock" || lock_wait_ms > 5 {
                    let group = if command_bg == "vault:lock" {
                        "perf:vault_lock"
                    } else {
                        "perf:rpc_dispatch"
                    };
                    info!(
                        "{} event=mutex_wait command={} lock_wait_ms={} was_unlocked={}",
                        group,
                        command_bg,
                        lock_wait_ms,
                        adapter.is_unlocked()
                    );
                }

                let was_unlocked = adapter.is_unlocked();
                let req = RpcRequest::new(command_bg.clone(), data);
                let handle_start = std::time::Instant::now();
                let resp = adapter.handle(&req);
                let handle_ms = handle_start.elapsed().as_millis();
                if command_bg == "vault:lock" || handle_ms > 10 {
                    let group = if command_bg == "vault:lock" {
                        "perf:vault_lock"
                    } else {
                        "perf:rpc_dispatch"
                    };
                    info!(
                        "{} event=handle command={} handle_ms={} was_unlocked={} now_unlocked={}",
                        group,
                        command_bg,
                        handle_ms,
                        was_unlocked,
                        adapter.is_unlocked()
                    );
                }

                if command_bg == "vault:lock" && !resp.is_ok() {
                    let now_unlocked = adapter.is_unlocked();
                    return Ok::<(RpcResponse, bool, bool), RpcResult<Value>>((
                        resp,
                        was_unlocked,
                        now_unlocked,
                    ));
                }

                if let Err(error) = adapter.save() {
                    if command_bg == "vault:lock" {
                        return Err(rpc_err(
                            format!("Failed to save vault lock state: {error}"),
                            Some("INTERNAL".to_string()),
                        ));
                    }
                }
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

                Ok::<(RpcResponse, bool, bool), RpcResult<Value>>((
                    resp,
                    was_unlocked,
                    now_unlocked,
                ))
            },
        )
        .await
    {
        Ok(phase) => phase,
        Err(CoreRpcDispatchError::Cancelled) => {
            return Ok(rpc_err(
                "rpc_dispatch cancelled before adapter phase",
                Some("CANCELLED".to_string()),
            ))
        }
        Err(error) => {
            return Ok(rpc_err(
                format!("rpc_dispatch dispatcher error: {error}"),
                Some("INTERNAL".to_string()),
            ))
        }
    };
    let (resp, was_unlocked, now_unlocked) = match phase.value {
        Ok(result) => result,
        Err(error) => return Ok(error),
    };
    let outcome = CoreRpcDispatchOutcome {
        response: resp,
        was_unlocked,
        now_unlocked,
        timing: phase.timing,
    };

    info!(
        "perf:rpc_dispatch event=done command={} dt_ms={} dispatcher_wait_ms={} adapter_phase_ms={}",
        command,
        start.elapsed().as_millis(),
        outcome.timing.dispatcher_wait_ms,
        outcome.timing.adapter_phase_ms
    );

    handle_lock_transition(&app, &state, outcome.was_unlocked, outcome.now_unlocked);

    if matches!(outcome.response, RpcResponse::Success { .. }) {
        #[cfg(desktop)]
        if should_reconcile_ssh_agent_after_success(&command) {
            if let Err(error) =
                crate::commands::ssh_agent_cmds::reconcile_ssh_agent_with_vault(&app, false).await
            {
                tracing::warn!(
                    "rpc_dispatch: ssh-agent reconcile failed after command={} error={}",
                    command,
                    error
                );
            }
        }
    }

    rpc_response_to_result(&command, outcome.response, optional_secret_type.as_deref())
}

#[cfg(desktop)]
async fn cancel_remote_media_inspection_for_lock(
    state: &tauri::State<'_, AppState>,
    cancel_epoch: u64,
) {
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let remote_client = match adapter.lock() {
                Ok(adapter) => adapter.remote_json_client(),
                Err(_) => {
                    tracing::warn!(
                        "rpc_dispatch: adapter mutex poisoned while cancelling remote media inspection"
                    );
                    None
                }
            };
            if let Some(remote_client) = remote_client {
                if remote_client.try_send_cancel_media_inspection(cancel_epoch) {
                    tracing::info!(
                        "perf:media_inspection event=cancel_send command=catalog:media:inspect:cancel epoch={}",
                        cancel_epoch
                    );
                } else {
                    tracing::warn!(
                        "rpc_dispatch: remote media inspection cancel was not sent epoch={}",
                        cancel_epoch
                    );
                }
            }
        })
        .await
    {
        Ok(()) => {}
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Remote media inspection cancel");
            tracing::warn!("rpc_dispatch: remote media inspection cancel failed: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::should_reconcile_ssh_agent_after_success;

    #[test]
    fn ssh_agent_reconcile_triggers_for_entry_mutations() {
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:entry:save"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:entry:delete"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:root:import"
        ));
        assert!(!should_reconcile_ssh_agent_after_success(
            "passmanager:entry:list"
        ));
        assert!(!should_reconcile_ssh_agent_after_success(
            "passmanager:secret:save"
        ));
        assert!(!should_reconcile_ssh_agent_after_success("vault:unlock"));
    }
}
