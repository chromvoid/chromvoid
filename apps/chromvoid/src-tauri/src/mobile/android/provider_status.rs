#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde::Serialize;
use serde_json::{json, Value};

use super::runtime;

pub const ANDROID_CREDENTIAL_PROVIDER_MIN_API: u64 = 28;
pub const ANDROID_PASSKEYS_LITE_MIN_API: u64 = 34;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderPathState {
    Ready,
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasskeysLiteState {
    Ready,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AndroidCredentialProviderStatus {
    pub api_level: u64,
    pub password_provider: ProviderPathState,
    pub passkeys_lite: PasskeysLiteState,
    pub autofill_fallback: ProviderPathState,
    pub unsupported_reason: Option<String>,
}

pub fn android_provider_status_for_api(api_level: u64) -> AndroidCredentialProviderStatus {
    if api_level < ANDROID_CREDENTIAL_PROVIDER_MIN_API {
        return AndroidCredentialProviderStatus {
            api_level,
            password_provider: ProviderPathState::Unsupported,
            passkeys_lite: PasskeysLiteState::Unsupported,
            autofill_fallback: ProviderPathState::Unsupported,
            unsupported_reason: Some(format!(
                "Credential provider requires Android API {}+",
                ANDROID_CREDENTIAL_PROVIDER_MIN_API
            )),
        };
    }

    if api_level < ANDROID_PASSKEYS_LITE_MIN_API {
        return AndroidCredentialProviderStatus {
            api_level,
            password_provider: ProviderPathState::Ready,
            passkeys_lite: PasskeysLiteState::Unsupported,
            autofill_fallback: ProviderPathState::Ready,
            unsupported_reason: Some(format!(
                "passkeys_lite requires Android API {}+",
                ANDROID_PASSKEYS_LITE_MIN_API
            )),
        };
    }

    AndroidCredentialProviderStatus {
        api_level,
        password_provider: ProviderPathState::Ready,
        passkeys_lite: PasskeysLiteState::Ready,
        autofill_fallback: ProviderPathState::Ready,
        unsupported_reason: None,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AndroidProviderRuntimeStatus {
    pub enabled: bool,
    pub vault_open: bool,
    pub android_api_level: u64,
    pub runtime_ready: bool,
    pub autofill_surface_available: bool,
    pub password_provider_surface_available: bool,
    pub passkey_surface_available: bool,
}

fn provider_runtime_status_for_api(api_level: u64) -> AndroidProviderRuntimeStatus {
    let runtime_ready = runtime::runtime_ready();
    let mut enabled = false;
    let mut vault_open = false;

    if let Some(adapter_handle) = runtime::shared_app_adapter() {
        if let Ok(mut adapter) = adapter_handle.lock() {
            let response = adapter.handle(&RpcRequest::new(
                "credential_provider:status".to_string(),
                json!({}),
            ));
            if let RpcResponse::Success { result, .. } = response {
                enabled = result
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                vault_open = result
                    .get("vault_open")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
            }
        }
    }

    AndroidProviderRuntimeStatus {
        enabled,
        vault_open,
        android_api_level: api_level,
        runtime_ready,
        autofill_surface_available: runtime_ready
            && api_level >= ANDROID_CREDENTIAL_PROVIDER_MIN_API,
        password_provider_surface_available: runtime_ready
            && api_level >= ANDROID_PASSKEYS_LITE_MIN_API,
        passkey_surface_available: runtime_ready && api_level >= ANDROID_PASSKEYS_LITE_MIN_API,
    }
}

pub fn runtime_provider_status(api_level: u64) -> Value {
    json!({
        "ok": true,
        "result": provider_runtime_status_for_api(api_level),
    })
}

pub fn provider_runtime_unavailable(message: &str) -> Value {
    json!({
        "ok": false,
        "degraded": {
            "code": "PROVIDER_UNAVAILABLE",
            "message": message,
        }
    })
}
