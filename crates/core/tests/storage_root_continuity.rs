mod test_helpers;

use chromvoid_core::crypto::keystore::{InMemoryKeystore, Keystore, KeystoreError};
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::{assert_rpc_error, assert_rpc_ok, lock_vault, unlock_vault};

enum DeniedKeystore {
    Missing,
    Unavailable,
}

impl Keystore for DeniedKeystore {
    fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
        match self {
            Self::Missing => Ok(None),
            Self::Unavailable => Err(KeystoreError::Unavailable),
        }
    }

    fn store_storage_pepper(&self, _: [u8; 32]) -> Result<(), KeystoreError> {
        panic!("Opening unavailable storage must not create replacement key material")
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        panic!("Opening unavailable storage must not erase key material")
    }
}

fn open(root: &Path, key: Arc<dyn Keystore>) -> RpcRouter {
    RpcRouter::new(Storage::new(root).unwrap()).with_keystore(key)
}

fn tree(root: &Path) -> BTreeMap<PathBuf, Option<Vec<u8>>> {
    fn visit(root: &Path, path: &Path, entries: &mut BTreeMap<PathBuf, Option<Vec<u8>>>) {
        for entry in fs::read_dir(path).unwrap() {
            let path = entry.unwrap().path();
            let relative = path.strip_prefix(root).unwrap().to_path_buf();
            if path.is_dir() {
                entries.insert(relative, None);
                visit(root, &path, entries);
            } else {
                entries.insert(relative, Some(fs::read(path).unwrap()));
            }
        }
    }
    let mut entries = BTreeMap::new();
    visit(root, root, &mut entries);
    entries
}

fn assert_credential(router: &mut RpcRouter, expected_secret: &str) {
    let entries = router.handle(&RpcRequest::new("passmanager:entry:list", json!({})));
    assert_rpc_ok(&entries);
    let entries = entries.result().unwrap()["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["id"], "relocated-credential");
    assert_eq!(entries[0]["title"], "Container continuity fixture");
    let secret = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        json!({"entry_id":"relocated-credential", "secret_type":"password"}),
    ));
    assert_rpc_ok(&secret);
    assert_eq!(secret.result().unwrap()["value"], expected_secret);
}

#[test]
fn relocated_storage_retains_data_and_rejects_missing_keys_without_mutation() {
    let temporary = TempDir::new().unwrap();
    let old_home = temporary.path().join("Container-A");
    let new_home = temporary.path().join("Container-B");
    let relative_root = Path::new("Library/Application Support/ChromVoidAir");
    let old_root = old_home.join(relative_root);
    let new_root = new_home.join(relative_root);
    let key = Arc::new(InMemoryKeystore::new());
    let password = "synthetic container vault password";

    let mut original = open(&old_root, key.clone());
    assert_rpc_ok(&unlock_vault(&mut original, password));
    assert_rpc_ok(&original.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({
            "entry_id":"relocated-credential", "entry_type":"login",
            "title":"Container continuity fixture", "group_path":"/Work",
            "secrets":{"password":"synthetic original secret"}
        }),
    )));
    original.save().unwrap();
    assert_rpc_ok(&lock_vault(&mut original));
    drop(original);
    let format = fs::read(old_root.join("format.version")).unwrap();

    // Move the whole synthetic container. Keep the same keystore object; never copy its key.
    fs::rename(&old_home, &new_home).unwrap();
    assert!(!old_home.exists());
    let before = tree(&new_home);
    for (unavailable_key, expected_error) in [
        (
            Arc::new(DeniedKeystore::Missing) as Arc<dyn Keystore>,
            "STORAGE_PEPPER_REQUIRED",
        ),
        (
            Arc::new(DeniedKeystore::Unavailable) as Arc<dyn Keystore>,
            "KEYSTORE_UNAVAILABLE",
        ),
    ] {
        let mut denied = open(&new_root, unavailable_key);
        assert_rpc_error(&unlock_vault(&mut denied, password), expected_error);
        drop(denied);
        assert!(
            tree(&new_home) == before,
            "Denied reopen must preserve every file and directory"
        );
    }

    let mut relocated = open(&new_root, key.clone());
    assert_rpc_ok(&unlock_vault(&mut relocated, password));
    assert_credential(&mut relocated, "synthetic original secret");
    assert_rpc_ok(&relocated.handle(&RpcRequest::new(
        "passmanager:secret:save",
        json!({"entry_id":"relocated-credential", "secret_type":"password", "value":"synthetic updated secret"}),
    )));
    relocated.save().unwrap();
    assert_rpc_ok(&lock_vault(&mut relocated));
    drop(relocated);

    // Returning to the previous container path must retain a write made at the new path.
    fs::rename(&new_home, &old_home).unwrap();
    let mut returned = open(&old_root, key);
    assert_rpc_ok(&unlock_vault(&mut returned, password));
    assert_credential(&mut returned, "synthetic updated secret");
    assert_eq!(fs::read(old_root.join("format.version")).unwrap(), format);
    assert_rpc_ok(&lock_vault(&mut returned));
}
