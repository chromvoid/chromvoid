use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PASSKEY_SCHEMA_V1: &str = "passkey_credential_source_v1";
pub const ES256_ALGORITHM: i64 = -7;
pub const P256_CURVE: &str = "P-256";
pub const STORAGE_KIND_VAULT: &str = "vault";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasskeyCredentialSource {
    pub schema: String,
    #[serde(rename = "credentialIdB64Url")]
    pub credential_id_b64url: String,
    #[serde(rename = "rpId")]
    pub rp_id: String,
    #[serde(rename = "rpName")]
    pub rp_name: String,
    #[serde(rename = "userHandleB64Url")]
    pub user_handle_b64url: String,
    #[serde(rename = "userName")]
    pub user_name: String,
    #[serde(rename = "userDisplayName")]
    pub user_display_name: String,
    pub algorithm: i64,
    pub curve: String,
    #[serde(rename = "privateKeyPkcs8B64Url")]
    pub private_key_pkcs8_b64url: String,
    #[serde(rename = "publicKeyCoseB64Url")]
    pub public_key_cose_b64url: String,
    #[serde(rename = "publicKeyDerB64Url")]
    pub public_key_der_b64url: String,
    #[serde(rename = "backupEligible")]
    pub backup_eligible: bool,
    #[serde(rename = "backupState")]
    pub backup_state: bool,
    #[serde(rename = "signCount")]
    pub sign_count: u64,
    #[serde(rename = "createdAtEpochMs")]
    pub created_at_epoch_ms: u64,
    #[serde(rename = "lastUsedEpochMs")]
    pub last_used_epoch_ms: u64,
}

#[derive(Debug, Clone)]
pub struct PasskeyRegistration {
    pub source: PasskeyCredentialSource,
    pub response: Value,
}

#[derive(Debug, Clone)]
pub struct PasskeyAssertion {
    pub source: PasskeyCredentialSource,
    pub response: Value,
}

#[derive(Debug, Clone)]
pub struct PasskeyError {
    pub code: &'static str,
    pub message: String,
}

impl PasskeyError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

pub fn now_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
