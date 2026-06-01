use crate::wallet::WalletProviderError;

use super::WalletCommandError;

pub(super) fn invalid_input(message: impl Into<String>) -> WalletCommandError {
    WalletCommandError::invalid_input(message)
}

pub(super) fn provider_unavailable() -> WalletCommandError {
    WalletCommandError::provider_unavailable()
}

pub(super) fn provider_error(error: WalletProviderError) -> WalletCommandError {
    WalletCommandError::from(error)
}
