use std::fmt;

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

pub const ENV_RUNTIME_RECORD_VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct EnvSecretMetadataRecordV1 {
    pub(crate) version: u8,
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) revision: u64,
    pub(crate) created_at_epoch_ms: u64,
    pub(crate) updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct AgentSecretMetadataV1 {
    pub id: String,
    pub label: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub revision: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub usage_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvVariableMappingV1 {
    pub name: String,
    pub secret_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct EnvProfileRecordV1 {
    pub(crate) version: u8,
    pub(crate) id: String,
    pub(crate) slug: String,
    pub(crate) label: String,
    pub(crate) description: Option<String>,
    pub(crate) revision: u64,
    pub(crate) variables: Vec<EnvVariableMappingV1>,
    pub(crate) created_at_epoch_ms: u64,
    pub(crate) updated_at_epoch_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct AgentProfileMetadataV1 {
    pub id: String,
    pub slug: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub revision: u64,
    pub variables: Vec<EnvVariableMappingV1>,
}

/// Local-only input consumed immediately before Tauri spawns a process.
///
/// No serde, clone, or debug projection is provided by design.
pub struct PrivateSpawnResolutionRequestV1 {
    pub profile_id: String,
    pub expected_profile_revision: u64,
}

/// Zeroize-on-drop environment values for a single spawn attempt.
///
/// No serde, clone, or debug projection is provided by design. Consumers can
/// borrow the entries only while the lease is alive.
pub struct ResolvedEnvLeaseV1 {
    entries: Zeroizing<Vec<(String, String)>>,
}

impl ResolvedEnvLeaseV1 {
    pub(crate) fn new(entries: Vec<(String, String)>) -> Self {
        Self {
            entries: Zeroizing::new(entries),
        }
    }

    pub fn iter(&self) -> impl ExactSizeIterator<Item = (&str, &str)> {
        self.entries
            .iter()
            .map(|(name, value)| (name.as_str(), value.as_str()))
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EnvSecretValueRecordV1 {
    pub(crate) version: u8,
    pub(crate) secret_id: String,
    pub(crate) revision: u64,
    pub(crate) value: String,
}

impl EnvSecretValueRecordV1 {
    pub(crate) fn new(secret_id: String, revision: u64, value: String) -> Self {
        Self {
            version: ENV_RUNTIME_RECORD_VERSION,
            secret_id,
            revision,
            value,
        }
    }
}

impl fmt::Debug for EnvSecretValueRecordV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EnvSecretValueRecordV1")
            .field("version", &self.version)
            .field("secret_id", &self.secret_id)
            .field("revision", &self.revision)
            .field("value", &"[redacted]")
            .finish()
    }
}

impl Drop for EnvSecretValueRecordV1 {
    fn drop(&mut self) {
        self.value.zeroize();
    }
}
