use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use zeroize::Zeroizing;

use crate::rpc::types::{
    WalletBalance, WalletFeeTier, WalletNetwork, WalletPreview, WalletTransactionOutput,
};

use super::constants::{default_mnemonic_standard, default_wallet_mode};
use super::root::{TonSigningState, WalletRoot};

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
    /// Account-based networks (Ethereum, Solana) of a restored phrase whose used derived
    /// accounts have not been discovered yet; cleared network by network by the first
    /// `wallet:balance:get { discover_addresses: true }`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub account_discovery_pending: Vec<WalletNetwork>,
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

    pub fn needs_account_discovery(&self, network: &WalletNetwork) -> bool {
        self.kind == "hd" && self.account_discovery_pending.contains(network)
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
    /// TEP-0003 Rotation mnemonic: 12 words before the first rotation, 24 after it.
    /// `pending_signing_words` is a rotation that was broadcast but not yet observed on-chain;
    /// it is kept next to the current phrase so a late-landing rotation cannot lock the account.
    Rotation {
        mnemonic_words: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pending_signing_words: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pending_signing_valid_until: Option<u32>,
        /// Multichain rotation wallets derive non-TON networks from the anchor half plus this
        /// passphrase, so the bare 12 words (e.g. imported into Telegram) never reach them.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        bip39_passphrase: Option<String>,
    },
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SecretPayloadV1 {
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
        } else if mnemonic_standard == "rotation" {
            HdRootRecoveryMaterialV2::Rotation {
                mnemonic_words: mnemonic_words.unwrap_or_default(),
                pending_signing_words: None,
                pending_signing_valid_until: None,
                bip39_passphrase,
            }
        } else {
            HdRootRecoveryMaterialV2::Bip39 {
                mnemonic_entropy,
                bip39_passphrase,
            }
        };
        Self::HdRootV2 { wordlist, recovery }
    }

    pub fn wallet_root(&self) -> Option<(WalletRoot, Option<TonSigningState>)> {
        match self {
            Self::HdRootV2 { recovery, .. } => match recovery {
                HdRootRecoveryMaterialV2::Bip39 {
                    mnemonic_entropy,
                    bip39_passphrase,
                } => Some((
                    WalletRoot::Bip39 {
                        entropy: Zeroizing::new(mnemonic_entropy.clone()),
                        passphrase: bip39_passphrase.clone().map(Zeroizing::new),
                    },
                    None,
                )),
                HdRootRecoveryMaterialV2::TonNative { mnemonic_words } => Some((
                    WalletRoot::TonNative {
                        words: Zeroizing::new(mnemonic_words.clone()),
                    },
                    None,
                )),
                HdRootRecoveryMaterialV2::Rotation {
                    mnemonic_words,
                    pending_signing_words,
                    pending_signing_valid_until,
                    bip39_passphrase,
                } => {
                    let normalized = Zeroizing::new(
                        super::rotation_mnemonic::normalize_rotation_words(mnemonic_words),
                    );
                    let signing_words = super::rotation_mnemonic::rotation_halves(&normalized)
                        .ok()
                        .and_then(|(anchor, signing)| {
                            (anchor != signing).then(|| Zeroizing::new(signing.to_vec()))
                        });
                    Some((
                        WalletRoot::Bip39 {
                            entropy: Zeroizing::new(rotation_anchor_entropy_hex(mnemonic_words)),
                            passphrase: bip39_passphrase.clone().map(Zeroizing::new),
                        },
                        Some(TonSigningState {
                            signing_words,
                            pending_words: pending_signing_words.clone().map(Zeroizing::new),
                            pending_valid_until: *pending_signing_valid_until,
                        }),
                    ))
                }
            },
            _ => None,
        }
    }
}

/// Hex entropy of the anchor half (words 1–12) of a rotation phrase; empty when invalid.
pub fn rotation_anchor_entropy_hex(words: &[String]) -> String {
    use bip39::{Language, Mnemonic};

    let words = Zeroizing::new(super::rotation_mnemonic::normalize_rotation_words(words));
    let Ok((anchor, _)) = super::rotation_mnemonic::rotation_halves(&words) else {
        return String::new();
    };
    let phrase = zeroize::Zeroizing::new(anchor.join(" "));
    match Mnemonic::parse_in_normalized(Language::English, phrase.as_str()) {
        Ok(mnemonic) => super::ids::hex_string(&mnemonic.to_entropy()),
        Err(_) => String::new(),
    }
}

impl fmt::Debug for SecretPayloadV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HdRootV2 { wordlist, recovery } => formatter
                .debug_struct("HdRootV2")
                .field("wordlist", wordlist)
                .field(
                    "mnemonic_standard",
                    &match recovery {
                        HdRootRecoveryMaterialV2::Bip39 { .. } => "bip39",
                        HdRootRecoveryMaterialV2::TonNative { .. } => "ton_native",
                        HdRootRecoveryMaterialV2::Rotation { .. } => "rotation",
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
