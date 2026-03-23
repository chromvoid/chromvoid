use super::*;

#[test]
fn test_new_root() {
    let root = CatalogNode::new_root();

    assert_eq!(root.node_id, 0);
    assert_eq!(root.name, "/");
    assert!(root.is_dir());
    assert!(root.children().is_empty());
}

#[test]
fn test_new_dir() {
    let dir = CatalogNode::new_dir(1, "documents".to_string());

    assert_eq!(dir.node_id, 1);
    assert_eq!(dir.name, "documents");
    assert!(dir.is_dir());
    assert!(dir.children().is_empty());
}

#[test]
fn test_new_file() {
    let file = CatalogNode::new_file(
        2,
        "readme.txt".to_string(),
        1024,
        Some("text/plain".to_string()),
    );

    assert_eq!(file.node_id, 2);
    assert_eq!(file.name, "readme.txt");
    assert!(file.is_file());
    assert_eq!(file.size, 1024);
    assert_eq!(file.mime_type, Some("text/plain".to_string()));
    assert!(file.children.is_none());
}

#[test]
fn test_add_child() {
    let mut root = CatalogNode::new_root();
    let child = CatalogNode::new_dir(1, "docs".to_string());

    assert!(root.add_child(child));
    assert_eq!(root.children().len(), 1);
    assert!(root.has_child("docs"));
}

#[test]
fn test_find_child() {
    let mut root = CatalogNode::new_root();
    root.add_child(CatalogNode::new_dir(1, "docs".to_string()));
    root.add_child(CatalogNode::new_dir(2, "images".to_string()));

    let found = root.find_child("docs");
    assert!(found.is_some());
    assert_eq!(found.unwrap().node_id, 1);

    assert!(root.find_child("nonexistent").is_none());
}

#[test]
fn test_remove_child() {
    let mut root = CatalogNode::new_root();
    root.add_child(CatalogNode::new_dir(1, "docs".to_string()));
    root.add_child(CatalogNode::new_dir(2, "images".to_string()));

    let removed = root.remove_child(1);
    assert!(removed.is_some());
    assert_eq!(removed.unwrap().name, "docs");
    assert_eq!(root.children().len(), 1);
}

#[test]
fn test_count_nodes() {
    let mut root = CatalogNode::new_root();
    let mut docs = CatalogNode::new_dir(1, "docs".to_string());
    docs.add_child(CatalogNode::new_file(2, "file1.txt".to_string(), 100, None));
    docs.add_child(CatalogNode::new_file(3, "file2.txt".to_string(), 200, None));
    root.add_child(docs);
    root.add_child(CatalogNode::new_dir(4, "images".to_string()));

    assert_eq!(root.count_nodes(), 5);
}

#[test]
fn test_total_size() {
    let mut root = CatalogNode::new_root();
    let mut docs = CatalogNode::new_dir(1, "docs".to_string());
    docs.add_child(CatalogNode::new_file(2, "file1.txt".to_string(), 100, None));
    docs.add_child(CatalogNode::new_file(3, "file2.txt".to_string(), 200, None));
    root.add_child(docs);

    assert_eq!(root.total_size(), 300);
}

#[test]
fn test_file_cannot_have_children() {
    let mut file = CatalogNode::new_file(1, "test.txt".to_string(), 100, None);

    assert!(file.children_mut().is_none());
    assert!(!file.add_child(CatalogNode::new_dir(2, "child".to_string())));
}
