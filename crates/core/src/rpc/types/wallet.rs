//! Wallet domain RPC types (SPEC-217).

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "lowercase")]
pub enum WalletNetwork {
    Bitcoin,
    Ethereum,
}

impl WalletNetwork {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Bitcoin => "bitcoin",
            Self::Ethereum => "ethereum",
        }
    }

    pub fn amount_unit(self) -> &'static str {
        match self {
            Self::Bitcoin => "satoshi",
            Self::Ethereum => "wei",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum WalletFeeTier {
    Slow,
    Standard,
    Fast,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletFeePolicy {
    pub tier: WalletFeeTier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionOutput {
    pub address: String,
    pub amount: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletWarning {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletPreview {
    pub amount_unit: String,
    pub outputs: Vec<WalletTransactionOutput>,
    pub estimated_fee: String,
    pub total_debit: String,
    pub warnings: Vec<WalletWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletBalance {
    pub spendable: String,
    pub pending_in: String,
    pub pending_out: String,
    pub total: String,
    pub amount_unit: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletSummary {
    pub wallet_id: String,
    pub kind: String,
    pub label: String,
    pub supported_networks: Vec<WalletNetwork>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAccountMeta {
    pub account_id: String,
    pub wallet_id: String,
    pub network: WalletNetwork,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derivation_profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub account_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derivation_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_receive_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_receive_derivation_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub next_receive_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub next_change_index: Option<u32>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionEntry {
    pub tx_ref: String,
    pub wallet_id: String,
    pub account_id: String,
    pub network: WalletNetwork,
    pub status: String,
    pub tx_hash: String,
    pub amount_unit: String,
    pub amount: String,
    pub fee: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletStatusResponse {
    pub initialized: bool,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub wallet_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletListResponse {
    pub wallets: Vec<WalletSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletHdGenerateMnemonicRequest {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub word_count: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wordlist: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletHdGenerateMnemonicResponse {
    pub mnemonic: Vec<String>,
    pub wordlist: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletHdCreateRequest {
    pub label: String,
    pub mnemonic: Vec<String>,
    pub wordlist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bip39_passphrase: Option<String>,
    pub supported_networks: Vec<WalletNetwork>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletHdCreateResponse {
    pub wallet_id: String,
    pub accounts: Vec<WalletAccountMeta>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletImportCreateRequest {
    pub label: String,
    pub network: WalletNetwork,
    pub curve: String,
    pub private_key: String,
    pub encoding: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletImportCreateResponse {
    pub wallet_id: String,
    pub account_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAccountsListRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAccountsListResponse {
    pub accounts: Vec<WalletAccountMeta>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAccountsDeriveRequest {
    pub wallet_id: String,
    pub network: WalletNetwork,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAccountsDeriveResponse {
    pub account_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAddressesDeriveRequest {
    pub account_id: String,
    pub purpose: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAddressesDeriveResponse {
    pub account_id: String,
    pub purpose: String,
    pub address: String,
    pub public_key: String,
    pub derivation_path: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub index: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletBalanceGetRequest {
    pub account_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletBalanceGetResponse {
    pub account_id: String,
    pub network: WalletNetwork,
    pub balance: WalletBalance,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub fetched_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionPrepareRequest {
    pub account_id: String,
    pub network: WalletNetwork,
    pub outputs: Vec<WalletTransactionOutput>,
    pub fee_policy: WalletFeePolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionPrepareResponse {
    pub preparation_id: String,
    pub wallet_id: String,
    pub account_id: String,
    pub network: WalletNetwork,
    pub preview: WalletPreview,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionConfirmRequest {
    pub preparation_id: String,
    pub accepted_warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionConfirmResponse {
    pub tx_ref: String,
    pub network: WalletNetwork,
    pub status: String,
    pub tx_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionCancelRequest {
    pub preparation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionCancelResponse {
    pub cancelled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionsListRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionsListResponse {
    pub transactions: Vec<WalletTransactionEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionsRefreshRequest {
    pub tx_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionsRefreshResponse {
    pub tx_ref: String,
    pub network: WalletNetwork,
    pub status: String,
    pub tx_hash: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletBackupExportRequest {
    pub wallet_id: String,
    pub master_password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletBackupExportResponse {
    pub wallet_id: String,
    pub export_kind: String,
    pub mnemonic: Vec<String>,
    pub wordlist: String,
    pub bip39_passphrase: Option<String>,
}
