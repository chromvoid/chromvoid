use std::collections::BTreeMap;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::VerifyingKey;

use super::error::LicenseError;
use super::types::LICENSE_KEY_ID_2026_01;

const LICENSE_PUBLIC_KEY_ED25519_2026_01: Option<&str> =
    option_env!("CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01");

pub(super) fn trusted_keys_from_env() -> BTreeMap<String, VerifyingKey> {
    let mut keys = BTreeMap::new();
    let runtime_value = std::env::var("CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01").ok();
    let value = runtime_value
        .as_deref()
        .or(LICENSE_PUBLIC_KEY_ED25519_2026_01)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = value {
        if let Ok(key) = parse_verifying_key(value) {
            keys.insert(LICENSE_KEY_ID_2026_01.to_string(), key);
        }
    }
    keys
}

fn parse_verifying_key(input: &str) -> Result<VerifyingKey, LicenseError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(input.trim())
        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(input.trim()))
        .map_err(LicenseError::message)?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| LicenseError::InvalidPublicKeyLength)?;
    VerifyingKey::from_bytes(&bytes).map_err(LicenseError::message)
}
