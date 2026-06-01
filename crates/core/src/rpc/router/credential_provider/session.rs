//! Provider session lifecycle, validation, allowlist guard, and status.

use crate::rpc::types::{CredentialProviderStatusResponse, RpcResponse};

use super::super::state::RpcRouter;
use super::error::CredentialProviderCommandError;
use super::request::CredentialProviderCloseSessionRequest;

impl RpcRouter {
    pub(in crate::rpc::router) fn credential_provider_status(&self) -> RpcResponse {
        RpcResponse::success(CredentialProviderStatusResponse {
            enabled: self.credential_provider_runtime.is_enabled(),
            vault_open: self.session.is_some(),
            capability_matrix: super::super::credential_types::capability_matrix(),
            passkeys_lite_status: super::super::credential_types::passkeys_lite_status_matrix(),
            command_error_map: super::super::credential_types::command_error_map(),
        })
    }

    pub(in crate::rpc::router) fn credential_provider_open_session(&mut self) -> RpcResponse {
        match self.credential_provider_open_session_service() {
            Ok(result) => RpcResponse::success(serde_json::json!({
                "provider_session": result.provider_session,
                "expires_at_ms": result.expires_at_ms,
            })),
            Err(error) => error.into_rpc_response(),
        }
    }

    pub(in crate::rpc::router) fn credential_provider_close_session(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let request = match CredentialProviderCloseSessionRequest::parse(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.credential_provider_close_session_service(request.provider_session);
        RpcResponse::success(serde_json::json!({}))
    }

    pub(in crate::rpc::router) fn credential_provider_preflight(&self) -> Result<(), RpcResponse> {
        self.credential_provider_preflight_typed()
            .map_err(CredentialProviderCommandError::into_rpc_response)
    }
}
