#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use crate::credential_provider_contract::passkey_native_request_payload;
pub use crate::credential_provider_contract::{PasskeyLiteCommand, PasskeyLiteRequest};
#[cfg(test)]
use crate::credential_provider_passkey::dispatch_provider_rpc;
use crate::credential_provider_passkey::{
    ensure_local_mode, ensure_passkeys_supported, provider_policy_preflight, PasskeyRuntimeError,
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
            local_only: true,
            provider_enabled: policy.provider_enabled,
            vault_open: policy.vault_open,
        })
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
