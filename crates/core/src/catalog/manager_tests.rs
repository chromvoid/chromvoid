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
