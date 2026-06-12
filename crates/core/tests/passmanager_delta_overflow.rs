mod test_helpers;

use chromvoid_core::catalog::{
    serialize_catalog, CatalogNode, DeltaEntry, LoadStrategy, PartialNode, RootIndex, Shard,
    ShardMeta, MAX_DELTAS,
};
use chromvoid_core::crypto::{
    decrypt, delta_chunk_name, derive_vault_key_v2, encrypt, root_index_chunk_name,
    shard_chunk_name, StoragePepper,
};
use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::collections::BTreeSet;
use test_helpers::*;

fn write_encrypted_chunk(storage: &Storage, vault_key: &[u8; 32], name: &str, plaintext: &[u8]) {
    let encrypted = encrypt(plaintext, vault_key, name.as_bytes()).expect("encrypt chunk");
    storage.write_chunk(name, &encrypted).expect("write chunk");
}

fn read_root_index(storage: &Storage, vault_key: &[u8; 32]) -> RootIndex {
    let root_name = root_index_chunk_name(vault_key, 0);
    let enc = storage
        .read_chunk(&root_name)
        .expect("read root index chunk");
    let plain = decrypt(&enc, vault_key, root_name.as_bytes()).expect("decrypt root index chunk");
    serde_json::from_slice::<RootIndex>(&plain).expect("root index json")
}

fn write_inconsistent_passmanager_fixture(
    storage: &Storage,
    vault_key: &[u8; 32],
    delta_count: u64,
) {
    // Legacy recovery snapshot A: /.passmanager/Ungrouped is empty.
    let mut legacy_root = CatalogNode::new_root();
    let mut legacy_pm = CatalogNode::new_dir(62, ".passmanager".to_string());
    legacy_pm.add_child(CatalogNode::new_dir(69, "123".to_string()));
    legacy_pm.add_child(CatalogNode::new_dir(70, "Ungrouped".to_string()));
    legacy_root.add_child(legacy_pm);

    let legacy_recovery_version: u64 = 500;
    let catalog_plain =
        serialize_catalog(&legacy_root, legacy_recovery_version).expect("serialize catalog");
    let catalog_name = chromvoid_core::crypto::catalog_chunk_name(vault_key, 0);
    write_encrypted_chunk(storage, vault_key, &catalog_name, &catalog_plain);

    // RootIndex: points at the sharded world with too many deltas.
    let mut index = RootIndex::new();
    index.root_version = legacy_recovery_version;

    let mut meta = ShardMeta::new(".passmanager", LoadStrategy::Eager);
    meta.version = delta_count;
    meta.base_version = 0;
    meta.has_deltas = true;
    meta.delta_count = delta_count as u32;
    meta.last_delta_seq = delta_count;
    index.shards.insert(".passmanager".to_string(), meta);

    let root_name = root_index_chunk_name(vault_key, 0);
    let root_plain = serde_json::to_vec(&index).expect("root index serialize");
    write_encrypted_chunk(storage, vault_key, &root_name, &root_plain);

    // Shard snapshot B: Ungrouped contains a child that the legacy recovery snapshot does NOT have.
    let mut pm_b = CatalogNode::new_dir(62, ".passmanager".to_string());
    pm_b.add_child(CatalogNode::new_dir(69, "123".to_string()));
    let mut ungrouped_b = CatalogNode::new_dir(70, "Ungrouped".to_string());
    ungrouped_b.add_child(CatalogNode::new_dir(4, "staleEntry".to_string()));
    pm_b.add_child(ungrouped_b);

    let shard = Shard {
        v: 2,
        shard_id: ".passmanager".to_string(),
        version: 0,
        base_version: 0,
        root: pm_b,
    };
    let snap_name = shard_chunk_name(vault_key, ".passmanager", 0);
    let snap_plain = serde_json::to_vec(&shard).expect("shard serialize");
    write_encrypted_chunk(storage, vault_key, &snap_name, &snap_plain);

    // Deltas: N no-op updates so unlock hits MAX_DELTAS and falls back.
    for seq in 1..=delta_count {
        let delta = DeltaEntry::update(seq, "/", PartialNode::default()).with_node_id(0);
        let delta_name = delta_chunk_name(vault_key, ".passmanager", seq);
        let delta_plain = serde_json::to_vec(&delta).expect("delta serialize");
        write_encrypted_chunk(storage, vault_key, &delta_name, &delta_plain);
    }
}

#[test]
fn test_unlock_errors_when_passmanager_deltas_exceed_limit_without_writing() {
    let (_router, temp_dir, keystore) = create_test_router_with_keystore();

    // We write our own chunks. Ensure no router keeps the storage open.
    drop(_router);

    let password = "test_password";
    let delta_count: u64 = (MAX_DELTAS as u64) + 1;

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let vault_salt = storage.get_or_create_salt().expect("vault salt");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    write_inconsistent_passmanager_fixture(&storage, &*vault_key, delta_count);
    let before = storage
        .list_chunks()
        .expect("list chunks before unlock")
        .into_iter()
        .collect::<BTreeSet<_>>();

    let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
    let unlock = unlock_vault(&mut router, password);
    assert_rpc_error(&unlock, "INTERNAL_ERROR");
    assert!(
        unlock
            .error_message()
            .unwrap_or_default()
            .contains("shard delta log exceeds MAX_DELTAS"),
        "unexpected unlock error: {unlock:?}"
    );

    let after = storage
        .list_chunks()
        .expect("list chunks after unlock")
        .into_iter()
        .collect::<BTreeSet<_>>();
    assert_eq!(after, before, "unlock read path must not write or compact");
}

#[test]
fn test_overflow_unlock_does_not_fall_back_to_legacy_catalog_or_enable_mutation() {
    let (_router, temp_dir, keystore) = create_test_router_with_keystore();
    drop(_router);

    let password = "test_password";
    let delta_count: u64 = (MAX_DELTAS as u64) + 1;

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let vault_salt = storage.get_or_create_salt().expect("vault salt");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    write_inconsistent_passmanager_fixture(&storage, &*vault_key, delta_count);
    let before = storage
        .list_chunks()
        .expect("list chunks before unlock")
        .into_iter()
        .collect::<BTreeSet<_>>();

    let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
    let unlock = unlock_vault(&mut router, password);
    assert_rpc_error(&unlock, "INTERNAL_ERROR");
    assert!(
        router.session().is_none(),
        "failed overflow unlock must not leave a mutable session"
    );

    let after = storage
        .list_chunks()
        .expect("list chunks after unlock")
        .into_iter()
        .collect::<BTreeSet<_>>();
    assert_eq!(after, before, "failed unlock must leave storage unchanged");
}

#[test]
fn test_passmanager_deltas_do_not_accumulate_on_non_passmanager_writes() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    assert_rpc_ok(&unlock_vault(&mut router, password));

    // Perform mutations unrelated to .passmanager.
    for i in 0..8 {
        let name = format!("dir_{i}");
        assert_rpc_ok(&create_dir(&mut router, &name));
        router.save().expect("save");
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let vault_salt = storage.get_or_create_salt().expect("vault salt");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    let index = read_root_index(&storage, &*vault_key);
    let pm = index
        .get_shard(".passmanager")
        .expect(".passmanager shard meta");

    // Correct behavior: .passmanager should only receive deltas when the shard changes.
    assert_eq!(
        pm.delta_count, 0,
        "unexpected .passmanager delta_count={}",
        pm.delta_count
    );
    assert_eq!(
        pm.has_deltas, false,
        "unexpected .passmanager has_deltas=true"
    );
}

#[test]
fn test_auto_compacts_passmanager_when_delta_chain_reaches_threshold() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    assert_rpc_ok(&unlock_vault(&mut router, password));

    // Ensure /.passmanager exists.
    set_bypass_system_shard_guards(true);
    assert_rpc_ok(&create_dir(&mut router, ".passmanager"));

    // Create enough deltas under .passmanager to exceed MAX_DELTAS.
    let n = (MAX_DELTAS as usize) + 10;
    for i in 0..n {
        let name = format!("g_{i}");
        assert_rpc_ok(&create_dir_at(&mut router, "/.passmanager", &name));
    }
    set_bypass_system_shard_guards(false);
    router.save().expect("save");

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let vault_salt = storage.get_or_create_salt().expect("vault salt");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    let index = read_root_index(&storage, &*vault_key);
    let pm = index
        .get_shard(".passmanager")
        .expect(".passmanager shard meta");
    assert!(
        pm.delta_count < MAX_DELTAS,
        "expected auto-compaction to keep passmanager delta chain bounded, got delta_count={}",
        pm.delta_count
    );
    assert!(
        pm.base_version > 0,
        "expected compaction to advance base_version"
    );
    assert_eq!(
        pm.has_deltas,
        pm.delta_count > 0,
        "has_deltas must match remaining post-compaction deltas"
    );

    // Old deltas from the compacted chain must be removed after compaction.
    let delta1 = delta_chunk_name(&*vault_key, ".passmanager", 1);
    assert!(
        !storage.chunk_exists(&delta1).expect("chunk_exists"),
        "expected delta chunks to be removed after auto-compaction"
    );
}
