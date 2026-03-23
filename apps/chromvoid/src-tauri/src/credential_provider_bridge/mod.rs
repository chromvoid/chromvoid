#![cfg_attr(not(any(target_os = "ios", target_os = "macos")), allow(dead_code))]

//! Apple/mobile credential provider bridge and shared runtime access.
//!
//! Listens for Darwin notifications from the Credential Provider Extension,
//! processes RPC requests via the credential_provider commands, and writes
//! responses back to the shared UserDefaults (App Group).
//!
//! Also handles credential identity store synchronization on vault lock/unlock.

use std::sync::{Arc, Mutex};

#[cfg(any(target_os = "ios", target_os = "macos"))]
use serde_json::Value;

use crate::core_adapter::CoreAdapter;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod ffi;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod identity_store;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod ipc_handler;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod notifications;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod user_defaults;

static SHARED_APP_ADAPTER: Mutex<Option<Arc<Mutex<Box<dyn CoreAdapter>>>>> = Mutex::new(None);

pub fn register_shared_app_adapter(adapter: Arc<Mutex<Box<dyn CoreAdapter>>>) {
    if let Ok(mut guard) = SHARED_APP_ADAPTER.lock() {
        *guard = Some(adapter);
    }
}

pub fn shared_app_adapter() -> Option<Arc<Mutex<Box<dyn CoreAdapter>>>> {
    SHARED_APP_ADAPTER
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

pub fn runtime_ready() -> bool {
    shared_app_adapter().is_some()
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn dispatch_provider_rpc(command: &str, data: Value) -> RpcResponse {
    let Some(adapter) = shared_app_adapter() else {
        return RpcResponse::error(
            "Provider bridge is not active",
            Some("PROVIDER_UNAVAILABLE".to_string()),
        );
    };

    let response = match adapter.lock() {
        Ok(mut adapter) => {
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
pub fn spawn_credential_provider_bridge(app_handle: tauri::AppHandle) {
    ipc_handler::spawn_credential_provider_listener(app_handle);
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn spawn_credential_provider_bridge(_app_handle: tauri::AppHandle) {}

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
