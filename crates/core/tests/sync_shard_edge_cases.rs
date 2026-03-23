mod test_helpers;

use chromvoid_core::catalog::MAX_DELTAS;
use chromvoid_core::crypto::{delta_chunk_name, derive_vault_key_v2, StoragePepper};
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::storage::Storage;
use std::fs;
use test_helpers::*;

#[test]
fn test_sync_shard_requires_full_load_when_delta_window_too_large() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    for i in 0..=(MAX_DELTAS as usize) {
        assert_rpc_ok(&create_dir_at(&mut router, "/docs", &format!("d{}", i)));
    }
    router.save().expect("save");

    let sync = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_ok(&sync);
    let r = sync.result().unwrap();
    assert_eq!(
        r.get("requires_full_load").and_then(|v| v.as_bool()),
        Some(true)
    );
    let deltas = r
        .get("deltas")
        .and_then(|v| v.as_array())
        .expect("deltas array");
    assert!(
        deltas.is_empty(),
        "expected no deltas when full load is required"
    );
}

#[test]
fn test_sync_shard_requires_full_load_on_missing_delta_chunk() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "a"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "b"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "c"));
    router.save().expect("save");

    let salt_bytes = fs::read(temp_dir.path().join("salt")).expect("read vault salt");
    let vault_salt: [u8; 16] = salt_bytes
        .as_slice()
        .try_into()
        .expect("salt must be 16 bytes");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");
    let storage = Storage::new(temp_dir.path()).expect("storage");

    let delta2 = delta_chunk_name(&*vault_key, "docs", 2);
    assert!(storage.chunk_exists(&delta2).expect("chunk_exists"));
    storage.delete_chunk(&delta2).expect("delete_chunk");

    let sync = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_ok(&sync);
    let r = sync.result().unwrap();
    assert_eq!(
        r.get("requires_full_load").and_then(|v| v.as_bool()),
        Some(true)
    );
}

#[test]
fn test_sync_shard_requires_full_load_when_from_version_below_base_version_after_compact() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "work"));
    router.save().expect("save");

    let compact = router.handle(&RpcRequest::new(
        "catalog:shard:compact",
        serde_json::json!({"shard_id": "docs"}),
    ));
    assert_rpc_ok(&compact);

    let sync = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_ok(&sync);
    let r = sync.result().unwrap();
    assert_eq!(
        r.get("requires_full_load").and_then(|v| v.as_bool()),
        Some(true)
    );
}
