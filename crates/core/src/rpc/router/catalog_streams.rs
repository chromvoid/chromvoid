//! Catalog streaming operations — thin router shims over stream services.

mod derivative_streams;
mod file_replace_tx;
mod file_streams;

use crate::rpc::stream::{RpcInputStream, RpcReply};
use crate::rpc::types::RpcResponse;
use serde_json::Value;

use super::state::RpcRouter;

impl RpcRouter {
    pub(super) fn handle_catalog_upload_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        file_streams::handle_upload(self, data, stream)
    }

    pub(super) fn handle_catalog_upload_abort(&mut self) -> RpcResponse {
        file_streams::handle_abort_upload(self)
    }

    pub(super) fn handle_catalog_download_stream(&self, data: &serde_json::Value) -> RpcReply {
        file_streams::handle_download(self, data)
    }

    pub(super) fn handle_catalog_file_replace_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        file_streams::handle_replace(self, data, stream)
    }

    pub(super) fn handle_catalog_file_patch(&mut self, data: &serde_json::Value) -> RpcResponse {
        file_streams::handle_patch(self, data)
    }

    pub(super) fn recover_catalog_file_replace_transaction(
        &mut self,
    ) -> Result<(), crate::error::Error> {
        file_replace_tx::recover_file_replace_transaction(self)
    }

    pub(super) fn recover_catalog_upload_session_transaction(
        &mut self,
    ) -> Result<(), crate::error::Error> {
        file_streams::recover_pending_upload_session(self)
    }

    #[cfg(test)]
    pub(super) fn has_catalog_file_replace_transaction_marker(&self) -> bool {
        file_replace_tx::has_file_replace_transaction_marker(self)
    }

    pub(super) fn handle_catalog_download_range_stream(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcReply {
        file_streams::handle_download_range(self, data)
    }

    pub(super) fn handle_catalog_media_inspect(&mut self, data: &serde_json::Value) -> RpcReply {
        file_streams::handle_media_inspect(self, data)
    }

    pub(super) fn handle_catalog_secret_write_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        let data = catalog_secret_write_upload_data(data);
        self.handle_catalog_upload_stream(&data, stream)
    }

    pub(super) fn handle_catalog_secret_read_stream(&self, data: &serde_json::Value) -> RpcReply {
        self.handle_catalog_download_stream(data)
    }

    pub(super) fn handle_catalog_derivative_write_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        derivative_streams::handle_write(self, data, stream)
    }

    pub(super) fn handle_catalog_derivative_read_stream(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcReply {
        derivative_streams::handle_read(self, data)
    }
}

fn catalog_secret_write_upload_data(data: &Value) -> Value {
    let mut data = data.clone();
    let Some(object) = data.as_object_mut() else {
        return data;
    };
    if object.contains_key("total_size") {
        return data;
    }

    let offset = object.get("offset").and_then(Value::as_u64).unwrap_or(0);
    let size = object.get("size").and_then(Value::as_u64).unwrap_or(0);
    object.insert(
        "total_size".to_string(),
        Value::from(offset.saturating_add(size)),
    );
    object.entry("finish").or_insert(Value::Bool(true));
    data
}
