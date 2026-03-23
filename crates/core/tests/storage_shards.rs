//! ADR-003: sharded storage must persist shard snapshots.

mod test_helpers;

use chromvoid_core::crypto::{derive_vault_key_v2, shard_chunk_name, StoragePepper};
use chromvoid_core::storage::Storage;
use std::fs;
use test_helpers::*;

#[test]
fn test_passmanager_shard_snapshot_chunk_exists_after_save() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    // Persist at least one change.
    create_dir(&mut router, "docs");
    router.save().expect("save");

    let salt_bytes = fs::read(temp_dir.path().join("salt")).expect("read vault salt");
    let vault_salt: [u8; 16] = salt_bytes
        .as_slice()
        .try_into()
        .expect("salt must be 16 bytes");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    let shard_chunk = shard_chunk_name(&*vault_key, ".passmanager", 0);
    let storage = Storage::new(temp_dir.path()).expect("storage");

    assert!(
        storage.chunk_exists(&shard_chunk).expect("chunk_exists"),
        "ADR-003 expects an eager shard snapshot chunk for .passmanager"
    );
}
