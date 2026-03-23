use super::*;

fn create_test_catalog() -> CatalogNode {
    let mut root = CatalogNode::new_root();

    let mut passmanager = CatalogNode::new_dir(1, PASSMANAGER_SHARD_ID.to_string());
    passmanager.add_child(CatalogNode::new_file(2, "bank.txt".to_string(), 100, None));
    root.add_child(passmanager);

    let mut docs = CatalogNode::new_dir(3, "documents".to_string());
    docs.add_child(CatalogNode::new_file(
        4,
        "readme.txt".to_string(),
        200,
        None,
    ));
    root.add_child(docs);

    let photos = CatalogNode::new_dir(5, "photos".to_string());
    root.add_child(photos);

    root
}

#[test]
fn test_sharded_catalog_manager_new() {
    let manager = ShardedCatalogManager::new();

    assert!(manager.list_shards().is_empty());
    assert!(manager.dirty_shards().is_empty());
}

#[test]
fn test_split_into_shards() {
    let root = create_test_catalog();

    let shards = split_into_shards(&root, None);

    assert_eq!(shards.len(), 3);
    assert!(shards.iter().any(|s| s.shard_id == PASSMANAGER_SHARD_ID));
    assert!(shards.iter().any(|s| s.shard_id == "documents"));
    assert!(shards.iter().any(|s| s.shard_id == "photos"));
}

#[test]
fn test_create_root_index_from_shards() {
    let root = create_test_catalog();
    let shards = split_into_shards(&root, None);

    let index = create_root_index_from_shards(&shards);

    assert_eq!(index.shards.len(), 3);

    let pm_meta = index.get_shard(PASSMANAGER_SHARD_ID).unwrap();
    assert_eq!(pm_meta.strategy, LoadStrategy::Eager);

    let docs_meta = index.get_shard("documents").unwrap();
    assert_eq!(docs_meta.strategy, LoadStrategy::Lazy);
}

#[test]
fn test_merge_shards_to_catalog() {
    let original = create_test_catalog();
    let shards = split_into_shards(&original, None);

    let merged = merge_shards_to_catalog(&shards);

    assert_eq!(merged.children().len(), 3);
    assert!(merged.find_child(PASSMANAGER_SHARD_ID).is_some());
    assert!(merged.find_child("documents").is_some());
    assert!(merged.find_child("photos").is_some());
}

#[test]
fn test_load_shard() {
    let mut manager = ShardedCatalogManager::new();
    let shard = Shard::new("test", CatalogNode::new_root());

    manager.load_shard("test", shard);

    assert!(manager.is_shard_loaded("test"));
    assert!(manager.get_shard("test").is_some());
}

#[test]
fn test_mark_dirty() {
    let mut manager = ShardedCatalogManager::new();

    manager.mark_dirty("shard1");
    manager.mark_dirty("shard2");
    manager.mark_dirty("shard1");

    assert_eq!(manager.dirty_shards().len(), 2);
}

#[test]
fn test_add_delta() {
    let mut manager = ShardedCatalogManager::new();
    let meta = ShardMeta::new("test", LoadStrategy::Lazy);
    manager.root_index_mut().upsert_shard(meta);

    let delta = DeltaEntry::delete(1, "/test/file.txt");
    manager.add_delta("test", delta);

    assert!(manager.dirty_shards().contains(&"test".to_string()));
    assert!(manager.get_delta_log("test").is_some());
    assert_eq!(manager.get_delta_log("test").unwrap().len(), 1);
}

#[test]
fn test_eager_shard_ids() {
    let root = create_test_catalog();
    let shards = split_into_shards(&root, None);
    let index = create_root_index_from_shards(&shards);

    let manager = ShardedCatalogManager::from_root_index(index);
    let eager_ids = manager.eager_shard_ids();

    assert_eq!(eager_ids.len(), 1);
    assert!(eager_ids.contains(&PASSMANAGER_SHARD_ID.to_string()));
}
