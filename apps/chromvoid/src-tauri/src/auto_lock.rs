use tauri::{Emitter, Manager};
use tracing::info;

use crate::app_state::AppState;
#[cfg(desktop)]
use crate::commands::volume_ops::{volume_spawn_join_backend, volume_take_backend_on_vault_lock};
use crate::helpers::{emit_basic_state, flush_core_events};

pub(crate) fn spawn_auto_lock_thread(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(10));

            let state: tauri::State<'_, AppState> = app_handle.state();

            let timeout = match state.session_settings.lock() {
                Ok(s) => s.auto_lock_timeout_secs,
                Err(_) => continue,
            };

            if timeout == 0 {
                continue;
            }

            let should_lock = match state.last_activity.lock() {
                Ok(last) => last.elapsed().as_secs() >= timeout,
                Err(_) => false,
            };

            if !should_lock {
                continue;
            }

            let is_unlocked = match state.adapter.lock() {
                Ok(a) => a.is_unlocked(),
                Err(_) => false,
            };

            if is_unlocked {
                info!("auto_lock: locking vault due to inactivity");
                let invalidated =
                    crate::mobile::android::invalidate_all_password_save_requests("auto_lock");
                if invalidated > 0 {
                    crate::mobile::android::notify_password_save_review_result(
                        None,
                        "dismissed",
                        false,
                    );
                }
                if let Ok(mut adapter) = state.adapter.lock() {
                    let req = chromvoid_core::rpc::types::RpcRequest::new(
                        "vault:lock".to_string(),
                        serde_json::Value::Null,
                    );
                    let _ = adapter.handle(&req);

                    let _ = adapter.save();
                    flush_core_events(&app_handle, adapter.as_mut());
                    if let Ok(root) = state.storage_root.lock() {
                        emit_basic_state(&app_handle, &root, adapter.as_ref());
                    }

                    // Revoke all capability grants on vault lock.
                    #[cfg(desktop)]
                    if let Ok(mut gw) = state.gateway.lock() {
                        gw.revoke_all_grants();
                    }

                    // Stop SSH agent on vault lock.
                    #[cfg(desktop)]
                    if let Ok(mut agent) = state.ssh_agent.lock() {
                        agent.stop();
                    }

                    // Clear credential identities from ASCredentialIdentityStore on auto-lock
                    crate::credential_provider_bridge::on_vault_locked();

                    let _ =
                        app_handle.emit("vault:locked", serde_json::json!({"reason": "auto_lock"}));
                }
                #[cfg(desktop)]
                {
                    let app2 = app_handle.clone();
                    let backend = volume_take_backend_on_vault_lock(&app2, &state.volume_manager);
                    if let Some(h) = backend {
                        volume_spawn_join_backend(h);
                    }
                }
            }
        }
    });
}
