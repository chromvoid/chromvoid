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
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
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

fn extract_shard_root(response: &chromvoid_core::rpc::types::RpcResponse) -> CatalogNode {
    let result = response.result().expect("response should have result");
    let root = result.get("root").expect("result should have root").clone();
    serde_json::from_value::<CatalogNode>(root).expect("root must be a CatalogNode")
}

fn write_inconsistent_passmanager_fixture(
    storage: &Storage,
    vault_key: &[u8; 32],
    delta_count: u64,
) {
    // Monolithic catalog A: /.passmanager/Ungrouped is empty.
    let mut root_a = CatalogNode::new_root();
    let mut pm_a = CatalogNode::new_dir(62, ".passmanager".to_string());
    pm_a.add_child(CatalogNode::new_dir(69, "123".to_string()));
    pm_a.add_child(CatalogNode::new_dir(70, "Ungrouped".to_string()));
    root_a.add_child(pm_a);

    let monolithic_version: u64 = 500;
    let catalog_plain = serialize_catalog(&root_a, monolithic_version).expect("serialize catalog");
    let catalog_name = chromvoid_core::crypto::catalog_chunk_name(vault_key, 0);
    write_encrypted_chunk(storage, vault_key, &catalog_name, &catalog_plain);

    // RootIndex: points at the sharded world with too many deltas.
    let mut index = RootIndex::new();
    index.root_version = monolithic_version;

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

    // Shard snapshot B: Ungrouped contains a child that monolithic does NOT have.
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
fn test_unlock_uses_sharded_passmanager_view_even_when_deltas_exceed_limit() {
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

    let mut router = RpcRouter::new(storage).with_keystore(keystore);
    let unlock = unlock_vault(&mut router, password);
    assert_rpc_ok(&unlock);

    // Correct behavior: even with a long delta chain, unlock must NOT silently fall back
    // to the monolithic catalog for .passmanager, otherwise frontend shard sync diverges.
    set_bypass_system_shard_guards(true);
    let items = get_items(&list_dir(&mut router, "/.passmanager/Ungrouped"));
    set_bypass_system_shard_guards(false);
    let names = get_item_names(&items);
    assert!(
        names.contains(&"staleEntry".to_string()),
        "expected sharded view (contains staleEntry), got: {names:?}"
    );
}

#[test]
fn test_delete_node_from_passmanager_shard_persists_after_overflow_unlock() {
    let (_router, temp_dir, keystore) = create_test_router_with_keystore();
    drop(_router);

    let password = "test_password";
    let delta_count: u64 = (MAX_DELTAS as u64) + 1;

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let vault_salt = storage.get_or_create_salt().expect("vault salt");
    let pepper = StoragePepper::get_or_create(keystore.as_ref()).expect("pepper");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    write_inconsistent_passmanager_fixture(&storage, &*vault_key, delta_count);

    let mut router = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut router, password));

    // This node exists in the shard view, but NOT in the monolithic fallback.
    // Correct behavior: after unlock, deletes must affect the same view the UI sync uses.
    set_bypass_system_shard_guards(true);
    assert_rpc_ok(&delete_node(&mut router, 4));
    set_bypass_system_shard_guards(false);
    router.save().expect("save");

    set_bypass_system_shard_guards(true);
    let shard = router.handle(&RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": ".passmanager"}),
    ));
    set_bypass_system_shard_guards(false);
    assert_rpc_ok(&shard);

    let root = extract_shard_root(&shard);
    let ungrouped = root.find_child("Ungrouped").expect("Ungrouped dir");
    assert!(
        ungrouped.find_child("staleEntry").is_none(),
        "expected staleEntry to be removed from shard after delete"
    );
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
fn test_auto_compacts_passmanager_when_deltas_exceed_threshold() {
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
    assert_eq!(
        pm.has_deltas, false,
        "expected auto-compaction to clear deltas, but has_deltas=true (delta_count={})",
        pm.delta_count
    );
    assert_eq!(
        pm.base_version, pm.version,
        "base_version must match version after compaction"
    );

    // Old deltas must be removed after compaction.
    let delta1 = delta_chunk_name(&*vault_key, ".passmanager", 1);
    assert!(
        !storage.chunk_exists(&delta1).expect("chunk_exists"),
        "expected delta chunks to be removed after auto-compaction"
    );
}
