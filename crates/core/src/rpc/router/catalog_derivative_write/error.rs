use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub struct CatalogDerivativeSplitWriteError {
    message: String,
    code: Option<String>,
}

pub type CatalogDerivativeSplitWriteResult<T> = Result<T, CatalogDerivativeSplitWriteError>;

impl CatalogDerivativeSplitWriteError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    pub(in crate::rpc::router) fn node_not_found() -> Self {
        Self::new("Node not found", Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn access_denied() -> Self {
        Self::new("Access denied", Some(ErrorCode::AccessDenied))
    }

    pub(in crate::rpc::router) fn not_file() -> Self {
        Self::new("Node is not a file", Some(ErrorCode::NotFile))
    }

    pub(in crate::rpc::router) fn media_stream_stale() -> Self {
        Self::new("stale source revision", Some(ErrorCode::MediaStreamStale))
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}
