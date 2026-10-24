//! Existing credential exchange request; destructive modes require explicit confirmation.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerRootImportRequest {
    pub entries: Value,
    pub folders: Value,
    #[serde(
        default,
        alias = "foldersMeta",
        skip_serializing_if = "Option::is_none"
    )]
    pub folders_meta: Option<Value>,
    #[serde(default, alias = "sshKeys", skip_serializing_if = "Option::is_none")]
    pub ssh_keys: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Value>,
    #[serde(default, alias = "tagMeta", skip_serializing_if = "Option::is_none")]
    pub tag_meta: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(
        default,
        alias = "allowDestructive",
        skip_serializing_if = "Option::is_none"
    )]
    pub allow_destructive: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<String>,
}

/// Input counts after complete staging validation; no imported secret values are returned.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerRootImportPreview {
    pub revision: String,
    pub mode: String,
    pub entry_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_entry_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_entry_count: Option<u32>,
    pub folder_count: u32,
    pub ssh_key_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<CredentialImportWarning>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum CredentialImportWarningCode {
    UnsupportedRecords,
    PasskeysOmitted,
    OtpInNote,
    CardInNote,
    EntryLimit,
    InvalidRows,
    UnmappedColumns,
    AttachmentsOmitted,
    IconsOmitted,
    RecordsOmitted,
    LegacyIdentifiersMatched,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialImportWarning {
    pub code: CredentialImportWarningCode,
    pub count: u32,
}
