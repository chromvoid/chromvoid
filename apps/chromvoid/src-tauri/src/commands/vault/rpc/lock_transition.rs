use tauri::Emitter;

use crate::app_state::AppState;
use crate::helpers::{emit_basic_state, flush_core_events};

#[cfg(desktop)]
use crate::commands::volume_ops::{
    perform_volume_teardown, volume_mount_inner, volume_status_from_vm,
};
#[cfg(desktop)]
use crate::task_lifecycle::EventTaskName;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

pub(super) fn handle_lock_transition(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    was_unlocked: bool,
    now_unlocked: bool,
) {
    handle_lock_transition_with_reason(app, state, was_unlocked, now_unlocked, "manual");
}

pub(crate) fn handle_lock_transition_with_reason(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    was_unlocked: bool,
    now_unlocked: bool,
    lock_reason: &str,
) {
    if was_unlocked && !now_unlocked {
        #[cfg(desktop)]
        {
            let usb_teardown_reason = if lock_reason == "system_sleep" {
                "system_sleep"
            } else {
                "vault_lock"
            };
            crate::mobile_usb::disconnect_mobile_usb_and_restore_local(
                app,
                state,
                usb_teardown_reason,
            );
        }
        crate::commands::vault::release_mobile_native_sessions(app, state, lock_reason);
        #[cfg(desktop)]
        {
            // Active processes keep running after lock, but all unresolved
            // proposals and run approvals fail closed immediately.
            let revoke_gateway_access = || match state.gateway.lock() {
                Ok(mut gw) => {
                    if gw.pairing.as_ref().is_some_and(|pairing| {
                        pairing.actor_kind == crate::gateway::GatewayActorKind::CliAgent
                    }) {
                        gw.cancel_pairing();
                    }
                    gw.revoke_all_grants();
                }
                Err(_) => tracing::warn!("vault lock transition: gateway mutex poisoned"),
            };
            match state.env_runtime.commit_guard() {
                Ok(_commit_guard) => {
                    state.env_runtime.cancel_pending_for_lock();
                    revoke_gateway_access();
                }
                Err(error) => {
                    tracing::warn!(
                        code = %error.code,
                        "vault lock transition: Env Runtime commit gate unavailable"
                    );
                    // Vault lock still invalidates Gateway authority even if
                    // the Env Runtime serialization gate was poisoned.
                    revoke_gateway_access();
                }
            }
            match state.ssh_agent.lock() {
                Ok(mut agent) => {
                    let stop_reason = if lock_reason == "system_sleep" {
                        crate::ssh_agent::StopReason::SystemSleep
                    } else {
                        crate::ssh_agent::StopReason::VaultLock
                    };
                    agent.stop_with_reason(stop_reason);
                }
                Err(_) => tracing::warn!("vault lock transition: SSH agent mutex poisoned"),
            }
            perform_volume_teardown(app, &state.volume_manager);
        }
        // Clear credential identities from ASCredentialIdentityStore on vault lock
        crate::credential_provider_bridge::on_vault_locked(app);
        let _ = crate::commands::catalog::purge_catalog_preview_cache_for_app(app, "vault-lock");
        let _ = app.emit("vault:locked", serde_json::json!({"reason": lock_reason}));
    } else if !was_unlocked && now_unlocked {
        #[cfg(desktop)]
        {
            match state.volume_manager.lock() {
                Ok(mut vm) => {
                    vm.notify_unlocked();
                    let st = volume_status_from_vm(&vm);
                    let _ = app.emit("volume:status", &st);
                }
                Err(_) => tracing::warn!("vault unlock transition: volume manager mutex poisoned"),
            }

            let (should_auto_mount, should_auto_start_ssh_agent) =
                match state.session_settings.lock() {
                    Ok(s) => (
                        s.auto_mount_after_unlock,
                        s.auto_start_ssh_agent_after_unlock,
                    ),
                    Err(_) => {
                        tracing::warn!("vault unlock transition: session settings mutex poisoned");
                        (false, false)
                    }
                };
            if should_auto_mount {
                schedule_vault_auto_mount_after_unlock(app, state);
            }
            if should_auto_start_ssh_agent {
                schedule_vault_ssh_agent_auto_start_after_unlock(app, state);
            }
        }
        // Sync credential identities to ASCredentialIdentityStore on vault unlock
        crate::credential_provider_bridge::on_vault_unlocked(app);
    }
}

#[cfg(desktop)]
fn schedule_vault_auto_mount_after_unlock(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) {
    let app = app.clone();
    let adapter = state.adapter.clone();
    let volume_manager = state.volume_manager.clone();
    let task_lifecycle = state.task_lifecycle.clone();

    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::VaultAutoMountAfterUnlock,
        move |mut shutdown_rx| async move {
            tokio::select! {
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        tracing::info!("Vault unlock auto-mount stopped by lifecycle shutdown");
                    }
                }
                _ = tokio::task::yield_now() => {
                    let _ = volume_mount_inner(app, adapter, volume_manager, None).await;
                }
            }
        },
    ) {
        tracing::warn!("Vault unlock auto-mount task was not scheduled: {error}");
    }
}

#[cfg(desktop)]
fn schedule_vault_ssh_agent_auto_start_after_unlock(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) {
    let app = app.clone();
    let task_lifecycle = state.task_lifecycle.clone();

    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::VaultSshAgentAutoStartAfterUnlock,
        move |mut shutdown_rx| async move {
            tokio::select! {
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        tracing::info!(
                            "Vault unlock SSH agent auto-start stopped by lifecycle shutdown"
                        );
                    }
                }
                _ = tokio::task::yield_now() => {
                    let _ = crate::commands::ssh_agent_cmds::reconcile_ssh_agent_with_vault(
                        &app, true,
                    )
                    .await;
                }
            }
        },
    ) {
        tracing::warn!("Vault unlock SSH agent auto-start task was not scheduled: {error}");
    }
}

pub(crate) fn lock_vault_with_reason(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    reason: &str,
) -> Result<(), String> {
    let (was_unlocked, now_unlocked) = {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        let was_unlocked = adapter.is_unlocked();
        let req = RpcRequest::new("vault:lock".to_string(), serde_json::Value::Null);
        let resp = adapter.handle(&req);
        if let Some(error) = lock_response_error(&resp) {
            return Err(error);
        }
        adapter
            .save()
            .map_err(|error| format!("Failed to save vault lock state: {error}"))?;
        flush_core_events(app, adapter.as_mut());
        match state.storage_root.lock() {
            Ok(root) => emit_basic_state(app, &root, adapter.as_ref()),
            Err(_) => tracing::warn!("lock_vault_with_reason: storage root mutex poisoned"),
        }
        (was_unlocked, adapter.is_unlocked())
    };

    handle_lock_transition_with_reason(app, state, was_unlocked, now_unlocked, reason);
    Ok(())
}

fn lock_response_error(resp: &RpcResponse) -> Option<String> {
    match resp {
        RpcResponse::Error { error, code, .. } => Some(match code {
            Some(code) => format!("{error} ({code})"),
            None => error.clone(),
        }),
        RpcResponse::Success { .. } => None,
    }
}
