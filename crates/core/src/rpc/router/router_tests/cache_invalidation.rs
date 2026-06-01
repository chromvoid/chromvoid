use super::fixtures::*;
use super::*;

#[test]
fn test_catalog_upload_finalization_invalidates_decrypted_chunk_cache() {
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
    let before = cache.stats();

    let upload = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "node_id": node_id,
                "size": 10,
                "offset": 0,
            }),
        ),
        Some(RpcInputStream::from_bytes(b"klmnopqrst".to_vec())),
    );
    assert!(matches!(
        upload,
        RpcReply::Json(RpcResponse::Success { .. })
    ));

    let after = cache.stats();
    assert_eq!(after.entries, 0);
    assert!(after.generation > before.generation);
}

#[test]
fn test_catalog_file_replace_invalidates_decrypted_chunk_cache() {
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
    let before = cache.stats();

    let result = replace_test_file(
        &mut router,
        node_id,
        b"klmnopqrst",
        Some(source_revision),
        None,
    );
    assert!(
        result
            .get("source_revision")
            .and_then(|value| value.as_u64())
            .expect("source revision")
            > source_revision
    );

    let after = cache.stats();
    assert_eq!(after.entries, 0);
    assert!(after.generation > before.generation);
}

#[test]
fn test_single_blob_write_invalidates_decrypted_chunk_cache() {
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
    let before = cache.stats();
    let outcome = super::blob_io::write_single_blob_atomic(
        router.session.as_mut().expect("session"),
        &router.storage,
        node_id,
        b"klmnopqrst",
    );
    let outcome = outcome.expect("single blob write");
    assert_eq!(outcome.node_id, node_id);
    assert_eq!(outcome.size, 10);

    let after = cache.stats();
    assert_eq!(after.entries, 0);
    assert!(after.generation > before.generation);
}

#[test]
fn test_catalog_delete_invalidates_decrypted_chunk_cache() {
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
    let before = cache.stats();

    let response = router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": node_id}),
    ));
    assert!(response.is_ok());

    let after = cache.stats();
    assert_eq!(after.entries, 0);
    assert!(after.generation > before.generation);
}

#[test]
fn test_catalog_rename_preserves_decrypted_chunk_cache() {
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
    let before = cache.stats();

    let response = router.handle(&RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": node_id, "new_name": "renamed.mp4"}),
    ));
    assert!(response.is_ok());

    let after_rename = cache.stats();
    assert_eq!(after_rename.entries, before.entries);
    assert_eq!(after_rename.generation, before.generation);

    let (_meta, second) = read_catalog_download_range(&mut router, node_id, 1, 2, source_revision);
    assert_eq!(second, b"bc");
    assert_eq!(cache.stats().hits, before.hits + 1);
}

#[test]
fn test_catalog_move_preserves_decrypted_chunk_cache() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let create_dir = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"parent_path": "/", "name": "media"}),
    ));
    assert!(create_dir.is_ok());
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", b"abcdefghij", 4);
    let cache = router
        .session
        .as_ref()
        .expect("session")
        .decrypted_chunk_cache();
    let (_meta, first) = read_catalog_download_range(&mut router, node_id, 0, 2, source_revision);
    assert_eq!(first, b"ab");
    let before = cache.stats();

    let response = router.handle(&RpcRequest::new(
        "catalog:move",
        serde_json::json!({"node_id": node_id, "new_parent_path": "/media"}),
    ));
    assert!(response.is_ok());

    let after_move = cache.stats();
    assert_eq!(after_move.entries, before.entries);
    assert_eq!(after_move.generation, before.generation);

    let (_meta, second) = read_catalog_download_range(&mut router, node_id, 1, 2, source_revision);
    assert_eq!(second, b"bc");
    assert_eq!(cache.stats().hits, before.hits + 1);
}
