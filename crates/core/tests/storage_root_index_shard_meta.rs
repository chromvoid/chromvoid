//! ADR-003: RootIndex must include shard metadata consistent with storage deltas.

mod test_helpers;

use chromvoid_core::crypto::{decrypt, derive_vault_key_v2, root_index_chunk_name, StoragePepper};
use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::storage::Storage;
use std::fs;
use test_helpers::*;

#[test]
fn test_root_index_includes_passmanager_meta_and_marks_deltas() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    // Mutate within .passmanager so the eager shard advertises pending deltas.
    set_bypass_system_shard_guards(true);
    assert_rpc_ok(&create_dir(&mut router, ".passmanager"));
    assert_rpc_ok(&create_dir_at(&mut router, "/.passmanager", "entry"));
    set_bypass_system_shard_guards(false);
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
    let encrypted = storage
        .read_chunk(&root_chunk)
        .expect("read root index chunk");
    let plaintext = decrypt(&encrypted, &*vault_key, root_chunk.as_bytes())
        .expect("root index must decrypt with AAD=chunk_name");
    let json: serde_json::Value =
        serde_json::from_slice(&plaintext).expect("root index plaintext must be JSON");

    // ADR-003: RootIndex is v2 sharded.
    assert_eq!(json.get("v").and_then(|v| v.as_u64()), Some(2));
    assert_eq!(json.get("format").and_then(|v| v.as_str()), Some("sharded"));

    // ADR-003: root_version is a global version counter.
    assert!(
        json.get("root_version")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            > 0
    );

    let shards = json
        .get("shards")
        .and_then(|v| v.as_object())
        .expect("shards must be an object map");

    let pm = shards
        .get(".passmanager")
        .and_then(|v| v.as_object())
        .expect(".passmanager shard meta must exist");

    assert_eq!(
        pm.get("context").and_then(|v| v.as_str()),
        Some("shard:.passmanager")
    );
    assert_eq!(pm.get("strategy").and_then(|v| v.as_str()), Some("eager"));

    // ADR-003: after a .passmanager write+save, the eager shard must advertise pending deltas.
    assert_eq!(pm.get("has_deltas").and_then(|v| v.as_bool()), Some(true));
}
