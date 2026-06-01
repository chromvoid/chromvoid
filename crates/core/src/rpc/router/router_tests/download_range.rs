use super::fixtures::*;
use super::*;

#[test]
fn test_catalog_download_range_one_chunk() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);

    let (meta, bytes) = read_catalog_download_range(&mut router, node_id, 1, 2, source_revision);

    assert_eq!(bytes, b"bc");
    assert_eq!(meta.name, "clip.mp4");
    assert_eq!(meta.mime_type, "video/mp4");
    assert_eq!(meta.file_size, 10);
    assert_eq!(meta.chunk_size, 4);
    assert_eq!(meta.range_offset, 1);
    assert_eq!(meta.range_length, 2);
    assert_eq!(meta.source_revision, source_revision);
}

#[test]
fn test_catalog_download_range_cross_chunk() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);

    let (meta, bytes) = read_catalog_download_range(&mut router, node_id, 2, 6, source_revision);

    assert_eq!(bytes, b"cdefgh");
    assert_eq!(meta.range_offset, 2);
    assert_eq!(meta.range_length, 6);
}

#[test]
fn test_catalog_download_range_rejects_stale_source_revision() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);

    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:downloadRange",
            serde_json::json!({
                "node_id": node_id,
                "offset": 0,
                "length": 1,
                "expected_source_revision": source_revision.saturating_sub(1),
            }),
        ),
        None,
    );

    match reply {
        RpcReply::Json(RpcResponse::Error { code, error, .. }) => {
            assert_eq!(code.as_deref(), Some("ERR_MEDIA_STREAM_STALE"));
            assert_eq!(error, "Source revision is stale");
        }
        RpcReply::Json(RpcResponse::Success { .. })
        | RpcReply::Stream(_)
        | RpcReply::RangeStream(_) => panic!("expected stale source error"),
    }
}

#[test]
fn test_catalog_download_range_reuses_decrypted_chunk_cache_same_revision() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);
    let cache = router
        .session
        .as_ref()
        .expect("session")
        .decrypted_chunk_cache();

    let (_meta, first) = read_catalog_download_range(&mut router, node_id, 0, 2, source_revision);
    assert_eq!(first, b"ab");
    let after_first = cache.stats();
    assert_eq!(after_first.misses, 1);
    assert_eq!(after_first.inserts, 1);
    assert_eq!(after_first.hits, 0);

    let (_meta, second) = read_catalog_download_range(&mut router, node_id, 1, 2, source_revision);
    assert_eq!(second, b"bc");
    let after_second = cache.stats();
    assert_eq!(after_second.hits, 1);
    assert_eq!(after_second.misses, after_first.misses);
}

#[test]
fn test_catalog_download_range_changed_revision_misses_decrypted_chunk_cache() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);
    let cache = router
        .session
        .as_ref()
        .expect("session")
        .decrypted_chunk_cache();

    let (_meta, first) = read_catalog_download_range(&mut router, node_id, 0, 2, source_revision);
    assert_eq!(first, b"ab");
    let after_first = cache.stats();

    let next_revision = source_revision.saturating_add(1);
    {
        let node = router
            .session
            .as_mut()
            .expect("session")
            .catalog_mut()
            .find_by_id_mut(node_id)
            .expect("uploaded node");
        node.source_revision = next_revision;
    }

    let (_meta, second) = read_catalog_download_range(&mut router, node_id, 0, 2, next_revision);
    assert_eq!(second, b"ab");
    let after_second = cache.stats();
    assert_eq!(after_second.hits, after_first.hits);
    assert_eq!(after_second.misses, after_first.misses + 1);
    assert_eq!(after_second.inserts, after_first.inserts + 1);
}

#[test]
fn test_catalog_download_range_stale_revision_is_not_satisfied_from_cache() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);
    let cache = router
        .session
        .as_ref()
        .expect("session")
        .decrypted_chunk_cache();

    let (_meta, first) = read_catalog_download_range(&mut router, node_id, 0, 2, source_revision);
    assert_eq!(first, b"ab");
    let after_first = cache.stats();

    {
        let node = router
            .session
            .as_mut()
            .expect("session")
            .catalog_mut()
            .find_by_id_mut(node_id)
            .expect("uploaded node");
        node.source_revision = source_revision.saturating_add(1);
    }

    expect_catalog_download_range_error(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "offset": 0,
            "length": 1,
            "expected_source_revision": source_revision,
        }),
        "ERR_MEDIA_STREAM_STALE",
    );
    assert_eq!(cache.stats().hits, after_first.hits);
}

#[test]
fn test_catalog_download_range_rejects_unsatisfiable_ranges() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);

    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "offset": 0,
            "length": 0,
            "expected_source_revision": source_revision,
        }),
        "ERR_MEDIA_RANGE_INVALID",
        "length must be greater than zero",
    );
    for (offset, length) in [(10, 1), (9, 2)] {
        expect_catalog_download_range_error_message(
            &mut router,
            serde_json::json!({
                "node_id": node_id,
                "offset": offset,
                "length": length,
                "expected_source_revision": source_revision,
            }),
            "ERR_MEDIA_RANGE_INVALID",
            "Range is not satisfiable",
        );
    }
}

#[test]
fn test_catalog_download_range_read_errors_for_missing_corrupt_and_short_chunks() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    let (missing_node_id, missing_revision) =
        prepare_test_file_with_chunk_size(&mut router, "missing.mp4", b"abcdefghij", 4);
    let missing_chunk = catalog_blob_chunk_name(&router, missing_node_id, 0);
    router
        .storage
        .delete_chunk(&missing_chunk)
        .expect("delete chunk");
    assert_eq!(
        read_catalog_download_range_error_kind(
            &mut router,
            missing_node_id,
            0,
            1,
            missing_revision
        ),
        std::io::ErrorKind::NotFound
    );

    let (corrupt_node_id, corrupt_revision) =
        prepare_test_file_with_chunk_size(&mut router, "corrupt.mp4", b"abcdefghij", 4);
    let corrupt_chunk = catalog_blob_chunk_name(&router, corrupt_node_id, 0);
    router
        .storage
        .write_chunk(&corrupt_chunk, b"not encrypted")
        .expect("write corrupt chunk");
    assert_eq!(
        read_catalog_download_range_error_kind(
            &mut router,
            corrupt_node_id,
            0,
            1,
            corrupt_revision
        ),
        std::io::ErrorKind::InvalidData
    );

    let (short_node_id, short_revision) =
        prepare_test_file_with_chunk_size(&mut router, "short.mp4", b"abcdefghij", 4);
    let short_chunk = catalog_blob_chunk_name(&router, short_node_id, 0);
    let vault_key = *router.session.as_ref().unwrap().vault_key();
    let encrypted_short = crate::crypto::encrypt(b"ab", &vault_key, short_chunk.as_bytes())
        .expect("encrypt short chunk");
    router
        .storage
        .write_chunk(&short_chunk, &encrypted_short)
        .expect("write short chunk");
    assert_eq!(
        read_catalog_download_range_error_kind(&mut router, short_node_id, 0, 4, short_revision),
        std::io::ErrorKind::UnexpectedEof
    );
}

#[test]
fn test_catalog_download_range_rejects_validation_gates() {
    let (mut locked_router, _locked_temp_dir) = create_test_router();
    expect_catalog_download_range_error_message(
        &mut locked_router,
        serde_json::json!({
            "node_id": 1,
            "offset": 0,
            "length": 1,
            "expected_source_revision": 1,
        }),
        "VAULT_REQUIRED",
        "Vault not unlocked",
    );

    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);

    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "offset": 0,
            "length": 1,
            "expected_source_revision": source_revision,
        }),
        "EMPTY_PAYLOAD",
        "node_id is required",
    );
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "length": 1,
            "expected_source_revision": source_revision,
        }),
        "EMPTY_PAYLOAD",
        "offset is required",
    );
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "offset": 0,
            "expected_source_revision": source_revision,
        }),
        "EMPTY_PAYLOAD",
        "length is required",
    );
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": node_id,
            "offset": 0,
            "length": 1,
        }),
        "EMPTY_PAYLOAD",
        "expected_source_revision is required",
    );
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": 999_999_u64,
            "offset": 0,
            "length": 1,
            "expected_source_revision": source_revision,
        }),
        "NODE_NOT_FOUND",
        "Node not found",
    );

    let json_only = router.handle(&RpcRequest::new(
        "catalog:downloadRange",
        serde_json::json!({
            "node_id": node_id,
            "offset": 0,
            "length": 1,
            "expected_source_revision": source_revision,
        }),
    ));
    assert_eq!(json_only.code(), Some("STREAM_REQUIRED"));

    let created_dir = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "media"}),
    ));
    let dir_node_id = created_dir
        .result()
        .unwrap()
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("dir node id");
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": dir_node_id,
            "offset": 0,
            "length": 1,
            "expected_source_revision": 1,
        }),
        "INTERNAL_ERROR",
        "Node is not a file",
    );

    let empty = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": "empty.mp4",
                "total_size": 0,
                "size": 0,
                "offset": 0,
                "mime_type": "video/mp4",
            }),
        ),
        Some(RpcInputStream::from_bytes(Vec::new())),
    );
    let RpcReply::Json(empty) = empty else {
        panic!("catalog:upload must return JSON response");
    };
    let empty_node_id = empty
        .result()
        .unwrap()
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("empty node id");
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": empty_node_id,
            "offset": 0,
            "length": 1,
            "expected_source_revision": 1,
        }),
        "ERR_MEDIA_RANGE_INVALID",
        "File is empty",
    );

    let (zero_chunk_node_id, zero_chunk_revision) =
        prepare_test_file_with_chunk_size(&mut router, "zero-chunk.mp4", b"abc", 4);
    router
        .session
        .as_mut()
        .expect("unlocked session")
        .catalog_mut()
        .set_chunk_size(zero_chunk_node_id, 0)
        .expect("set invalid test chunk size");
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": zero_chunk_node_id,
            "offset": 0,
            "length": 1,
            "expected_source_revision": zero_chunk_revision,
        }),
        "INTERNAL_ERROR",
        "Invalid chunk size",
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
                    "name": "guarded.mp4",
                    "total_size": 1,
                    "size": 1,
                    "offset": 0,
                    "mime_type": "video/mp4",
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
    expect_catalog_download_range_error_message(
        &mut router,
        serde_json::json!({
            "node_id": guarded_node_id,
            "offset": 0,
            "length": 1,
            "expected_source_revision": 1,
        }),
        "ACCESS_DENIED",
        "Access denied",
    );
    expect_catalog_download_error_message(
        &mut router,
        serde_json::json!({"node_id": guarded_node_id}),
        "ACCESS_DENIED",
        "Access denied",
    );
}
