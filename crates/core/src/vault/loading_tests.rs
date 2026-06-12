use super::*;

use crate::catalog::{
    serialize_catalog, CatalogNode, LoadStrategy, Shard, ShardMeta, MAX_DELTA_SIZE,
};
use crate::crypto::{
    catalog_chunk_name, catalog_commit_chunk_name, decrypt, delta_chunk_name, encrypt,
    root_index_chunk_name, shard_chunk_name, shard_snapshot_chunk_name,
};
use crate::error::Error;
use crate::storage::test_util::{fault_injecting_storage, FaultRule, StorageOperation};
use tempfile::TempDir;

fn setup() -> (TempDir, Storage, [u8; KEY_SIZE]) {
    let dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(dir.path()).expect("storage");
    let key = [42u8; KEY_SIZE];
    (dir, storage, key)
}

fn write_encrypted_chunk<T: serde::Serialize>(
    storage: &Storage,
    key: &[u8; KEY_SIZE],
    name: &str,
    value: &T,
) {
    let plain = serde_json::to_vec(value).expect("serialize");
    let enc = encrypt(&plain, key, name.as_bytes()).expect("encrypt");
    storage.write_chunk(name, &enc).expect("write chunk");
}

fn write_legacy_recovery_catalog(
    storage: &Storage,
    key: &[u8; KEY_SIZE],
    catalog: &CatalogManager,
) {
    let name = catalog_chunk_name(key, 0);
    let plain = serialize_catalog(catalog.root(), catalog.version()).expect("serialize catalog");
    let enc = encrypt(&plain, key, name.as_bytes()).expect("encrypt catalog");
    storage.write_chunk(&name, &enc).expect("write catalog");
}

fn write_sharded_catalog(storage: &Storage, key: &[u8; KEY_SIZE], catalog: &CatalogManager) {
    Vault::rewrite_sharded_catalog_from_catalog(storage, key, catalog).expect("write sharded");
}

fn write_commit_record_json(
    storage: &Storage,
    key: &[u8; KEY_SIZE],
    phase: &str,
    root_index: &RootIndex,
    new_chunks: Vec<String>,
    old_chunks: Vec<String>,
) {
    let name = catalog_commit_chunk_name(key);
    let record = serde_json::json!({
        "v": 1,
        "id": format!("test-{phase}"),
        "phase": phase,
        "root_version": root_index.root_version,
        "new_chunks": new_chunks,
        "old_chunks": old_chunks,
        "root_index": root_index,
    });
    write_encrypted_chunk(storage, key, &name, &record);
}

fn write_sharded_snapshot_set(
    storage: &Storage,
    key: &[u8; KEY_SIZE],
    catalog: &CatalogManager,
    snapshot_seq: u64,
) -> (RootIndex, Vec<String>) {
    let mut root_index = RootIndex::new();
    root_index.root_version = catalog.version();
    let mut chunks = Vec::new();

    for mut shard in crate::catalog::split_into_shards(catalog.root(), None) {
        let mut meta = ShardMeta::new(shard.shard_id.clone(), LoadStrategy::Lazy);
        meta.version = catalog.version();
        meta.base_version = catalog.version();
        meta.last_delta_seq = catalog.version();
        meta.snapshot_seq = snapshot_seq;
        meta.update_stats(shard.node_count(), shard.size());

        shard.version = catalog.version();
        shard.base_version = catalog.version();
        let name = shard_snapshot_chunk_name(key, &shard.shard_id, snapshot_seq);
        write_encrypted_chunk(storage, key, &name, &shard);
        chunks.push(name);
        root_index.shards.insert(meta.shard_id.clone(), meta);
    }

    (root_index, chunks)
}

fn catalog_with_docs_child(child_name: &str, size: u64) -> CatalogManager {
    let mut catalog = CatalogManager::new();
    catalog.create_dir("/", "docs").expect("create docs");
    catalog
        .create_file("/docs", child_name, size, None)
        .expect("create child");
    catalog
}

fn catalog_has_path(catalog: &CatalogManager, path: &str) -> bool {
    catalog.find_by_path(path).is_some()
}

#[test]
fn try_load_sharded_catalog_none_when_root_index_missing() {
    let (_d, storage, key) = setup();
    assert!(Vault::try_load_sharded_catalog(&storage, &key)
        .expect("ok")
        .is_none());
}

#[test]
fn try_load_sharded_catalog_none_when_root_index_not_sharded() {
    let (_d, storage, key) = setup();
    let mut root_index = RootIndex::new();
    root_index.v = 1;
    root_index.format = "legacy".to_string();

    let name = root_index_chunk_name(&key, 0);
    write_encrypted_chunk(&storage, &key, &name, &root_index);

    assert!(Vault::try_load_sharded_catalog(&storage, &key)
        .expect("ok")
        .is_none());
}

#[test]
fn try_load_sharded_catalog_errors_when_shard_snapshot_missing() {
    let (_d, storage, key) = setup();
    let mut root_index = RootIndex::new();
    root_index.upsert_shard(ShardMeta::passmanager());

    let name = root_index_chunk_name(&key, 0);
    write_encrypted_chunk(&storage, &key, &name, &root_index);

    // The root index (written under the correct key) references a shard whose
    // snapshot chunk is missing — that is corruption, not "no catalog". It must
    // error rather than silently yield an empty catalog that a later save would
    // make permanent (H3).
    assert!(Vault::try_load_sharded_catalog(&storage, &key).is_err());
}

#[test]
fn try_load_sharded_catalog_errors_when_delta_replay_fails() {
    let (_d, storage, key) = setup();
    let shard_id = "docs";
    let mut shard = Shard::new(shard_id, CatalogNode::new_dir(1, shard_id.to_string()));
    assert!(shard
        .root
        .add_child(CatalogNode::new_file(2, "readme.txt".to_string(), 12, None,)));

    let mut root_index = RootIndex::new();
    let mut meta = ShardMeta::new(shard_id, LoadStrategy::Lazy);
    meta.base_version = 0;
    meta.version = 1;
    meta.last_delta_seq = 1;
    meta.has_deltas = true;
    meta.snapshot_seq = 0;
    meta.update_stats(shard.node_count(), shard.size());
    root_index.root_version = 1;
    root_index.upsert_shard(meta);

    let root_name = root_index_chunk_name(&key, 0);
    write_encrypted_chunk(&storage, &key, &root_name, &root_index);
    let snapshot_name = shard_snapshot_chunk_name(&key, shard_id, 0);
    write_encrypted_chunk(&storage, &key, &snapshot_name, &shard);
    let delta = DeltaEntry::move_node(1, "/readme.txt", "/missing", None);
    let delta_name = delta_chunk_name(&key, shard_id, 1);
    write_encrypted_chunk(&storage, &key, &delta_name, &delta);

    let result = Vault::try_load_sharded_catalog(&storage, &key);

    assert!(result.is_err(), "failed delta replay must not be masked");
}

#[test]
fn save_catalog_creates_root_index_chunk() {
    let (_d, storage, key) = setup();
    let catalog = CatalogManager::new();
    let mut pending = HashMap::new();
    let mut persisted = Vec::new();

    Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted).expect("save");

    let name = root_index_chunk_name(&key, 0);
    assert!(storage.chunk_exists(&name).expect("exists"));
}

#[test]
fn save_catalog_does_not_create_legacy_catalog_chunk() {
    let (_d, storage, key) = setup();
    let catalog = CatalogManager::new();
    let mut pending = HashMap::new();
    let mut persisted = Vec::new();

    Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted).expect("save");

    let legacy_name = catalog_chunk_name(&key, 0);
    assert!(
        !storage.chunk_exists(&legacy_name).expect("exists"),
        "sharded save must not write legacy recovery catalog chunk"
    );
}

#[test]
fn recovery_only_legacy_catalog_chunk_does_not_restore_files() {
    let (_d, storage, key) = setup();
    let legacy = catalog_with_docs_child("legacy.bin", 42);
    write_legacy_recovery_catalog(&storage, &key, &legacy);

    let loaded = Vault::load_catalog_for_unlock(&storage, &key).expect("load for unlock");

    assert!(
        !catalog_has_path(&loaded, "/docs/legacy.bin"),
        "recovery-only legacy catalog chunks are intentionally ignored"
    );
}

#[test]
fn save_then_load_sharded_catalog_returns_some() {
    let (_d, storage, key) = setup();
    let catalog = CatalogManager::new();
    let mut pending = HashMap::new();
    let mut persisted = Vec::new();

    Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted).expect("save");

    let loaded = Vault::try_load_sharded_catalog(&storage, &key).expect("ok");
    assert!(
        loaded.is_some(),
        "sharded catalog should round-trip after save"
    );
}

#[test]
fn unlock_catalog_uses_sharded_state_when_legacy_catalog_chunk_is_absent() {
    let (_d, storage, key) = setup();
    let catalog = catalog_with_docs_child("child.bin", 42);

    write_sharded_catalog(&storage, &key, &catalog);

    let legacy_name = catalog_chunk_name(&key, 0);
    assert!(
        !storage.chunk_exists(&legacy_name).expect("exists"),
        "test setup must not rely on a legacy catalog chunk"
    );

    let loaded = Vault::load_catalog_for_unlock(&storage, &key).expect("load for unlock");

    assert!(catalog_has_path(&loaded, "/docs/child.bin"));
}

#[test]
fn unlock_recovers_publishing_catalog_commit() {
    let (_d, storage, key) = setup();
    let old = catalog_with_docs_child("old.bin", 1);
    write_sharded_catalog(&storage, &key, &old);

    let mut next = catalog_with_docs_child("old.bin", 1);
    next.create_file("/docs", "new.bin", 2, None)
        .expect("create new child");
    let (root_index, new_chunks) = write_sharded_snapshot_set(&storage, &key, &next, 42);
    write_commit_record_json(
        &storage,
        &key,
        "publishing",
        &root_index,
        new_chunks,
        Vec::new(),
    );

    let loaded = Vault::load_catalog_for_unlock(&storage, &key).expect("load");

    assert!(catalog_has_path(&loaded, "/docs/old.bin"));
    assert!(catalog_has_path(&loaded, "/docs/new.bin"));
    assert!(
        !storage
            .chunk_exists(&catalog_commit_chunk_name(&key))
            .expect("commit exists check"),
        "publishing commit record should be cleared after recovery"
    );
}

#[test]
fn unlock_catalog_commit_recovery_propagates_chunk_exists_error() {
    let (dir, storage, key) = setup();
    let old = catalog_with_docs_child("old.bin", 1);
    write_sharded_catalog(&storage, &key, &old);

    let mut next = catalog_with_docs_child("old.bin", 1);
    next.create_file("/docs", "new.bin", 2, None)
        .expect("create new child");
    let (root_index, new_chunks) = write_sharded_snapshot_set(&storage, &key, &next, 42);
    write_commit_record_json(
        &storage,
        &key,
        "publishing",
        &root_index,
        new_chunks,
        Vec::new(),
    );

    let (fault_storage, _handle) = fault_injecting_storage(
        dir.path(),
        Some(FaultRule {
            operation: StorageOperation::ChunkExists,
            fail_on: 3,
        }),
    )
    .expect("fault storage");
    let result = Vault::load_catalog_for_unlock(&fault_storage, &key);
    assert!(
        matches!(result, Err(Error::StorageIo(_))),
        "transient chunk_exists failure must propagate"
    );

    assert!(
        storage
            .chunk_exists(&catalog_commit_chunk_name(&key))
            .expect("commit marker still exists"),
        "failed recovery must leave marker for retry"
    );

    let loaded = Vault::load_catalog_for_unlock(&storage, &key).expect("retry load");
    assert!(catalog_has_path(&loaded, "/docs/old.bin"));
    assert!(catalog_has_path(&loaded, "/docs/new.bin"));
}

#[test]
fn unlock_rolls_back_staging_catalog_commit_without_advancing_root_index() {
    let (_d, storage, key) = setup();
    let old = catalog_with_docs_child("old.bin", 1);
    write_sharded_catalog(&storage, &key, &old);

    let fake_chunk = shard_snapshot_chunk_name(&key, "docs", 999);
    storage
        .write_chunk_atomic(&fake_chunk, b"staged but unpublished")
        .expect("write fake chunk");
    let mut root_index = RootIndex::new();
    root_index.root_version = old.version().saturating_add(1);
    write_commit_record_json(
        &storage,
        &key,
        "staging",
        &root_index,
        vec![fake_chunk.clone()],
        Vec::new(),
    );

    let loaded = Vault::load_catalog_for_unlock(&storage, &key).expect("load");

    assert!(catalog_has_path(&loaded, "/docs/old.bin"));
    assert!(!storage
        .chunk_exists(&fake_chunk)
        .expect("fake chunk removed"));
    assert!(
        !storage
            .chunk_exists(&catalog_commit_chunk_name(&key))
            .expect("commit exists check"),
        "staging commit record should be cleared after rollback"
    );
}

#[test]
fn unlock_ignores_corrupt_catalog_commit_record() {
    let (_d, storage, key) = setup();
    let catalog = catalog_with_docs_child("child.bin", 1);
    write_sharded_catalog(&storage, &key, &catalog);

    let commit_name = catalog_commit_chunk_name(&key);
    let bad = serde_json::json!({"v": 1, "phase": "publishing"});
    write_encrypted_chunk(&storage, &key, &commit_name, &bad);

    let loaded = Vault::load_catalog_for_unlock(&storage, &key).expect("load");

    assert!(catalog_has_path(&loaded, "/docs/child.bin"));
    assert!(
        !storage
            .chunk_exists(&commit_name)
            .expect("commit exists check"),
        "corrupt commit record should be cleared"
    );
}

#[test]
fn sharded_load_defaults_missing_snapshot_seq_to_legacy_snapshot_zero() {
    let (_d, storage, key) = setup();
    let catalog = catalog_with_docs_child("child.bin", 1);
    let docs = catalog.find_by_path("/docs").expect("docs").clone();

    let shard = Shard::new("docs", docs);
    let shard_name = shard_chunk_name(&key, "docs", 0);
    write_encrypted_chunk(&storage, &key, &shard_name, &shard);

    let mut root_index = RootIndex::new();
    root_index.root_version = catalog.version();
    let mut meta = ShardMeta::new("docs", LoadStrategy::Lazy);
    meta.update_stats(shard.node_count(), shard.size());
    root_index.shards.insert("docs".to_string(), meta);

    let root_name = root_index_chunk_name(&key, 0);
    let mut value = serde_json::to_value(&root_index).expect("root index json");
    value
        .get_mut("shards")
        .and_then(|shards| shards.get_mut("docs"))
        .and_then(|meta| meta.as_object_mut())
        .expect("docs meta object")
        .remove("snapshot_seq");
    write_encrypted_chunk(&storage, &key, &root_name, &value);

    let loaded = Vault::try_load_sharded_catalog(&storage, &key)
        .expect("load")
        .expect("legacy root index should load");

    assert!(catalog_has_path(&loaded, "/docs/child.bin"));
}

#[test]
fn save_catalog_marks_eager_system_shards_as_eager() {
    let (_d, storage, key) = setup();
    let catalog = CatalogManager::new();
    let mut pending = HashMap::new();
    let mut persisted = Vec::new();

    Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted).expect("save");

    let name = root_index_chunk_name(&key, 0);
    let enc = storage.read_chunk(&name).expect("read");
    let plain = decrypt(&enc, &key, name.as_bytes()).expect("decrypt");
    let root_index: RootIndex = serde_json::from_slice(&plain).expect("parse");

    let passmanager = root_index
        .get_shard(".passmanager")
        .expect(".passmanager shard meta should exist after save");
    assert!(matches!(passmanager.strategy, LoadStrategy::Eager));

    let passkeys = root_index
        .get_shard(".passkeys")
        .expect(".passkeys shard meta should exist after save");
    assert!(matches!(passkeys.strategy, LoadStrategy::Eager));
}

#[test]
fn save_catalog_rewrites_stale_eager_system_dir_snapshot_ids() {
    fn collect_ids<'a>(node: &'a CatalogNode, path: String, out: &mut Vec<(u64, String, &'a str)>) {
        out.push((node.node_id, path.clone(), node.name.as_str()));
        for child in node.children() {
            let child_path = if path == "/" {
                format!("/{}", child.name)
            } else {
                format!("{}/{}", path, child.name)
            };
            collect_ids(child, child_path, out);
        }
    }

    let (_d, storage, key) = setup();
    let mut pending = HashMap::new();
    let mut persisted = Vec::new();

    let mut catalog = CatalogManager::new();
    Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted)
        .expect("initial save creates eager system shard snapshots");

    let user_node_id = catalog
        .create_file("/", "user.txt", 123, Some("text/plain".to_string()))
        .expect("create user file");
    assert_eq!(
        user_node_id, 2,
        "fresh user allocation documents the collision with the first .passkeys synthetic id"
    );

    Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted)
        .expect("second save rewrites stale eager system snapshots");

    let loaded = Vault::try_load_sharded_catalog(&storage, &key)
        .expect("load sharded catalog")
        .expect("sharded catalog should load");

    let mut entries = Vec::new();
    collect_ids(loaded.root(), "/".to_string(), &mut entries);

    let mut seen = std::collections::HashMap::<u64, String>::new();
    for (node_id, path, _name) in &entries {
        if let Some(previous) = seen.insert(*node_id, path.clone()) {
            panic!(
                "duplicate node_id {node_id}: first path={previous}, second path={path}, all entries={entries:?}"
            );
        }
    }

    assert_eq!(
        loaded.get_path(user_node_id).as_deref(),
        Some("/user.txt"),
        "user node id must resolve to its user path after sharded reload"
    );
    assert!(
        !crate::catalog::is_system_path(
            loaded
                .get_path(user_node_id)
                .as_deref()
                .expect("user path should be indexed")
        ),
        "user file must not be classified as a system path"
    );
}

#[test]
fn compact_shard_returns_err_when_shard_not_found_and_not_passmanager() {
    let (_d, storage, key) = setup();
    let root_index = RootIndex::new();

    let result = Vault::compact_shard_with_commit(&storage, &key, root_index, "not-passmanager");
    assert!(result.is_err());
}

#[test]
fn compact_shard_clears_deltas_for_passmanager() {
    let (_d, storage, key) = setup();

    let mut root_index = RootIndex::new();
    let mut meta = ShardMeta::passmanager();
    meta.record_delta(1);
    let expected_last_seq = meta.version;
    root_index.upsert_shard(meta);

    let snapshot = Shard::new(
        ".passmanager",
        CatalogNode::new_dir(1, ".passmanager".to_string()),
    );
    let snap_name = shard_chunk_name(&key, ".passmanager", 0);
    write_encrypted_chunk(&storage, &key, &snap_name, &snapshot);

    let delta = DeltaEntry::create(1, "/", CatalogNode::new_dir(2, "foo".to_string()));
    let delta_name = delta_chunk_name(&key, ".passmanager", 1);
    write_encrypted_chunk(&storage, &key, &delta_name, &delta);

    let (root_index, _, _) =
        Vault::compact_shard_with_commit(&storage, &key, root_index, ".passmanager")
            .expect("compact");

    let updated = root_index.get_shard(".passmanager").expect("meta");
    assert!(
        !updated.has_deltas,
        "deltas should be cleared after compact"
    );
    assert_eq!(updated.last_delta_seq, expected_last_seq);

    assert!(
        !storage.chunk_exists(&delta_name).expect("exists"),
        "delta chunk should be deleted after compact"
    );
    let compacted_snap_name = shard_snapshot_chunk_name(&key, ".passmanager", updated.snapshot_seq);
    assert!(
        storage.chunk_exists(&compacted_snap_name).expect("exists"),
        "compacted snapshot chunk should exist after compact"
    );
    assert_ne!(
        compacted_snap_name, snap_name,
        "compaction should publish a new snapshot sequence"
    );
}

#[test]
fn compact_shard_creates_missing_passkeys_meta() {
    let (_d, storage, key) = setup();
    let root_index = RootIndex::new();

    let result = Vault::compact_shard_with_commit(&storage, &key, root_index, ".passkeys");

    assert!(
        result.is_ok(),
        "missing eager passkeys meta is repaired before no-op compaction"
    );
    let (root_index, _, _) = result.expect("compaction result");
    let meta = root_index.get_shard(".passkeys").expect("meta");
    assert_eq!(meta.strategy, LoadStrategy::Eager);
}

#[test]
fn save_catalog_rejects_oversized_delta() {
    let (_d, storage, key) = setup();
    let catalog = CatalogManager::new();

    {
        let mut pending: HashMap<String, Vec<DeltaEntry>> = HashMap::new();
        let mut persisted: Vec<(String, DeltaEntry)> = Vec::new();
        Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted)
            .expect("first save establishes RootIndex");
    }

    let huge_path = "x".repeat(MAX_DELTA_SIZE + 1024);
    let delta = DeltaEntry::create(1, huge_path, CatalogNode::new_dir(2, "foo".to_string()));

    let mut pending: HashMap<String, Vec<DeltaEntry>> = HashMap::new();
    pending.insert(".passmanager".to_string(), vec![delta]);
    let mut persisted: Vec<(String, DeltaEntry)> = Vec::new();

    let result = Vault::save_catalog(&storage, &key, &catalog, &mut pending, &mut persisted);
    assert!(result.is_err(), "expected Err for oversized delta");
}
