//! ADR-003: delta log chunks are appended on each catalog write.
//!
//! Contract tests. Expected to fail until sharded storage + delta persistence is implemented.

mod test_helpers;

use chromvoid_core::crypto::{decrypt, delta_chunk_name, derive_vault_key_v2, StoragePepper};
use chromvoid_core::storage::Storage;
use std::fs;
use test_helpers::*;

#[test]
fn test_delta_chunk_exists_after_catalog_change_and_save() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    // Create a shard and then mutate within it so a shard delta is persisted.
    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "child"));
    router.save().expect("save");

    // Derive vault_key to compute expected delta chunk name.
    let salt_bytes = fs::read(temp_dir.path().join("salt")).expect("read vault salt");
    let vault_salt: [u8; 16] = salt_bytes
        .as_slice()
        .try_into()
        .expect("salt must be 16 bytes");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    // ADR-003: delta chunk naming context = "delta:{shard_id}", index = seq.
    let delta1 = delta_chunk_name(&*vault_key, "docs", 1);

    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert!(
        storage.chunk_exists(&delta1).expect("chunk_exists"),
        "ADR-003 requires a delta chunk after a write"
    );
}

#[test]
fn test_delta_chunk_decrypts_and_matches_schema() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "child"));
    router.save().expect("save");

    let salt_bytes = fs::read(temp_dir.path().join("salt")).expect("read vault salt");
    let vault_salt: [u8; 16] = salt_bytes
        .as_slice()
        .try_into()
        .expect("salt must be 16 bytes");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    let delta1 = delta_chunk_name(&*vault_key, "docs", 1);
    let storage = Storage::new(temp_dir.path()).expect("storage");

    let encrypted = storage.read_chunk(&delta1).expect("read delta chunk");
    let plaintext = decrypt(&encrypted, &*vault_key, delta1.as_bytes())
        .expect("delta chunk must decrypt with AAD=chunk_name");
    let json: serde_json::Value = serde_json::from_slice(&plaintext).expect("delta must be JSON");

    // ADR-003 attachments: DeltaEntry schema
    assert_eq!(json.get("seq").and_then(|v| v.as_u64()), Some(1));
    assert!(json.get("ts").and_then(|v| v.as_u64()).is_some());
    assert!(json.get("op").is_some());
    assert!(json.get("path").and_then(|v| v.as_str()).is_some());

    // Minimal op shape validation.
    let op = json.get("op").expect("op");
    let t = op.get("type").and_then(|v| v.as_str()).unwrap_or("");
    assert!(
        matches!(t, "create" | "update" | "delete" | "move"),
        "unexpected delta op type: {t}"
    );
}
