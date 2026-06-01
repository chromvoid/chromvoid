use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;
use crate::wallet::WalletProviderError;

use super::super::domain_read::DomainReadError;
use super::super::domain_uow::DomainUowError;

#[derive(Debug, Clone)]
pub(super) struct WalletCommandError {
    message: String,
    code: Option<String>,
}

pub(super) type WalletResult<T> = Result<T, WalletCommandError>;

impl WalletCommandError {
    pub(super) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(super) fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InvalidInput))
    }

    pub(super) fn empty_payload(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::EmptyPayload))
    }

    pub(super) fn unsupported_chain(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::UnsupportedChain))
    }

    pub(super) fn unsupported_account_model(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::UnsupportedAccountModel))
    }

    pub(super) fn insufficient_funds() -> Self {
        Self::new("Insufficient funds", Some(ErrorCode::InsufficientFunds))
    }

    pub(super) fn preparation_stale(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::PreparationStale))
    }

    pub(super) fn preparation_not_found() -> Self {
        Self::new(
            "Preparation not found",
            Some(ErrorCode::PreparationNotFound),
        )
    }

    pub(super) fn preparation_expired() -> Self {
        Self::new("Preparation expired", Some(ErrorCode::PreparationExpired))
    }

    pub(super) fn provider_unavailable() -> Self {
        Self::new(
            "Wallet provider unavailable",
            Some(ErrorCode::ProviderUnavailable),
        )
    }

    pub(super) fn broadcast_rejected(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::BroadcastRejected))
    }

    pub(super) fn wallet_not_found() -> Self {
        Self::new("Wallet not found", Some(ErrorCode::WalletNotFound))
    }

    pub(super) fn account_not_found() -> Self {
        Self::new("Account not found", Some(ErrorCode::AccountNotFound))
    }

    pub(super) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NodeNotFound))
    }

    pub(super) fn unsupported_export_kind(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::UnsupportedExportKind))
    }

    pub(super) fn message(&self) -> &str {
        &self.message
    }

    pub(super) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(super) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl From<DomainUowError> for WalletCommandError {
    fn from(error: DomainUowError) -> Self {
        let (message, code) = error.into_parts();
        Self { message, code }
    }
}

impl From<DomainReadError> for WalletCommandError {
    fn from(error: DomainReadError) -> Self {
        match error.into_rpc_response() {
            RpcResponse::Error { error, code, .. } => Self {
                message: error,
                code,
            },
            RpcResponse::Success { .. } => Self::internal("Wallet read failed"),
        }
    }
}

impl From<WalletProviderError> for WalletCommandError {
    fn from(error: WalletProviderError) -> Self {
        match error {
            WalletProviderError::Unavailable => Self::provider_unavailable(),
            WalletProviderError::Rejected(message) => Self::broadcast_rejected(message),
        }
    }
}
