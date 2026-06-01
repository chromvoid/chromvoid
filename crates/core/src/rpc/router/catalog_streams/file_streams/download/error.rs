use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(super) struct DownloadCommandError {
    message: String,
    code: Option<String>,
}

pub(super) type DownloadResult<T> = Result<T, DownloadCommandError>;

impl DownloadCommandError {
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

    pub(super) fn invalid_node_id() -> Self {
        Self::new("Invalid node_id", Some(ErrorCode::InternalError))
    }

    pub(super) fn media_range_invalid(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::MediaRangeInvalid))
    }

    pub(super) fn media_stream_stale() -> Self {
        Self::new(
            "Source revision is stale",
            Some(ErrorCode::MediaStreamStale),
        )
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(super) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}
