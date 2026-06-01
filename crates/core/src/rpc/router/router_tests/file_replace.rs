use super::fixtures::*;
use super::*;

#[test]
fn test_catalog_file_replace_clears_media_info_until_on_demand_inspect() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let audio_bytes = minimal_mp4(&["soun"]);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "podcast.mp4", &audio_bytes, 16);
    assert_eq!(
        media_info_kind(&catalog_source_metadata(&mut router, node_id)),
        None
    );
    let inspect = router.handle(&RpcRequest::new(
        "catalog:media:inspect",
        serde_json::json!({"node_id": node_id}),
    ));
    let inspect = inspect.result().expect("inspect result");
    assert_eq!(media_info_kind(inspect), Some("audio"));
    assert_eq!(
        media_info_kind(&catalog_source_metadata(&mut router, node_id)),
        Some("audio")
    );

    let video_bytes = minimal_mp4(&["vide"]);
    let result = replace_test_file_with_mime(
        &mut router,
        node_id,
        &video_bytes,
        "video/mp4",
        Some(source_revision),
        Some("fail_if_stale"),
    );
    assert_eq!(media_info_kind(&result), None);
    assert_eq!(media_inspected_revision(&result), Some(0));
    let next_revision = result
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");
    let metadata = catalog_source_metadata(&mut router, node_id);
    assert_eq!(media_info_kind(&metadata), None);
    assert_eq!(media_inspected_revision(&metadata), Some(0));

    let inspect = router.handle(&RpcRequest::new(
        "catalog:media:inspect",
        serde_json::json!({"node_id": node_id}),
    ));
    let inspect = inspect.result().expect("inspect result");
    assert_eq!(media_info_kind(inspect), Some("video"));
    assert_eq!(media_inspected_revision(inspect), Some(next_revision));

    let invalid_result = replace_test_file_with_mime(
        &mut router,
        node_id,
        b"not an mp4",
        "video/mp4",
        Some(next_revision),
        Some("fail_if_stale"),
    );
    assert!(invalid_result
        .get("media_info")
        .is_some_and(|value| value.is_null()));
    assert_eq!(media_inspected_revision(&invalid_result), Some(0));
    assert!(catalog_source_metadata(&mut router, node_id)
        .get("media_info")
        .is_none());
    assert_eq!(
        media_inspected_revision(&catalog_source_metadata(&mut router, node_id)),
        Some(0)
    );
}

#[test]
fn test_catalog_file_replace_same_larger_smaller_and_empty() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, mut source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "notes.md", b"abcdefghij", 4);

    for bytes in [
        b"0123456789".as_slice(),
        b"0123456789ab".as_slice(),
        b"xyz".as_slice(),
        b"".as_slice(),
    ] {
        let result = replace_test_file(
            &mut router,
            node_id,
            bytes,
            Some(source_revision),
            Some("fail_if_stale"),
        );
        assert_eq!(
            result.get("node_id").and_then(|value| value.as_u64()),
            Some(node_id)
        );
        assert_eq!(
            result.get("size").and_then(|value| value.as_u64()),
            Some(bytes.len() as u64)
        );
        assert_eq!(
            result.get("mime_type").and_then(|value| value.as_str()),
            Some("text/markdown")
        );
        let next_revision = result
            .get("source_revision")
            .and_then(|value| value.as_u64())
            .expect("source revision");
        assert!(next_revision > source_revision);
        source_revision = next_revision;

        let (meta, downloaded) = read_catalog_download(&mut router, node_id);
        assert_eq!(downloaded, bytes);
        assert_eq!(meta.size, bytes.len() as u64);
        assert_eq!(meta.mime_type, "text/markdown");
        assert!(!router.has_catalog_file_replace_transaction_marker());

        let metadata = router.handle(&RpcRequest::new(
            "catalog:source:metadata",
            serde_json::json!({"node_id": node_id}),
        ));
        assert_eq!(
            metadata
                .result()
                .unwrap()
                .get("size")
                .and_then(|value| value.as_u64()),
            Some(bytes.len() as u64)
        );
        assert_eq!(
            metadata
                .result()
                .unwrap()
                .get("source_revision")
                .and_then(|value| value.as_u64()),
            Some(source_revision)
        );
    }
}

#[test]
fn test_catalog_file_replace_recovers_uncommitted_canonical_commit() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "notes.md", b"original", 4);
    router.save().expect("persist original catalog");

    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:file:replace",
            serde_json::json!({
                "node_id": node_id,
                "size": 7,
                "mime_type": "text/markdown",
                "expected_source_revision": source_revision,
                "conflict_mode": "fail_if_stale",
                "debug_crash_after_canonical_commit": true,
            }),
        ),
        Some(RpcInputStream::from_bytes(b"changed".to_vec())),
    );
    assert!(matches!(reply, RpcReply::Json(RpcResponse::Error { .. })));
    assert!(router.has_catalog_file_replace_transaction_marker());
    drop(router);

    let storage = Storage::new(temp_dir.path()).expect("failed to reopen storage");
    let mut recovered = RpcRouter::new(storage).with_keystore(keystore);
    unlock_test_router(&mut recovered);
    assert!(!recovered.has_catalog_file_replace_transaction_marker());
    let (meta, bytes) = read_catalog_download(&mut recovered, node_id);
    assert_eq!(bytes, b"original");
    assert_eq!(meta.size, 8);
    let metadata = recovered.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_eq!(
        metadata
            .result()
            .unwrap()
            .get("source_revision")
            .and_then(|value| value.as_u64()),
        Some(source_revision)
    );
}

#[test]
fn test_catalog_file_replace_recovers_committed_marker_cleanup() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "notes.md", b"original", 4);
    router.save().expect("persist original catalog");

    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:file:replace",
            serde_json::json!({
                "node_id": node_id,
                "size": 7,
                "mime_type": "text/markdown",
                "expected_source_revision": source_revision,
                "conflict_mode": "fail_if_stale",
                "debug_crash_after_catalog_save": true,
            }),
        ),
        Some(RpcInputStream::from_bytes(b"changed".to_vec())),
    );
    assert!(matches!(reply, RpcReply::Json(RpcResponse::Error { .. })));
    assert!(router.has_catalog_file_replace_transaction_marker());
    drop(router);

    let storage = Storage::new(temp_dir.path()).expect("failed to reopen storage");
    let mut recovered = RpcRouter::new(storage).with_keystore(keystore);
    unlock_test_router(&mut recovered);
    assert!(!recovered.has_catalog_file_replace_transaction_marker());
    let (meta, bytes) = read_catalog_download(&mut recovered, node_id);
    assert_eq!(bytes, b"changed");
    assert_eq!(meta.size, 7);
    let metadata = recovered.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    let recovered_revision = metadata
        .result()
        .unwrap()
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");
    assert!(recovered_revision > source_revision);
}

#[test]
fn test_catalog_file_replace_rejects_stale_source_and_allows_explicit_overwrite() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "notes.md", b"original", 4);

    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "size": 5,
            "mime_type": "text/markdown",
            "expected_source_revision": source_revision.saturating_sub(1),
            "conflict_mode": "fail_if_stale",
        }),
        Some(RpcInputStream::from_bytes(b"stale".to_vec())),
        "ERR_STALE_SOURCE",
        "Source revision is stale",
    );
    let (_meta, bytes) = read_catalog_download(&mut router, node_id);
    assert_eq!(bytes, b"original");

    let result = replace_test_file(
        &mut router,
        node_id,
        b"forced",
        Some(source_revision.saturating_sub(1)),
        Some("overwrite"),
    );
    assert!(
        result
            .get("source_revision")
            .and_then(|value| value.as_u64())
            .unwrap()
            > source_revision
    );
    let (_meta, bytes) = read_catalog_download(&mut router, node_id);
    assert_eq!(bytes, b"forced");
}

#[test]
fn test_catalog_file_replace_rejects_required_fields_and_invalid_mode() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, _source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "notes.md", b"original", 4);

    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({"size": 1}),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "EMPTY_PAYLOAD",
        "node_id is required",
    );
    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({"node_id": node_id}),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "EMPTY_PAYLOAD",
        "size is required",
    );
    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "size": 1,
            "conflict_mode": "merge",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "EMPTY_PAYLOAD",
        "Invalid conflict_mode",
    );
}

#[test]
fn test_catalog_file_replace_rejects_invalid_targets_and_size_mismatch() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "notes.md", b"original", 4);

    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "size": 3,
            "mime_type": "text/markdown",
            "expected_source_revision": source_revision,
        }),
        None,
        "NO_STREAM",
        "No incoming stream",
    );

    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "size": 9,
            "mime_type": "text/markdown",
            "expected_source_revision": source_revision,
        }),
        Some(RpcInputStream::from_bytes(b"short".to_vec())),
        "ERR_SIZE_MISMATCH",
        "Size mismatch",
    );

    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({
            "node_id": 999_999,
            "size": 1,
            "mime_type": "text/markdown",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "NODE_NOT_FOUND",
        "Node not found",
    );

    let created = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"parent_path": "/", "name": "folder"}),
    ));
    let dir_id = created
        .result()
        .unwrap()
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("dir id");
    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({
            "node_id": dir_id,
            "size": 1,
            "mime_type": "text/markdown",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "ERR_NOT_FILE",
        "Node is not a file",
    );
}

#[test]
fn test_catalog_file_replace_rejects_guarded_system_path() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let guarded_id = {
        let session = router.session.as_mut().expect("session");
        session
            .catalog_mut()
            .create_dir("/", ".passmanager")
            .expect("system dir");
        session
            .catalog_mut()
            .create_file(
                "/.passmanager",
                "meta.json",
                1,
                Some("application/json".to_string()),
            )
            .expect("system file")
    };

    expect_catalog_file_replace_error_message(
        &mut router,
        serde_json::json!({
            "node_id": guarded_id,
            "size": 1,
            "mime_type": "application/json",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "ACCESS_DENIED",
        "Access denied",
    );
}
