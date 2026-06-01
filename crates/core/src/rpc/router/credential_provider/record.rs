//! `credential_provider:record_use` and `credential_provider:passkey_stub` handlers.

use crate::rpc::types::RpcResponse;

use super::super::state::RpcRouter;
use super::request::CredentialProviderRecordUseRequest;

impl RpcRouter {
    pub(in crate::rpc::router) fn credential_provider_record_use(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight_typed() {
            return err.into_rpc_response();
        }

        let request = match CredentialProviderRecordUseRequest::parse(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };

        let context = match self.credential_provider_extract_context(data, false) {
            Ok(c) => c,
            Err(e) => return e.into_rpc_response(),
        };

        if let Err(error) = self.credential_provider_record_use_service(request, context) {
            return error.into_rpc_response();
        }

        RpcResponse::success(serde_json::json!({}))
    }
}
