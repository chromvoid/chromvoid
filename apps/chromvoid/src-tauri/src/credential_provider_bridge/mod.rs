#![cfg_attr(not(any(target_os = "ios", target_os = "macos")), allow(dead_code))]

//! Apple/mobile credential provider bridge and shared runtime access.
//!
//! Listens for Darwin notifications from the Credential Provider Extension,
//! processes RPC requests via the credential_provider commands, and writes
//! responses back to the shared UserDefaults (App Group).
//!
//! Also handles credential identity store synchronization on vault lock/unlock.

use std::sync::Arc;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use std::sync::{Mutex, OnceLock, Weak};

#[cfg(any(target_os = "ios", target_os = "macos"))]
use serde_json::Value;

#[cfg(any(target_os = "ios", target_os = "macos"))]
use crate::core_adapter::CoreAdapter;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use crate::credential_provider_contract::PasskeyLiteCommand;
use crate::task_lifecycle::TaskLifecycleRuntime;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use crate::task_lifecycle::{ExternalTaskName, ExternalTaskReadiness};
#[cfg(any(target_os = "ios", target_os = "macos"))]
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
#[cfg(any(target_os = "ios", target_os = "macos"))]
use tauri::Manager;

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod ffi;
mod identity_candidate;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod identity_store;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod ipc_handler;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod notifications;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod user_defaults;
#[cfg(any(target_os = "ios", target_os = "macos"))]
pub(crate) use user_defaults::APP_GROUP_ID;

#[cfg(any(target_os = "ios", target_os = "macos"))]
static TASK_LIFECYCLE: OnceLock<Weak<TaskLifecycleRuntime>> = OnceLock::new();

pub fn runtime_ready() -> bool {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        let Some(task_lifecycle) = TASK_LIFECYCLE.get().and_then(Weak::upgrade) else {
            return false;
        };
        match task_lifecycle.external_task_ready(ExternalTaskName::CredentialProviderBridge) {
            Ok(ready) => ready,
            Err(error) => {
                tracing::warn!("credential_provider_bridge: readiness lookup failed: {error}");
                false
            }
        }
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        false
    }
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn register_task_lifecycle(task_lifecycle: &Arc<TaskLifecycleRuntime>) {
    let _ = TASK_LIFECYCLE.set(Arc::downgrade(task_lifecycle));
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub(crate) fn provider_bridge_unavailable_response() -> RpcResponse {
    RpcResponse::error(
        "Provider bridge is not active",
        Some("PROVIDER_UNAVAILABLE".to_string()),
    )
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn dispatch_provider_rpc(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    command: &str,
    data: Value,
) -> RpcResponse {
    let response = match adapter.lock() {
        Ok(mut adapter) => {
            if PasskeyLiteCommand::from_bridge_command(command).is_some() {
                let platform_label = if cfg!(target_os = "ios") {
                    "iOS"
                } else {
                    "macOS"
                };
                if let Err(error) = crate::credential_provider_passkey::ensure_local_mode(
                    adapter.mode(),
                    platform_label,
                ) {
                    return RpcResponse::error(error.message, Some(error.code));
                }
            }

            let response = adapter.handle(&RpcRequest::new(command.to_string(), data));
            let _ = adapter.save();
            response
        }
        Err(_) => RpcResponse::error(
            "Internal error: adapter unavailable",
            Some("INTERNAL".to_string()),
        ),
    };

    response
}

// MARK: - Public API (platform-gated)

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn spawn_credential_provider_bridge(
    app_handle: tauri::AppHandle,
    task_lifecycle: Arc<TaskLifecycleRuntime>,
) {
    register_task_lifecycle(&task_lifecycle);

    if task_lifecycle.is_shutdown_requested() {
        tracing::warn!(
            "credential_provider_bridge: listener registration skipped: lifecycle shutdown requested"
        );
        return;
    }

    let Some(state) = app_handle.try_state::<crate::app_state::AppState>() else {
        tracing::warn!("credential_provider_bridge: AppState unavailable; listener not started");
        return;
    };
    let adapter = state.adapter.clone();
    let readiness = ExternalTaskReadiness::new();
    let listener = match ipc_handler::spawn_credential_provider_listener(adapter, readiness) {
        Ok(listener) => listener,
        Err(error) => {
            tracing::warn!("credential_provider_bridge: listener startup failed: {error}");
            return;
        }
    };

    if let Err(error) = task_lifecycle
        .register_external_thread(ExternalTaskName::CredentialProviderBridge, listener)
    {
        tracing::warn!("credential_provider_bridge: listener registration skipped: {error}");
    }
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn spawn_credential_provider_bridge(
    _app_handle: tauri::AppHandle,
    _task_lifecycle: Arc<TaskLifecycleRuntime>,
) {
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn on_vault_unlocked(app_handle: &tauri::AppHandle) {
    let _ = app_handle;
    identity_store::sync_credential_identities_on_unlock(app_handle);
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn on_vault_unlocked(_app_handle: &tauri::AppHandle) {}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn on_vault_locked() {
    identity_store::clear_credential_identities_on_lock();
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn on_vault_locked() {}

#[cfg(test)]
mod tests {
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    #[test]
    fn runtime_ready_defaults_false_without_apple_listener() {
        assert!(!super::runtime_ready());
    }
}
