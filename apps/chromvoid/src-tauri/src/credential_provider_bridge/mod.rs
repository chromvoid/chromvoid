#![cfg_attr(not(any(target_os = "ios", target_os = "macos")), allow(dead_code))]

//! Apple/mobile credential provider bridge and shared runtime access.
//!
//! Listens for Darwin notifications from the Credential Provider Extension,
//! processes RPC requests via the credential_provider commands, and writes
//! responses back to the shared UserDefaults (App Group).
//!
//! Also handles credential identity store synchronization on vault lock/unlock.

#[cfg(any(target_os = "ios", target_os = "macos"))]
use chromvoid_client_runtime::provider::{
    command_allowed as provider_bridge_command_allowed,
    command_requires_local_core as provider_bridge_command_requires_local_core,
};
use std::sync::Arc;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use std::sync::{Mutex, OnceLock, Weak};

#[cfg(any(target_os = "ios", target_os = "macos"))]
use serde_json::Value;

#[cfg(any(target_os = "ios", target_os = "macos"))]
use crate::core_adapter::CoreAdapter;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use crate::module_access::MODULE_CREDENTIAL_PROVIDER;
use crate::task_lifecycle::TaskLifecycleRuntime;
#[cfg(any(target_os = "ios", target_os = "macos"))]
use crate::task_lifecycle::{ExternalTaskName, ExternalTaskReadiness};
#[cfg(any(target_os = "ios", target_os = "macos"))]
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
#[cfg(any(target_os = "ios", target_os = "macos"))]
use tauri::Manager;

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod ffi;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod identity_store;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod ipc_handler;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod notifications;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod otp_policy;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod secret_store;
#[cfg(target_os = "macos")]
pub(crate) mod settings;
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod user_defaults;

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

#[cfg(target_os = "macos")]
pub(crate) fn otp_capability_status(selected: bool) -> Value {
    let platform_version_major = otp_policy::otp_autofill_platform_version_major();
    let rollout_enabled = otp_policy::otp_autofill_rollout_enabled();
    let bridge_available = runtime_ready();
    let status = otp_autofill_native_status(platform_version_major, rollout_enabled, selected);

    serde_json::json!({
        "oneTimeCodeAutofill": {
            "status": status,
            "platformVersionMajor": platform_version_major,
            "apiAvailable": platform_version_major >= 15,
            "rolloutEnabled": rollout_enabled,
            "bridgeAvailable": bridge_available,
        },
        "verificationCodeSetupHandler": {
            "status": "available",
            "scheme": "otpauth",
            "defaultSelection": "unverified",
        },
    })
}

#[cfg(any(test, target_os = "macos"))]
fn otp_autofill_native_status(
    platform_version_major: u64,
    rollout_enabled: bool,
    selected: bool,
) -> &'static str {
    if platform_version_major < 15 {
        "unsupported_os"
    } else if !rollout_enabled {
        "provider_disabled"
    } else if !selected {
        "extension_not_enabled"
    } else {
        // Module access and vault state are resolved reactively in the host UI.
        "unverified"
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
    if !provider_bridge_command_allowed(command) {
        tracing::warn!(
            command = command,
            "credential_provider_bridge: rejected disallowed provider RPC command"
        );
        return RpcResponse::error(
            "Provider bridge command is not allowed",
            Some("POLICY_DENIED".to_string()),
        );
    }

    let response = match adapter.lock() {
        Ok(mut adapter) => {
            if provider_bridge_command_requires_local_core(command)
                && !matches!(adapter.mode(), crate::core_adapter::CoreMode::Local)
            {
                return RpcResponse::error(
                    "Apple Credential Provider requires local Core adapter mode",
                    Some("REMOTE_CORE_UNSUPPORTED".to_string()),
                );
            }

            if command == "credential_provider:getOneTimeCode" {
                if let Err(error) = otp_policy::ensure_otp_autofill_enabled() {
                    return RpcResponse::error(error.message, Some(error.code));
                }
            }

            if provider_bridge_command_requires_local_core(command) {
                let caps = crate::types::runtime_capabilities_for_current_target();
                if let Err(error) = crate::module_access::guard_module_for_adapter(
                    adapter.as_mut(),
                    MODULE_CREDENTIAL_PROVIDER,
                    &caps,
                ) {
                    return module_denial_response(error);
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

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn module_denial_response(error: crate::types::RpcResult<Value>) -> RpcResponse {
    match error {
        crate::types::RpcResult::Error { error, code, .. } => RpcResponse::error(error, code),
        crate::types::RpcResult::Success { .. } => RpcResponse::error(
            "Credential Provider module access unavailable",
            Some("INTERNAL".to_string()),
        ),
    }
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
    identity_store::schedule_credential_identity_sync_on_unlock(app_handle);
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn on_vault_unlocked(_app_handle: &tauri::AppHandle) {}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn on_vault_locked(app_handle: &tauri::AppHandle) {
    crate::otp_import_handoff::clear_pending_otp_import();
    identity_store::cancel_credential_identity_sync(app_handle);
    identity_store::clear_credential_identities_on_lock();
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn on_vault_locked(_app_handle: &tauri::AppHandle) {}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn on_passmanager_mutation(app_handle: &tauri::AppHandle, command: &str) {
    if matches!(
        command,
        "passmanager:entry:create"
            | "passmanager:entry:save"
            | "passmanager:entry:delete"
            | "passmanager:entry:move"
            | "passmanager:entry:rename"
            | "passmanager:otp:setSecret"
            | "passmanager:otp:removeSecret"
            | "passmanager:otp:renameSecret"
    ) {
        identity_store::schedule_credential_identity_sync_after_mutation(app_handle);
    }
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub(crate) fn on_identity_policy_status(app_handle: &tauri::AppHandle, enabled: bool) {
    if enabled {
        identity_store::schedule_credential_identity_sync_for_policy(app_handle);
    } else {
        identity_store::cancel_credential_identity_sync(app_handle);
        identity_store::clear_credential_identities_on_lock();
    }
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub(crate) fn on_identity_policy_status(_app_handle: &tauri::AppHandle, _enabled: bool) {}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn on_passmanager_mutation(_app_handle: &tauri::AppHandle, _command: &str) {}

#[cfg(test)]
mod tests {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    use crate::core_adapter::{CoreAdapter, CoreMode, RemoteHost};
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    use serde_json::Value;
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    use std::sync::{Arc, Mutex};

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    struct RecordingAdapter {
        mode: CoreMode,
        commands: Arc<Mutex<Vec<String>>>,
        response: RpcResponse,
    }

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    impl CoreAdapter for RecordingAdapter {
        fn mode(&self) -> CoreMode {
            self.mode.clone()
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, request: &RpcRequest) -> RpcResponse {
            self.commands
                .lock()
                .expect("recording adapter commands")
                .push(request.command.clone());
            self.response.clone()
        }

        fn handle_with_stream(
            &mut self,
            request: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(self.handle(request))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    #[test]
    fn non_provider_command_is_denied_before_adapter_dispatch() {
        let commands = Arc::new(Mutex::new(Vec::new()));
        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
            Arc::new(Mutex::new(Box::new(RecordingAdapter {
                mode: CoreMode::Local,
                commands: commands.clone(),
                response: RpcResponse::success(serde_json::json!({})),
            })));
        let response =
            super::dispatch_provider_rpc(&adapter, "vault:unlock", serde_json::json!({}));
        assert!(matches!(
            response,
            RpcResponse::Error { code: Some(code), .. } if code == "POLICY_DENIED"
        ));
        assert!(commands.lock().expect("recorded commands").is_empty());
    }

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    #[test]
    fn local_core_guard_rejects_vault_commands_before_core_dispatch() {
        let commands = Arc::new(Mutex::new(Vec::new()));
        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
            Arc::new(Mutex::new(Box::new(RecordingAdapter {
                mode: CoreMode::Remote {
                    host: RemoteHost::TauriRemoteWss {
                        peer_id: "peer".to_string(),
                    },
                },
                commands: commands.clone(),
                response: RpcResponse::success(serde_json::json!({})),
            })));

        let response = super::dispatch_provider_rpc(
            &adapter,
            "credential_provider:getOneTimeCode",
            serde_json::json!({}),
        );

        assert!(matches!(
            response,
            RpcResponse::Error { code: Some(code), .. } if code == "REMOTE_CORE_UNSUPPORTED"
        ));
        assert!(commands.lock().expect("recorded commands").is_empty());
    }

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    #[test]
    fn module_guard_admits_vault_command_without_any_licence() {
        let commands = Arc::new(Mutex::new(Vec::new()));
        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
            Arc::new(Mutex::new(Box::new(RecordingAdapter {
                mode: CoreMode::Local,
                commands: commands.clone(),
                response: RpcResponse::success(serde_json::json!({"secret": "synthetic"})),
            })));

        let response = super::dispatch_provider_rpc(
            &adapter,
            "credential_provider:getSecret",
            serde_json::json!({}),
        );

        let module_enabled =
            crate::types::runtime_capabilities_for_current_target().supports_autofill;
        if module_enabled {
            assert!(matches!(response, RpcResponse::Success { .. }));
            assert_eq!(
                commands.lock().expect("recorded commands").as_slice(),
                ["core:capabilities", "credential_provider:getSecret"]
            );
        } else {
            assert!(matches!(
                response,
                RpcResponse::Error { code: Some(code), .. }
                    if code == "FEATURE_UNSUPPORTED_ON_PLATFORM"
            ));
            assert_eq!(
                commands.lock().expect("recorded commands").as_slice(),
                ["core:capabilities"]
            );
        }
    }

    #[test]
    fn otp_native_status_never_claims_ready_without_host_policy_state() {
        assert_eq!(
            super::otp_autofill_native_status(14, true, true),
            "unsupported_os"
        );
        assert_eq!(
            super::otp_autofill_native_status(15, false, true),
            "provider_disabled"
        );
        assert_eq!(
            super::otp_autofill_native_status(15, true, false),
            "extension_not_enabled"
        );
        assert_eq!(
            super::otp_autofill_native_status(15, true, true),
            "unverified"
        );
    }

    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    #[test]
    fn runtime_ready_defaults_false_without_apple_listener() {
        assert!(!super::runtime_ready());
    }
}
