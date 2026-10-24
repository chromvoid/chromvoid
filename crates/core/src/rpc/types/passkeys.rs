//! Vault-backed passkey RPC types (ADR-034).

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultPasskeysListResponse {
    pub passkeys: Vec<VaultPasskeySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultPasskeyDeleteResponse {
    pub deleted: bool,
}

/// Canonical management request; aliases retain the established RPC wire contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct VaultPasskeyDeleteRequest {
    #[serde(
        rename = "credentialIdB64Url",
        alias = "credential_id_b64url",
        alias = "credentialId"
    )]
    pub credential_id_b64url: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rpc::types::RpcCommand;
    use serde_json::json;

    #[test]
    fn delete_request_preserves_canonical_wire_and_legacy_aliases() {
        for key in ["credentialIdB64Url", "credential_id_b64url", "credentialId"] {
            let data = json!({key: "c3ludGhldGlj"});
            let request: VaultPasskeyDeleteRequest = serde_json::from_value(data.clone()).unwrap();
            assert_eq!(request.credential_id_b64url, "c3ludGhldGlj");
            assert_eq!(
                serde_json::to_value(&request).unwrap(),
                json!({"credentialIdB64Url": "c3ludGhldGlj"})
            );
            let command: RpcCommand = serde_json::from_value(json!({
                "command": "passkeys:delete", "data": data
            }))
            .unwrap();
            assert_eq!(
                serde_json::to_value(command).unwrap(),
                json!({"command": "passkeys:delete", "data": {"credentialIdB64Url": "c3ludGhldGlj"}})
            );
        }
        assert!(serde_json::from_value::<VaultPasskeyDeleteRequest>(json!({})).is_err());
    }
}
