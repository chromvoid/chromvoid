use crate::rpc::stream::RpcReply;
use crate::rpc::types::RpcResponse;

use super::super::super::catalog_media_inspect::inspect_catalog_media;
use super::super::super::state::RpcRouter;

pub(in crate::rpc::router::catalog_streams) fn handle_media_inspect(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcReply {
    match inspect_catalog_media(router, data) {
        Ok(value) => RpcReply::Json(RpcResponse::success(value)),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}
