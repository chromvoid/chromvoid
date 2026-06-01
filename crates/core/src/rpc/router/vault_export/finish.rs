//! `vault:export:finish` handler — closes the active export session.

use super::super::super::types::RpcResponse;
use super::super::state::RpcRouter;
use super::error::VaultExportCommandError;
use super::request::parse_vault_export_id_request;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_vault_export_finish(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if self.session.is_none() {
            return VaultExportCommandError::vault_not_unlocked().into_rpc_response();
        }

        let request = match parse_vault_export_id_request(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };

        self.expire_vault_export_if_idle();
        let session = match self.finish_vault_export_session(&request.export_id) {
            Ok(session) => session,
            Err(error) => return error.into_rpc_response(),
        };
        RpcResponse::success(serde_json::json!({
            "export_id": request.export_id,
            "file_hash": session.file_hash,
            "file_count": session.file_count,
            "included_otp_secrets": session.included_otp_secrets,
        }))
    }
}
