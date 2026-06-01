//! Root import orchestration for PassManager.

mod catalog_staging;
mod entry_staging;
mod error;
mod group_meta_staging;
mod otp_staging;
mod parser;
mod secret_staging;
mod staging;
mod types;

use super::super::super::types::RpcResponse;
use super::super::domain_uow::DomainUnitOfWork;
use super::super::state::RpcRouter;
use crate::error::ErrorCode;
use parser::parse_root_import_payload;
use serde_json::Value;
use staging::build_root_import_plan;

impl RpcRouter {
    pub(in super::super) fn handle_passmanager_root_import(&mut self, data: &Value) -> RpcResponse {
        let storage = self.storage.clone();
        let payload = match parse_root_import_payload(data) {
            Ok(payload) => payload,
            Err(error) => return error.into_rpc_response(),
        };

        let Some(session) = self.session.as_mut() else {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        };
        let plan = match build_root_import_plan(session, &storage, payload) {
            Ok(plan) => plan,
            Err(error) => return error.into_rpc_response(),
        };

        let mut uow =
            DomainUnitOfWork::begin(session, &storage, ".passmanager", "passmanager-root-import");
        if let Err(error) = uow.replace_staged_catalog(plan.catalog) {
            return error.into_rpc_response();
        }
        for chunk in plan.chunks {
            if let Err(error) = uow.stage_encrypted_chunk(chunk.name, chunk.encrypted) {
                return error.into_rpc_response();
            }
        }
        if let Err(error) = uow.commit(session) {
            let message = error.message().to_string();
            return RpcResponse::error(
                format!("Failed to commit imported root data: {message}"),
                Some(ErrorCode::InternalError),
            );
        }

        RpcResponse::success(Value::Null)
    }
}
