//! Vault-backed passkey RPC types (ADR-034).

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultPasskeySummary {
    #[serde(rename = "credentialIdB64Url")]
    pub credential_id_b64url: String,
    #[serde(rename = "rpId")]
    pub rp_id: String,
    #[serde(rename = "rpName")]
    pub rp_name: String,
    #[serde(rename = "userName")]
    pub user_name: String,
    #[serde(rename = "userDisplayName")]
    pub user_display_name: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    #[serde(rename = "signCount")]
    pub sign_count: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    #[serde(rename = "createdAtEpochMs")]
    pub created_at_epoch_ms: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    #[serde(rename = "lastUsedEpochMs")]
    pub last_used_epoch_ms: u64,
    #[serde(rename = "storageKind")]
    pub storage_kind: String,
    pub portable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultPasskeysListResponse {
    pub passkeys: Vec<VaultPasskeySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultPasskeyDeleteResponse {
    pub deleted: bool,
}
