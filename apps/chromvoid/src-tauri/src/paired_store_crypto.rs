//! Tauri platform key selection for the shared encrypted peer store.

use chromvoid_network_runtime::paired_store_crypto::load_storage_key as load_paired_store_pepper;
use std::path::Path;

#[cfg(test)]
pub(crate) fn paired_store_key(path: &Path) -> Result<[u8; 32], String> {
    Ok(debug_paired_store_key(path).unwrap_or([0x42; 32]))
}

#[cfg(all(
    not(test),
    any(
        target_os = "macos",
        target_os = "windows",
        all(target_os = "linux", not(target_env = "musl"))
    )
))]
pub(crate) fn paired_store_key(path: &Path) -> Result<[u8; 32], String> {
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
pub(crate) fn paired_store_key(path: &Path) -> Result<[u8; 32], String> {
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
    not(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "ios",
        all(target_os = "linux", not(target_env = "musl"))
    ))
))]
pub(crate) fn paired_store_key(_path: &Path) -> Result<[u8; 32], String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::crypto::keystore::InMemoryKeystore;
    use chromvoid_network_runtime::paired_store_crypto::save_store;
    use std::collections::HashMap;

    #[test]
    fn missing_pepper_does_not_mutate_existing_store_or_create_backup() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("paired.json");
        let original = b"existing paired store";
        std::fs::write(&path, original).expect("write existing store");
        let store = HashMap::from([("peer".to_string(), "payload".to_string())]);
        let keystore = InMemoryKeystore::new();

        let error = save_store(&path, &store, |_| load_paired_store_pepper(&keystore))
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
