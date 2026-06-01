use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

use super::super::domain_read::DomainReadError;
use super::super::domain_uow::DomainUowError;

#[derive(Debug, Clone)]
pub(super) struct PassmanagerCommandError {
    message: String,
    code: Option<String>,
}

impl PassmanagerCommandError {
    pub(super) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(super) fn empty_payload(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::EmptyPayload))
    }

    pub(super) fn access_denied(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::AccessDenied))
    }

    pub(super) fn invalid_path(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InvalidPath))
    }

    pub(super) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NodeNotFound))
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(super) fn from_rpc_response(response: RpcResponse, fallback: &'static str) -> Self {
        Self {
            message: response.error_message().unwrap_or(fallback).to_string(),
            code: response.code().map(str::to_string),
        }
    }

    pub(super) fn from_domain_uow_error(error: DomainUowError, fallback: &'static str) -> Self {
        let (message, code) = error.into_parts();
        Self {
            message: if message.is_empty() {
                fallback.to_string()
            } else {
                message
            },
            code,
        }
    }

    pub(super) fn from_domain_read_error(error: DomainReadError, fallback: &'static str) -> Self {
        Self {
            message: if error.message().is_empty() {
                fallback.to_string()
            } else {
                error.message().to_string()
            },
            code: error.code().map(str::to_string),
        }
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, self.code)
    }

    pub(super) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }
}
