use std::fmt;

use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

pub use crate::env_runtime::{AgentProfileMetadataV1, AgentSecretMetadataV1, EnvVariableMappingV1};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

macro_rules! empty_request {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
        #[cfg_attr(feature = "ts-bindings", derive(TS))]
        #[cfg_attr(feature = "ts-bindings", ts(export))]
        #[serde(deny_unknown_fields)]
        pub struct $name {}
    };
}

empty_request!(EnvRuntimeStatusRequest);
empty_request!(EnvSecretListRequest);
empty_request!(EnvProfileListRequest);

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvSecretCreateRequest {
    pub label: String,
    pub value: String,
}

impl fmt::Debug for EnvSecretCreateRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EnvSecretCreateRequest")
            .field("label", &self.label)
            .field("value", &"[redacted]")
            .finish()
    }
}

impl Drop for EnvSecretCreateRequest {
    fn drop(&mut self) {
        self.value.zeroize();
    }
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvSecretUpdateRequest {
    pub id: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub base_revision: u64,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub label: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub value: Option<String>,
}

impl fmt::Debug for EnvSecretUpdateRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EnvSecretUpdateRequest")
            .field("id", &self.id)
            .field("base_revision", &self.base_revision)
            .field("label", &self.label)
            .field("value", &self.value.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

impl Drop for EnvSecretUpdateRequest {
    fn drop(&mut self) {
        if let Some(value) = self.value.as_mut() {
            value.zeroize();
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvSecretDeleteRequest {
    pub id: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub base_revision: u64,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvSecretRevealRequest {
    pub id: String,
    pub master_password: String,
}

impl fmt::Debug for EnvSecretRevealRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EnvSecretRevealRequest")
            .field("id", &self.id)
            .field("master_password", &"[redacted]")
            .finish()
    }
}

impl Drop for EnvSecretRevealRequest {
    fn drop(&mut self) {
        self.master_password.zeroize();
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvProfileGetRequest {
    pub profile: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvProfileDraftV1 {
    pub slug: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    pub variables: Vec<EnvVariableMappingV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvProfileCreateRequest {
    pub slug: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    pub variables: Vec<EnvVariableMappingV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvProfileUpdateRequest {
    pub target: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub base_revision: u64,
    pub draft: EnvProfileDraftV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct EnvProfileDeleteRequest {
    pub target: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub base_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EnvRuntimeStatusResponse {
    pub vault_unlocked: bool,
    pub pro_enabled: bool,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub secret_count: Option<u32>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub profile_count: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EnvDeleteResponse {
    pub deleted: bool,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EnvSecretRevealResponse {
    pub id: String,
    pub value: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub revealed_at_epoch_ms: u64,
}

impl fmt::Debug for EnvSecretRevealResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EnvSecretRevealResponse")
            .field("id", &self.id)
            .field("value", &"[redacted]")
            .field("revealed_at_epoch_ms", &self.revealed_at_epoch_ms)
            .finish()
    }
}

impl Drop for EnvSecretRevealResponse {
    fn drop(&mut self) {
        self.value.zeroize();
    }
}
