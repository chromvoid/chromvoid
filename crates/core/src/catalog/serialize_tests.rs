use super::*;

#[test]
fn test_serialize_deserialize_roundtrip() {
    let mut root = CatalogNode::new_root();
    root.add_child(CatalogNode::new_dir(1, "docs".to_string()));
    root.add_child(CatalogNode::new_file(
        2,
        "readme.txt".to_string(),
        1024,
        Some("text/plain".to_string()),
    ));

    let serialized = serialize_catalog(&root, 42).expect("should serialize");
    let (deserialized, version) = deserialize_catalog(&serialized).expect("should deserialize");

    assert_eq!(version, 42);
    assert_eq!(deserialized.node_id, root.node_id);
    assert_eq!(deserialized.name, root.name);
    assert_eq!(deserialized.children().len(), root.children().len());
}

#[test]
fn test_json_format() {
    let root = CatalogNode::new_root();

    let json = serde_json::to_string_pretty(&CatalogEnvelope { version: 0, root })
        .expect("should serialize");

    assert!(json.contains("\"v\":"));
    assert!(json.contains("\"r\":"));
    assert!(json.contains("\"i\":"));
    assert!(json.contains("\"t\":"));
    assert!(json.contains("\"n\":"));
}

#[test]
fn test_optional_fields_skip() {
    let node = CatalogNode::new_dir(1, "test".to_string());

    let json = serde_json::to_string_pretty(&node).expect("should serialize");

    assert!(!json.contains("\"y\":"));
    assert!(!json.contains("\"l\":"));
}

#[test]
fn test_nested_structure() {
    let mut root = CatalogNode::new_root();
    let mut docs = CatalogNode::new_dir(1, "docs".to_string());
    docs.add_child(CatalogNode::new_file(2, "file1.txt".to_string(), 100, None));
    docs.add_child(CatalogNode::new_file(3, "file2.txt".to_string(), 200, None));
    root.add_child(docs);

    let serialized = serialize_catalog(&root, 1).expect("should serialize");
    let (deserialized, _version) = deserialize_catalog(&serialized).expect("should deserialize");

    let docs = deserialized.find_child("docs").expect("should find docs");
    assert_eq!(docs.children().len(), 2);
}
