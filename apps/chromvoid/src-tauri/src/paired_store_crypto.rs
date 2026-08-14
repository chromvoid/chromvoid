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

pub(crate) fn load_store<T>(path: &Path, context: &str) -> Result<HashMap<String, T>, String>
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
        return decrypt_store(&wrapper, path).map_err(|error| {
            format!(
                "{context}: failed to decrypt paired store {}: {error}",
                path.display()
            )
        });
    }

    match serde_json::from_slice::<HashMap<String, T>>(&bytes) {
        Ok(legacy_store) => {
            if let Err(error) = save_store(path, &legacy_store) {
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

pub(crate) fn save_store<T>(path: &Path, store: &HashMap<String, T>) -> Result<(), String>
where
    T: Serialize,
{
    save_store_with_key_provider(path, store, paired_store_key)
}

fn save_store_with_key_provider<T, F>(
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
    crate::helpers::storage::write_json_pretty_atomic(path, &wrapper)
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
    load_paired_store_pepper(&keystore)
}

#[cfg(all(
    not(test),
    any(
        target_os = "macos",
        target_os = "windows",
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
    load_paired_store_pepper(&keystore)
}

#[cfg(all(not(test), target_os = "ios"))]
fn paired_store_key(path: &Path) -> Result<[u8; 32], String> {
    if let Some(key) = debug_paired_store_key(path) {
        return Ok(key);
    }

    use chromvoid_core::crypto::keystore::IosKeystore;

    let keystore = IosKeystore::new()
        .map_err(|error| format!("paired store keystore unavailable: {error}"))?;
    load_paired_store_pepper(&keystore)
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

fn load_paired_store_pepper(
    keystore: &dyn chromvoid_core::crypto::keystore::Keystore,
) -> Result<[u8; 32], String> {
    chromvoid_core::crypto::StoragePepper::load(keystore)
        .map_err(|error| format!("paired store key unavailable: {error}"))?
        .ok_or_else(|| "paired store key unavailable: storage pepper is missing".to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::crypto::keystore::InMemoryKeystore;

    #[test]
    fn missing_pepper_does_not_mutate_existing_store_or_create_backup() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("paired.json");
        let original = b"existing paired store";
        std::fs::write(&path, original).expect("write existing store");
        let store = HashMap::from([("peer".to_string(), "payload".to_string())]);
        let keystore = InMemoryKeystore::new();

        let error =
            save_store_with_key_provider(&path, &store, |_| load_paired_store_pepper(&keystore))
                .expect_err("missing pepper");

        assert_eq!(
            error,
            "paired store key unavailable: storage pepper is missing"
        );
        assert_eq!(
            std::fs::read(&path).expect("read preserved store"),
            original
        );
        let mut entries = std::fs::read_dir(tempdir.path())
            .expect("read tempdir")
            .map(|entry| entry.expect("directory entry").file_name())
            .collect::<Vec<_>>();
        entries.sort();
        assert_eq!(
            entries,
            vec![path.file_name().expect("file name").to_owned()]
        );
    }
}
