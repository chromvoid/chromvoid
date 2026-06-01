//! `credential_provider:list` and `credential_provider:search` handlers.

use crate::rpc::types::RpcResponse;

use super::super::state::RpcRouter;
use super::error::CredentialProviderCommandError;
use super::request::{CredentialProviderListRequest, CredentialProviderSearchRequest};

impl RpcRouter {
    pub(in crate::rpc::router) fn credential_provider_list(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight_typed() {
            return err.into_rpc_response();
        }

        let request = CredentialProviderListRequest::parse(data);

        let context = match self.credential_provider_extract_context(data, true) {
            Ok(Some(c)) => c,
            Ok(None) => {
                return CredentialProviderCommandError::invalid_context("context is required")
                    .into_rpc_response()
            }
            Err(e) => return e.into_rpc_response(),
        };

        match self.credential_provider_list_service(request, context) {
            Ok(result) => {
                if let Some(debug) = result.debug {
                    RpcResponse::success(serde_json::json!({
                        "candidates": result.candidates,
                        "debug": debug,
                    }))
                } else {
                    RpcResponse::success(serde_json::json!({
                        "candidates": result.candidates,
                    }))
                }
            }
            Err(error) => error.into_rpc_response(),
        }
    }

    pub(in crate::rpc::router) fn credential_provider_search(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight_typed() {
            return err.into_rpc_response();
        }

        let context = match self.credential_provider_extract_context(data, false) {
            Ok(c) => c,
            Err(e) => return e.into_rpc_response(),
        };

        let request = CredentialProviderSearchRequest::parse(data);
        match self.credential_provider_search_service(request, context) {
            Ok(result) => RpcResponse::success(serde_json::json!({
                "candidates": result.candidates
            })),
            Err(error) => error.into_rpc_response(),
        }
    }
}
