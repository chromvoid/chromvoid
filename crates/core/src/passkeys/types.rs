use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PASSKEY_SCHEMA_V1: &str = "passkey_credential_source_v1";
pub const ES256_ALGORITHM: i64 = -7;
pub const P256_CURVE: &str = "P-256";
pub const STORAGE_KIND_VAULT: &str = "vault";

#[derive(Clone)]
pub struct PasskeyInvocationContext {
    pub platform: String,
    pub platform_version_major: Option<u64>,
    pub origin: String,
    pub client_data_hash: Option<Vec<u8>>,
    pub selected_credential_id: Option<String>,
}

impl std::fmt::Debug for PasskeyInvocationContext {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PasskeyInvocationContext")
            .field("platform", &self.platform)
            .field("platform_version_major", &self.platform_version_major)
            .field("origin", &self.origin)
            .field(
                "client_data_hash",
                &self
                    .client_data_hash
                    .as_ref()
                    .map(|hash| format!("[redacted; {} bytes]", hash.len())),
            )
            .field("selected_credential_id", &self.selected_credential_id)
            .finish()
    }
}

#[derive(Clone, Serialize, Deserialize)]
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

impl std::fmt::Debug for PasskeyCredentialSource {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PasskeyCredentialSource")
            .field("schema", &self.schema)
            .field("credential_id_b64url", &self.credential_id_b64url)
            .field("rp_id", &self.rp_id)
            .field("rp_name", &self.rp_name)
            .field("user_handle_b64url", &self.user_handle_b64url)
            .field("user_name", &self.user_name)
            .field("user_display_name", &self.user_display_name)
            .field("algorithm", &self.algorithm)
            .field("curve", &self.curve)
            .field("private_key_pkcs8_b64url", &"[redacted]")
            .field("public_key_cose_b64url", &self.public_key_cose_b64url)
            .field("public_key_der_b64url", &self.public_key_der_b64url)
            .field("backup_eligible", &self.backup_eligible)
            .field("backup_state", &self.backup_state)
            .field("sign_count", &self.sign_count)
            .field("created_at_epoch_ms", &self.created_at_epoch_ms)
            .field("last_used_epoch_ms", &self.last_used_epoch_ms)
            .finish()
    }
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

#[cfg(test)]
mod tests {
    use super::{PasskeyCredentialSource, ES256_ALGORITHM, P256_CURVE, PASSKEY_SCHEMA_V1};

    #[test]
    fn passkey_credential_source_debug_redacts_private_key() {
        let source = PasskeyCredentialSource {
            schema: PASSKEY_SCHEMA_V1.to_string(),
            credential_id_b64url: "credential".to_string(),
            rp_id: "example.com".to_string(),
            rp_name: "Example".to_string(),
            user_handle_b64url: "user-handle".to_string(),
            user_name: "user".to_string(),
            user_display_name: "User".to_string(),
            algorithm: ES256_ALGORITHM,
            curve: P256_CURVE.to_string(),
            private_key_pkcs8_b64url: "private-key-material".to_string(),
            public_key_cose_b64url: "public-cose".to_string(),
            public_key_der_b64url: "public-der".to_string(),
            backup_eligible: true,
            backup_state: true,
            sign_count: 0,
            created_at_epoch_ms: 1,
            last_used_epoch_ms: 1,
        };

        let debug = format!("{source:?}");
        assert!(!debug.contains("private-key-material"));
        assert!(debug.contains("[redacted]"));
    }
}
