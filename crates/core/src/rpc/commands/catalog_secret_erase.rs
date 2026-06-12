//! Catalog secret erase command handler.

use serde_json::Value;

use crate::rpc::derivative_index::DerivativeIndexState;
use crate::rpc::request_parse::required_u64;
use crate::rpc::router::blob_io::erase_single_blob_atomic;
use crate::vault::VaultSession;

use super::super::types::RpcResponse;

struct CatalogSecretEraseRequest {
    node_id: u64,
}

fn parse_catalog_secret_erase_request(
    data: &Value,
) -> Result<CatalogSecretEraseRequest, RpcResponse> {
    Ok(CatalogSecretEraseRequest {
        node_id: required_u64(data, "node_id")?,
    })
}

pub(in crate::rpc) fn handle_catalog_secret_erase(
    session: &mut VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
    derivative_index_state: &DerivativeIndexState,
) -> RpcResponse {
    let request = match parse_catalog_secret_erase_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    match erase_single_blob_atomic(session, storage, derivative_index_state, request.node_id) {
        Ok(()) => RpcResponse::success(Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}
