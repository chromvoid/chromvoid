//! Phase 3: sharded catalog becomes primary load path in v2 mode.

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::keystore::Keystore;
use chromvoid_core::crypto::{catalog_chunk_name, derive_vault_key_v2};
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
fn test_v2_unlock_loads_from_shards_when_monolithic_missing() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();

    // Force v2 mode.
    {
        let _storage = Storage::new(storage_path).expect("storage");
        set_storage_format_v2(storage_path);
    }

    let keystore = Arc::new(InMemoryKeystore::new());
    let password = "test_password";

    // Create a directory and save it (this writes RootIndex + shard snapshots).
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

        assert_rpc_ok(&unlock_vault(&mut router, password));
        assert_rpc_ok(&create_dir(&mut router, "docs"));
        router.save().expect("save");
        assert_rpc_ok(&lock_vault(&mut router));
    }

    // Delete monolithic catalog chunk to ensure sharded path is used.
    {
        let storage = Storage::new(storage_path).expect("storage");

        let salt_bytes = fs::read(storage_path.join("salt")).expect("read vault salt");
        let vault_salt: [u8; 16] = salt_bytes
            .as_slice()
            .try_into()
            .expect("salt must be 16 bytes");
        let pepper = keystore
            .load_storage_pepper()
            .expect("load pepper")
            .expect("pepper must exist");
        let v2_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

        let monolithic = catalog_chunk_name(&*v2_key, 0);
        storage
            .delete_chunk(&monolithic)
            .expect("delete monolithic chunk");
    }

    // Unlock should still see data (loaded from RootIndex + shard snapshots).
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

        assert_rpc_ok(&unlock_vault(&mut router, password));

        let items = get_items(&list_dir(&mut router, "/"));
        let names = get_item_names(&items);
        assert!(names.contains(&"docs".to_string()));
    }
}
