use super::fixtures::*;
use super::*;

fn derivative_write_request(node_id: u64, source_version: u64) -> CatalogDerivativeWriteRequest {
    CatalogDerivativeWriteRequest {
        node_id,
        source_version,
        tier: "preview".to_string(),
        version: 1,
        size: 5,
        name: "photo.webp".to_string(),
        mime_type: "image/webp".to_string(),
        file_extension: "webp".to_string(),
        chunk_size: 2,
    }
}

fn expect_derivative_split_snapshot_error(
    router: &mut RpcRouter,
    request: CatalogDerivativeWriteRequest,
    expected_code: &str,
    expected_message: &str,
) {
    let error = match router.snapshot_catalog_derivative_write(request) {
        Ok(_) => panic!("expected derivative split snapshot error"),
        Err(error) => error,
    };
    assert_eq!(error.code(), Some(expected_code));
    assert_eq!(error.message(), expected_message);
}

#[test]
fn test_catalog_derivative_split_snapshot_error_contracts() {
    let (mut locked_router, _locked_temp_dir) = create_test_router();
    expect_derivative_split_snapshot_error(
        &mut locked_router,
        derivative_write_request(1, 0),
        "VAULT_REQUIRED",
        "Vault not unlocked",
    );

    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    expect_derivative_split_snapshot_error(
        &mut router,
        derivative_write_request(999_999, 0),
        "NODE_NOT_FOUND",
        "Node not found",
    );

    let dir = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "derivatives"}),
    ));
    let dir_id = dir
        .result()
        .expect("create dir result")
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("dir node id");
    expect_derivative_split_snapshot_error(
        &mut router,
        derivative_write_request(dir_id, 0),
        "ERR_NOT_FILE",
        "Node is not a file",
    );

    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "photo.jpg", b"source", 2);
    expect_derivative_split_snapshot_error(
        &mut router,
        derivative_write_request(node_id, source_revision + 1),
        "ERR_MEDIA_STREAM_STALE",
        "stale source revision",
    );

    let guarded_node_id = crate::rpc::commands::with_system_shard_guard_bypass(|| {
        router.handle(&RpcRequest::new(
            "catalog:createDir",
            serde_json::json!({"name": ".passmanager"}),
        ));
        let upload = router.handle_with_stream(
            &RpcRequest::new(
                "catalog:upload",
                serde_json::json!({
                    "parent_path": "/.passmanager",
                    "name": "guarded.jpg",
                    "total_size": 1,
                    "size": 1,
                    "offset": 0,
                    "mime_type": "image/jpeg",
                }),
            ),
            Some(RpcInputStream::from_bytes(vec![0])),
        );
        let RpcReply::Json(response) = upload else {
            panic!("catalog:upload must return JSON response");
        };
        response
            .result()
            .unwrap()
            .get("node_id")
            .and_then(|value| value.as_u64())
            .expect("guarded node id")
    });
    expect_derivative_split_snapshot_error(
        &mut router,
        derivative_write_request(guarded_node_id, 0),
        "ACCESS_DENIED",
        "Access denied",
    );
}

#[test]
fn test_catalog_derivative_split_commit_indexes_written_chunks() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "photo.jpg", b"source", 2);
    let snapshot = router
        .snapshot_catalog_derivative_write(derivative_write_request(node_id, source_revision))
        .expect("derivative write snapshot");
    let write_result =
        write_catalog_derivative_snapshot(&snapshot, b"abcde", || false).expect("write chunks");
    let commit = router
        .commit_catalog_derivative_write(&snapshot, &write_result)
        .expect("commit response");

    assert_eq!(
        commit.get("stale").and_then(|value| value.as_bool()),
        Some(false)
    );
    assert_eq!(
        read_test_derivative(&mut router, node_id, source_revision),
        Some(b"abcde".to_vec())
    );
}

#[test]
fn test_catalog_derivative_split_commit_skips_stale_source_revision() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "photo.jpg", b"source", 2);
    let snapshot = router
        .snapshot_catalog_derivative_write(derivative_write_request(node_id, source_revision))
        .expect("derivative write snapshot");
    let write_result =
        write_catalog_derivative_snapshot(&snapshot, b"abcde", || false).expect("write chunks");
    {
        let session = router.session.as_mut().expect("unlocked session");
        let node = session
            .catalog_mut()
            .find_by_id_mut(node_id)
            .expect("uploaded node");
        node.source_revision = source_revision + 1;
    }
    let result = router
        .commit_catalog_derivative_write(&snapshot, &write_result)
        .expect("stale commit response");

    assert_eq!(
        result.get("stale").and_then(|value| value.as_bool()),
        Some(true)
    );
    assert_eq!(
        read_test_derivative(&mut router, node_id, source_revision),
        None
    );
}

fn derivative_stats(router: &mut RpcRouter) -> (usize, u64) {
    let stats = router.handle(&RpcRequest::new(
        "catalog:derivative:stats",
        serde_json::json!({}),
    ));
    let result = stats.result().expect("derivative stats result");
    (
        result
            .get("indexed_count")
            .and_then(|value| value.as_u64())
            .expect("indexed count") as usize,
        result
            .get("indexed_bytes")
            .and_then(|value| value.as_u64())
            .expect("indexed bytes"),
    )
}

fn compact_derivatives_rpc(
    router: &mut RpcRouter,
    node_id: u64,
    max_indexed_bytes: u64,
) -> (usize, u64) {
    let compact = router.handle(&RpcRequest::new(
        "catalog:derivative:compact",
        serde_json::json!({
            "max_indexed_bytes": max_indexed_bytes,
            "protected_revisions": [
                {
                    "node_id": node_id,
                    "source_revision": 3
                }
            ],
        }),
    ));
    let result = compact.result().expect("compact derivatives result");
    (
        result
            .get("indexed_count")
            .and_then(|value| value.as_u64())
            .expect("indexed count") as usize,
        result
            .get("indexed_bytes")
            .and_then(|value| value.as_u64())
            .expect("indexed bytes"),
    )
}

fn expect_derivative_write_error_message(
    router: &mut RpcRouter,
    data: serde_json::Value,
    stream: Option<RpcInputStream>,
    expected_code: &str,
    expected_message: &str,
) {
    let reply =
        router.handle_with_stream(&RpcRequest::new("catalog:derivative:write", data), stream);
    match reply {
        RpcReply::Json(RpcResponse::Error { code, error, .. }) => {
            assert_eq!(code.as_deref(), Some(expected_code));
            assert_eq!(error, expected_message);
        }
        RpcReply::Json(RpcResponse::Success { .. })
        | RpcReply::Stream(_)
        | RpcReply::RangeStream(_) => panic!("expected {expected_code} error"),
    }
}

fn expect_derivative_read_error_message(
    router: &mut RpcRouter,
    data: serde_json::Value,
    expected_code: &str,
    expected_message: &str,
) {
    let reply = router.handle_with_stream(&RpcRequest::new("catalog:derivative:read", data), None);
    match reply {
        RpcReply::Json(RpcResponse::Error { code, error, .. }) => {
            assert_eq!(code.as_deref(), Some(expected_code));
            assert_eq!(error, expected_message);
        }
        RpcReply::Json(RpcResponse::Success { .. })
        | RpcReply::Stream(_)
        | RpcReply::RangeStream(_) => panic!("expected {expected_code} error"),
    }
}

#[test]
fn test_catalog_derivative_stream_roundtrip_and_version_isolation() {
    let (mut router, _temp_dir) = create_test_router();

    router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));

    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    let write = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:write",
            serde_json::json!({
                "node_id": node_id,
                "source_version": 100,
                "tier": "preview",
                "version": 1,
                "size": 5,
                "name": "photo.jpg",
                "mime_type": "image/jpeg",
                "file_extension": "jpg",
                "chunk_size": 2,
            }),
        ),
        Some(RpcInputStream::from_bytes(b"hello".to_vec())),
    );
    assert!(matches!(write, RpcReply::Json(RpcResponse::Success { .. })));

    let read = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:read",
            serde_json::json!({
                "node_id": node_id,
                "source_version": 100,
                "tier": "preview",
                "version": 1,
            }),
        ),
        None,
    );
    let mut bytes = Vec::new();
    match read {
        RpcReply::Stream(out) => {
            assert_eq!(out.meta.name, "photo.jpg");
            assert_eq!(out.meta.mime_type, "image/jpeg");
            let mut reader = out.reader;
            reader
                .read_to_end(&mut bytes)
                .expect("read derivative stream");
        }
        RpcReply::Json(_) => panic!("expected derivative stream"),
        RpcReply::RangeStream(_) => panic!("expected derivative stream"),
    }
    assert_eq!(bytes, b"hello");

    let missing = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:read",
            serde_json::json!({
                "node_id": node_id,
                "source_version": 101,
                "tier": "preview",
                "version": 1,
            }),
        ),
        None,
    );
    match missing {
        RpcReply::Json(RpcResponse::Error { code, error, .. }) => {
            assert_eq!(code.as_deref(), Some("NODE_NOT_FOUND"));
            assert_eq!(error, "Derivative not found");
        }
        RpcReply::Stream(_)
        | RpcReply::RangeStream(_)
        | RpcReply::Json(RpcResponse::Success { .. }) => {
            panic!("expected missing derivative error")
        }
    }
}

#[test]
fn test_catalog_derivative_stream_error_contracts() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    expect_derivative_write_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "tier": "preview",
            "size": 1,
            "name": "photo.jpg",
            "mime_type": "image/jpeg",
            "file_extension": "jpg",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "EMPTY_PAYLOAD",
        "version is required",
    );
    expect_derivative_read_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "version": 0,
            "tier": "preview",
        }),
        "EMPTY_PAYLOAD",
        "version is required",
    );
    expect_derivative_write_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "version": 1,
            "tier": "full",
            "size": 1,
            "name": "photo.jpg",
            "mime_type": "image/jpeg",
            "file_extension": "jpg",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "EMPTY_PAYLOAD",
        "tier must be thumbnail, preview, or metadata",
    );
    expect_derivative_write_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "version": 1,
            "tier": "preview",
            "size": 1,
            "name": "photo.jpg",
            "mime_type": "image/jpeg",
            "file_extension": "jpg",
        }),
        None,
        "NO_STREAM",
        "No incoming stream",
    );
    expect_derivative_write_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "version": 1,
            "tier": "preview",
            "size": 2,
            "name": "photo.jpg",
            "mime_type": "image/jpeg",
            "file_extension": "jpg",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "INTERNAL_ERROR",
        "Size mismatch",
    );
    expect_derivative_write_error_message(
        &mut router,
        serde_json::json!({
            "node_id": 999_999_u64,
            "version": 1,
            "tier": "preview",
            "size": 1,
            "name": "photo.jpg",
            "mime_type": "image/jpeg",
            "file_extension": "jpg",
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
    expect_derivative_write_error_message(
        &mut router,
        serde_json::json!({
            "node_id": dir_id,
            "version": 1,
            "tier": "preview",
            "size": 1,
            "name": "photo.jpg",
            "mime_type": "image/jpeg",
            "file_extension": "jpg",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "INTERNAL_ERROR",
        "Node is not a file",
    );

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
    expect_derivative_write_error_message(
        &mut router,
        serde_json::json!({
            "node_id": guarded_id,
            "version": 1,
            "tier": "metadata",
            "size": 1,
            "name": "meta.json",
            "mime_type": "application/json",
            "file_extension": "json",
        }),
        Some(RpcInputStream::from_bytes(b"x".to_vec())),
        "ACCESS_DENIED",
        "Access denied",
    );
    expect_derivative_read_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "version": 1,
            "tier": "preview",
        }),
        "NODE_NOT_FOUND",
        "Derivative not found",
    );
}

#[test]
fn test_catalog_derivative_metadata_tier_roundtrip() {
    let (mut router, _temp_dir) = create_test_router();

    router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));

    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);
    let payload = br#"{"sourceRevision":5,"width":12,"height":7}"#;

    let write = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:write",
            serde_json::json!({
                "node_id": node_id,
                "source_version": 5,
                "tier": "metadata",
                "version": 1,
                "size": payload.len(),
                "name": "image-metadata.json",
                "mime_type": "application/vnd.chromvoid.image-metadata+json",
                "file_extension": "json",
                "chunk_size": 16,
            }),
        ),
        Some(RpcInputStream::from_bytes(payload.to_vec())),
    );
    assert!(matches!(write, RpcReply::Json(RpcResponse::Success { .. })));

    let read = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:read",
            serde_json::json!({
                "node_id": node_id,
                "source_version": 5,
                "tier": "metadata",
                "version": 1,
            }),
        ),
        None,
    );
    match read {
        RpcReply::Stream(out) => {
            assert_eq!(
                out.meta.mime_type,
                "application/vnd.chromvoid.image-metadata+json"
            );
            let mut reader = out.reader;
            let mut bytes = Vec::new();
            reader.read_to_end(&mut bytes).expect("read metadata cache");
            assert_eq!(bytes, payload);
        }
        RpcReply::Json(_) | RpcReply::RangeStream(_) => {
            panic!("expected metadata cache stream")
        }
    }
}

#[test]
fn test_catalog_derivative_index_stats_and_delete_cleanup() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    write_test_derivative(&mut router, node_id, 100, b"hello");
    assert_eq!(derivative_stats(&mut router), (1, 5));

    let vault_key = *router.session.as_ref().unwrap().vault_key();
    let meta_chunk_name =
        crate::crypto::derivative_meta_chunk_name(&vault_key, node_id, 100, "preview", 1);
    let part0_chunk_name =
        crate::crypto::derivative_chunk_name(&vault_key, node_id, 100, "preview", 1, 0);
    assert!(router.storage.chunk_exists(&meta_chunk_name).unwrap());
    assert!(router.storage.chunk_exists(&part0_chunk_name).unwrap());

    let deleted = router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": node_id}),
    ));
    assert!(deleted.is_ok());

    assert_eq!(derivative_stats(&mut router), (0, 0));
    assert!(!router.storage.chunk_exists(&meta_chunk_name).unwrap());
    assert!(!router.storage.chunk_exists(&part0_chunk_name).unwrap());
}

#[test]
fn test_catalog_derivative_index_source_revision_invalidation() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    write_test_derivative(&mut router, node_id, 100, b"hello");
    assert_eq!(
        read_test_derivative(&mut router, node_id, 100).unwrap(),
        b"hello"
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

    assert_eq!(derivative_stats(&mut router), (0, 0));
    assert!(read_test_derivative(&mut router, node_id, 100).is_none());
}

#[test]
fn test_catalog_derivative_touch_updates_compact_order_before_disk_flush() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    write_test_derivative(&mut router, node_id, 1, b"old1");
    std::thread::sleep(Duration::from_millis(5));
    write_test_derivative(&mut router, node_id, 2, b"old2");
    std::thread::sleep(Duration::from_millis(5));

    assert_eq!(
        read_test_derivative(&mut router, node_id, 1).unwrap(),
        b"old1"
    );
    assert_eq!(compact_derivatives_rpc(&mut router, node_id, 4), (1, 4));
    assert_eq!(
        read_test_derivative(&mut router, node_id, 1).unwrap(),
        b"old1"
    );
    assert!(read_test_derivative(&mut router, node_id, 2).is_none());
}

#[test]
fn test_catalog_derivative_touch_flushes_on_vault_lock_for_fresh_router() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    write_test_derivative(&mut router, node_id, 1, b"old1");
    std::thread::sleep(Duration::from_millis(5));
    write_test_derivative(&mut router, node_id, 2, b"old2");
    std::thread::sleep(Duration::from_millis(5));
    assert_eq!(
        read_test_derivative(&mut router, node_id, 1).unwrap(),
        b"old1"
    );

    let locked = router.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
    assert!(locked.is_ok());
    drop(router);

    let storage = Storage::new(temp_dir.path()).expect("reopen storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    unlock_test_router(&mut reopened);

    assert_eq!(compact_derivatives_rpc(&mut reopened, node_id, 4), (1, 4));
    assert_eq!(
        read_test_derivative(&mut reopened, node_id, 1).unwrap(),
        b"old1"
    );
    assert!(read_test_derivative(&mut reopened, node_id, 2).is_none());
}

#[test]
fn test_catalog_derivative_touch_flushes_before_storage_gc_scan() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    write_test_derivative(&mut router, node_id, 1, b"old1");
    std::thread::sleep(Duration::from_millis(5));
    write_test_derivative(&mut router, node_id, 2, b"old2");
    std::thread::sleep(Duration::from_millis(5));
    assert_eq!(
        read_test_derivative(&mut router, node_id, 1).unwrap(),
        b"old1"
    );

    let scan = router.handle(&RpcRequest::new(
        "admin:storage:gc:scan",
        serde_json::json!({}),
    ));
    assert!(scan.is_ok());
    drop(router);

    let storage = Storage::new(temp_dir.path()).expect("reopen storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    unlock_test_router(&mut reopened);

    assert_eq!(compact_derivatives_rpc(&mut reopened, node_id, 4), (1, 4));
    assert_eq!(
        read_test_derivative(&mut reopened, node_id, 1).unwrap(),
        b"old1"
    );
    assert!(read_test_derivative(&mut reopened, node_id, 2).is_none());
}

#[test]
fn test_catalog_derivative_index_quota_trim_order_and_current_protection() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);

    write_test_derivative(&mut router, node_id, 1, b"old1");
    std::thread::sleep(Duration::from_millis(5));
    write_test_derivative(&mut router, node_id, 2, b"old2");
    std::thread::sleep(Duration::from_millis(5));
    write_test_derivative(&mut router, node_id, 3, b"currentten");
    assert_eq!(derivative_stats(&mut router), (3, 18));

    let vault_key = *router.session.as_ref().unwrap().vault_key();
    let mut protected_revisions = HashMap::new();
    protected_revisions.insert(node_id, 3);
    let stats = crate::rpc::derivative_index::compact_derivatives(
        &router.storage,
        &vault_key,
        14,
        &protected_revisions,
    )
    .expect("compact derivatives");
    assert_eq!(stats.indexed_count, 2);
    assert_eq!(stats.indexed_bytes, 14);
    assert!(read_test_derivative(&mut router, node_id, 1).is_none());
    assert_eq!(
        read_test_derivative(&mut router, node_id, 2).unwrap(),
        b"old2"
    );
    assert_eq!(
        read_test_derivative(&mut router, node_id, 3).unwrap(),
        b"currentten"
    );

    let stats = crate::rpc::derivative_index::compact_derivatives(
        &router.storage,
        &vault_key,
        0,
        &protected_revisions,
    )
    .expect("compact derivatives");
    assert_eq!(stats.indexed_count, 1);
    assert_eq!(stats.indexed_bytes, 10);
    assert_eq!(
        read_test_derivative(&mut router, node_id, 3).unwrap(),
        b"currentten"
    );
}

#[test]
fn test_catalog_derivative_index_leaves_legacy_unindexed_chunks() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let node_id = prepare_test_image(&mut router, "photo.jpg", 3);
    let vault_key = *router.session.as_ref().unwrap().vault_key();
    let meta_chunk_name =
        crate::crypto::derivative_meta_chunk_name(&vault_key, node_id, 100, "preview", 1);
    let part0_chunk_name =
        crate::crypto::derivative_chunk_name(&vault_key, node_id, 100, "preview", 1, 0);

    let encrypted_meta =
        crate::crypto::encrypt(b"legacy-meta", &vault_key, meta_chunk_name.as_bytes()).unwrap();
    router
        .storage
        .write_chunk(&meta_chunk_name, &encrypted_meta)
        .unwrap();
    let encrypted_part =
        crate::crypto::encrypt(b"legacy-part", &vault_key, part0_chunk_name.as_bytes()).unwrap();
    router
        .storage
        .write_chunk(&part0_chunk_name, &encrypted_part)
        .unwrap();
    assert_eq!(derivative_stats(&mut router), (0, 0));

    let deleted = router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": node_id}),
    ));
    assert!(deleted.is_ok());

    assert!(router.storage.chunk_exists(&meta_chunk_name).unwrap());
    assert!(router.storage.chunk_exists(&part0_chunk_name).unwrap());
    assert_eq!(derivative_stats(&mut router), (0, 0));
}
