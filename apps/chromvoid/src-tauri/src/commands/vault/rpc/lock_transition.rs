use tauri::Emitter;

use crate::app_state::AppState;

#[cfg(desktop)]
use crate::commands::volume_ops::{
    perform_volume_teardown, volume_mount_inner, volume_status_from_vm,
};

pub(super) async fn handle_lock_transition(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    was_unlocked: bool,
    now_unlocked: bool,
) {
    #[cfg(not(desktop))]
    let _ = state;

    if was_unlocked && !now_unlocked {
        let invalidated =
            crate::mobile::android::invalidate_all_password_save_requests("vault_lock");
        if invalidated > 0 {
            crate::mobile::android::notify_password_save_review_result(None, "dismissed", false);
        }
        #[cfg(desktop)]
        {
            if let Ok(mut gw) = state.gateway.lock() {
                gw.revoke_all_grants();
            }
            if let Ok(mut agent) = state.ssh_agent.lock() {
                agent.stop();
            }
            perform_volume_teardown(app, &state.volume_manager);
        }
        // Clear credential identities from ASCredentialIdentityStore on vault lock
        crate::credential_provider_bridge::on_vault_locked();
        let _ = app.emit("vault:locked", serde_json::json!({"reason": "manual"}));
    } else if !was_unlocked && now_unlocked {
        #[cfg(desktop)]
        {
            if let Ok(mut vm) = state.volume_manager.lock() {
                vm.notify_unlocked();
                let st = volume_status_from_vm(&vm);
                let _ = app.emit("volume:status", &st);
            }

            let should_auto_mount = match state.session_settings.lock() {
                Ok(s) => s.auto_mount_after_unlock,
                Err(_) => false,
            };
            if should_auto_mount {
                let app2 = app.clone();
                let adapter = state.adapter.clone();
                let vm = state.volume_manager.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = volume_mount_inner(app2, adapter, vm, None).await;
                });
            }
        }
        // Sync credential identities to ASCredentialIdentityStore on vault unlock
        crate::credential_provider_bridge::on_vault_unlocked(app);
    }
}
