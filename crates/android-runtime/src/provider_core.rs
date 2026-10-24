//! What a provider path may do with Core, and nothing more.
//!
//! Provider paths answer requests from other apps: an Autofill fill, a
//! Credential Manager query, a passkey ceremony. They need to send provider
//! commands, know whether Core is local, and persist after a passkey ceremony.
//! They must not be able to send anything else, so the host never lends them
//! its Core adapter; it lends a [`ProviderCore`].
//!
//! A host whose Core is a plain adapter wraps it in [`AdapterProviderCore`],
//! which refuses every command outside the provider allowlist. A host whose
//! Core sits behind a session implements the trait over that session's
//! admission instead, so a provider request is fenced by the same generation,
//! lock and cancellation as any other request.

use chromvoid_client_runtime::adapter::{CoreAdapter, CoreMode};
use chromvoid_client_runtime::provider::command_allowed;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

/// The code a refused non-provider command answers with. SPEC-215 reserves it
/// for a call the adapter itself forbids before anything reaches Core.
pub const PROVIDER_POLICY_DENIED: &str = "POLICY_DENIED";

pub trait ProviderCore {
    /// Sends one provider command. Anything outside
    /// `chromvoid_client_runtime::provider::command_allowed` is refused.
    fn handle(&mut self, request: &RpcRequest) -> RpcResponse;

    /// Provider paths run only against a local Core (SPEC-215 VR-007).
    fn mode(&self) -> CoreMode;

    /// Persists what a passkey ceremony changed. A session-backed host whose
    /// commands persist on their own may treat this as already done.
    fn save(&mut self) -> Result<(), String>;
}

/// A host's Core adapter narrowed to what a provider path may use.
pub struct AdapterProviderCore<'a>(pub &'a mut dyn CoreAdapter);

impl ProviderCore for AdapterProviderCore<'_> {
    fn handle(&mut self, request: &RpcRequest) -> RpcResponse {
        if !command_allowed(&request.command) {
            return RpcResponse::error(
                format!("{} is not a provider command", request.command),
                Some(PROVIDER_POLICY_DENIED),
            );
        }
        self.0.handle(request)
    }

    fn mode(&self) -> CoreMode {
        self.0.mode()
    }

    fn save(&mut self) -> Result<(), String> {
        self.0.save()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::unlocked_adapter;
    use serde_json::json;

    #[test]
    fn a_provider_path_cannot_send_anything_but_provider_commands() {
        let (_root, mut adapter) = unlocked_adapter();
        let mut core = AdapterProviderCore(adapter.as_mut());

        for command in [
            "passmanager:root:export",
            "vault:lock",
            "catalog:list",
            "master:setup",
        ] {
            let response = core.handle(&RpcRequest::new(command.to_string(), json!({})));
            match response {
                RpcResponse::Error { code, .. } => {
                    assert_eq!(code.as_deref(), Some(PROVIDER_POLICY_DENIED), "{command}")
                }
                RpcResponse::Success { .. } => {
                    panic!("{command} reached Core through a provider path")
                }
            }
        }
        assert!(
            adapter.is_unlocked(),
            "a refused vault:lock must not have run"
        );
    }

    #[test]
    fn provider_commands_pass_through() {
        let (_root, mut adapter) = unlocked_adapter();
        let mut core = AdapterProviderCore(adapter.as_mut());

        let status = core.handle(&RpcRequest::new(
            "credential_provider:status".to_string(),
            json!({}),
        ));
        assert!(status.is_ok());
    }
}
