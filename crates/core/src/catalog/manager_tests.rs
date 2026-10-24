use super::*;

#[test]
fn test_new_catalog() {
    let manager = CatalogManager::new();

    assert_eq!(manager.root().node_id, 0);
    assert_eq!(manager.root().name, "/");
    assert!(manager.root().is_dir());
}

#[test]
fn test_create_dir() {
    let mut manager = CatalogManager::new();

    let node_id = manager
        .create_dir("/", "documents")
        .expect("should create dir");

    assert!(node_id > 0);
    assert!(manager.find_by_path("/documents").is_some());
    assert!(manager.find_by_id(node_id).is_some());
}

#[test]
fn test_create_nested_dirs() {
    let mut manager = CatalogManager::new();

    manager
        .create_dir("/", "documents")
        .expect("should create dir");
    manager
        .create_dir("/documents", "work")
        .expect("should create nested dir");

    assert!(manager.find_by_path("/documents/work").is_some());
}

#[test]
fn test_create_file() {
    let mut manager = CatalogManager::new();

    let node_id = manager
        .create_file("/", "readme.txt", 1024, Some("text/plain".to_string()))
        .expect("should create file");

    let file = manager.find_by_id(node_id).expect("should find file");
    assert!(file.is_file());
    assert_eq!(file.size, 1024);
    assert_eq!(file.mime_type, Some("text/plain".to_string()));
}

#[test]
fn test_create_duplicate_name_fails() {
    let mut manager = CatalogManager::new();

    manager
        .create_dir("/", "docs")
        .expect("should create first");
    let result = manager.create_dir("/", "docs");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::NameExists(_))));
}

#[test]
fn test_create_in_nonexistent_parent_fails() {
    let mut manager = CatalogManager::new();

    let result = manager.create_dir("/nonexistent", "child");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::InvalidPath(_))));
}

#[test]
fn test_rename() {
    let mut manager = CatalogManager::new();

    let node_id = manager
        .create_dir("/", "old_name")
        .expect("should create dir");

    manager.rename(node_id, "new_name").expect("should rename");

    assert!(manager.find_by_path("/old_name").is_none());
    assert!(manager.find_by_path("/new_name").is_some());
}

#[test]
fn test_rename_root_fails() {
    let mut manager = CatalogManager::new();

    let result = manager.rename(0, "new_root");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::CannotModifyRoot)));
}

#[test]
fn test_move_node() {
    let mut manager = CatalogManager::new();

    manager.create_dir("/", "src").expect("should create src");
    manager.create_dir("/", "dest").expect("should create dest");
    let file_id = manager
        .create_file("/src", "file.txt", 100, None)
        .expect("should create file");

    manager.move_node(file_id, "/dest").expect("should move");

    assert!(manager.find_by_path("/src/file.txt").is_none());
    assert!(manager.find_by_path("/dest/file.txt").is_some());
}

#[test]
fn test_source_revision_survives_rename_and_move() {
    let mut manager = CatalogManager::new();

    manager.create_dir("/", "src").expect("should create src");
    manager.create_dir("/", "dest").expect("should create dest");
    let file_id = manager
        .create_file("/src", "photo.jpg", 100, Some("image/jpeg".to_string()))
        .expect("should create file");
    let source_revision = manager
        .find_by_id(file_id)
        .expect("should find file")
        .source_revision();

    manager
        .rename(file_id, "renamed.jpg")
        .expect("should rename");
    manager.move_node(file_id, "/dest").expect("should move");

    let moved = manager
        .find_by_path("/dest/renamed.jpg")
        .expect("should find moved file");
    assert_eq!(moved.source_revision(), source_revision);
}

#[test]
fn test_delete() {
    let mut manager = CatalogManager::new();

    let node_id = manager.create_dir("/", "to_delete").expect("should create");

    manager.delete(node_id).expect("should delete");

    assert!(manager.find_by_path("/to_delete").is_none());
    assert!(manager.find_by_id(node_id).is_none());
}

#[test]
fn test_delete_with_children() {
    let mut manager = CatalogManager::new();

    manager
        .create_dir("/", "parent")
        .expect("should create parent");
    let child_id = manager
        .create_dir("/parent", "child")
        .expect("should create child");
    let parent_id = manager
        .find_by_path("/parent")
        .map(|n| n.node_id)
        .expect("should find parent");

    manager.delete(parent_id).expect("should delete parent");

    assert!(manager.find_by_path("/parent").is_none());
    assert!(manager.find_by_id(child_id).is_none());
}

#[test]
fn test_delete_root_fails() {
    let mut manager = CatalogManager::new();

    let result = manager.delete(0);

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::CannotModifyRoot)));
}

#[test]
fn test_trash_restore_and_empty() {
    let mut manager = CatalogManager::new();

    manager.create_dir("/", "docs").expect("should create docs");
    let file_id = manager
        .create_file("/docs", "report.txt", 42, Some("text/plain".to_string()))
        .expect("should create file");

    let trashed = manager.trash_node(file_id).expect("should trash file");
    assert_eq!(
        trashed
            .trash
            .as_ref()
            .map(|trash| trash.original_path.as_str()),
        Some("/docs/report.txt")
    );
    assert!(manager.find_by_path("/docs/report.txt").is_none());
    assert_eq!(manager.list("/").expect("root list").len(), 2);
    assert_eq!(manager.list_trash().expect("trash list").len(), 1);

    let restored = manager
        .restore_trashed_node(file_id, None, None)
        .expect("should restore file");
    assert_eq!(restored.name, "report.txt");
    assert_eq!(restored.trash, None);
    assert!(manager.find_by_path("/docs/report.txt").is_some());
    assert!(manager.list_trash().expect("trash list").is_empty());

    manager.trash_node(file_id).expect("should trash again");
    let removed = manager.empty_trash().expect("should empty trash");
    assert_eq!(removed.len(), 1);
    assert!(manager.find_by_id(file_id).is_none());
    assert!(manager.list_trash().expect("trash list").is_empty());
}

#[test]
fn test_restore_trash_reports_name_conflict_without_losing_node() {
    let mut manager = CatalogManager::new();

    manager.create_dir("/", "docs").expect("should create docs");
    let file_id = manager
        .create_file("/docs", "report.txt", 42, None)
        .expect("should create file");
    manager.trash_node(file_id).expect("should trash file");
    manager
        .create_file("/docs", "report.txt", 1, None)
        .expect("should create conflicting file");

    let result = manager.restore_trashed_node(file_id, None, None);

    assert!(matches!(result, Err(Error::NameExists(_))));
    let trashed = manager.find_by_id(file_id).expect("trashed node remains");
    assert!(trashed.trash.is_some());
    assert!(manager
        .get_path(file_id)
        .expect("trashed path")
        .starts_with("/.trash/"));
}

#[test]
fn test_exchange_nodes_swaps_same_type_paths() {
    let mut manager = CatalogManager::new();

    manager.create_dir("/", "left").expect("should create left");
    manager
        .create_dir("/", "right")
        .expect("should create right");
    let left_id = manager
        .create_file("/left", "a.txt", 1, None)
        .expect("should create left file");
    let right_id = manager
        .create_file("/right", "b.txt", 2, None)
        .expect("should create right file");

    manager
        .exchange_nodes(left_id, right_id)
        .expect("should exchange files");

    assert_eq!(manager.get_path(left_id).as_deref(), Some("/right/b.txt"));
    assert_eq!(manager.get_path(right_id).as_deref(), Some("/left/a.txt"));
}

#[test]
fn test_exchange_nodes_rolls_back_on_type_mismatch() {
    let mut manager = CatalogManager::new();

    let dir_id = manager.create_dir("/", "docs").expect("should create dir");
    let file_id = manager
        .create_file("/", "file.txt", 1, None)
        .expect("should create file");

    let result = manager.exchange_nodes(dir_id, file_id);

    assert!(matches!(result, Err(Error::InvalidPath(_))));
    assert_eq!(manager.get_path(dir_id).as_deref(), Some("/docs"));
    assert_eq!(manager.get_path(file_id).as_deref(), Some("/file.txt"));
}

#[test]
fn test_list() {
    let mut manager = CatalogManager::new();

    manager.create_dir("/", "dir1").expect("should create dir1");
    manager.create_dir("/", "dir2").expect("should create dir2");
    manager
        .create_file("/", "file.txt", 100, None)
        .expect("should create file");

    let items = manager.list("/").expect("should list");

    assert_eq!(items.len(), 3);
}

#[test]
fn test_list_nonexistent_fails() {
    let manager = CatalogManager::new();

    let result = manager.list("/nonexistent");

    assert!(result.is_err());
}

#[test]
fn test_version_increments() {
    let mut manager = CatalogManager::new();

    assert_eq!(manager.version(), 0);

    manager.create_dir("/", "dir1").expect("should create");
    assert_eq!(manager.version(), 1);

    manager.create_dir("/", "dir2").expect("should create");
    assert_eq!(manager.version(), 2);
}

#[test]
fn rename_directory_keeps_nested_nodes_addressable_by_identity() {
    let mut manager = CatalogManager::new();
    let parent = manager.create_dir("/", "old").unwrap();
    let nested = manager.create_dir("/old", "nested").unwrap();
    let file = manager
        .create_file("/old/nested", "note.txt", 4, None)
        .unwrap();
    manager.rename(parent, "новое").unwrap();
    assert_eq!(manager.get_path(nested).as_deref(), Some("/новое/nested"));
    assert_eq!(
        manager.get_path(file).as_deref(),
        Some("/новое/nested/note.txt")
    );
    assert!(manager.find_by_id_mut(file).is_some());
    assert!(manager.find_by_path("/old/nested/note.txt").is_none());
    manager.rename(file, "updated.txt").unwrap();
    assert_eq!(
        manager
            .find_by_path("/новое/nested/updated.txt")
            .unwrap()
            .node_id,
        file
    );
}
