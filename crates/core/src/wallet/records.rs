use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::rpc::types::{
    WalletBalance, WalletFeeTier, WalletNetwork, WalletPreview, WalletTransactionOutput,
};

use super::constants::{default_mnemonic_standard, default_wallet_mode};

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
    #[serde(default = "default_wallet_mode")]
    pub wallet_mode: String,
    #[serde(default = "default_mnemonic_standard")]
    pub mnemonic_standard: String,
    pub supported_networks: Vec<WalletNetwork>,
    /// `None` identifies HD wallets written before recovery discovery became explicit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bitcoin_discovery_pending: Option<bool>,
    pub secret_ref: String,
    pub created_at: u64,
    pub updated_at: u64,
}

impl WalletMetaV1 {
    pub fn needs_bitcoin_discovery(&self) -> bool {
        self.kind == "hd"
            && self
                .supported_networks
                .iter()
                .any(|network| network.as_str() == "bitcoin")
            && self.bitcoin_discovery_pending.unwrap_or(true)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBalanceCacheV1 {
    pub schema_version: u32,
    pub wallet_id: String,
    pub account_id: String,
    pub network: WalletNetwork,
    pub balance: WalletBalance,
    pub fetched_at: u64,
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "mnemonic_standard", rename_all = "snake_case")]
pub enum HdRootRecoveryMaterialV2 {
    Bip39 {
        mnemonic_entropy: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        bip39_passphrase: Option<String>,
    },
    TonNative {
        mnemonic_words: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HdRootMaterial {
    pub mnemonic_standard: String,
    pub mnemonic_entropy: String,
    pub wordlist: String,
    pub mnemonic_words: Option<Vec<String>>,
    pub bip39_passphrase: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SecretPayloadV1 {
    /// Legacy v1 shape. Read-only compatibility; new writes use `HdRootV2`.
    HdRoot {
        #[serde(default = "default_mnemonic_standard")]
        mnemonic_standard: String,
        mnemonic_entropy: String,
        wordlist: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mnemonic_words: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        bip39_passphrase: Option<String>,
    },
    HdRootV2 {
        wordlist: String,
        recovery: HdRootRecoveryMaterialV2,
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
    BroadcastArtifact {
        signed_artifact: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tx_hash: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message_ref: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        submit_metadata: Option<Value>,
    },
}

impl SecretPayloadV1 {
    pub fn hd_root_v2(
        mnemonic_standard: &str,
        mnemonic_entropy: String,
        wordlist: String,
        mnemonic_words: Option<Vec<String>>,
        bip39_passphrase: Option<String>,
    ) -> Self {
        let recovery = if mnemonic_standard == "ton_native" {
            HdRootRecoveryMaterialV2::TonNative {
                mnemonic_words: mnemonic_words.unwrap_or_default(),
            }
        } else {
            HdRootRecoveryMaterialV2::Bip39 {
                mnemonic_entropy,
                bip39_passphrase,
            }
        };
        Self::HdRootV2 { wordlist, recovery }
    }

    pub fn hd_root_material(&self) -> Option<HdRootMaterial> {
        match self {
            Self::HdRoot {
                mnemonic_standard,
                mnemonic_entropy,
                wordlist,
                mnemonic_words,
                bip39_passphrase,
            } => Some(HdRootMaterial {
                mnemonic_standard: mnemonic_standard.clone(),
                mnemonic_entropy: mnemonic_entropy.clone(),
                wordlist: wordlist.clone(),
                mnemonic_words: mnemonic_words.clone(),
                bip39_passphrase: bip39_passphrase.clone(),
            }),
            Self::HdRootV2 { wordlist, recovery } => match recovery {
                HdRootRecoveryMaterialV2::Bip39 {
                    mnemonic_entropy,
                    bip39_passphrase,
                } => Some(HdRootMaterial {
                    mnemonic_standard: "bip39".to_string(),
                    mnemonic_entropy: mnemonic_entropy.clone(),
                    wordlist: wordlist.clone(),
                    mnemonic_words: None,
                    bip39_passphrase: bip39_passphrase.clone(),
                }),
                HdRootRecoveryMaterialV2::TonNative { mnemonic_words } => Some(HdRootMaterial {
                    mnemonic_standard: "ton_native".to_string(),
                    mnemonic_entropy: String::new(),
                    wordlist: wordlist.clone(),
                    mnemonic_words: Some(mnemonic_words.clone()),
                    bip39_passphrase: None,
                }),
            },
            _ => None,
        }
    }
}

impl fmt::Debug for SecretPayloadV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HdRoot {
                mnemonic_standard,
                wordlist,
                mnemonic_words,
                bip39_passphrase,
                ..
            } => formatter
                .debug_struct("HdRoot")
                .field("mnemonic_standard", mnemonic_standard)
                .field("mnemonic_entropy", &"[redacted]")
                .field("wordlist", wordlist)
                .field(
                    "mnemonic_words",
                    &mnemonic_words.as_ref().map(|_| "[redacted]"),
                )
                .field(
                    "bip39_passphrase",
                    &bip39_passphrase.as_ref().map(|_| "[redacted]"),
                )
                .finish(),
            Self::HdRootV2 { wordlist, recovery } => formatter
                .debug_struct("HdRootV2")
                .field("wordlist", wordlist)
                .field(
                    "mnemonic_standard",
                    &match recovery {
                        HdRootRecoveryMaterialV2::Bip39 { .. } => "bip39",
                        HdRootRecoveryMaterialV2::TonNative { .. } => "ton_native",
                    },
                )
                .field("recovery", &"[redacted]")
                .finish(),
            Self::ImportedKey {
                network,
                curve,
                encoding,
                ..
            } => formatter
                .debug_struct("ImportedKey")
                .field("network", network)
                .field("curve", curve)
                .field("private_key", &"[redacted]")
                .field("encoding", encoding)
                .finish(),
            Self::PreparedPayload { .. } => formatter
                .debug_struct("PreparedPayload")
                .field("canonical_payload", &"[redacted]")
                .finish(),
            Self::BroadcastArtifact { .. } => formatter
                .debug_struct("BroadcastArtifact")
                .field("signed_artifact", &"[redacted]")
                .finish(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PreparationStateV1 {
    #[default]
    Ready,
    Consumed,
    InFlight,
    Superseded,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_snapshot: Option<Value>,
    pub preview: WalletPreview,
    #[serde(default)]
    pub state: PreparationStateV1,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consumed_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirm_attempt_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tx_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by_tx_ref: Option<String>,
    pub expires_at: u64,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreparedIntentV1 {
    pub outputs: Vec<WalletTransactionOutput>,
    pub fee_tier: WalletFeeTier,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastArtifactV2 {
    pub tx_ref: String,
    pub wallet_id: String,
    pub account_id: String,
    pub network: WalletNetwork,
    pub artifact_ref: String,
    #[serde(default)]
    pub artifact_digest: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_ref: Option<String>,
    #[serde(default)]
    pub submit_attempts: Vec<BroadcastSubmitAttemptV1>,
    pub expires_at: u64,
    pub created_at: u64,
}

/// Read compatibility alias for schema-v1 callers. New writes use schema-v2 fields.
pub type BroadcastArtifactV1 = BroadcastArtifactV2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastSubmitAttemptV1 {
    pub attempted_at: u64,
    pub outcome: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WalletProviderObservationOutcomeV1 {
    Pending,
    Confirmed,
    Failed,
    NotFound,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletProviderObservationV1 {
    pub source_id: String,
    pub independence_group: String,
    pub observed_at: u64,
    pub outcome: WalletProviderObservationOutcomeV1,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmations: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletReconciliationEvidenceV1 {
    pub tx_ref: String,
    pub observations: Vec<WalletProviderObservationV1>,
    pub evaluated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletOperationIdempotencyRecordV1 {
    pub client_request_id: String,
    pub command: String,
    pub payload_digest: String,
    pub result_ref: Value,
    pub created_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WalletTxStatus {
    Broadcasting,
    Pending,
    Confirmed,
    Failed,
    BroadcastUnknown,
}

impl WalletTxStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Broadcasting => "broadcasting",
            Self::Pending => "pending",
            Self::Confirmed => "confirmed",
            Self::Failed => "failed",
            Self::BroadcastUnknown => "broadcast_unknown",
        }
    }
}
