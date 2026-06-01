use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

use super::super::error::PassmanagerCommandError;

#[derive(Debug, Clone)]
pub(super) struct RootImportError {
    message: String,
    code: ErrorCode,
}

impl RootImportError {
    pub(super) fn new(message: impl Into<String>, code: ErrorCode) -> Self {
        Self {
            message: message.into(),
            code,
        }
    }

    pub(super) fn empty_payload(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::EmptyPayload)
    }

    pub(super) fn access_denied(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::AccessDenied)
    }

    pub(super) fn invalid_path(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::InvalidPath)
    }

    pub(super) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::NodeNotFound)
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::InternalError)
    }

    pub(super) fn from_rpc_response(response: RpcResponse) -> Self {
        let message = response
            .error_message()
            .unwrap_or("Root import failed")
            .to_string();
        let code = match response.code() {
            Some("EMPTY_PAYLOAD") => ErrorCode::EmptyPayload,
            Some("ACCESS_DENIED") => ErrorCode::AccessDenied,
            Some("INVALID_PATH") => ErrorCode::InvalidPath,
            Some("NODE_NOT_FOUND") => ErrorCode::NodeNotFound,
            Some("INTERNAL_ERROR") => ErrorCode::InternalError,
            _ => ErrorCode::InternalError,
        };
        Self { message, code }
    }

    pub(super) fn from_passmanager_command_error(error: PassmanagerCommandError) -> Self {
        let (message, code) = error.into_parts();
        let code = match code.as_deref() {
            Some("EMPTY_PAYLOAD") => ErrorCode::EmptyPayload,
            Some("ACCESS_DENIED") => ErrorCode::AccessDenied,
            Some("INVALID_PATH") => ErrorCode::InvalidPath,
            Some("NODE_NOT_FOUND") => ErrorCode::NodeNotFound,
            Some("INTERNAL_ERROR") => ErrorCode::InternalError,
            _ => ErrorCode::InternalError,
        };
        Self { message, code }
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, Some(self.code))
    }
}
