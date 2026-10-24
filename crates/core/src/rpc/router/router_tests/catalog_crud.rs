use super::fixtures::*;
use super::*;

#[test]
fn save_snapshot_fallback_publishes_catalog_invalidation_without_persisted_deltas() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    {
        let session = router.session_mut().expect("unlocked session");
        session.catalog_mut().create_dir("/", "docs").expect("docs");
        session
            .catalog_mut()
            .create_dir("/docs", "existing")
            .expect("existing child");
    }
    router.save().expect("persist initial snapshot");
    assert!(router
        .handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})))
        .is_ok());
    let _ = router.take_events();

    {
        let session = router.session_mut().expect("unlocked session");
        let node_id = session
            .catalog_mut()
            .create_dir("/docs", "new")
            .expect("new child");
        // This cannot replay against the stored snapshot, so saving must persist
        // the changed catalog as a snapshot without reporting persisted deltas.
        session.record_delta(
            "docs",
            crate::catalog::DeltaEntry::move_node(0, "/new", "/missing", None)
                .with_node_id(node_id),
        );
        assert!(session.is_dirty());
    }

    router.save().expect("persist fallback snapshot");

    let events = router.take_events();
    assert_eq!(
        events.len(),
        2,
        "expected catalog invalidation and update:state: {events:?}"
    );
    assert_eq!(
        events[0],
        serde_json::json!({
            "command": "catalog:event",
            "data": {"type": "invalidate"}
        })
    );
    assert_eq!(events[1]["command"], "update:state");
    assert!(!router.session_mut().expect("unlocked session").is_dirty());

    // Persist MAX_DELTAS - 1 ordinary creates, then verify that the next
    // create refreshes consumers when compaction replaces the delta chain.
    {
        let session = router.session_mut().expect("unlocked session");
        for index in 0..crate::catalog::MAX_DELTAS - 1 {
            let node_id = session
                .catalog_mut()
                .create_dir("/docs", &format!("child-{index}"))
                .expect("child below delta limit");
            let node = session.catalog().find_by_id(node_id).unwrap().clone();
            session.record_delta("docs", crate::catalog::DeltaEntry::create(0, "/", node));
        }
    }
    router.save().expect("persist deltas below limit");
    let events = router.take_events();
    assert_eq!(events[0]["command"], "catalog:event:batch");
    assert_eq!(
        events[0]["data"]["events"].as_array().unwrap().len(),
        crate::catalog::MAX_DELTAS as usize
    );
    assert_eq!(
        events[0]["data"]["events"][crate::catalog::MAX_DELTAS as usize - 1],
        serde_json::json!({"type": "invalidate"})
    );

    assert!(router
        .handle(&RpcRequest::new(
            "catalog:createDir",
            serde_json::json!({
                "parent_path": "/docs",
                "name": "at-delta-limit"
            })
        ))
        .is_ok());
    let events = router.take_events();
    assert_eq!(events.len(), 2);
    assert_eq!(
        events[0],
        serde_json::json!({
            "command": "catalog:event",
            "data": {"type": "invalidate"}
        })
    );
    assert_eq!(events[1]["command"], "update:state");
    let manifest = router.handle(&RpcRequest::new(
        "catalog:sync:manifest",
        serde_json::json!({}),
    ));
    let docs = manifest.result().unwrap()["shards"]
        .as_array()
        .unwrap()
        .iter()
        .find(|shard| shard["shard_id"] == "docs")
        .unwrap();
    assert_eq!(
        docs["has_deltas"], false,
        "delta limit must persist a snapshot"
    );
}

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

#[test]
fn source_metadata_and_range_reads_persist_legacy_revision_once_without_repeated_writes() {
    use crate::storage::test_util::{fault_injecting_storage, StorageOperation};

    let root = TempDir::new().unwrap();
    let keystore = Arc::new(InMemoryKeystore::new());
    let (storage, operations) = fault_injecting_storage(root.path(), None).unwrap();
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "legacy.jpg", 3);
    router
        .session
        .as_mut()
        .unwrap()
        .catalog_mut()
        .find_by_id_mut(node_id)
        .unwrap()
        .source_revision = 0;
    router.save().unwrap();

    let metadata = catalog_source_metadata(&mut router, node_id);
    let revision = metadata["source_revision"].as_u64().unwrap();
    assert!(revision > 0);
    assert_eq!(metadata["source_revision_initialized"], true);

    // A fresh router must observe the initialized revision without relying on a
    // later save/lock of the original session.
    let mut reopened = RpcRouter::new(Storage::new(root.path()).unwrap()).with_keystore(keystore);
    unlock_test_router(&mut reopened);
    let persisted = catalog_source_metadata(&mut reopened, node_id);
    assert_eq!(persisted["source_revision"], revision);
    assert_eq!(persisted["source_revision_initialized"], false);

    let before = operations.operations().len();
    for _ in 0..3 {
        let (_, bytes) = read_catalog_download_range(&mut router, node_id, 0, 1, revision);
        assert_eq!(bytes, [0]);
        let repeated = catalog_source_metadata(&mut router, node_id);
        assert_eq!(repeated["source_revision"], revision);
        assert_eq!(repeated["source_revision_initialized"], false);
    }
    let recorded = operations.operations();
    let additional = &recorded[before..];
    assert!(
        additional.iter().all(|operation| matches!(
            operation,
            StorageOperation::ReadChunk
                | StorageOperation::ChunkLen
                | StorageOperation::ChunkExists
                | StorageOperation::ListChunks
                | StorageOperation::HasAnyChunk
                | StorageOperation::ReadArtifact
                | StorageOperation::ArtifactExists
        )),
        "Stable metadata must not write storage: {additional:?}"
    );
}
