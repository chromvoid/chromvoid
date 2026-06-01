//! Typed restore command error boundary.

use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

use super::super::master_material::MasterMaterialError;
use super::super::recovery::RecoveryError;
use super::super::session_lifecycle::LongRunningSessionError;

#[derive(Debug, Clone)]
pub(in crate::rpc::router::restore) struct RestoreCommandError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router::restore) type RestoreResult<T> = Result<T, RestoreCommandError>;

impl RestoreCommandError {
    pub(in crate::rpc::router::restore) fn new(
        message: impl Into<String>,
        code: Option<ErrorCode>,
    ) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router::restore) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(in crate::rpc::router::restore) fn no_stream() -> Self {
        Self::new("No incoming stream", Some(ErrorCode::NoStream))
    }

    pub(in crate::rpc::router::restore) fn invalid_backup(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InvalidBackup))
    }

    pub(in crate::rpc::router::restore) fn restore_invalid_format(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::RestoreInvalidFormat))
    }

    pub(in crate::rpc::router::restore) fn invalid_metadata() -> Self {
        Self::restore_invalid_format("Invalid metadata")
    }

    pub(in crate::rpc::router::restore) fn restore_version_not_supported(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::RestoreVersionNotSupported))
    }

    pub(in crate::rpc::router::restore) fn storage_pepper_invalid(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::StoragePepperInvalid))
    }

    pub(in crate::rpc::router::restore) fn storage_not_blank() -> Self {
        Self::new(
            "Storage must be blank for restore. Use admin:erase first.",
            Some(ErrorCode::StorageNotBlank),
        )
    }

    pub(in crate::rpc::router::restore) fn checksum_mismatch() -> Self {
        Self::new("Checksum mismatch", Some(ErrorCode::ChecksumMismatch))
    }

    pub(in crate::rpc::router::restore) fn backup_already_in_progress(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::BackupAlreadyInProgress))
    }

    pub(in crate::rpc::router::restore) fn keystore_unavailable(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::KeystoreUnavailable))
    }

    pub(in crate::rpc::router::restore) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router::restore) fn failed_to_create_restore_transaction(
        error: impl std::fmt::Display,
    ) -> Self {
        Self::internal(format!("Failed to create restore transaction: {error}"))
    }

    pub(in crate::rpc::router::restore) fn failed_to_write_restore_transaction(
        error: impl std::fmt::Display,
    ) -> Self {
        Self::internal(format!("Failed to write restore transaction: {error}"))
    }

    pub(in crate::rpc::router::restore) fn failed_to_update_restore_transaction(
        error: impl std::fmt::Display,
    ) -> Self {
        Self::internal(format!("Failed to update restore transaction: {error}"))
    }

    pub(in crate::rpc::router::restore) fn failed_to_clear_restore_transaction(
        error: impl std::fmt::Display,
    ) -> Self {
        Self::internal(format!("Failed to clear restore transaction: {error}"))
    }

    pub(in crate::rpc::router::restore) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router::restore) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router::restore) fn into_parts(self) -> (String, Option<String>) {
        let message = self.message().to_owned();
        let code = self.code().map(str::to_owned);
        (message, code)
    }

    pub(in crate::rpc::router::restore) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl From<MasterMaterialError> for RestoreCommandError {
    fn from(error: MasterMaterialError) -> Self {
        let (message, code) = error.into_parts();
        Self { message, code }
    }
}

impl From<RecoveryError> for RestoreCommandError {
    fn from(error: RecoveryError) -> Self {
        let (message, code) = error.into_parts();
        Self { message, code }
    }
}

impl From<LongRunningSessionError> for RestoreCommandError {
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
