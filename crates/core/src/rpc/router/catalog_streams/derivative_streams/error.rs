use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(super) struct DerivativeCommandError {
    message: String,
    code: Option<String>,
}

pub(super) type DerivativeResult<T> = Result<T, DerivativeCommandError>;

impl DerivativeCommandError {
    pub(super) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(super) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(super) fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    pub(super) fn access_denied() -> Self {
        Self::new("Access denied", Some(ErrorCode::AccessDenied))
    }

    pub(super) fn node_not_found() -> Self {
        Self::new("Node not found", Some(ErrorCode::NodeNotFound))
    }

    pub(super) fn not_file_internal() -> Self {
        Self::new("Node is not a file", Some(ErrorCode::InternalError))
    }

    pub(super) fn no_stream() -> Self {
        Self::new("No incoming stream", Some(ErrorCode::NoStream))
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(super) fn derivative_not_found() -> Self {
        Self::new("Derivative not found", Some(ErrorCode::NodeNotFound))
    }

    pub(super) fn invalid_tier() -> Self {
        Self::new(
            "tier must be thumbnail, preview, or metadata",
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(super) fn version_required() -> Self {
        Self::new("version is required", Some(ErrorCode::EmptyPayload))
    }

    pub(super) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}
