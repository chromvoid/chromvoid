use crate::error::ErrorCode;
use crate::rpc::commands::system_shard_denied;
use crate::rpc::types::RpcResponse;

#[derive(Debug)]
pub(in crate::rpc) enum BlobIoError {
    AccessDenied,
    NodeNotFound,
    NotFile,
    InvalidNodeId,
    Crypto(String),
    Storage(String),
    DerivativeIndex(String),
    Save(String),
}

impl BlobIoError {
    pub(in crate::rpc) fn into_rpc_response(self) -> RpcResponse {
        match self {
            Self::AccessDenied => system_shard_denied(),
            Self::NodeNotFound => {
                RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound))
            }
            Self::NotFile => {
                RpcResponse::error("Node is not a file", Some(ErrorCode::InternalError))
            }
            Self::InvalidNodeId => {
                RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError))
            }
            Self::Crypto(error) | Self::Storage(error) | Self::Save(error) => {
                RpcResponse::error(error, Some(ErrorCode::InternalError))
            }
            Self::DerivativeIndex(error) => {
                RpcResponse::error(error, Some(ErrorCode::InternalError))
            }
        }
    }
}
