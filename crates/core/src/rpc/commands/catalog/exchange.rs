//! Atomic catalog exchange RPC handler.

use serde_json::Value;

use crate::error::{Error, ErrorCode};
use crate::rpc::request_parse::required_u64;
use crate::rpc::types::RpcResponse;
use crate::vault::VaultSession;

use super::super::guards::{is_system_node, system_shard_denied};
use super::deltas::{record_create_delta_for_path, record_delete_delta};

struct CatalogExchangeRequest {
    src_node_id: u64,
    dst_node_id: u64,
}

fn parse_catalog_exchange_request(data: &Value) -> Result<CatalogExchangeRequest, RpcResponse> {
    Ok(CatalogExchangeRequest {
        src_node_id: required_u64(data, "src_node_id")?,
        dst_node_id: required_u64(data, "dst_node_id")?,
    })
}

pub fn handle_catalog_exchange(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let request = match parse_catalog_exchange_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    if is_system_node(session, request.src_node_id) || is_system_node(session, request.dst_node_id)
    {
        return system_shard_denied();
    }

    let src_old_path = session.catalog().get_path(request.src_node_id);
    let dst_old_path = session.catalog().get_path(request.dst_node_id);

    match session
        .catalog_mut()
        .exchange_nodes(request.src_node_id, request.dst_node_id)
    {
        Ok(()) => {
            if let Some(old_path) = src_old_path.as_ref() {
                record_delete_delta(session, old_path, request.src_node_id);
            }
            if let Some(old_path) = dst_old_path.as_ref() {
                record_delete_delta(session, old_path, request.dst_node_id);
            }

            if let Some(node) = session.catalog().find_by_id(request.src_node_id).cloned() {
                if let Some(new_path) = session.catalog().get_path(request.src_node_id) {
                    record_create_delta_for_path(session, &new_path, &node);
                }
            }
            if let Some(node) = session.catalog().find_by_id(request.dst_node_id).cloned() {
                if let Some(new_path) = session.catalog().get_path(request.dst_node_id) {
                    record_create_delta_for_path(session, &new_path, &node);
                }
            }

            RpcResponse::success(Value::Null)
        }
        Err(error) => catalog_error_response(error),
    }
}

fn catalog_error_response(error: Error) -> RpcResponse {
    let code = match &error {
        Error::NodeNotFound(_) => ErrorCode::NodeNotFound,
        Error::NameExists(_) => ErrorCode::NameExist,
        Error::InvalidName(_) => ErrorCode::EmptyPayload,
        Error::InvalidPath(message) if message.contains("same node type") => {
            ErrorCode::InvalidInput
        }
        Error::InvalidPath(_) => ErrorCode::InvalidPath,
        Error::NotADirectory(_) => ErrorCode::NotADir,
        Error::CannotModifyRoot => ErrorCode::NodeNotFound,
        _ => ErrorCode::InternalError,
    };
    RpcResponse::error(error.to_string(), Some(code))
}
