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
