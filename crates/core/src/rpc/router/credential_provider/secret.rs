//! `credential_provider:get_secret` handler + OTP generation helper.

use crate::rpc::types::RpcResponse;

use super::super::state::RpcRouter;
use super::request::CredentialProviderSecretRequest;

impl RpcRouter {
    pub(in crate::rpc::router) fn credential_provider_get_secret(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight_typed() {
            return err.into_rpc_response();
        }

        let request = match CredentialProviderSecretRequest::parse(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };

        let context = match self.credential_provider_extract_context(data, false) {
            Ok(c) => c,
            Err(e) => return e.into_rpc_response(),
        };

        match self.credential_provider_get_secret_service(request, context) {
            Ok(result) => RpcResponse::success(serde_json::json!({
                "credential_id": result.credential_id,
                "username": result.username,
                "password": result.password,
                "otp": result.otp,
            })),
            Err(error) => error.into_rpc_response(),
        }
    }
}
