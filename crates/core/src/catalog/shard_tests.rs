use super::*;

#[test]
fn test_load_strategy_default() {
    assert_eq!(LoadStrategy::default(), LoadStrategy::Lazy);
}

#[test]
fn test_shard_meta_new() {
    let meta = ShardMeta::new("documents", LoadStrategy::Lazy);

    assert_eq!(meta.shard_id, "documents");
    assert_eq!(meta.context, "shard:documents");
    assert_eq!(meta.version, 0);
    assert_eq!(meta.strategy, LoadStrategy::Lazy);
    assert!(!meta.has_deltas);
}

#[test]
fn test_shard_meta_passmanager() {
    let meta = ShardMeta::passmanager();

    assert_eq!(meta.shard_id, ".passmanager");
    assert_eq!(meta.strategy, LoadStrategy::Eager);
}

#[test]
fn test_shard_meta_record_delta() {
    let mut meta = ShardMeta::new("test", LoadStrategy::Lazy);

    meta.record_delta(1);

    assert_eq!(meta.delta_count, 1);
    assert_eq!(meta.last_delta_seq, 1);
    assert!(meta.has_deltas);
    assert_eq!(meta.version, 1);
}

#[test]
fn test_shard_meta_clear_deltas() {
    let mut meta = ShardMeta::new("test", LoadStrategy::Lazy);
    meta.record_delta(1);
    meta.record_delta(2);

    meta.clear_deltas();

    assert_eq!(meta.delta_count, 0);
    assert!(!meta.has_deltas);
    assert_eq!(meta.base_version, meta.version);
}

#[test]
fn test_root_index_new() {
    let index = RootIndex::new();

    assert_eq!(index.v, 2);
    assert_eq!(index.format, "sharded");
    assert_eq!(index.root_version, 0);
    assert!(index.shards.is_empty());
    assert!(index.is_sharded());
}

#[test]
fn test_root_index_upsert_shard() {
    let mut index = RootIndex::new();
    let meta = ShardMeta::passmanager();

    index.upsert_shard(meta);

    assert_eq!(index.shards.len(), 1);
    assert!(index.get_shard(".passmanager").is_some());
    assert_eq!(index.root_version, 1);
}

#[test]
fn test_root_index_eager_shards() {
    let mut index = RootIndex::new();
    index.upsert_shard(ShardMeta::passmanager());
    index.upsert_shard(ShardMeta::new("documents", LoadStrategy::Lazy));
    index.upsert_shard(ShardMeta::new("photos", LoadStrategy::Lazy));

    let eager = index.eager_shards();

    assert_eq!(eager.len(), 1);
    assert_eq!(eager[0].shard_id, ".passmanager");
}

#[test]
fn test_shard_new() {
    let root = CatalogNode::new_root();
    let shard = Shard::new(".passmanager", root);

    assert_eq!(shard.v, 2);
    assert_eq!(shard.shard_id, ".passmanager");
    assert_eq!(shard.version, 0);
    assert_eq!(shard.base_version, 0);
    assert!(!shard.has_pending_deltas());
}

#[test]
fn test_shard_increment_version() {
    let root = CatalogNode::new_root();
    let mut shard = Shard::new("test", root);

    shard.increment_version();
    shard.increment_version();

    assert_eq!(shard.version, 2);
    assert!(shard.has_pending_deltas());
}

#[test]
fn test_shard_compact() {
    let root = CatalogNode::new_root();
    let mut shard = Shard::new("test", root);

    shard.increment_version();
    shard.increment_version();
    shard.compact();

    assert_eq!(shard.base_version, 2);
    assert!(!shard.has_pending_deltas());
}
