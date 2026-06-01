mod chunks;
mod error;
mod request;
mod service;

use crate::rpc::stream::{RpcInputStream, RpcReply};
use crate::rpc::types::RpcResponse;

use super::super::super::state::RpcRouter;

pub(in crate::rpc::router::catalog_streams) fn handle_replace(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> RpcReply {
    match service::replace_file(router, data, stream) {
        Ok(response) => RpcReply::Json(RpcResponse::success(response)),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}
