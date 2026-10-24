//! Bounded external import transport; file bodies never occupy a whole RPC envelope.
use crate::credential_import::CredentialImportMode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct CredentialImportStartRequest {
    pub byte_count: u32,
    pub mode: CredentialImportMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct CredentialImportAppendRequest {
    pub import_id: String,
    pub offset: u32,
    pub chunk_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct CredentialImportReviewRequest {
    pub import_id: String,
    pub source_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct CredentialImportIdRequest {
    pub import_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct CredentialImportCommitRequest {
    pub import_id: String,
    pub confirm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialImportLimits {
    pub max_input_bytes: u32,
    pub max_chunk_bytes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialImportStarted {
    pub import_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialImportReceived {
    pub received_bytes: u32,
}
