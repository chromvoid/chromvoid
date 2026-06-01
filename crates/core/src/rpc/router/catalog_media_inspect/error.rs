use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub struct MediaInspectCommandError {
    message: String,
    code: Option<String>,
}

pub type MediaInspectResult<T> = Result<T, MediaInspectCommandError>;

impl MediaInspectCommandError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(in crate::rpc::router) fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    pub(in crate::rpc::router) fn access_denied() -> Self {
        Self::new("Access denied", Some(ErrorCode::AccessDenied))
    }

    pub(in crate::rpc::router) fn node_not_found() -> Self {
        Self::new("Node not found", Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn not_file() -> Self {
        Self::new("Node is not a file", Some(ErrorCode::NotFile))
    }

    pub(in crate::rpc::router) fn invalid_node_id() -> Self {
        Self::new("Invalid node_id", Some(ErrorCode::InternalError))
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
