use super::fixtures::*;
use super::*;

#[test]
fn test_catalog_crud() {
    let (mut router, _temp_dir) = create_test_router();

    let unlock = RpcRequest::new("vault:unlock", serde_json::json!({"password": "test"}));
    router.handle(&unlock);

    let create_dir = RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "documents"}),
    );
    let response = router.handle(&create_dir);
    assert!(response.is_ok());

    let node_id = response
        .result()
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();
    assert!(node_id > 0);

    let list = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&list);
    assert!(response.is_ok());

    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].get("name").unwrap().as_str().unwrap(), "documents");

    let rename = RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": node_id, "new_name": "docs"}),
    );
    let response = router.handle(&rename);
    assert!(response.is_ok());

    let list = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&list);
    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert_eq!(items[0].get("name").unwrap().as_str().unwrap(), "docs");

    let delete = RpcRequest::new("catalog:delete", serde_json::json!({"node_id": node_id}));
    let response = router.handle(&delete);
    assert!(response.is_ok());

    let list = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&list);
    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert!(items.is_empty());
}

#[test]
fn test_catalog_sync_manifest() {
    let (mut router, _temp_dir) = create_test_router();

    let unlock = RpcRequest::new("vault:unlock", serde_json::json!({"password": "test"}));
    router.handle(&unlock);

    router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "docs"}),
    ));

    let sync = RpcRequest::new("catalog:sync:manifest", serde_json::json!({}));
    let response = router.handle(&sync);
    assert!(response.is_ok());

    let result = response.result().unwrap();
    assert_eq!(
        result.get("format").and_then(|v| v.as_str()),
        Some("manifest")
    );
    assert!(result.get("root_version").is_some());
    assert!(result.get("shards").is_some());
    assert!(result.get("eager_data").is_some());
}

#[test]
fn test_catalog_source_revision_metadata_and_upload_bump() {
    let (mut router, _temp_dir) = create_test_router();

    router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));

    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    {
        let session = router.session.as_mut().expect("unlocked session");
        let node = session
            .catalog_mut()
            .find_by_id_mut(node_id)
            .expect("uploaded node");
        node.source_revision = 0;
    }

    let first_metadata = router.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    let first_revision = first_metadata
        .result()
        .unwrap()
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");
    assert!(first_revision > 0);
    assert_eq!(
        first_metadata
            .result()
            .unwrap()
            .get("source_revision_initialized")
            .and_then(|value| value.as_bool()),
        Some(true)
    );

    let repeated_metadata = router.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_eq!(
        repeated_metadata
            .result()
            .unwrap()
            .get("source_revision_initialized")
            .and_then(|value| value.as_bool()),
        Some(false)
    );

    let upload = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "node_id": node_id,
                "size": 3,
                "offset": 0,
            }),
        ),
        Some(RpcInputStream::from_bytes(b"abc".to_vec())),
    );
    assert!(matches!(
        upload,
        RpcReply::Json(RpcResponse::Success { .. })
    ));

    let second_metadata = router.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    let second_revision = second_metadata
        .result()
        .unwrap()
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");

    assert!(second_revision > first_revision);
    assert_eq!(
        second_metadata
            .result()
            .unwrap()
            .get("source_revision_initialized")
            .and_then(|value| value.as_bool()),
        Some(false)
    );

    router.handle(&RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": node_id, "new_name": "renamed.jpg"}),
    ));
    let renamed_metadata = router.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    let renamed_revision = renamed_metadata
        .result()
        .unwrap()
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");
    assert_eq!(renamed_revision, second_revision);
}

#[test]
fn test_catalog_list_item_includes_source_revision() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    let (_node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "notes.txt", b"hello", 4);

    let response = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/"}),
    ));
    let items = response
        .result()
        .unwrap()
        .get("items")
        .and_then(|value| value.as_array())
        .expect("items");

    assert_eq!(
        items[0]
            .get("source_revision")
            .and_then(|value| value.as_u64()),
        Some(source_revision)
    );
}

#[test]
fn test_catalog_trash_list_restore_and_empty() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "report.txt", b"hello", 4);

    let trash = router.handle(&RpcRequest::new(
        "catalog:trash",
        serde_json::json!({"node_id": node_id}),
    ));
    assert!(trash.is_ok());
    assert_eq!(
        trash
            .result()
            .unwrap()
            .get("original_path")
            .and_then(|value| value.as_str()),
        Some("/report.txt")
    );

    let root_list = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/"}),
    ));
    assert!(root_list
        .result()
        .unwrap()
        .get("items")
        .and_then(|value| value.as_array())
        .expect("items")
        .is_empty());

    let generic_trash_list = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/.trash"}),
    ));
    assert!(!generic_trash_list.is_ok());
    assert_eq!(generic_trash_list.code(), Some("ACCESS_DENIED"));

    let trash_list = router.handle(&RpcRequest::new(
        "catalog:trash:list",
        serde_json::json!({}),
    ));
    let trash_items = trash_list
        .result()
        .unwrap()
        .get("items")
        .and_then(|value| value.as_array())
        .expect("trash items");
    assert_eq!(trash_items.len(), 1);
    assert_eq!(
        trash_items[0].get("name").and_then(|value| value.as_str()),
        Some("report.txt")
    );
    assert_eq!(
        trash_items[0]
            .get("source_revision")
            .and_then(|value| value.as_u64()),
        Some(source_revision)
    );

    let restore = router.handle(&RpcRequest::new(
        "catalog:trash:restore",
        serde_json::json!({"node_id": node_id}),
    ));
    assert!(restore.is_ok());
    assert_eq!(
        restore
            .result()
            .unwrap()
            .get("restored_path")
            .and_then(|value| value.as_str()),
        Some("/report.txt")
    );

    router.handle(&RpcRequest::new(
        "catalog:trash",
        serde_json::json!({"node_id": node_id}),
    ));
    let empty = router.handle(&RpcRequest::new(
        "catalog:trash:empty",
        serde_json::json!({}),
    ));
    assert!(empty.is_ok());
    assert_eq!(
        empty
            .result()
            .unwrap()
            .get("removed")
            .and_then(|value| value.as_u64()),
        Some(1)
    );
    assert!(router
        .handle(&RpcRequest::new(
            "catalog:trash:list",
            serde_json::json!({})
        ))
        .result()
        .unwrap()
        .get("items")
        .and_then(|value| value.as_array())
        .expect("trash items")
        .is_empty());
}

#[test]
fn test_catalog_trash_restore_conflict_is_reversible() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    let (node_id, _source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "report.txt", b"hello", 4);
    router.handle(&RpcRequest::new(
        "catalog:trash",
        serde_json::json!({"node_id": node_id}),
    ));
    prepare_test_file_with_chunk_size(&mut router, "report.txt", b"new", 4);

    let restore = router.handle(&RpcRequest::new(
        "catalog:trash:restore",
        serde_json::json!({"node_id": node_id}),
    ));

    assert!(!restore.is_ok());
    assert_eq!(restore.code(), Some("NAME_EXIST"));
    let trash_list = router.handle(&RpcRequest::new(
        "catalog:trash:list",
        serde_json::json!({}),
    ));
    assert_eq!(
        trash_list
            .result()
            .unwrap()
            .get("items")
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(1)
    );
}

#[test]
fn test_catalog_exchange_swaps_nodes_atomically() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "left"}),
    ));
    router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "right"}),
    ));
    let left_id = upload_text_file_to(&mut router, "/left", "a.txt", b"a");
    let right_id = upload_text_file_to(&mut router, "/right", "b.txt", b"b");

    let exchange = router.handle(&RpcRequest::new(
        "catalog:exchange",
        serde_json::json!({
            "src_node_id": left_id,
            "dst_node_id": right_id,
        }),
    ));
    assert!(exchange.is_ok());

    let session = router.session().expect("session");
    assert_eq!(
        session.catalog().get_path(left_id).as_deref(),
        Some("/right/b.txt")
    );
    assert_eq!(
        session.catalog().get_path(right_id).as_deref(),
        Some("/left/a.txt")
    );
    assert!(session
        .catalog()
        .find_by_path("/.chromvoid-swap-left")
        .is_none());
}

fn upload_text_file_to(router: &mut RpcRouter, parent_path: &str, name: &str, bytes: &[u8]) -> u64 {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": parent_path,
                "name": name,
                "total_size": bytes.len(),
                "size": bytes.len(),
                "offset": 0,
                "mime_type": "text/plain",
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    );
    let RpcReply::Json(response) = reply else {
        panic!("catalog upload should return JSON");
    };
    response
        .result()
        .unwrap()
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("node id")
}
