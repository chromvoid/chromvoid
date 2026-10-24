//! Vault-related RPC types

use serde::{Deserialize, Serialize};

use crate::vault::{
    CatalogRepairDiagnosis, CatalogRepairIssue, CatalogRepairOutcomeSummary, CatalogRepairStatus,
};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

/// Vault status response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct VaultStatusResponse {
    pub is_unlocked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub session_started_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultUnlockResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repair: Option<CatalogRepairOutcomeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultRepairDiagnosisResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repair_id: Option<String>,
    pub status: CatalogRepairStatus,
    pub issues: Vec<CatalogRepairIssue>,
    pub lossy_requires_confirm: bool,
}

impl From<CatalogRepairDiagnosis> for VaultRepairDiagnosisResponse {
    fn from(diagnosis: CatalogRepairDiagnosis) -> Self {
        Self {
            repair_id: diagnosis.repair_id,
            status: diagnosis.status,
            issues: diagnosis.issues,
            lossy_requires_confirm: diagnosis.lossy_requires_confirm,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultRepairApplyResponse {
    pub unlocked: bool,
    pub repair: CatalogRepairOutcomeSummary,
}

/// master:setup response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct MasterSetupResponse {
    pub created: bool,
}

/// Canonical `master:setup` wire request; never expose the password through Debug.
#[derive(Clone, Serialize, Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct MasterSetupRequest {
    pub master_password: String,
}

impl std::fmt::Debug for MasterSetupRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("MasterSetupRequest")
            .field("master_password", &"[redacted]")
            .finish()
    }
}

/// Canonical `master:rekey` wire request; never expose passwords through Debug.
#[derive(Clone, Serialize, Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct MasterRekeyRequest {
    pub current_password: String,
    pub new_master_password: String,
}

impl std::fmt::Debug for MasterRekeyRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("MasterRekeyRequest")
            .field("current_password", &"[redacted]")
            .field("new_master_password", &"[redacted]")
            .finish()
    }
}

/// Canonical `vault:rekey` wire request; Core owns validation and migration.
#[derive(Clone, Serialize, Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct VaultRekeyRequest {
    pub current_password: String,
    pub new_password: String,
}

impl std::fmt::Debug for VaultRekeyRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("VaultRekeyRequest")
            .field("current_password", &"[redacted]")
            .field("new_password", &"[redacted]")
            .finish()
    }
}

/// master:rekey response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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

#[cfg(test)]
mod tests {
    use crate::rpc::types::RpcCommand;
    use serde_json::json;

    #[test]
    fn rekey_wire_requests_preserve_the_existing_shape_and_redact_passwords() {
        for (command, field) in [
            ("vault:rekey", "new_password"),
            ("master:rekey", "new_master_password"),
        ] {
            let input = json!({"command":command, "data":{
                "current_password":"synthetic current secret", field:"synthetic new secret"
            }});
            let decoded: RpcCommand = serde_json::from_value(input.clone()).unwrap();
            assert_eq!(serde_json::to_value(&decoded).unwrap(), input);
            let debug = format!("{decoded:?}");
            assert!(!debug.contains("synthetic current secret"));
            assert!(!debug.contains("synthetic new secret"));
            assert!(debug.contains("[redacted]"));
        }
    }
}
