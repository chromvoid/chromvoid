//! Typed backup command error boundary.

use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

use super::super::master_material::MasterMaterialError;
use super::super::session_lifecycle::LongRunningSessionError;

#[derive(Debug, Clone)]
pub(in crate::rpc::router::backup) struct BackupCommandError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router::backup) type BackupResult<T> = Result<T, BackupCommandError>;

impl BackupCommandError {
    pub(in crate::rpc::router::backup) fn new(
        message: impl Into<String>,
        code: Option<ErrorCode>,
    ) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router::backup) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(in crate::rpc::router::backup) fn stream_required() -> Self {
        Self::new("Streaming required", Some(ErrorCode::StreamRequired))
    }

    pub(in crate::rpc::router::backup) fn backup_already_in_progress() -> Self {
        Self::new(
            "Backup already in progress",
            Some(ErrorCode::BackupAlreadyInProgress),
        )
    }

    pub(in crate::rpc::router::backup) fn backup_too_large() -> Self {
        Self::new("Backup too large", Some(ErrorCode::BackupTooLarge))
    }

    pub(in crate::rpc::router::backup) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router::backup) fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    pub(in crate::rpc::router::backup) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router::backup) fn keystore_unavailable(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::KeystoreUnavailable))
    }

    pub(in crate::rpc::router::backup) fn storage_version_not_supported(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::StorageVersionNotSupported))
    }

    pub(in crate::rpc::router::backup) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub(in crate::rpc::router::backup) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl From<MasterMaterialError> for BackupCommandError {
    fn from(error: MasterMaterialError) -> Self {
        let (message, code) = error.into_parts();
        Self { message, code }
    }
}

impl From<LongRunningSessionError> for BackupCommandError {
    fn from(error: LongRunningSessionError) -> Self {
        match error.into_rpc_response() {
            RpcResponse::Error { error, code, .. } => Self {
                message: error,
                code,
            },
            RpcResponse::Success { .. } => Self::internal("Unexpected session lifecycle result"),
        }
    }
}
