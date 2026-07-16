mod service;

use crate::rpc::types::RpcResponse;

use super::super::super::state::RpcRouter;

pub(in crate::rpc::router::catalog_streams) fn handle_patch(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    match service::patch_file(router, data) {
        Ok(response) => RpcResponse::success(response),
        Err(error) => error.into_rpc_response(),
    }
}
