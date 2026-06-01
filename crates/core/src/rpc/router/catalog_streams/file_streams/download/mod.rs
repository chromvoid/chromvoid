mod error;
mod request;
mod service;

use crate::rpc::stream::RpcReply;

use super::super::super::state::RpcRouter;

pub(in crate::rpc::router::catalog_streams) fn handle_download(
    router: &RpcRouter,
    data: &serde_json::Value,
) -> RpcReply {
    match service::download_file(router, data) {
        Ok(output) => RpcReply::Stream(output),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}

pub(in crate::rpc::router::catalog_streams) fn handle_download_range(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcReply {
    match service::download_range(router, data) {
        Ok(output) => RpcReply::RangeStream(output),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}
