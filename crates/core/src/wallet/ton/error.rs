use crate::wallet::WalletChainError;

use super::provider::{TonProviderError, TonProviderErrorKind};

pub(super) fn provider_error(error: TonProviderError) -> WalletChainError {
    match error.kind {
        TonProviderErrorKind::Unavailable => {
            WalletChainError::provider_unavailable_with_message(error.message)
        }
        TonProviderErrorKind::Rejected => WalletChainError::broadcast_rejected(error.message),
        TonProviderErrorKind::Unknown => WalletChainError::internal(error.message),
    }
}

pub(super) fn fee_estimation_error(error: TonProviderError) -> WalletChainError {
    WalletChainError::fee_estimation_failed(error.message)
}

pub(super) fn ton_error(error: ::ton::errors::TonError) -> WalletChainError {
    WalletChainError::internal(format!("TON wallet operation failed: {error}"))
}

pub(super) fn ton_core_error(error: ::ton::ton_core::errors::TonCoreError) -> WalletChainError {
    WalletChainError::internal(format!("TON cell operation failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::WalletChainErrorCode;

    #[test]
    fn fee_estimation_error_preserves_provider_diagnostic() {
        let error = fee_estimation_error(TonProviderError::unavailable(
            "TON Center estimateFee failed with HTTP 500 / TON code 500: emulation failed",
        ));

        assert_eq!(error.code, WalletChainErrorCode::FeeEstimationFailed);
        assert!(error.message.contains("HTTP 500"));
        assert!(error.message.contains("emulation failed"));
    }

    #[test]
    fn unavailable_provider_error_preserves_provider_diagnostic() {
        let error = provider_error(TonProviderError::unavailable(
            "TON Center walletStates request timed out",
        ));

        assert_eq!(error.code, WalletChainErrorCode::ProviderUnavailable);
        assert_eq!(error.message, "TON Center walletStates request timed out");
    }
}
