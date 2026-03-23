use super::*;

fn create_test_tree() -> CatalogNode {
    let mut root = CatalogNode::new_root();
    let mut docs = CatalogNode::new_dir(1, "docs".to_string());
    docs.add_child(CatalogNode::new_file(
        2,
        "readme.txt".to_string(),
        100,
        None,
    ));
    root.add_child(docs);
    root.add_child(CatalogNode::new_dir(3, "images".to_string()));
    root
}

#[test]
fn test_delta_entry_create() {
    let node = CatalogNode::new_file(10, "test.txt".to_string(), 50, None);
    let delta = DeltaEntry::create(1, "/docs", node.clone());

    assert_eq!(delta.seq, 1);
    assert_eq!(delta.path, "/docs");
    match delta.op {
        DeltaOp::Create { node: n } => assert_eq!(n.name, "test.txt"),
        _ => panic!("Expected Create op"),
    }
}

#[test]
fn test_delta_entry_update() {
    let fields = PartialNode {
        name: Some("renamed.txt".to_string()),
        size: Some(200),
        ..Default::default()
    };
    let delta = DeltaEntry::update(2, "/docs/readme.txt", fields);

    assert_eq!(delta.seq, 2);
    match delta.op {
        DeltaOp::Update { fields: f } => {
            assert_eq!(f.name, Some("renamed.txt".to_string()));
            assert_eq!(f.size, Some(200));
        }
        _ => panic!("Expected Update op"),
    }
}

#[test]
fn test_delta_entry_delete() {
    let delta = DeltaEntry::delete(3, "/docs/readme.txt");

    assert_eq!(delta.seq, 3);
    assert!(matches!(delta.op, DeltaOp::Delete));
}

#[test]
fn test_delta_log() {
    let mut log = DeltaLog::new("test_shard");

    assert!(log.is_empty());
    assert_eq!(log.len(), 0);

    log.push(DeltaEntry::delete(1, "/test"));

    assert!(!log.is_empty());
    assert_eq!(log.len(), 1);
    assert_eq!(log.to_version, 1);
}

#[test]
fn test_delta_log_should_compact() {
    let mut log = DeltaLog::new("test");

    for i in 0..MAX_DELTAS {
        log.push(DeltaEntry::delete(i as u64, "/test"));
    }

    assert!(log.should_compact());
}

#[test]
fn test_apply_delta_create() {
    let mut root = create_test_tree();
    let new_file = CatalogNode::new_file(10, "new.txt".to_string(), 50, None);
    let delta = DeltaEntry::create(1, "/docs", new_file);

    assert!(apply_delta(&mut root, &delta));

    let docs = root.find_child("docs").unwrap();
    assert!(docs.find_child("new.txt").is_some());
}

#[test]
fn test_apply_delta_update() {
    let mut root = create_test_tree();
    let fields = PartialNode {
        size: Some(999),
        ..Default::default()
    };
    let delta = DeltaEntry::update(1, "/docs/readme.txt", fields);

    assert!(apply_delta(&mut root, &delta));

    let docs = root.find_child("docs").unwrap();
    let readme = docs.find_child("readme.txt").unwrap();
    assert_eq!(readme.size, 999);
}

#[test]
fn test_apply_delta_delete() {
    let mut root = create_test_tree();
    let delta = DeltaEntry::delete(1, "/docs/readme.txt");

    assert!(apply_delta(&mut root, &delta));

    let docs = root.find_child("docs").unwrap();
    assert!(docs.find_child("readme.txt").is_none());
}

#[test]
fn test_apply_delta_move() {
    let mut root = create_test_tree();
    let delta = DeltaEntry::move_node(1, "/docs/readme.txt", "/images", None);

    assert!(apply_delta(&mut root, &delta));

    let docs = root.find_child("docs").unwrap();
    assert!(docs.find_child("readme.txt").is_none());

    let images = root.find_child("images").unwrap();
    assert!(images.find_child("readme.txt").is_some());
}

#[test]
fn test_apply_delta_move_with_rename() {
    let mut root = create_test_tree();
    let delta = DeltaEntry::move_node(
        1,
        "/docs/readme.txt",
        "/images",
        Some("moved.txt".to_string()),
    );

    assert!(apply_delta(&mut root, &delta));

    let images = root.find_child("images").unwrap();
    assert!(images.find_child("moved.txt").is_some());
    assert!(images.find_child("readme.txt").is_none());
}

#[test]
fn test_apply_deltas_multiple() {
    let mut root = create_test_tree();
    let deltas = vec![
        DeltaEntry::create(
            1,
            "/docs",
            CatalogNode::new_file(10, "a.txt".to_string(), 10, None),
        ),
        DeltaEntry::create(
            2,
            "/docs",
            CatalogNode::new_file(11, "b.txt".to_string(), 20, None),
        ),
        DeltaEntry::delete(3, "/docs/readme.txt"),
    ];

    let applied = apply_deltas(&mut root, &deltas);

    assert_eq!(applied, 3);

    let docs = root.find_child("docs").unwrap();
    assert!(docs.find_child("a.txt").is_some());
    assert!(docs.find_child("b.txt").is_some());
    assert!(docs.find_child("readme.txt").is_none());
}

#[test]
fn test_find_node_mut_root() {
    let mut root = create_test_tree();

    let found = find_node_mut(&mut root, "/");
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "/");
}

#[test]
fn test_find_node_mut_nested() {
    let mut root = create_test_tree();

    let found = find_node_mut(&mut root, "/docs/readme.txt");
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "readme.txt");
}

#[test]
fn test_find_node_mut_not_found() {
    let mut root = create_test_tree();

    let found = find_node_mut(&mut root, "/nonexistent/path");
    assert!(found.is_none());
}
