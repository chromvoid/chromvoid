mod error;
mod request;
mod service;

use crate::rpc::stream::{RpcInputStream, RpcReply};
use crate::rpc::types::RpcResponse;

use super::super::state::RpcRouter;

pub(super) fn handle_write(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> RpcReply {
    match service::write_derivative(router, data, stream) {
        Ok(()) => RpcReply::Json(RpcResponse::success(serde_json::Value::Null)),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}

pub(super) fn handle_read(router: &mut RpcRouter, data: &serde_json::Value) -> RpcReply {
    match service::read_derivative(router, data) {
        Ok(output) => RpcReply::Stream(output),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}
