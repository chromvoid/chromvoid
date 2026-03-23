mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::keystore::Keystore;
use chromvoid_core::crypto::StoragePepper;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn set_storage_format_v2(base_path: &Path) {
    let format_path = base_path.join("format.version");
    let bytes = fs::read(&format_path).expect("read format.version");
    let mut v: serde_json::Value = serde_json::from_slice(&bytes).expect("format.version JSON");
    if let Some(obj) = v.as_object_mut() {
        obj.insert("v".to_string(), serde_json::json!(2));
        obj.insert("kdf".to_string(), serde_json::json!(2));
        obj.insert("pepper".to_string(), serde_json::json!(true));
    }
    let out = serde_json::to_vec(&v).expect("serialize format.version");
    fs::write(&format_path, out).expect("write format.version");
}

#[test]
fn test_v2_unlock_requires_pepper_when_storage_has_chunks() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");

    // Force v2 mode before first unlock.
    set_storage_format_v2(temp_dir.path());

    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

    // First unlock (empty storage) should create and store pepper.
    assert_rpc_ok(&unlock_vault(&mut router, "vault_password"));
    assert_rpc_ok(&create_dir(&mut router, "seed"));
    router.save().expect("save");
    assert_rpc_ok(&lock_vault(&mut router));

    // Remove pepper; with existing chunks, unlock must fail (typed).
    StoragePepper::delete(keystore.as_ref()).expect("delete pepper");
    let r = unlock_vault(&mut router, "vault_password");
    assert_rpc_error(&r, "STORAGE_PEPPER_REQUIRED");
}

#[test]
fn test_v2_wrong_pepper_keeps_pd_but_hides_data() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");

    // Force v2 mode before first unlock.
    set_storage_format_v2(temp_dir.path());

    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

    assert_rpc_ok(&unlock_vault(&mut router, "vault_password"));
    assert_rpc_ok(&create_dir(&mut router, "seed"));
    router.save().expect("save");
    assert_rpc_ok(&lock_vault(&mut router));

    let original = keystore
        .load_storage_pepper()
        .expect("load pepper")
        .expect("pepper must exist");

    // Replace pepper with a different value.
    keystore
        .store_storage_pepper([9u8; 32])
        .expect("store wrong pepper");

    assert_rpc_ok(&unlock_vault(&mut router, "vault_password"));
    let items = get_items(&list_dir(&mut router, "/"));
    let names = get_item_names(&items);
    assert!(
        !names.contains(&"seed".to_string()),
        "wrong pepper must not reveal existing data"
    );
    assert_rpc_ok(&lock_vault(&mut router));

    // Restore original pepper and verify data is visible again.
    keystore
        .store_storage_pepper(original)
        .expect("restore pepper");
    assert_rpc_ok(&unlock_vault(&mut router, "vault_password"));
    let items = get_items(&list_dir(&mut router, "/"));
    let names = get_item_names(&items);
    assert!(names.contains(&"seed".to_string()));
}
