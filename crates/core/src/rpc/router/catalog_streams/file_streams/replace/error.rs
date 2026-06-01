use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

use super::super::super::super::blob_finalize::BlobFinalizeError;

#[derive(Debug, Clone)]
pub(super) struct ReplaceCommandError {
    message: String,
    code: Option<String>,
}

pub(super) type ReplaceResult<T> = Result<T, ReplaceCommandError>;

impl ReplaceCommandError {
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

    pub(super) fn invalid_conflict_mode() -> Self {
        Self::new("Invalid conflict_mode", Some(ErrorCode::EmptyPayload))
    }

    pub(super) fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    pub(super) fn no_stream() -> Self {
        Self::new("No incoming stream", Some(ErrorCode::NoStream))
    }

    pub(super) fn node_not_found() -> Self {
        Self::new("Node not found", Some(ErrorCode::NodeNotFound))
    }

    pub(super) fn access_denied() -> Self {
        Self::new("Access denied", Some(ErrorCode::AccessDenied))
    }

    pub(super) fn not_file() -> Self {
        Self::new("Node is not a file", Some(ErrorCode::NotFile))
    }

    pub(super) fn stale_source() -> Self {
        Self::new("Source revision is stale", Some(ErrorCode::StaleSource))
    }

    pub(super) fn size_mismatch() -> Self {
        Self::new("Size mismatch", Some(ErrorCode::SizeMismatch))
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(super) fn from_blob_finalize_error(error: BlobFinalizeError) -> Self {
        match error {
            BlobFinalizeError::NodeNotFound => Self::node_not_found(),
            BlobFinalizeError::DerivativeIndex(error) => Self::internal(error),
        }
    }

    pub(super) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}
