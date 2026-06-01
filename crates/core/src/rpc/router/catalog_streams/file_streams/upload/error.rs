use crate::error::{Error as CatalogError, ErrorCode};
use crate::rpc::types::RpcResponse;

use super::super::super::super::blob_finalize::BlobFinalizeError;

#[derive(Debug, Clone)]
pub(super) struct UploadCommandError {
    message: String,
    code: Option<String>,
}

pub(super) type UploadResult<T> = Result<T, UploadCommandError>;

impl UploadCommandError {
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

    pub(super) fn no_stream() -> Self {
        Self::new("No incoming stream", Some(ErrorCode::NoStream))
    }

    pub(super) fn invalid_offset(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InvalidOffset))
    }

    pub(super) fn access_denied() -> Self {
        Self::new("Access denied", Some(ErrorCode::AccessDenied))
    }

    pub(super) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NodeNotFound))
    }

    pub(super) fn name_exists(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NameExist))
    }

    pub(super) fn not_a_dir(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NotADir))
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(super) fn from_catalog_error(error: CatalogError) -> Self {
        match &error {
            CatalogError::NameExists(_) => Self::name_exists(error.to_string()),
            CatalogError::InvalidName(_) => {
                Self::new(error.to_string(), Some(ErrorCode::EmptyPayload))
            }
            CatalogError::InvalidPath(_) => Self::node_not_found(error.to_string()),
            CatalogError::NotADirectory(_) => Self::not_a_dir(error.to_string()),
            _ => Self::internal(error.to_string()),
        }
    }

    pub(super) fn from_blob_finalize_error(error: BlobFinalizeError) -> Self {
        match error {
            BlobFinalizeError::NodeNotFound => Self::node_not_found("Node not found"),
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
