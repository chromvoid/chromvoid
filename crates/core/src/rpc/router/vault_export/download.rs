//! `vault:export:download_chunk` and `vault:export:download_stream` handlers.

use base64::{engine::general_purpose, Engine as _};

use super::super::super::stream::{RpcOutputStream, RpcReply, RpcStreamMeta};
use super::super::super::types::RpcResponse;
use super::super::state::RpcRouter;
use super::error::{VaultExportAccessError, VaultExportCommandError};
use super::request::{parse_vault_export_chunk_request, parse_vault_export_id_request};

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_vault_export_download_chunk(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if self.session.is_none() {
            return VaultExportCommandError::vault_not_unlocked().into_rpc_response();
        }

        let request = match parse_vault_export_chunk_request(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };

        self.expire_vault_export_if_idle();
        let chunk = {
            let session = match self.vault_export_session(&request.export_id) {
                Ok(session) => session,
                Err(error) => return error.into_rpc_response(),
            };
            self.read_vault_export_chunk(session, request.chunk_index)
        };
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(VaultExportAccessError::Response(error)) => return error.into_rpc_response(),
            Err(VaultExportAccessError::BrokenSession(error)) => {
                self.clear_vault_export();
                return error.into_rpc_response();
            }
        };
        self.touch_vault_export(&request.export_id);

        RpcResponse::success(serde_json::json!({
            "chunk_index": chunk.chunk_index,
            "data": general_purpose::STANDARD.encode(&chunk.bytes),
            "is_last": chunk.is_last,
        }))
    }

    pub(in crate::rpc::router) fn handle_vault_export_download_stream(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcReply {
        if self.session.is_none() {
            return RpcReply::Json(
                VaultExportCommandError::vault_not_unlocked().into_rpc_response(),
            );
        }

        let request = match parse_vault_export_id_request(data) {
            Ok(request) => request,
            Err(error) => return RpcReply::Json(error.into_rpc_response()),
        };

        self.expire_vault_export_if_idle();
        let stream = {
            let session = match self.vault_export_session(&request.export_id) {
                Ok(session) => session,
                Err(error) => return RpcReply::Json(error.into_rpc_response()),
            };
            self.open_vault_export_stream(session)
        };
        let stream = match stream {
            Ok(stream) => stream,
            Err(VaultExportAccessError::Response(error)) => {
                return RpcReply::Json(error.into_rpc_response())
            }
            Err(VaultExportAccessError::BrokenSession(error)) => {
                self.clear_vault_export();
                return RpcReply::Json(error.into_rpc_response());
            }
        };
        self.touch_vault_export(&request.export_id);

        let meta = RpcStreamMeta {
            name: stream.name,
            mime_type: stream.mime_type,
            size: stream.file_size,
            chunk_size: stream.chunk_size,
        };

        RpcReply::Stream(RpcOutputStream {
            meta,
            reader: Box::new(stream.file),
        })
    }
}
