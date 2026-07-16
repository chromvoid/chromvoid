use serde::{Deserialize, Serialize};

use crate::rpc::types::{WalletFeeTier, WalletProviderStatus};
use crate::wallet::WalletChainError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BitcoinAddressStats {
    pub funded_txo_sum: u64,
    pub spent_txo_sum: u64,
    pub tx_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BitcoinAddressStatus {
    pub chain_stats: BitcoinAddressStats,
    pub mempool_stats: BitcoinAddressStats,
}

impl BitcoinAddressStatus {
    pub(super) fn is_used(&self) -> bool {
        self.chain_stats.tx_count > 0
            || self.mempool_stats.tx_count > 0
            || self.chain_stats.funded_txo_sum > 0
            || self.mempool_stats.funded_txo_sum > 0
    }

    pub(super) fn confirmed_balance(&self) -> u64 {
        self.chain_stats
            .funded_txo_sum
            .saturating_sub(self.chain_stats.spent_txo_sum)
    }

    pub(super) fn pending_in(&self) -> u64 {
        self.mempool_stats.funded_txo_sum
    }

    pub(super) fn pending_out(&self) -> u64 {
        self.mempool_stats.spent_txo_sum
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BitcoinUtxo {
    pub txid: String,
    pub vout: u32,
    pub value: u64,
    pub address: String,
    pub script_pubkey: String,
    pub confirmed: bool,
    pub confirmations: u32,
    pub block_height: Option<u64>,
}

impl BitcoinUtxo {
    pub(super) fn outpoint_key(&self) -> String {
        format!("{}:{}", self.txid, self.vout)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BitcoinFeeEstimates {
    pub slow_sat_vb: u64,
    pub standard_sat_vb: u64,
    pub fast_sat_vb: u64,
}

impl BitcoinFeeEstimates {
    pub(super) fn for_tier(&self, tier: &WalletFeeTier) -> u64 {
        match tier {
            WalletFeeTier::Slow => self.slow_sat_vb,
            WalletFeeTier::Standard => self.standard_sat_vb,
            WalletFeeTier::Fast => self.fast_sat_vb,
        }
        .max(1)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BitcoinBroadcastResult {
    pub txid: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BitcoinTransactionStatus {
    pub confirmed: bool,
    pub block_height: Option<u64>,
    pub confirmations: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BitcoinProviderErrorKind {
    Unavailable,
    Rejected,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BitcoinProviderError {
    pub kind: BitcoinProviderErrorKind,
    pub message: String,
}

impl BitcoinProviderError {
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            kind: BitcoinProviderErrorKind::Unavailable,
            message: message.into(),
        }
    }

    pub fn rejected(message: impl Into<String>) -> Self {
        Self {
            kind: BitcoinProviderErrorKind::Rejected,
            message: message.into(),
        }
    }

    pub fn unknown(message: impl Into<String>) -> Self {
        Self {
            kind: BitcoinProviderErrorKind::Unknown,
            message: message.into(),
        }
    }
}

pub trait BitcoinProvider: Send + Sync {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }

    fn tip_height(&self) -> Result<Option<u64>, BitcoinProviderError>;

    fn address_status(&self, address: &str) -> Result<BitcoinAddressStatus, BitcoinProviderError>;

    fn address_utxos(&self, address: &str) -> Result<Vec<BitcoinUtxo>, BitcoinProviderError>;

    fn fee_estimates(&self) -> Result<BitcoinFeeEstimates, BitcoinProviderError>;

    fn broadcast_raw_tx(
        &self,
        raw_tx_hex: &str,
    ) -> Result<BitcoinBroadcastResult, BitcoinProviderError>;

    fn transaction_status(
        &self,
        txid: &str,
    ) -> Result<Option<BitcoinTransactionStatus>, BitcoinProviderError>;
}

#[derive(Debug, Default)]
pub struct UnavailableBitcoinProvider;

impl BitcoinProvider for UnavailableBitcoinProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Unavailable
    }

    fn tip_height(&self) -> Result<Option<u64>, BitcoinProviderError> {
        Err(BitcoinProviderError::unavailable(
            "Bitcoin provider unavailable",
        ))
    }

    fn address_status(&self, _address: &str) -> Result<BitcoinAddressStatus, BitcoinProviderError> {
        Err(BitcoinProviderError::unavailable(
            "Bitcoin provider unavailable",
        ))
    }

    fn address_utxos(&self, _address: &str) -> Result<Vec<BitcoinUtxo>, BitcoinProviderError> {
        Err(BitcoinProviderError::unavailable(
            "Bitcoin provider unavailable",
        ))
    }

    fn fee_estimates(&self) -> Result<BitcoinFeeEstimates, BitcoinProviderError> {
        Err(BitcoinProviderError::unavailable(
            "Bitcoin provider unavailable",
        ))
    }

    fn broadcast_raw_tx(
        &self,
        _raw_tx_hex: &str,
    ) -> Result<BitcoinBroadcastResult, BitcoinProviderError> {
        Err(BitcoinProviderError::unavailable(
            "Bitcoin provider unavailable",
        ))
    }

    fn transaction_status(
        &self,
        _txid: &str,
    ) -> Result<Option<BitcoinTransactionStatus>, BitcoinProviderError> {
        Err(BitcoinProviderError::unavailable(
            "Bitcoin provider unavailable",
        ))
    }
}

pub(super) fn provider_error(error: BitcoinProviderError) -> WalletChainError {
    match error.kind {
        BitcoinProviderErrorKind::Unavailable => WalletChainError::provider_unavailable(),
        BitcoinProviderErrorKind::Rejected => WalletChainError::broadcast_rejected(error.message),
        BitcoinProviderErrorKind::Unknown => WalletChainError::broadcast_unknown(error.message),
    }
}
