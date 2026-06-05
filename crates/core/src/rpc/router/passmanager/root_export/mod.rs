//! Root export orchestration for PassManager.

mod entry_export;
mod error;
mod group_export;
mod secret_export;
mod service;
mod tag_export;
mod types;

use super::super::super::types::RpcResponse;
use super::super::state::RpcRouter;
use super::path;
use serde_json::Value;

impl RpcRouter {
    pub(in super::super) fn handle_passmanager_root_export(&self, _data: &Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|session| {
            let now_ms = path::now_unix_ms();
            match service::build_root_export(session, &storage, now_ms) {
                Ok(root) => RpcResponse::success(serde_json::json!({ "root": root })),
                Err(error) => error.into_rpc_response(),
            }
        })
    }
}
