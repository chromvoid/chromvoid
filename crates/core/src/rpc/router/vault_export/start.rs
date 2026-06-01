//! `vault:export:start` handler.

use super::super::super::types::RpcResponse;
use super::super::state::RpcRouter;
use super::error::VaultExportCommandError;
use super::request::parse_vault_export_start_request;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_vault_export_start(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let context = match self.collect_vault_export_start_context() {
            Ok(context) => context,
            Err(error) => return error.into_rpc_response(),
        };

        let request = match parse_vault_export_start_request(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };

        if request.include_otp_secrets && self.master_key.is_none() {
            return VaultExportCommandError::master_password_required().into_rpc_response();
        }

        self.expire_vault_export_if_idle();
        if self.vault_export_is_active() {
            return VaultExportCommandError::already_in_progress().into_rpc_response();
        }

        let export = match self.build_vault_export(context, request) {
            Ok(export) => export,
            Err(error) => return error.into_rpc_response(),
        };
        let export_id = export.session.id.clone();
        self.start_vault_export_session(export.session);

        RpcResponse::success(serde_json::json!({
            "export_id": export_id,
            "estimated_size": export.estimated_size,
            "file_count": export.file_count,
        }))
    }
}
