//! Ordered website rules for native editing; persisted metadata remains entry-owned.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct CredentialWebsiteRule {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_index: Option<u32>,
    pub value: String,
    pub match_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerWebsiteReadRequest {
    pub entry_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerWebsiteValidateRequest {
    pub rules: Vec<CredentialWebsiteRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerWebsiteUpdateRequest {
    pub entry_id: String,
    pub revision: String,
    pub rules: Vec<CredentialWebsiteRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct WebsiteRuleError {
    pub index: u32,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerWebsiteResult {
    pub rules: Vec<CredentialWebsiteRule>,
    pub errors: Vec<WebsiteRuleError>,
    pub revision: Option<String>,
}
