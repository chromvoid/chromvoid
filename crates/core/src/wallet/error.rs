#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WalletChainErrorCode {
    InvalidInput,
    UnsupportedChain,
    UnsupportedAccountModel,
    UnsupportedWalletContract,
    UnsupportedAsset,
    UnsupportedTonPayload,
    UnsupportedProviderSurface,
    AddressGapLimitReached,
    InvalidAddress,
    InsufficientFunds,
    FeeEstimationFailed,
    PreparationStale,
    ProviderUnavailable,
    BroadcastRejected,
    BroadcastUnknown,
    Internal,
}

#[derive(Debug, Clone)]
pub struct WalletChainError {
    pub code: WalletChainErrorCode,
    pub message: String,
}

impl WalletChainError {
    pub fn new(code: WalletChainErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::InvalidInput, message)
    }

    pub fn unsupported_chain(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::UnsupportedChain, message)
    }

    pub fn unsupported_account_model(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::UnsupportedAccountModel, message)
    }

    pub fn unsupported_wallet_contract(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::UnsupportedWalletContract, message)
    }

    pub fn unsupported_asset(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::UnsupportedAsset, message)
    }

    pub fn unsupported_ton_payload(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::UnsupportedTonPayload, message)
    }

    pub fn unsupported_provider_surface(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::UnsupportedProviderSurface, message)
    }

    pub fn address_gap_limit_reached() -> Self {
        Self::new(
            WalletChainErrorCode::AddressGapLimitReached,
            "Bitcoin address gap limit reached",
        )
    }

    pub fn invalid_address(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::InvalidAddress, message)
    }

    pub fn insufficient_funds() -> Self {
        Self::new(
            WalletChainErrorCode::InsufficientFunds,
            "Insufficient funds",
        )
    }

    pub fn fee_estimation_failed(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::FeeEstimationFailed, message)
    }

    pub fn preparation_stale(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::PreparationStale, message)
    }

    pub fn provider_unavailable() -> Self {
        Self::new(
            WalletChainErrorCode::ProviderUnavailable,
            "Wallet provider unavailable",
        )
    }

    pub fn provider_unavailable_with_message(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::ProviderUnavailable, message)
    }

    pub fn broadcast_rejected(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::BroadcastRejected, message)
    }

    pub fn broadcast_unknown(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::BroadcastUnknown, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(WalletChainErrorCode::Internal, message)
    }
}
