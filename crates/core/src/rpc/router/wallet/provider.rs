use super::WalletCommandError;

pub(super) fn invalid_input(message: impl Into<String>) -> WalletCommandError {
    WalletCommandError::invalid_input(message)
}
