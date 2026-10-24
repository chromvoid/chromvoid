//! SSH key creation and explicit key exchange contracts.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSshKeygenRequest {
    pub key_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub comment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerSshKeyCreateResponse {
    pub key_id: String,
    pub public_key_openssh: String,
    pub fingerprint: String,
    pub key_type: String,
}

#[derive(Clone, Serialize, Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSshImportRequest {
    pub private_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub passphrase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_entry_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSshExportRequest {
    pub key_id: String,
    pub format: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub passphrase: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerSshExportResponse {
    pub filename: String,
    pub content: String,
}

impl std::fmt::Debug for PassmanagerSshImportRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PassmanagerSshImportRequest")
            .finish_non_exhaustive()
    }
}
impl std::fmt::Debug for PassmanagerSshExportRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PassmanagerSshExportRequest")
            .finish_non_exhaustive()
    }
}
impl std::fmt::Debug for PassmanagerSshExportResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PassmanagerSshExportResponse")
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SshKeyMetadata {
    pub id: String,
    #[serde(rename = "type")]
    pub key_type: String,
    pub fingerprint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(alias = "source_entry_id", skip_serializing_if = "Option::is_none")]
    pub source_entry_id: Option<String>,
    #[serde(alias = "created_ts", skip_serializing_if = "Option::is_none")]
    pub created_ts: Option<u64>,
    #[serde(alias = "updated_ts", skip_serializing_if = "Option::is_none")]
    pub updated_ts: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSshPageRequest {
    pub offset: u32,
    pub limit: u32,
    #[serde(default)]
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_entry_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub key_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub revision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct SshKeySummary {
    pub key: SshKeyMetadata,
    pub revision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerSshPageResponse {
    pub keys: Vec<SshKeySummary>,
    pub revision: String,
    pub total_count: u32,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSshEditRequest {
    pub key_id: String,
    pub revision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_entry_id: Option<String>,
}
