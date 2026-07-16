//! Wallet domain RPC types (SPEC-217).

use std::fmt;

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "ts-bindings", ts(type = "string"))]
#[serde(transparent)]
pub struct WalletNetwork(String);

impl WalletNetwork {
    pub fn new(network: impl Into<String>) -> Self {
        Self(network.into())
    }

    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl From<&str> for WalletNetwork {
    fn from(network: &str) -> Self {
        Self::new(network)
    }
}

impl From<String> for WalletNetwork {
    fn from(network: String) -> Self {
        Self::new(network)
    }
}

impl fmt::Display for WalletNetwork {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
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
#[serde(deny_unknown_fields)]
pub struct WalletFeePolicy {
    pub tier: WalletFeeTier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletTransactionOutput {
    pub address: String,
    pub amount: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletTransactionQuoteOutput {
    pub address: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ton: Option<TonTransactionPreviewV1>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ethereum: Option<EthereumTransactionPreviewV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EthereumTransactionPreviewV1 {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub nonce: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub chain_id: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub gas_limit: u64,
    pub max_fee_per_gas: String,
    pub max_priority_fee_per_gas: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct TonTransactionPreviewV1 {
    pub wallet_contract: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub seqno: u32,
    pub account_state: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub valid_until: u32,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub message_mode: u8,
    pub sender_state_init_included: bool,
    pub destination_state: String,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_mode: Option<String>,
    pub mnemonic_standard: String,
    pub supported_networks: Vec<WalletNetwork>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bitcoin_discovery_pending: Option<bool>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WalletAccountMeta {
    Imported(ImportedAccountMetaV1),
    Derived(DerivedAccountMetaV1),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct ImportedAccountMetaV1 {
    pub account_id: String,
    pub wallet_id: String,
    pub network: WalletNetwork,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curve: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_contract: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub workchain: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_account: Option<String>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct DerivedAccountMetaV1 {
    pub account_id: String,
    pub wallet_id: String,
    pub network: WalletNetwork,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_mode: Option<String>,
    #[serde(default)]
    pub mnemonic_standard: String,
    pub account_model: String,
    pub derivation_profile: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_contract: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub account_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub workchain: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_account: Option<String>,
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

impl WalletAccountMeta {
    pub fn account_id(&self) -> &str {
        match self {
            Self::Imported(meta) => &meta.account_id,
            Self::Derived(meta) => &meta.account_id,
        }
    }

    pub fn wallet_id(&self) -> &str {
        match self {
            Self::Imported(meta) => &meta.wallet_id,
            Self::Derived(meta) => &meta.wallet_id,
        }
    }

    pub fn network(&self) -> &WalletNetwork {
        match self {
            Self::Imported(meta) => &meta.network,
            Self::Derived(meta) => &meta.network,
        }
    }

    pub fn account_model(&self) -> Option<&str> {
        match self {
            Self::Imported(_) => None,
            Self::Derived(meta) => Some(meta.account_model.as_str()),
        }
    }

    pub fn derivation_profile(&self) -> Option<&str> {
        match self {
            Self::Imported(_) => None,
            Self::Derived(meta) => Some(meta.derivation_profile.as_str()),
        }
    }

    pub fn account_index(&self) -> Option<u32> {
        match self {
            Self::Imported(_) => None,
            Self::Derived(meta) => meta.account_index,
        }
    }

    pub fn is_derived(&self) -> bool {
        matches!(self, Self::Derived(_))
    }

    pub fn is_imported(&self) -> bool {
        matches!(self, Self::Imported(_))
    }

    pub fn created_at(&self) -> u64 {
        match self {
            Self::Imported(meta) => meta.created_at,
            Self::Derived(meta) => meta.created_at,
        }
    }

    pub fn updated_at(&self) -> u64 {
        match self {
            Self::Imported(meta) => meta.updated_at,
            Self::Derived(meta) => meta.updated_at,
        }
    }

    pub fn set_updated_at(&mut self, updated_at: u64) {
        match self {
            Self::Imported(meta) => meta.updated_at = updated_at,
            Self::Derived(meta) => meta.updated_at = updated_at,
        }
    }

    pub fn next_receive_index(&self) -> Option<u32> {
        match self {
            Self::Imported(_) => None,
            Self::Derived(meta) => meta.next_receive_index,
        }
    }

    pub fn next_change_index(&self) -> Option<u32> {
        match self {
            Self::Imported(_) => None,
            Self::Derived(meta) => meta.next_change_index,
        }
    }

    pub fn set_next_receive_state(
        &mut self,
        next_index: u32,
        address: String,
        derivation_path: String,
    ) {
        if let Self::Derived(meta) = self {
            meta.next_receive_index = Some(next_index);
            meta.current_receive_address = Some(address);
            meta.current_receive_derivation_path = Some(derivation_path);
        }
    }

    pub fn set_next_change_index(&mut self, next_index: u32) {
        if let Self::Derived(meta) = self {
            meta.next_change_index = Some(next_index);
        }
    }

    pub fn validate_base_contract(&self) -> Result<(), &'static str> {
        match self {
            Self::Imported(_) => Ok(()),
            Self::Derived(meta) => {
                if meta.account_model.trim().is_empty() {
                    return Err("derived account metadata requires account_model");
                }
                if meta.derivation_profile.trim().is_empty() {
                    return Err("derived account metadata requires derivation_profile");
                }
                Ok(())
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum WalletConfirmStatus {
    Pending,
    BroadcastUnknown,
}

impl WalletConfirmStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::BroadcastUnknown => "broadcast_unknown",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum WalletTransactionDirection {
    Incoming,
    Outgoing,
    Unknown,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broadcast_artifact_ref: Option<String>,
    pub amount_unit: String,
    pub amount: String,
    pub fee: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub direction: Option<WalletTransactionDirection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub counterparty: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub valid_until: Option<u32>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletStatusRequest {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum WalletProviderStatus {
    Ready,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum WalletCapabilityState {
    Ready,
    Disabled,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletCapabilityStatus {
    pub id: String,
    pub state: WalletCapabilityState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletNetworkStatus {
    pub network: WalletNetwork,
    pub enabled: bool,
    pub provider_status: WalletProviderStatus,
    pub broadcast_enabled: bool,
    #[serde(default)]
    pub capabilities: Vec<WalletCapabilityStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletStatusResponse {
    pub initialized: bool,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub wallet_count: u64,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
    pub networks: Vec<WalletNetworkStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletListRequest {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletListResponse {
    pub wallets: Vec<WalletSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletHdGenerateMnemonicRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mnemonic_standard: Option<String>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub word_count: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wordlist: Option<String>,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletHdGenerateMnemonicResponse {
    pub mnemonic_draft_id: String,
    pub mnemonic: Vec<String>,
    pub wordlist: String,
    pub wallet_mode: String,
    pub mnemonic_standard: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub expires_at: u64,
}

impl fmt::Debug for WalletHdGenerateMnemonicResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletHdGenerateMnemonicResponse")
            .field("mnemonic_draft_id", &self.mnemonic_draft_id)
            .field(
                "mnemonic",
                &format!("[redacted; {} words]", self.mnemonic.len()),
            )
            .field("wordlist", &self.wordlist)
            .field("wallet_mode", &self.wallet_mode)
            .field("mnemonic_standard", &self.mnemonic_standard)
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletHdCreateRequest {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mnemonic: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mnemonic_draft_id: Option<String>,
    pub wordlist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mnemonic_standard: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bip39_passphrase: Option<String>,
    pub supported_networks: Vec<WalletNetwork>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_request_id: Option<String>,
}

impl fmt::Debug for WalletHdCreateRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletHdCreateRequest")
            .field("label", &self.label)
            .field("wallet_mode", &self.wallet_mode)
            .field(
                "mnemonic",
                &self
                    .mnemonic
                    .as_ref()
                    .map(|mnemonic| format!("[redacted; {} words]", mnemonic.len())),
            )
            .field("mnemonic_draft_id", &self.mnemonic_draft_id)
            .field("wordlist", &self.wordlist)
            .field("mnemonic_standard", &self.mnemonic_standard)
            .field(
                "bip39_passphrase",
                &self.bip39_passphrase.as_ref().map(|_| "[redacted]"),
            )
            .field("supported_networks", &self.supported_networks)
            .field("client_request_id", &self.client_request_id)
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletHdCreateResponse {
    pub wallet_id: String,
    pub accounts: Vec<WalletAccountMeta>,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletImportCreateRequest {
    pub label: String,
    pub network: WalletNetwork,
    pub curve: String,
    pub private_key: String,
    pub encoding: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_request_id: Option<String>,
}

impl fmt::Debug for WalletImportCreateRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletImportCreateRequest")
            .field("label", &self.label)
            .field("network", &self.network)
            .field("curve", &self.curve)
            .field("private_key", &"[redacted]")
            .field("encoding", &self.encoding)
            .field("client_request_id", &self.client_request_id)
            .finish()
    }
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
#[serde(deny_unknown_fields)]
pub struct WalletAccountsListRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAccountsListResponse {
    pub accounts: Vec<WalletAccountMeta>,
    #[serde(default)]
    pub cached_balances: Vec<WalletBalanceGetResponse>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
pub struct WalletBalanceGetRequest {
    pub account_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discover_addresses: Option<bool>,
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
#[serde(deny_unknown_fields)]
pub struct WalletTransactionPrepareRequest {
    pub account_id: String,
    pub network: WalletNetwork,
    pub outputs: Vec<WalletTransactionOutput>,
    pub fee_policy: WalletFeePolicy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub maximize_output_index: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletTransactionQuoteRequest {
    pub account_id: String,
    pub network: WalletNetwork,
    pub outputs: Vec<WalletTransactionQuoteOutput>,
    pub fee_policy: WalletFeePolicy,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub max_output_index: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionQuoteResponse {
    pub account_id: String,
    pub network: WalletNetwork,
    pub spendable: String,
    pub current_preview: Option<WalletPreview>,
    pub max_preview: WalletPreview,
    pub max_amount: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub quoted_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub expires_at: u64,
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
#[serde(deny_unknown_fields)]
pub struct WalletTransactionConfirmRequest {
    pub preparation_id: String,
    pub accepted_warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub master_password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spend_authorization_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionConfirmResponse {
    pub tx_ref: String,
    pub network: WalletNetwork,
    pub status: WalletConfirmStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletAddressBookEntry {
    pub entry_id: String,
    pub label: String,
    pub network: WalletNetwork,
    pub address: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletAddressBookListRequest {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAddressBookListResponse {
    pub entries: Vec<WalletAddressBookEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletAddressBookCreateRequest {
    pub label: String,
    pub network: WalletNetwork,
    pub address: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAddressBookCreateResponse {
    pub entry: WalletAddressBookEntry,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletAddressBookUpdateRequest {
    pub entry_id: String,
    pub label: String,
    pub network: WalletNetwork,
    pub address: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAddressBookUpdateResponse {
    pub entry: WalletAddressBookEntry,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletAddressBookDeleteRequest {
    pub entry_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletAddressBookDeleteResponse {
    pub entry_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletSpendAuthorizationScope {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<WalletNetwork>,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletSpendAuthorizationCreateRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<WalletNetwork>,
    pub master_password: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub duration_ms: u64,
}

impl fmt::Debug for WalletSpendAuthorizationCreateRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletSpendAuthorizationCreateRequest")
            .field("wallet_id", &self.wallet_id)
            .field("account_id", &self.account_id)
            .field("network", &self.network)
            .field("master_password", &"[redacted]")
            .field("duration_ms", &self.duration_ms)
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletSpendAuthorizationCreateResponse {
    pub spend_authorization_id: String,
    pub scope: WalletSpendAuthorizationScope,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletSpendAuthorizationRevokeRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spend_authorization_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletSpendAuthorizationRevokeResponse {
    pub revoked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletTransactionCancelRequest {
    pub preparation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionCancelResponse {
    pub cancelled: bool,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletTransactionRebroadcastRequest {
    pub tx_ref: String,
    pub master_password: String,
}

impl fmt::Debug for WalletTransactionRebroadcastRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletTransactionRebroadcastRequest")
            .field("tx_ref", &self.tx_ref)
            .field("master_password", &"[redacted]")
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionRebroadcastResponse {
    pub tx_ref: String,
    pub network: WalletNetwork,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletTransactionsListRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub limit: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionsListResponse {
    pub transactions: Vec<WalletTransactionEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletTransactionsSyncRequest {
    pub account_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletTransactionsSyncResponse {
    pub account_id: String,
    pub network: WalletNetwork,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub synced_count: u32,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub fetched_at: u64,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct WalletBackupExportRequest {
    pub wallet_id: String,
    pub master_password: String,
}

impl fmt::Debug for WalletBackupExportRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletBackupExportRequest")
            .field("wallet_id", &self.wallet_id)
            .field("master_password", &"[redacted]")
            .finish()
    }
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct WalletBackupExportResponse {
    pub wallet_id: String,
    pub export_kind: String,
    pub mnemonic: Vec<String>,
    pub wordlist: String,
    pub wallet_mode: String,
    pub mnemonic_standard: String,
    pub bip39_passphrase: Option<String>,
}

impl fmt::Debug for WalletBackupExportResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletBackupExportResponse")
            .field("wallet_id", &self.wallet_id)
            .field("export_kind", &self.export_kind)
            .field(
                "mnemonic",
                &format!("[redacted; {} words]", self.mnemonic.len()),
            )
            .field("wordlist", &self.wordlist)
            .field("wallet_mode", &self.wallet_mode)
            .field("mnemonic_standard", &self.mnemonic_standard)
            .field(
                "bip39_passphrase",
                &self.bip39_passphrase.as_ref().map(|_| "[redacted]"),
            )
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DerivedAccountMetaV1, ImportedAccountMetaV1, WalletAccountMeta, WalletBackupExportRequest,
        WalletBackupExportResponse, WalletHdCreateRequest, WalletHdGenerateMnemonicResponse,
        WalletImportCreateRequest, WalletNetwork,
    };

    #[test]
    fn wallet_secret_bearing_debug_output_is_redacted() {
        let mnemonic_response = WalletHdGenerateMnemonicResponse {
            mnemonic_draft_id: "mnemonic-draft-fixture".to_string(),
            mnemonic: vec!["alpha".to_string(), "bravo".to_string()],
            wordlist: "english".to_string(),
            wallet_mode: "multichain".to_string(),
            mnemonic_standard: "bip39".to_string(),
            expires_at: 1,
        };
        let hd_create = WalletHdCreateRequest {
            label: "wallet".to_string(),
            wallet_mode: Some("multichain".to_string()),
            mnemonic: Some(vec!["alpha".to_string(), "bravo".to_string()]),
            mnemonic_draft_id: None,
            wordlist: "english".to_string(),
            mnemonic_standard: Some("bip39".to_string()),
            bip39_passphrase: Some("phrase-secret".to_string()),
            supported_networks: vec![WalletNetwork::from("bitcoin")],
            client_request_id: Some("client-request".to_string()),
        };
        let import_create = WalletImportCreateRequest {
            label: "import".to_string(),
            network: WalletNetwork::from("ethereum"),
            curve: "secp256k1".to_string(),
            private_key: "private-key-secret".to_string(),
            encoding: "hex".to_string(),
            client_request_id: Some("client-request-import".to_string()),
        };
        let backup_request = WalletBackupExportRequest {
            wallet_id: "wallet-id".to_string(),
            master_password: "master-secret".to_string(),
        };
        let backup_response = WalletBackupExportResponse {
            wallet_id: "wallet-id".to_string(),
            export_kind: "mnemonic".to_string(),
            mnemonic: vec!["alpha".to_string(), "bravo".to_string()],
            wordlist: "english".to_string(),
            wallet_mode: "multichain".to_string(),
            mnemonic_standard: "bip39".to_string(),
            bip39_passphrase: Some("phrase-secret".to_string()),
        };

        let debug = format!(
            "{mnemonic_response:?}\n{hd_create:?}\n{import_create:?}\n{backup_request:?}\n{backup_response:?}"
        );
        for secret in [
            "alpha",
            "bravo",
            "phrase-secret",
            "private-key-secret",
            "master-secret",
        ] {
            assert!(!debug.contains(secret), "{secret} leaked in {debug}");
        }
        assert!(debug.contains("[redacted"));
    }

    #[test]
    fn wallet_account_meta_roundtrips_as_tagged_union() {
        let imported = WalletAccountMeta::Imported(ImportedAccountMetaV1 {
            account_id: "account-imported".to_string(),
            wallet_id: "wallet".to_string(),
            network: WalletNetwork::from("testchain"),
            label: Some("Imported".to_string()),
            address: "test-address".to_string(),
            public_key: Some("test-public-key".to_string()),
            curve: None,
            wallet_contract: None,
            workchain: None,
            raw_account: None,
            created_at: 1,
            updated_at: 2,
        });
        let derived = WalletAccountMeta::Derived(DerivedAccountMetaV1 {
            account_id: "account-derived".to_string(),
            wallet_id: "wallet".to_string(),
            network: WalletNetwork::from("testchain"),
            wallet_mode: Some("multichain".to_string()),
            mnemonic_standard: "bip39".to_string(),
            account_model: "utxo".to_string(),
            derivation_profile: "test-profile-v1".to_string(),
            wallet_contract: None,
            account_index: Some(0),
            workchain: None,
            label: Some("Derived".to_string()),
            address: Some("test-address".to_string()),
            raw_account: None,
            public_key: Some("test-public-key".to_string()),
            derivation_path: Some("m/test/0".to_string()),
            current_receive_address: Some("test-receive".to_string()),
            current_receive_derivation_path: Some("m/test/0/0/0".to_string()),
            next_receive_index: Some(1),
            next_change_index: Some(0),
            created_at: 1,
            updated_at: 2,
        });

        for (account, expected_kind) in [(imported, "imported"), (derived, "derived")] {
            let json = serde_json::to_value(&account).expect("serialize account");
            assert_eq!(json["kind"], expected_kind);
            let roundtrip: WalletAccountMeta =
                serde_json::from_value(json).expect("deserialize account");
            assert_eq!(roundtrip, account);
        }
    }
}
