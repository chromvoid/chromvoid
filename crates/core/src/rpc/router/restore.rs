//! Restore RPC handlers — admin:restore and restore:local:* commands

mod admin;
mod apply;
mod error;
pub(in crate::rpc::router) mod local;
mod request;
mod tx;

use std::collections::HashSet;

use crate::rpc::stream::{RpcInputStream, RpcReply};
use crate::rpc::types::RpcResponse;

use super::session_lifecycle::ExpiringSessionMeta;
use super::state::RpcRouter;

pub(in crate::rpc::router) fn recover_restore_transaction(
    router: &mut RpcRouter,
) -> crate::error::Result<()> {
    tx::recover_restore_transaction(router)
}

/// Active local-restore session state.
#[derive(Debug, Clone)]
pub(super) struct RestoreLocalSession {
    pub(super) id: String,
    pub(super) meta: ExpiringSessionMeta,
    pub(super) received: HashSet<u64>,
    pub(super) chunk_names: HashSet<String>,
    pub(super) total_chunks: Option<u64>,
}

impl RpcRouter {
    pub(super) fn handle_admin_restore_v2(&mut self, data: &serde_json::Value) -> RpcResponse {
        admin::handle_admin_restore_v2(self, data)
    }

    pub(super) fn handle_admin_restore_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        admin::handle_admin_restore_stream(self, data, stream)
    }

    pub(super) fn handle_restore_local_validate(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        local::handle_restore_local_validate(self, data)
    }

    pub(super) fn handle_restore_local_validate_payload(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        local::handle_restore_local_validate_payload(self, data)
    }

    pub(super) fn handle_restore_local_validate_master_material(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        local::handle_restore_local_validate_master_material(self, data)
    }

    pub(super) fn handle_restore_local_start(&mut self, data: &serde_json::Value) -> RpcResponse {
        local::handle_restore_local_start(self, data)
    }

    pub(super) fn handle_restore_local_upload_pack(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        local::handle_restore_local_upload_pack(self, data, stream)
    }

    pub(super) fn handle_restore_local_cancel(&mut self, data: &serde_json::Value) -> RpcResponse {
        local::handle_restore_local_cancel(self, data)
    }

    pub(super) fn handle_restore_local_commit(&mut self, data: &serde_json::Value) -> RpcResponse {
        local::handle_restore_local_commit(self, data)
    }
}
