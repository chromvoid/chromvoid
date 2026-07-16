//! Least-privilege one-time-code provider handler (SPEC-242).

use crate::rpc::types::{CredentialOneTimeCode, RpcResponse};

use super::super::state::RpcRouter;
use super::error::CredentialProviderCommandError;
use super::request::CredentialProviderOneTimeCodeRequest;

impl RpcRouter {
    pub(in crate::rpc::router) fn credential_provider_get_one_time_code(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if let Err(error) = self.credential_provider_preflight_typed() {
            return error.into_rpc_response();
        }

        let request = match CredentialProviderOneTimeCodeRequest::parse(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let context = match self.credential_provider_extract_context(data, true) {
            Ok(Some(context)) => context,
            Ok(None) => {
                return CredentialProviderCommandError::invalid_context("context is required")
                    .into_rpc_response()
            }
            Err(error) => return error.into_rpc_response(),
        };

        match self.credential_provider_get_one_time_code_service(request, context) {
            Ok(result) => RpcResponse::success(CredentialOneTimeCode {
                credential_id: result.credential_id,
                otp_id: result.otp_id,
                code: result.code,
                valid_until_ms: result.valid_until_ms,
            }),
            Err(error) => error.into_rpc_response(),
        }
    }
}
