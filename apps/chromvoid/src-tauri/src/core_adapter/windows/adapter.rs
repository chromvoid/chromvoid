use serde_json::Value;

use super::mapper::status_from_probe;
use super::models::*;
use crate::core_adapter::types::CoreAdapter;
use crate::credential_provider_contract::passkey_native_request_payload;
use crate::credential_provider_passkey::{
    dispatch_provider_rpc, ensure_local_mode, ensure_passkeys_supported, provider_policy_preflight,
    PasskeyRuntimeError,
};

pub struct WindowsPasskeyAdapter<'a, P = fn() -> WebAuthnCapability>
where
    P: Fn() -> WebAuthnCapability,
{
    adapter: &'a mut dyn CoreAdapter,
    flags: WindowsCredentialFeatureFlags,
    probe: P,
}

pub type WindowsPasskeyError = PasskeyRuntimeError;

impl<'a, P> WindowsPasskeyAdapter<'a, P>
where
    P: Fn() -> WebAuthnCapability,
{
    pub fn with_probe(
        adapter: &'a mut dyn CoreAdapter,
        flags: WindowsCredentialFeatureFlags,
        probe: P,
    ) -> Self {
        Self {
            adapter,
            flags,
            probe,
        }
    }

    pub fn status(&self) -> WindowsCredentialStatus {
        status_from_probe(&self.flags, (self.probe)())
    }

    pub fn handle(&mut self, request: &PasskeyLiteRequest) -> Result<Value, WindowsPasskeyError> {
        ensure_local_mode(self.adapter.mode(), "Windows")?;

        let status = self.status();
        ensure_passkeys_supported(
            status.passkeys_lite_ready,
            status.unsupported_reason.as_deref(),
            "UNSUPPORTED: windows passkeys-lite is unavailable",
        )?;

        self.policy_preflight()?;

        let payload = passkey_native_request_payload(
            "windows",
            status.webauthn_api_version.unwrap_or(0) as u64,
            &request.payload,
        );

        self.dispatch(request.command.rpc_command(), payload)
    }

    fn policy_preflight(&mut self) -> Result<(), WindowsPasskeyError> {
        provider_policy_preflight(self.adapter).map(|_| ())
    }

    fn dispatch(&mut self, command: &str, data: Value) -> Result<Value, WindowsPasskeyError> {
        dispatch_provider_rpc(self.adapter, command, data)
    }
}
