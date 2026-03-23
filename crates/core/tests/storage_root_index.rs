//! ADR-003: sharded storage must persist a RootIndex chunk.

mod test_helpers;

use chromvoid_core::crypto::{decrypt, derive_vault_key_v2, root_index_chunk_name, StoragePepper};
use chromvoid_core::storage::Storage;
use std::fs;
use test_helpers::*;

#[test]
fn test_root_index_chunk_is_written_after_catalog_change_and_save() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    // Make a catalog change and persist it.
    create_dir(&mut router, "docs");
    router.save().expect("save");

    // Derive vault_key to compute expected chunk name.
    let salt_bytes = fs::read(temp_dir.path().join("salt")).expect("read vault salt");
    let vault_salt: [u8; 16] = salt_bytes
        .as_slice()
        .try_into()
        .expect("salt must be 16 bytes");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    let root_chunk = root_index_chunk_name(&*vault_key, 0);
    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert!(
        storage.chunk_exists(&root_chunk).expect("chunk_exists"),
        "ADR-003 requires root index chunk to exist"
    );

    // RootIndex must decrypt and match the expected schema.
    let encrypted = storage
        .read_chunk(&root_chunk)
        .expect("read root index chunk");
    let plaintext = decrypt(&encrypted, &*vault_key, root_chunk.as_bytes())
        .expect("root index must decrypt with AAD=chunk_name");
    let json: serde_json::Value =
        serde_json::from_slice(&plaintext).expect("root index plaintext must be JSON");

    assert_eq!(json.get("v").and_then(|v| v.as_u64()), Some(2));
    assert_eq!(json.get("format").and_then(|v| v.as_str()), Some("sharded"));
    assert!(
        json.get("root_version")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            > 0
    );
    assert!(json.get("created_at").and_then(|v| v.as_u64()).is_some());
    assert!(json.get("shards").is_some());
}
