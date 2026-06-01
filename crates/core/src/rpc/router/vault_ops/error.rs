//! Typed vault lifecycle command error boundary.

use crate::error::{Error, ErrorCode};
use crate::rpc::types::RpcResponse;

use super::super::master_material::MasterMaterialError;
use super::super::recovery::RecoveryError;

#[derive(Debug, Clone)]
pub(in crate::rpc::router::vault_ops) struct VaultOpsError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router::vault_ops) type VaultOpsResult<T> = Result<T, VaultOpsError>;

impl VaultOpsError {
    pub(in crate::rpc::router::vault_ops) fn new(
        message: impl Into<String>,
        code: Option<ErrorCode>,
    ) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router::vault_ops) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(in crate::rpc::router::vault_ops) fn already_unlocked() -> Self {
        Self::new("Already unlocked", Some(ErrorCode::VaultAlreadyUnlocked))
    }

    pub(in crate::rpc::router::vault_ops) fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    pub(in crate::rpc::router::vault_ops) fn keystore_unavailable(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::KeystoreUnavailable))
    }

    pub(in crate::rpc::router::vault_ops) fn erase_token_expired() -> Self {
        Self::new("Erase token expired", Some(ErrorCode::EraseTokenExpired))
    }

    pub(in crate::rpc::router::vault_ops) fn erase_no_confirm() -> Self {
        Self::new("Confirmation required", Some(ErrorCode::EraseNoConfirm))
    }

    pub(in crate::rpc::router::vault_ops) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router::vault_ops) fn from_unlock_error(error: Error) -> Self {
        let code = match &error {
            Error::KeystoreUnavailable(_) => Some(ErrorCode::KeystoreUnavailable),
            Error::StoragePepperRequired => Some(ErrorCode::StoragePepperRequired),
            Error::StoragePepperInvalid(_) => Some(ErrorCode::StoragePepperInvalid),
            Error::UnsupportedStorageVersion(_) => Some(ErrorCode::StorageVersionNotSupported),
            _ => Some(ErrorCode::InternalError),
        };
        Self::new(error.to_string(), code)
    }

    pub(in crate::rpc::router::vault_ops) fn from_rekey_error(error: Error) -> Self {
        let code = match &error {
            Error::RekeyAlreadyInProgress => Some(ErrorCode::RekeyAlreadyInProgress),
            Error::RekeyInvalidCurrentPassword => Some(ErrorCode::RekeyInvalidCurrentPassword),
            Error::RekeyPasswordPolicy(_) => Some(ErrorCode::RekeyPasswordPolicy),
            Error::RekeyCancelled => Some(ErrorCode::RekeyCancelled),
            Error::KeystoreUnavailable(_) => Some(ErrorCode::KeystoreUnavailable),
            Error::StoragePepperRequired => Some(ErrorCode::StoragePepperRequired),
            _ => Some(ErrorCode::InternalError),
        };
        Self::new(error.to_string(), code)
    }

    pub(in crate::rpc::router::vault_ops) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router::vault_ops) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router::vault_ops) fn into_parts(self) -> (String, Option<String>) {
        let message = self.message().to_owned();
        let code = self.code().map(str::to_owned);
        (message, code)
    }

    pub(in crate::rpc::router::vault_ops) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl From<MasterMaterialError> for VaultOpsError {
    fn from(error: MasterMaterialError) -> Self {
        let (message, code) = error.into_parts();
        Self { message, code }
    }
}

impl From<RecoveryError> for VaultOpsError {
    fn from(error: RecoveryError) -> Self {
        let (message, code) = error.into_parts();
        Self { message, code }
    }
}
