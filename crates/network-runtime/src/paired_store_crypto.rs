//! Existing paired-store envelope and migration; platform key selection is injected.

use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

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

pub fn load_store<T>(
    path: &Path,
    context: &str,
    key_provider: &dyn Fn(&Path) -> Result<[u8; 32], String>,
) -> Result<HashMap<String, T>, String>
where
    T: DeserializeOwned + Serialize,
{
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            if error.kind() == std::io::ErrorKind::NotFound {
                return Ok(HashMap::new());
            }
            return Err(format!(
                "{context}: failed to read paired store {}: {error}",
                path.display()
            ));
        }
    };

    if let Ok(wrapper) = serde_json::from_slice::<EncryptedPairedStore>(&bytes) {
        return decrypt_store(&wrapper, path, key_provider).map_err(|error| {
            format!(
                "{context}: failed to decrypt paired store {}: {error}",
                path.display()
            )
        });
    }

    match serde_json::from_slice::<HashMap<String, T>>(&bytes) {
        Ok(legacy_store) => {
            if let Err(error) = save_store(path, &legacy_store, key_provider) {
                tracing::warn!(
                    "{context}: failed to migrate legacy paired store {}: {error}",
                    path.display()
                );
            }
            Ok(legacy_store)
        }
        Err(error) => Err(format!(
            "{context}: failed to parse paired store {}: {error}",
            path.display()
        )),
    }
}

pub fn save_store<T, F>(
    path: &Path,
    store: &HashMap<String, T>,
    key_provider: F,
) -> Result<(), String>
where
    T: Serialize,
    F: FnOnce(&Path) -> Result<[u8; 32], String>,
{
    let plaintext = Zeroizing::new(
        serde_json::to_vec_pretty(store).map_err(|error| format!("serialize: {error}"))?,
    );
    let key = Zeroizing::new(key_provider(path)?);
    let ciphertext =
        chromvoid_core::crypto::encrypt(plaintext.as_slice(), &*key, ENCRYPTED_PAIRED_STORE_AAD)
            .map_err(|error| format!("encrypt paired store: {error}"))?;
    let wrapper = EncryptedPairedStore {
        kind: ENCRYPTED_PAIRED_STORE_KIND.to_string(),
        version: ENCRYPTED_PAIRED_STORE_VERSION,
        ciphertext_b64: BASE64_STANDARD.encode(ciphertext),
    };

    backup_existing_store(path)?;
    chromvoid_core::storage::atomic_file::write_json_pretty_atomic(path, &wrapper)
}

fn backup_existing_store(path: &Path) -> Result<(), String> {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => {}
        Ok(_) => {
            return Err(format!(
                "paired store path is not a file: {}",
                path.display()
            ))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("stat paired store {}: {error}", path.display())),
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("paired-store");
    let timestamp_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let backup_path = path.with_file_name(format!("{file_name}.bak.{timestamp_ns}"));
    std::fs::copy(path, &backup_path).map_err(|error| {
        format!(
            "backup paired store {} to {}: {error}",
            path.display(),
            backup_path.display()
        )
    })?;
    Ok(())
}

/// Remove the store and backups created by this owner, including legacy plaintext copies.
/// Callers must exclude concurrent readers too: loading a legacy store can migrate it.
pub fn erase_store(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Paired store directory is unavailable")?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Paired store name is unavailable")?;
    let prefix = format!("{name}.bak.");
    let mut failed = false;
    let entries =
        std::fs::read_dir(parent).map_err(|_| "Paired store directory could not be read")?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                failed = true;
                continue;
            }
        };
        let file_name = entry.file_name();
        let Some(file_name) = file_name.to_str() else {
            continue;
        };
        let backup = file_name.strip_prefix(&prefix).is_some_and(|suffix| {
            !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
        });
        if (file_name == name || backup) && std::fs::remove_file(entry.path()).is_err() {
            failed = true;
        }
    }
    if failed {
        Err("Paired store cleanup did not finish".into())
    } else {
        Ok(())
    }
}

fn decrypt_store<T>(
    wrapper: &EncryptedPairedStore,
    path: &Path,
    key_provider: &dyn Fn(&Path) -> Result<[u8; 32], String>,
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
    let key = Zeroizing::new(key_provider(path)?);
    let plaintext = Zeroizing::new(
        chromvoid_core::crypto::decrypt(&ciphertext, &*key, ENCRYPTED_PAIRED_STORE_AAD)
            .map_err(|error| format!("decrypt paired store: {error}"))?,
    );

    serde_json::from_slice(plaintext.as_slice())
        .map_err(|error| format!("parse plaintext: {error}"))
}

/// Load an existing storage key. Never creates or resets a pepper on unavailable storage.
pub fn load_storage_key(
    keystore: &dyn chromvoid_core::crypto::keystore::Keystore,
) -> Result<[u8; 32], String> {
    chromvoid_core::crypto::StoragePepper::load(keystore)
        .map_err(|error| format!("paired store key unavailable: {error}"))?
        .ok_or_else(|| "paired store key unavailable: storage pepper is missing".to_string())
}
