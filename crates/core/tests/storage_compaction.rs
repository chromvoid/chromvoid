//! ADR-003: compaction rewrites shard snapshot and deletes old delta chunks.
//!
//! Contract tests. Expected to fail until sharded storage + delta persistence + compaction exist.

mod test_helpers;

use chromvoid_core::crypto::{
    decrypt, delta_chunk_name, derive_vault_key_v2, root_index_chunk_name, shard_chunk_name,
    StoragePepper,
};
use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::storage::Storage;
use std::fs;
use test_helpers::*;

#[test]
fn test_compaction_removes_old_deltas_and_writes_new_snapshot() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    // Create a few mutations under .passmanager to produce multiple shard deltas.
    set_bypass_system_shard_guards(true);
    assert_rpc_ok(&create_dir(&mut router, ".passmanager"));

    assert_rpc_ok(&create_dir_at(&mut router, "/.passmanager", "a"));
    router.save().expect("save");
    assert_rpc_ok(&create_dir_at(&mut router, "/.passmanager", "b"));
    router.save().expect("save");
    assert_rpc_ok(&create_dir_at(&mut router, "/.passmanager", "c"));
    router.save().expect("save");
    set_bypass_system_shard_guards(false);

    let salt_bytes = fs::read(temp_dir.path().join("salt")).expect("read vault salt");
    let vault_salt: [u8; 16] = salt_bytes
        .as_slice()
        .try_into()
        .expect("salt must be 16 bytes");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    // Expected delta chunk names (ADR-003 naming).
    let delta1 = delta_chunk_name(&*vault_key, ".passmanager", 1);
    let delta2 = delta_chunk_name(&*vault_key, ".passmanager", 2);
    let delta3 = delta_chunk_name(&*vault_key, ".passmanager", 3);

    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert!(storage.chunk_exists(&delta1).expect("chunk_exists"));
    assert!(storage.chunk_exists(&delta2).expect("chunk_exists"));
    assert!(storage.chunk_exists(&delta3).expect("chunk_exists"));

    set_bypass_system_shard_guards(true);
    let resp = router.handle(&RpcRequest::new(
        "catalog:shard:compact",
        serde_json::json!({"shard_id": ".passmanager"}),
    ));
    set_bypass_system_shard_guards(false);
    assert_rpc_ok(&resp);

    // ADR-003: RootIndex must reflect compaction (has_deltas=false, base_version bumped).
    let root_name = root_index_chunk_name(&*vault_key, 0);
    let root_enc = storage
        .read_chunk(&root_name)
        .expect("read root index chunk");
    let root_plain = decrypt(&root_enc, &*vault_key, root_name.as_bytes())
        .expect("decrypt root index (AAD=chunk_name)");
    let root_json: serde_json::Value =
        serde_json::from_slice(&root_plain).expect("root index must be JSON");
    let shards = root_json
        .get("shards")
        .and_then(|v| v.as_object())
        .expect("shards object");
    let pm = shards
        .get(".passmanager")
        .and_then(|v| v.as_object())
        .expect(".passmanager meta");
    assert_eq!(pm.get("has_deltas").and_then(|v| v.as_bool()), Some(false));
    let base_version = pm
        .get("base_version")
        .and_then(|v| v.as_u64())
        .expect("base_version");
    let version = pm.get("version").and_then(|v| v.as_u64()).expect("version");
    assert_eq!(
        base_version, version,
        "base_version must match version after compaction"
    );

    // ADR-003: compaction rewrites shard snapshot (index 0) and removes old deltas.
    let shard_v0 = shard_chunk_name(&*vault_key, ".passmanager", 0);
    assert!(
        storage.chunk_exists(&shard_v0).expect("chunk_exists"),
        "expected a new shard snapshot chunk after compaction"
    );
    assert!(
        !storage.chunk_exists(&delta1).expect("chunk_exists"),
        "expected old delta chunks to be removed after compaction"
    );
}
