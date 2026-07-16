use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;
use crate::wallet::{WalletChainError, WalletChainErrorCode};

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

    pub(super) fn unsupported_wallet_contract(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::UnsupportedWalletContract))
    }

    pub(super) fn unsupported_asset(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::UnsupportedAsset))
    }

    pub(super) fn unsupported_ton_payload(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::UnsupportedTonPayload))
    }

    pub(super) fn unsupported_provider_surface(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::UnsupportedProviderSurface))
    }

    pub(super) fn address_gap_limit_reached() -> Self {
        Self::new(
            "Bitcoin address gap limit reached",
            Some(ErrorCode::AddressGapLimitReached),
        )
    }

    pub(super) fn invalid_address(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InvalidAddress))
    }

    pub(super) fn insufficient_funds() -> Self {
        Self::new("Insufficient funds", Some(ErrorCode::InsufficientFunds))
    }

    pub(super) fn fee_estimation_failed(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::FeeEstimationFailed))
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

    pub(super) fn provider_unavailable(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::ProviderUnavailable))
    }

    pub(super) fn broadcast_rejected(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::BroadcastRejected))
    }

    pub(super) fn broadcast_unknown(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::BroadcastUnknown))
    }

    pub(super) fn confirm_required(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::ConfirmRequired))
    }

    pub(super) fn storage_version_not_supported(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::StorageVersionNotSupported))
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

impl From<WalletChainError> for WalletCommandError {
    fn from(error: WalletChainError) -> Self {
        match error.code {
            WalletChainErrorCode::InvalidInput => Self::invalid_input(error.message),
            WalletChainErrorCode::UnsupportedChain => Self::unsupported_chain(error.message),
            WalletChainErrorCode::UnsupportedAccountModel => {
                Self::unsupported_account_model(error.message)
            }
            WalletChainErrorCode::UnsupportedWalletContract => {
                Self::unsupported_wallet_contract(error.message)
            }
            WalletChainErrorCode::UnsupportedAsset => Self::unsupported_asset(error.message),
            WalletChainErrorCode::UnsupportedTonPayload => {
                Self::unsupported_ton_payload(error.message)
            }
            WalletChainErrorCode::UnsupportedProviderSurface => {
                Self::unsupported_provider_surface(error.message)
            }
            WalletChainErrorCode::AddressGapLimitReached => Self::address_gap_limit_reached(),
            WalletChainErrorCode::InvalidAddress => Self::invalid_address(error.message),
            WalletChainErrorCode::InsufficientFunds => Self::insufficient_funds(),
            WalletChainErrorCode::FeeEstimationFailed => Self::fee_estimation_failed(error.message),
            WalletChainErrorCode::PreparationStale => Self::preparation_stale(error.message),
            WalletChainErrorCode::ProviderUnavailable => Self::provider_unavailable(error.message),
            WalletChainErrorCode::BroadcastRejected => Self::broadcast_rejected(error.message),
            WalletChainErrorCode::BroadcastUnknown => Self::broadcast_unknown(error.message),
            WalletChainErrorCode::Internal => Self::internal(error.message),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_estimation_failure_reaches_rpc_with_dedicated_code_and_message() {
        let error = WalletCommandError::from(WalletChainError::fee_estimation_failed(
            "TON Center estimateFee failed with HTTP 500",
        ));

        assert_eq!(error.code(), Some("FEE_ESTIMATION_FAILED"));
        assert_eq!(
            error.message(),
            "TON Center estimateFee failed with HTTP 500"
        );
    }

    #[test]
    fn provider_unavailable_reaches_rpc_with_diagnostic_message() {
        let error = WalletCommandError::from(WalletChainError::provider_unavailable_with_message(
            "TON Center walletStates request timed out",
        ));

        assert_eq!(error.code(), Some("PROVIDER_UNAVAILABLE"));
        assert_eq!(error.message(), "TON Center walletStates request timed out");
    }
}
