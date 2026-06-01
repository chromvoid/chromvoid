use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct DomainUowError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type DomainUowResult<T> = Result<T, DomainUowError>;

impl DomainUowError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router) fn access_denied(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::AccessDenied))
    }

    pub(in crate::rpc::router) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub(in crate::rpc::router) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, self.code)
    }
}

pub(super) fn catalog_error(error: crate::error::Error) -> DomainUowError {
    let code = match &error {
        crate::error::Error::NodeNotFound(_) => ErrorCode::NodeNotFound,
        crate::error::Error::NameExists(_) => ErrorCode::NameExist,
        crate::error::Error::InvalidName(_) => ErrorCode::EmptyPayload,
        crate::error::Error::InvalidPath(_) => ErrorCode::NodeNotFound,
        crate::error::Error::NotADirectory(_) => ErrorCode::NotADir,
        crate::error::Error::CannotModifyRoot => ErrorCode::NodeNotFound,
        _ => ErrorCode::InternalError,
    };
    DomainUowError::new(error.to_string(), Some(code))
}

pub(super) fn storage_error(error: crate::error::Error) -> DomainUowError {
    internal_error(error.to_string())
}

pub(super) fn internal_error(message: impl Into<String>) -> DomainUowError {
    DomainUowError::internal(message)
}
