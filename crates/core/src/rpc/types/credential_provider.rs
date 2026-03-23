//! Credential provider RPC types (ADR-020)

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderStatusResponse {
    pub enabled: bool,
    pub vault_open: bool,
    pub capability_matrix: CredentialProviderCapabilityMatrix,
    pub passkeys_lite_status: CredentialProviderPasskeysLiteStatusMatrix,
    pub command_error_map: CredentialProviderCommandErrorMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderPasskeysLiteStatus {
    pub create: String,
    pub get: String,
    pub unsupported_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderPasskeysLiteStatusMatrix {
    pub ios: CredentialProviderPasskeysLiteStatus,
    pub android: CredentialProviderPasskeysLiteStatus,
    pub macos: CredentialProviderPasskeysLiteStatus,
    pub windows: CredentialProviderPasskeysLiteStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderCapability {
    pub password_provider: bool,
    pub passkeys_lite: bool,
    pub autofill_fallback: bool,
    pub unsupported_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderCapabilityMatrix {
    pub ios: CredentialProviderCapability,
    pub android: CredentialProviderCapability,
    pub macos: CredentialProviderCapability,
    pub windows: CredentialProviderCapability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderCommandErrorMap {
    #[serde(rename = "credential_provider:status")]
    pub status: Vec<String>,
    #[serde(rename = "credential_provider:session:open")]
    pub session_open: Vec<String>,
    #[serde(rename = "credential_provider:session:close")]
    pub session_close: Vec<String>,
    #[serde(rename = "credential_provider:list")]
    pub list: Vec<String>,
    #[serde(rename = "credential_provider:search")]
    pub search: Vec<String>,
    #[serde(rename = "credential_provider:getSecret")]
    pub get_secret: Vec<String>,
    #[serde(rename = "credential_provider:recordUse")]
    pub record_use: Vec<String>,
    #[serde(rename = "credential_provider:passkey:create")]
    pub passkey_create: Vec<String>,
    #[serde(rename = "credential_provider:passkey:get")]
    pub passkey_get: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderSessionResponse {
    pub provider_session: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialCandidate {
    pub credential_id: String,
    pub label: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    pub r#match: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub otp_options: Vec<CredentialOtpOption>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub last_used_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialOtpOption {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "type")]
    pub otp_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialSecret {
    pub credential_id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub otp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CredentialProviderPasskeyCommandResponse {
    pub status: String,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub platform_version_major: Option<u64>,
    pub reason: String,
}
