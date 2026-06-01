//! Core wallet domain primitives (SPEC-217).

use serde::{Deserialize, Serialize};

use crate::rpc::types::{
    WalletBalance, WalletFeeTier, WalletNetwork, WalletPreview, WalletTransactionOutput,
};

pub const WALLET_ROOT: &str = "/.wallet";
pub const WALLET_SCHEMA_VERSION: u32 = 1;
pub const BITCOIN_GAP_LIMIT: u32 = 20;
pub const ETHEREUM_DISCOVERY_UNUSED_WINDOW: u32 = 5;
pub const PREPARATION_TTL_MS: u64 = 5 * 60 * 1000;

#[derive(Debug, Clone)]
pub struct WalletRuntimeConfig {
    pub wallet_phase1_enabled: bool,
    pub wallet_core_broadcast_enabled: bool,
}

impl Default for WalletRuntimeConfig {
    fn default() -> Self {
        Self {
            wallet_phase1_enabled: false,
            wallet_core_broadcast_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WalletIndexV1 {
    pub schema_version: u32,
    pub wallet_ids: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletMetaV1 {
    pub wallet_id: String,
    pub kind: String,
    pub label: String,
    pub supported_networks: Vec<WalletNetwork>,
    pub secret_ref: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllocatedAddressV1 {
    pub account_id: String,
    pub purpose: String,
    pub index: u32,
    pub address: String,
    pub public_key: String,
    pub derivation_path: String,
    pub created_at: u64,
    pub last_observed_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretBlobV1 {
    pub secret_id: String,
    pub kind: String,
    pub payload_version: u32,
    pub payload: SecretPayloadV1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SecretPayloadV1 {
    HdRoot {
        mnemonic_entropy: String,
        wordlist: String,
        bip39_passphrase: Option<String>,
        mnemonic: Vec<String>,
    },
    ImportedKey {
        network: WalletNetwork,
        curve: String,
        private_key: String,
        encoding: String,
    },
    PreparedPayload {
        canonical_payload: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WalletProviderPreconditions {
    pub nonce: Option<u64>,
    pub utxo_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreparationRecordV1 {
    pub preparation_id: String,
    pub wallet_id: String,
    pub account_id: String,
    pub network: WalletNetwork,
    pub canonical_intent: PreparedIntentV1,
    pub payload_ref: String,
    pub warning_codes: Vec<String>,
    pub preconditions: WalletProviderPreconditions,
    pub preview: WalletPreview,
    pub expires_at: u64,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreparedIntentV1 {
    pub outputs: Vec<WalletTransactionOutput>,
    pub fee_tier: WalletFeeTier,
}

#[derive(Debug, Clone, Serialize)]
pub struct BitcoinUtxo {
    pub outpoint: String,
    pub address: String,
    pub amount: u128,
}

#[derive(Debug, Clone, Serialize)]
pub struct BitcoinPrepareSnapshot {
    pub utxos: Vec<BitcoinUtxo>,
    pub fee: u128,
}

#[derive(Debug, Clone, Serialize)]
pub struct EthereumPrepareSnapshot {
    pub balance: u128,
    pub nonce: u64,
    pub estimated_fee: u128,
}

#[derive(Debug, Clone)]
pub enum WalletBroadcastOutcome {
    Accepted,
    Rejected(String),
    Unknown,
}

#[derive(Debug, Clone)]
pub enum WalletTxStatus {
    Pending,
    Confirmed,
    Failed,
    BroadcastUnknown,
}

impl WalletTxStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Confirmed => "confirmed",
            Self::Failed => "failed",
            Self::BroadcastUnknown => "broadcast_unknown",
        }
    }
}

pub trait WalletProvider: Send + Sync {
    fn bitcoin_balance(&self, addresses: &[String]) -> Result<WalletBalance, WalletProviderError>;
    fn bitcoin_prepare(
        &self,
        addresses: &[String],
        outputs: &[WalletTransactionOutput],
        fee_tier: &WalletFeeTier,
    ) -> Result<BitcoinPrepareSnapshot, WalletProviderError>;
    fn bitcoin_broadcast(
        &self,
        tx_hash: &str,
        signed_payload: &str,
    ) -> Result<WalletBroadcastOutcome, WalletProviderError>;
    fn bitcoin_transaction_status(
        &self,
        tx_hash: &str,
    ) -> Result<WalletTxStatus, WalletProviderError>;

    fn ethereum_balance(&self, address: &str) -> Result<WalletBalance, WalletProviderError>;
    fn ethereum_prepare(
        &self,
        address: &str,
        outputs: &[WalletTransactionOutput],
        fee_tier: &WalletFeeTier,
    ) -> Result<EthereumPrepareSnapshot, WalletProviderError>;
    fn ethereum_broadcast(
        &self,
        tx_hash: &str,
        signed_payload: &str,
    ) -> Result<WalletBroadcastOutcome, WalletProviderError>;
    fn ethereum_transaction_status(
        &self,
        tx_hash: &str,
    ) -> Result<WalletTxStatus, WalletProviderError>;

    fn address_used(
        &self,
        network: WalletNetwork,
        address: &str,
    ) -> Result<bool, WalletProviderError>;
}

#[derive(Debug, Clone)]
pub enum WalletProviderError {
    Unavailable,
    Rejected(String),
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn new_wallet_id() -> String {
    random_id("wallet")
}

pub fn new_account_id() -> String {
    random_id("account")
}

pub fn new_secret_id() -> String {
    random_id("secret")
}

pub fn new_preparation_id() -> String {
    random_id("prep")
}

pub fn new_tx_ref() -> String {
    random_id("tx")
}

fn random_id(prefix: &str) -> String {
    let mut bytes = [0u8; 16];
    if getrandom::getrandom(&mut bytes).is_err() {
        let fallback = now_ms().to_le_bytes();
        bytes[..fallback.len()].copy_from_slice(&fallback);
    }
    format!("{prefix}-{}", hex_string(&bytes))
}

pub fn hex_string(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

pub fn hash_hex(parts: &[&[u8]]) -> String {
    let mut hasher = blake3::Hasher::new();
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().to_hex().to_string()
}

pub fn derive_public_key(seed: &str, path: &str) -> String {
    format!("02{}", &hash_hex(&[seed.as_bytes(), path.as_bytes()])[..64])
}

pub fn derive_address(network: WalletNetwork, seed: &str, path: &str) -> String {
    let digest = hash_hex(&[
        network.as_str().as_bytes(),
        seed.as_bytes(),
        path.as_bytes(),
    ]);
    match network {
        WalletNetwork::Bitcoin => format!("bc1q{}", &digest[..38]),
        WalletNetwork::Ethereum => format!("0x{}", &digest[..40]),
    }
}

pub fn account_summary_from_meta(meta: &WalletMetaV1) -> crate::rpc::types::WalletSummary {
    crate::rpc::types::WalletSummary {
        wallet_id: meta.wallet_id.clone(),
        kind: meta.kind.clone(),
        label: meta.label.clone(),
        supported_networks: meta.supported_networks.clone(),
        created_at: meta.created_at,
        updated_at: meta.updated_at,
    }
}
