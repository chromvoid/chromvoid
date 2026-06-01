//! Vault-related RPC types

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

/// Vault status response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultStatusResponse {
    pub is_unlocked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub session_started_at: Option<u64>,
}

/// master:setup response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct MasterSetupResponse {
    pub created: bool,
}

/// master:rekey response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct MasterRekeyResponse {
    pub rewrapped_artifacts: Vec<String>,
    pub backup_recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct BackupResponse {
    pub name: String,
    pub content: String, // base64-encoded backup data
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,
}

/// Vault password rekey result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultRekeyResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub migrated_chunks: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub deleted_old_chunks: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub preserved_unknown_chunks: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub deleted_derivative_chunks: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub duration_ms: u64,
    pub backup_recommended: bool,
}
