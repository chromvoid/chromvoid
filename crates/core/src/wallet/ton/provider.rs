use crate::rpc::types::{WalletConfirmStatus, WalletProviderStatus, WalletTransactionDirection};
use crate::wallet::WalletTxStatus;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TonProviderAccountState {
    Uninitialized,
    Active,
}

impl TonProviderAccountState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Uninitialized => "uninitialized",
            Self::Active => "active",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonProviderAccount {
    pub account_id: String,
    pub wallet_id: String,
    pub address: String,
    pub raw_account: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonProviderSnapshot {
    pub seqno: u32,
    pub account_state: TonProviderAccountState,
    pub balance: u128,
    pub estimated_fee: Option<u128>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonFeeEstimateRequest {
    pub account: TonProviderAccount,
    pub body_boc_base64: String,
    pub init_code_boc_base64: Option<String>,
    pub init_data_boc_base64: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonBroadcastRequest {
    pub account: TonProviderAccount,
    pub seqno: u32,
    pub message_hash: String,
    pub signed_message_boc_base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonBroadcastResult {
    pub status: WalletConfirmStatus,
    pub tx_hash: Option<String>,
    pub message_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonRefreshRequest {
    pub account: TonProviderAccount,
    pub tx_ref: String,
    pub account_id: String,
    pub message_ref: Option<String>,
    pub tx_hash: Option<String>,
    pub valid_until: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonRefreshResult {
    pub status: WalletTxStatus,
    pub tx_hash: Option<String>,
    pub found: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonHistoryRequest {
    pub account: TonProviderAccount,
    pub limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonHistoryTransaction {
    pub tx_hash: String,
    pub message_ref: Option<String>,
    pub status: WalletTxStatus,
    pub direction: WalletTransactionDirection,
    pub counterparty: Option<String>,
    pub amount: u128,
    pub fee: u128,
    pub created_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TonProviderErrorKind {
    Unavailable,
    Rejected,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TonProviderError {
    pub kind: TonProviderErrorKind,
    pub message: String,
}

impl TonProviderError {
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            kind: TonProviderErrorKind::Unavailable,
            message: message.into(),
        }
    }

    pub fn rejected(message: impl Into<String>) -> Self {
        Self {
            kind: TonProviderErrorKind::Rejected,
            message: message.into(),
        }
    }

    pub fn unknown(message: impl Into<String>) -> Self {
        Self {
            kind: TonProviderErrorKind::Unknown,
            message: message.into(),
        }
    }
}

pub trait TonProvider: Send + Sync {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }

    fn snapshot(
        &self,
        account: &TonProviderAccount,
    ) -> Result<TonProviderSnapshot, TonProviderError>;

    fn account_state(&self, address: &str) -> Result<TonProviderAccountState, TonProviderError>;

    fn estimate_transfer_fee(
        &self,
        request: TonFeeEstimateRequest,
    ) -> Result<u128, TonProviderError> {
        let snapshot = self.snapshot(&request.account)?;
        Ok(snapshot.estimated_fee.unwrap_or(
            if snapshot.account_state == TonProviderAccountState::Uninitialized {
                super::constants::TON_DEFAULT_DEPLOY_TRANSFER_FEE_ESTIMATE
            } else {
                super::constants::TON_DEFAULT_TRANSFER_FEE_ESTIMATE
            },
        ))
    }

    fn broadcast(
        &self,
        request: TonBroadcastRequest,
    ) -> Result<TonBroadcastResult, TonProviderError>;

    fn refresh(&self, request: TonRefreshRequest) -> Result<TonRefreshResult, TonProviderError>;

    fn history(
        &self,
        _request: TonHistoryRequest,
    ) -> Result<Vec<TonHistoryTransaction>, TonProviderError> {
        Err(TonProviderError::unavailable(
            "TON transaction history unavailable",
        ))
    }
}

#[derive(Debug, Default)]
pub struct UnavailableTonProvider;

impl TonProvider for UnavailableTonProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Unavailable
    }

    fn snapshot(
        &self,
        _account: &TonProviderAccount,
    ) -> Result<TonProviderSnapshot, TonProviderError> {
        Err(TonProviderError::unavailable("TON provider unavailable"))
    }

    fn account_state(&self, _address: &str) -> Result<TonProviderAccountState, TonProviderError> {
        Err(TonProviderError::unavailable("TON provider unavailable"))
    }

    fn broadcast(
        &self,
        _request: TonBroadcastRequest,
    ) -> Result<TonBroadcastResult, TonProviderError> {
        Err(TonProviderError::unavailable("TON provider unavailable"))
    }

    fn refresh(&self, _request: TonRefreshRequest) -> Result<TonRefreshResult, TonProviderError> {
        Err(TonProviderError::unavailable("TON provider unavailable"))
    }
}
