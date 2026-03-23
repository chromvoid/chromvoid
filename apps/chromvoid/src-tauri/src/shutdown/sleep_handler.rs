use std::sync::Arc;
use std::sync::Mutex;

use tauri::{Emitter, Manager};

use crate::app_state::AppState;
use crate::commands::volume_ops::perform_volume_teardown;
use crate::core_adapter::CoreAdapter;
use crate::helpers::*;
use crate::sleep_watcher::SleepWatcher;

pub(crate) struct VaultSleepHandler {
    pub(crate) app_handle: tauri::AppHandle,
    pub(crate) storage_root: Arc<Mutex<std::path::PathBuf>>,
    pub(crate) adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    pub(crate) lock_on_sleep: bool,
    pub(crate) last_activity: Arc<Mutex<std::time::Instant>>,
}

impl SleepWatcher for VaultSleepHandler {
    fn on_sleep(&self) {
        if !self.lock_on_sleep {
            return;
        }

        let is_unlocked = match self.adapter.lock() {
            Ok(a) => a.is_unlocked(),
            Err(_) => return,
        };

        if !is_unlocked {
            return;
        }

        if let Ok(mut adapter) = self.adapter.lock() {
            let req = chromvoid_core::rpc::types::RpcRequest::new(
                "vault:lock".to_string(),
                serde_json::Value::Null,
            );
            let _ = adapter.handle(&req);
            let _ = adapter.save();

            flush_core_events(&self.app_handle, adapter.as_mut());
            if let Ok(root) = self.storage_root.lock() {
                emit_basic_state(&self.app_handle, &root, adapter.as_ref());
            }

            // Revoke all capability grants on vault lock (system sleep).
            let state: tauri::State<'_, AppState> = self.app_handle.state();
            if let Ok(mut gw) = state.gateway.lock() {
                let gw: &mut crate::gateway::GatewayState = &mut gw;
                gw.revoke_all_grants();
            }

            // Stop SSH agent on vault lock (system sleep).
            if let Ok(mut agent) = state.ssh_agent.lock() {
                agent.stop();
            }

            // Clear credential identities from ASCredentialIdentityStore on sleep lock
            crate::credential_provider_bridge::on_vault_locked();

            let _ = self.app_handle.emit(
                "vault:locked",
                serde_json::json!({"reason": "system_sleep"}),
            );
        }
        {
            let state: tauri::State<'_, AppState> = self.app_handle.state();
            perform_volume_teardown(&self.app_handle, &state.volume_manager);
        }
    }

    fn on_wake(&self) {
        if let Ok(mut activity) = self.last_activity.lock() {
            *activity = std::time::Instant::now();
        }
    }
}
