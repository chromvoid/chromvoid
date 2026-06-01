//! Typed storage GC command and service error boundary.

use crate::error::{Error, ErrorCode};
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(in crate::rpc::router::storage_gc) struct StorageGcError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router::storage_gc) type StorageGcResult<T> = Result<T, StorageGcError>;

impl StorageGcError {
    pub(in crate::rpc::router::storage_gc) fn new(
        message: impl Into<String>,
        code: Option<ErrorCode>,
    ) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router::storage_gc) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(in crate::rpc::router::storage_gc) fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    pub(in crate::rpc::router::storage_gc) fn confirm_delete_required_true() -> Self {
        Self::new("confirm_delete must be true", Some(ErrorCode::AccessDenied))
    }

    pub(in crate::rpc::router::storage_gc) fn scan_not_found() -> Self {
        Self::new("GC scan not found", Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router::storage_gc) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router::storage_gc) fn scan_failed(error: StorageGcError) -> Self {
        Self::internal(format!("Storage GC scan failed: {}", error.message))
    }

    pub(in crate::rpc::router::storage_gc) fn delete_failed(error: StorageGcError) -> Self {
        Self::internal(format!("Storage GC delete failed: {}", error.message))
    }

    pub(in crate::rpc::router::storage_gc) fn recovery_failed(
        operation: &str,
        error: StorageGcError,
    ) -> Self {
        Self::internal(format!("Storage GC {operation} failed: {}", error.message))
    }

    pub(in crate::rpc::router::storage_gc) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router::storage_gc) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router::storage_gc) fn into_parts(self) -> (String, Option<String>) {
        let message = self.message().to_owned();
        let code = self.code().map(str::to_owned);
        (message, code)
    }

    pub(in crate::rpc::router::storage_gc) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl std::fmt::Display for StorageGcError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.message())
    }
}

impl From<Error> for StorageGcError {
    fn from(error: Error) -> Self {
        Self::internal(error.to_string())
    }
}

impl From<serde_json::Error> for StorageGcError {
    fn from(error: serde_json::Error) -> Self {
        Self::internal(error.to_string())
    }
}
