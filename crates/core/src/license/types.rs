use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

pub const LICENSE_KEY_ID_2026_01: &str = "ed25519-2026-01";
pub const PRO_FEATURE_CRYPTO_WALLET: &str = "crypto-wallet";
pub const PRO_FEATURE_REMOTE: &str = "remote";
pub const PRO_FEATURE_CREDENTIAL_PROVIDER: &str = "credential-provider";
pub const PRO_FEATURE_SSH_AGENT: &str = "ssh-agent";
pub const PRO_FEATURE_EMERGENCY_ACCESS: &str = "emergency-access";
pub const PRO_FEATURE_BROWSER_EXTENSION: &str = "browser-extension";
pub const PRO_FEATURE_MOUNTED_VAULT: &str = "mounted-vault";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum BuildPolicy {
    Enforce,
    Bypass,
}

impl BuildPolicy {
    pub fn default_for_build() -> Self {
        Self::Enforce
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum LicensePlan {
    Free,
    Pro,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EntitlementSnapshot {
    pub licensed: bool,
    pub plan: LicensePlan,
    pub feature_keys: Vec<String>,
    pub source_core: String,
    pub build_policy: BuildPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct LicenseCert {
    pub v: u32,
    pub kid: String,
    pub license_id: String,
    pub featureset: String,
    pub seat_limit: u32,
    pub device_fingerprint: String,
    pub issued_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exp: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct SignedCert {
    pub payload: LicenseCert,
    pub signature: String,
}
