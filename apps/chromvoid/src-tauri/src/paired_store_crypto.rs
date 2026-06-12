use std::collections::HashMap;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

const ENCRYPTED_PAIRED_STORE_KIND: &str = "chromvoid.paired_store";
const ENCRYPTED_PAIRED_STORE_VERSION: u8 = 1;
const ENCRYPTED_PAIRED_STORE_AAD: &[u8] = b"chromvoid:paired-store:v1";

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct EncryptedPairedStore {
    kind: String,
    version: u8,
    ciphertext_b64: String,
}

pub(crate) fn load_store<T>(path: &Path, context: &str) -> HashMap<String, T>
where
    T: DeserializeOwned + Serialize,
{
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(
                    "{context}: failed to read paired store {}: {error}",
                    path.display()
                );
            }
            return HashMap::new();
        }
    };

    if let Ok(wrapper) = serde_json::from_slice::<EncryptedPairedStore>(&bytes) {
        return match decrypt_store(&wrapper, path) {
            Ok(store) => store,
            Err(error) => {
                tracing::warn!(
                    "{context}: failed to decrypt paired store {}: {error}",
                    path.display()
                );
                HashMap::new()
            }
        };
    }

    match serde_json::from_slice::<HashMap<String, T>>(&bytes) {
        Ok(legacy_store) => {
            if let Err(error) = save_store(path, &legacy_store) {
                tracing::warn!(
                    "{context}: failed to migrate legacy paired store {}: {error}",
                    path.display()
                );
            }
            legacy_store
        }
        Err(error) => {
            tracing::warn!(
                "{context}: failed to parse paired store {}: {error}",
                path.display()
            );
            HashMap::new()
        }
    }
}

pub(crate) fn save_store<T>(path: &Path, store: &HashMap<String, T>) -> Result<(), String>
where
    T: Serialize,
{
    let plaintext = Zeroizing::new(
        serde_json::to_vec_pretty(store).map_err(|error| format!("serialize: {error}"))?,
    );
    let key = Zeroizing::new(paired_store_key(path)?);
    let ciphertext =
        chromvoid_core::crypto::encrypt(plaintext.as_slice(), &*key, ENCRYPTED_PAIRED_STORE_AAD)
            .map_err(|error| format!("encrypt paired store: {error}"))?;
    let wrapper = EncryptedPairedStore {
        kind: ENCRYPTED_PAIRED_STORE_KIND.to_string(),
        version: ENCRYPTED_PAIRED_STORE_VERSION,
        ciphertext_b64: BASE64_STANDARD.encode(ciphertext),
    };

    crate::helpers::storage::write_json_pretty_atomic(path, &wrapper)
}

fn decrypt_store<T>(
    wrapper: &EncryptedPairedStore,
    path: &Path,
) -> Result<HashMap<String, T>, String>
where
    T: DeserializeOwned,
{
    if wrapper.kind != ENCRYPTED_PAIRED_STORE_KIND {
        return Err(format!("unexpected store kind {}", wrapper.kind));
    }
    if wrapper.version != ENCRYPTED_PAIRED_STORE_VERSION {
        return Err(format!("unsupported store version {}", wrapper.version));
    }

    let ciphertext = BASE64_STANDARD
        .decode(wrapper.ciphertext_b64.as_bytes())
        .map_err(|error| format!("decode ciphertext: {error}"))?;
    let key = Zeroizing::new(paired_store_key(path)?);
    let plaintext = Zeroizing::new(
        chromvoid_core::crypto::decrypt(&ciphertext, &*key, ENCRYPTED_PAIRED_STORE_AAD)
            .map_err(|error| format!("decrypt paired store: {error}"))?,
    );

    serde_json::from_slice(plaintext.as_slice())
        .map_err(|error| format!("parse plaintext: {error}"))
}

#[cfg(test)]
fn paired_store_key(path: &Path) -> Result<[u8; 32], String> {
    Ok(debug_paired_store_key(path).unwrap_or([0x42; 32]))
}

#[cfg(all(not(test), target_os = "android"))]
fn paired_store_key(path: &Path) -> Result<[u8; 32], String> {
    if let Some(key) = debug_paired_store_key(path) {
        return Ok(key);
    }

    use chromvoid_core::crypto::keystore::AndroidKeystore;

    let keystore = AndroidKeystore::new();
    chromvoid_core::crypto::StoragePepper::get_or_create(&keystore)
        .map_err(|error| format!("paired store key unavailable: {error}"))
}

#[cfg(all(
    not(test),
    any(
        target_os = "macos",
        target_os = "windows",
        target_os = "ios",
        all(target_os = "linux", not(target_env = "musl"))
    )
))]
fn paired_store_key(path: &Path) -> Result<[u8; 32], String> {
    if let Some(key) = debug_paired_store_key(path) {
        return Ok(key);
    }

    use chromvoid_core::crypto::keystore::KeyringKeystore;

    let root = path.parent().unwrap_or_else(|| Path::new("."));
    let keystore = KeyringKeystore::for_storage_path(root)
        .map_err(|error| format!("paired store keystore unavailable: {error}"))?;
    chromvoid_core::crypto::StoragePepper::get_or_create(&keystore)
        .map_err(|error| format!("paired store key unavailable: {error}"))
}

#[cfg(all(
    not(test),
    not(target_os = "android"),
    not(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "ios",
        all(target_os = "linux", not(target_env = "musl"))
    ))
))]
fn paired_store_key(_path: &Path) -> Result<[u8; 32], String> {
    Err("paired store encryption requires a platform keystore".to_string())
}

#[cfg(debug_assertions)]
fn debug_paired_store_key(path: &Path) -> Option<[u8; 32]> {
    if std::env::var_os("CHROMVOID_TEST_INMEMORY_KEYSTORE").is_none() {
        return None;
    }

    use sha2::{Digest as _, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(b"chromvoid:test:paired-store:");
    hasher.update(path.to_string_lossy().as_bytes());
    Some(hasher.finalize().into())
}

#[cfg(not(debug_assertions))]
fn debug_paired_store_key(_path: &Path) -> Option<[u8; 32]> {
    None
}
