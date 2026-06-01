#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use crate::credential_provider_contract::passkey_native_request_payload;
pub use crate::credential_provider_contract::{PasskeyLiteCommand, PasskeyLiteRequest};
use crate::credential_provider_passkey::{
    dispatch_provider_rpc, ensure_local_mode, ensure_passkeys_supported, provider_policy_preflight,
    PasskeyRuntimeError,
};
use crate::CoreAdapter;
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::provider_status::{AndroidCredentialProviderStatus, PasskeysLiteState};
use super::runtime::with_shared_provider_adapter;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AndroidPasskeyPolicyState {
    pub local_only: bool,
    pub provider_enabled: bool,
    pub vault_open: bool,
}

pub type AndroidPasskeyError = PasskeyRuntimeError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedPasskeyRequest {
    pub request_id: String,
    pub request: PasskeyLiteRequest,
    pub policy: AndroidPasskeyPolicyState,
}

pub struct AndroidPasskeyAdapter<'a> {
    adapter: &'a mut dyn CoreAdapter,
    api_level: u64,
}

impl<'a> AndroidPasskeyAdapter<'a> {
    pub fn new(adapter: &'a mut dyn CoreAdapter, api_level: u64) -> Self {
        Self { adapter, api_level }
    }

    pub fn status(&self) -> AndroidCredentialProviderStatus {
        super::provider_status::android_provider_status_for_api(self.api_level)
    }

    #[cfg(test)]
    pub fn handle(&mut self, request: &PasskeyLiteRequest) -> Result<Value, AndroidPasskeyError> {
        let prepared = self.prepare_native_request(request)?;
        self.dispatch(request.command.rpc_command(), prepared.request.payload)
    }

    pub fn prepare_native_request(
        &mut self,
        request: &PasskeyLiteRequest,
    ) -> Result<PreparedPasskeyRequest, AndroidPasskeyError> {
        ensure_local_mode(self.adapter.mode(), "Android")?;

        let status = self.status();
        ensure_passkeys_supported(
            status.passkeys_lite == PasskeysLiteState::Ready,
            status.unsupported_reason.as_deref(),
            "passkeys_lite is unsupported on this Android API level",
        )?;

        let policy = self.policy_preflight()?;

        Ok(PreparedPasskeyRequest {
            request_id: Uuid::new_v4().to_string(),
            request: PasskeyLiteRequest {
                command: request.command,
                payload: passkey_native_request_payload(
                    "android",
                    self.api_level,
                    &request.payload,
                ),
            },
            policy,
        })
    }

    fn policy_preflight(&mut self) -> Result<AndroidPasskeyPolicyState, AndroidPasskeyError> {
        let policy = provider_policy_preflight(self.adapter)?;

        Ok(AndroidPasskeyPolicyState {
            local_only: false,
            provider_enabled: policy.provider_enabled,
            vault_open: policy.vault_open,
        })
    }

    pub fn dispatch_core_operation(
        &mut self,
        command: PasskeyLiteCommand,
        payload: Value,
    ) -> Result<Value, AndroidPasskeyError> {
        ensure_local_mode(self.adapter.mode(), "Android")?;

        let status = self.status();
        ensure_passkeys_supported(
            status.passkeys_lite == PasskeysLiteState::Ready,
            status.unsupported_reason.as_deref(),
            "passkeys_lite is unsupported on this Android API level",
        )?;

        self.policy_preflight()?;
        let payload = core_operation_payload(payload, self.api_level)?;
        let result = dispatch_provider_rpc(self.adapter, command.rpc_command(), payload)?;
        if matches!(
            command,
            PasskeyLiteCommand::Create | PasskeyLiteCommand::Get
        ) {
            self.adapter.save().map_err(|message| PasskeyRuntimeError {
                code: "INTERNAL".to_string(),
                message,
            })?;
        }
        Ok(result)
    }

    #[cfg(test)]
    fn dispatch(&mut self, command: &str, data: Value) -> Result<Value, AndroidPasskeyError> {
        dispatch_provider_rpc(self.adapter, command, data)
    }
}

pub fn runtime_passkey_preflight(command: &str, payload: Value, api_level: u64) -> Value {
    let Some(command) = PasskeyLiteCommand::from_bridge_command(command) else {
        return json!({
            "ok": false,
            "code": "UNSUPPORTED",
            "message": "Unsupported Android passkey command",
        });
    };

    let request = PasskeyLiteRequest { command, payload };
    let prepared = match with_shared_provider_adapter(|adapter| {
        let mut passkeys = AndroidPasskeyAdapter::new(adapter, api_level);
        passkeys.prepare_native_request(&request)
    }) {
        Ok(prepared) => prepared,
        Err(message) => {
            return json!({
                "ok": false,
                "code": "PROVIDER_UNAVAILABLE",
                "message": message,
            });
        }
    };

    match prepared {
        Ok(prepared) => json!({
            "ok": true,
            "request_id": prepared.request_id,
            "command": prepared.request.command.bridge_command_name(),
            "native_request": prepared.request.payload,
            "policy": prepared.policy,
        }),
        Err(error) => json!({
            "ok": false,
            "code": error.code,
            "message": error.message,
        }),
    }
}

pub fn runtime_passkey_query(payload: Value, api_level: u64) -> Value {
    runtime_passkey_core_operation(PasskeyLiteCommand::Query, payload, api_level)
}

pub fn runtime_passkey_create(payload: Value, api_level: u64) -> Value {
    runtime_passkey_core_operation(PasskeyLiteCommand::Create, payload, api_level)
}

pub fn runtime_passkey_get(payload: Value, api_level: u64) -> Value {
    runtime_passkey_core_operation(PasskeyLiteCommand::Get, payload, api_level)
}

fn runtime_passkey_core_operation(
    command: PasskeyLiteCommand,
    payload: Value,
    api_level: u64,
) -> Value {
    let request_id = Uuid::new_v4().to_string();
    let result = match with_shared_provider_adapter(|adapter| {
        let mut passkeys = AndroidPasskeyAdapter::new(adapter, api_level);
        passkeys.dispatch_core_operation(command, payload)
    }) {
        Ok(result) => result,
        Err(message) => {
            return json!({
                "ok": false,
                "code": "PROVIDER_UNAVAILABLE",
                "message": message,
            });
        }
    };

    match result {
        Ok(result) if command == PasskeyLiteCommand::Query => json!({
            "ok": true,
            "request_id": request_id,
            "passkeys": result.get("passkeys").cloned().unwrap_or_else(|| json!([])),
        }),
        Ok(result) => json!({
            "ok": true,
            "credential_id": result
                .get("credentialIdB64Url")
                .and_then(|value| value.as_str())
                .unwrap_or_default(),
            "response_json": result.to_string(),
        }),
        Err(error) => json!({
            "ok": false,
            "code": error.code,
            "message": error.message,
        }),
    }
}

fn core_operation_payload(payload: Value, api_level: u64) -> Result<Value, PasskeyRuntimeError> {
    let request_json = payload
        .get("request_json")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| PasskeyRuntimeError {
            code: "EMPTY_PAYLOAD".to_string(),
            message: "Android passkey request_json is required".to_string(),
        })?;
    let mut request: Value =
        serde_json::from_str(request_json).map_err(|error| PasskeyRuntimeError {
            code: "INVALID_CONTEXT".to_string(),
            message: format!("Android passkey request_json is invalid: {error}"),
        })?;

    if let Some(origin) = payload
        .get("origin")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        request["origin"] = json!(origin);
    }
    if let Some(client_data_hash) = payload
        .get("client_data_hash")
        .or_else(|| payload.get("clientDataHash"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        request["clientDataHash"] = json!(client_data_hash);
    }

    let mut out = json!({
        "platform": "android",
        "platform_version_major": api_level,
        "request": request,
    });
    if let Some(credential_id) = payload
        .get("selected_credential_id")
        .or_else(|| payload.get("credentialIdB64Url"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        out["credentialIdB64Url"] = json!(credential_id);
    }
    Ok(out)
}
