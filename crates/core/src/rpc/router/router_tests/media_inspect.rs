use super::fixtures::*;
use super::*;

fn expect_media_inspect_error(
    router: &mut RpcRouter,
    data: serde_json::Value,
    expected_code: &str,
    expected_message: &str,
) {
    let response = router.handle(&RpcRequest::new("catalog:media:inspect", data));
    match response {
        RpcResponse::Error { code, error, .. } => {
            assert_eq!(code.as_deref(), Some(expected_code));
            assert_eq!(error, expected_message);
        }
        RpcResponse::Success { .. } => panic!("expected {expected_code} error"),
    }
}

#[test]
fn test_catalog_media_inspect_error_contracts() {
    let (mut locked_router, _locked_temp_dir) = create_test_router();
    expect_media_inspect_error(
        &mut locked_router,
        serde_json::json!({}),
        "EMPTY_PAYLOAD",
        "node_id is required",
    );
    expect_media_inspect_error(
        &mut locked_router,
        serde_json::json!({"node_id": 1}),
        "VAULT_REQUIRED",
        "Vault not unlocked",
    );

    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    expect_media_inspect_error(
        &mut router,
        serde_json::json!({"node_id": 999_999_u64}),
        "NODE_NOT_FOUND",
        "Node not found",
    );

    let dir = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "media"}),
    ));
    let dir_id = dir
        .result()
        .expect("create dir result")
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("dir node id");
    expect_media_inspect_error(
        &mut router,
        serde_json::json!({"node_id": dir_id}),
        "ERR_NOT_FILE",
        "Node is not a file",
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
    expect_media_inspect_error(
        &mut router,
        serde_json::json!({"node_id": guarded_node_id}),
        "ACCESS_DENIED",
        "Access denied",
    );
}

#[test]
fn test_catalog_upload_defers_audio_only_mp4_media_info_until_on_demand_inspect() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let bytes = minimal_mp4(&["soun"]);
    let (node_id, _source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "podcast.mp4", &bytes, 16);

    let metadata = catalog_source_metadata(&mut router, node_id);
    let source_revision = metadata
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");
    assert_eq!(media_info_kind(&metadata), None);
    assert_eq!(media_inspected_revision(&metadata), Some(0));

    let inspect = router.handle(&RpcRequest::new(
        "catalog:media:inspect",
        serde_json::json!({"node_id": node_id}),
    ));
    let inspect = inspect.result().expect("inspect result");
    assert_eq!(media_info_kind(inspect), Some("audio"));
    assert_eq!(media_inspected_revision(inspect), Some(source_revision));

    let metadata = catalog_source_metadata(&mut router, node_id);
    assert_eq!(media_info_kind(&metadata), Some("audio"));
    assert_eq!(media_inspected_revision(&metadata), Some(source_revision));
    assert_eq!(
        metadata
            .get("media_info")
            .and_then(|value| value.get("a"))
            .and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        metadata
            .get("media_info")
            .and_then(|value| value.get("v"))
            .and_then(|value| value.as_u64()),
        Some(0)
    );
    assert_eq!(
        metadata
            .get("media_info")
            .and_then(|value| value.get("m"))
            .and_then(|value| value.as_str()),
        Some("audio/mp4")
    );
}

#[test]
fn test_catalog_upload_defers_unsupported_revision_until_on_demand_inspect() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let bytes = vec![0, 1, 2, 3];
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "unknown.mp4", &bytes, 16);

    let metadata = catalog_source_metadata(&mut router, node_id);
    assert_eq!(media_info_kind(&metadata), None);
    assert_eq!(media_inspected_revision(&metadata), Some(0));

    let inspect = router.handle(&RpcRequest::new(
        "catalog:media:inspect",
        serde_json::json!({"node_id": node_id}),
    ));
    let inspect = inspect.result().expect("inspect result");
    assert_eq!(media_info_kind(inspect), None);
    assert_eq!(media_inspected_revision(inspect), Some(source_revision));

    let metadata = catalog_source_metadata(&mut router, node_id);
    assert_eq!(media_info_kind(&metadata), None);
    assert_eq!(media_inspected_revision(&metadata), Some(source_revision));
}

#[test]
fn test_catalog_media_inspect_skips_completed_unsupported_revision() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let bytes = vec![0, 1, 2, 3];
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "unknown.mp4", &bytes, 16);

    let snapshot = router
        .snapshot_catalog_media_inspect(node_id)
        .expect("media inspect snapshot");
    assert!(!snapshot.inspection_complete);
    assert_eq!(snapshot.media_info, None);
    assert_eq!(snapshot.source_revision, source_revision);
    assert_eq!(snapshot.media_inspected_revision, 0);

    let inspect = router.handle(&RpcRequest::new(
        "catalog:media:inspect",
        serde_json::json!({"node_id": node_id}),
    ));
    let inspect = inspect.result().expect("inspect result");
    assert_eq!(media_info_kind(inspect), None);
    assert_eq!(media_inspected_revision(inspect), Some(source_revision));

    let snapshot = router
        .snapshot_catalog_media_inspect(node_id)
        .expect("media inspect snapshot");
    assert!(snapshot.inspection_complete);
    assert_eq!(snapshot.media_info, None);
    assert_eq!(snapshot.source_revision, source_revision);
    assert_eq!(snapshot.media_inspected_revision, source_revision);
}

#[test]
fn test_catalog_media_inspect_stale_commit_does_not_overwrite_new_revision() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let bytes = minimal_mp4(&["soun"]);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "podcast.mp4", &bytes, 16);

    {
        let session = router.session.as_mut().expect("unlocked session");
        let node = session
            .catalog_mut()
            .find_by_id_mut(node_id)
            .expect("uploaded node");
        node.media_info = None;
        node.media_inspected_revision = 0;
    }

    let snapshot = router
        .snapshot_catalog_media_inspect(node_id)
        .expect("media inspect snapshot");
    assert!(!snapshot.inspection_complete);
    {
        let session = router.session.as_mut().expect("unlocked session");
        let node = session
            .catalog_mut()
            .find_by_id_mut(node_id)
            .expect("uploaded node");
        node.source_revision = source_revision + 1;
    }

    let result = router
        .commit_catalog_media_inspect(
            &snapshot,
            Some(crate::catalog::CatalogMediaInfo {
                kind: crate::catalog::CatalogMediaKind::Audio,
                audio_tracks: 1,
                video_tracks: 0,
                playback_mime_type: Some("audio/mp4".to_string()),
            }),
            snapshot.source_revision,
        )
        .expect("commit result");
    assert_eq!(
        result.get("stale").and_then(|value| value.as_bool()),
        Some(true)
    );
    assert_eq!(
        result
            .get("source_revision")
            .and_then(|value| value.as_u64()),
        Some(source_revision + 1)
    );

    let metadata = catalog_source_metadata(&mut router, node_id);
    assert_eq!(media_info_kind(&metadata), None);
    assert_eq!(media_inspected_revision(&metadata), Some(0));
    assert_eq!(
        metadata
            .get("source_revision")
            .and_then(|value| value.as_u64()),
        Some(source_revision + 1)
    );
}

#[test]
fn test_catalog_upload_persists_on_demand_audio_only_mp4_media_info_after_reopen() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let bytes = minimal_mp4(&["soun"]);

    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_test_router(&mut router);

        let (node_id, _source_revision) =
            prepare_test_file_with_chunk_size(&mut router, "podcast.mp4", &bytes, 16);
        let metadata = catalog_source_metadata(&mut router, node_id);
        assert_eq!(media_info_kind(&metadata), None);
        assert_eq!(media_inspected_revision(&metadata), Some(0));

        let inspect = router.handle(&RpcRequest::new(
            "catalog:media:inspect",
            serde_json::json!({"node_id": node_id}),
        ));
        let inspect = inspect.result().expect("inspect result");
        assert_eq!(media_info_kind(inspect), Some("audio"));

        let metadata = catalog_source_metadata(&mut router, node_id);
        assert_eq!(media_info_kind(&metadata), Some("audio"));
        node_id
    };

    let storage = Storage::new(temp_dir.path()).expect("failed to reopen storage");
    let mut router = RpcRouter::new(storage).with_keystore(keystore);
    unlock_test_router(&mut router);

    let metadata = catalog_source_metadata(&mut router, node_id);
    assert_eq!(media_info_kind(&metadata), Some("audio"));
    assert_eq!(
        metadata
            .get("media_info")
            .and_then(|value| value.get("m"))
            .and_then(|value| value.as_str()),
        Some("audio/mp4")
    );
}

#[test]
fn test_catalog_media_inspect_lazily_backfills_without_source_revision_bump() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let bytes = minimal_mp4(&["soun"]);
    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "podcast.mp4", &bytes, 16);

    {
        let session = router.session.as_mut().expect("unlocked session");
        let node = session
            .catalog_mut()
            .find_by_id_mut(node_id)
            .expect("uploaded node");
        node.media_info = None;
        node.media_inspected_revision = 0;
    }

    let inspect = router.handle(&RpcRequest::new(
        "catalog:media:inspect",
        serde_json::json!({"node_id": node_id}),
    ));
    let inspect = inspect.result().expect("inspect result");
    assert_eq!(media_info_kind(inspect), Some("audio"));
    assert_eq!(
        inspect
            .get("source_revision")
            .and_then(|value| value.as_u64()),
        Some(source_revision)
    );
    assert_eq!(media_inspected_revision(inspect), Some(source_revision));

    let metadata = catalog_source_metadata(&mut router, node_id);
    assert_eq!(media_info_kind(&metadata), Some("audio"));
    assert_eq!(media_inspected_revision(&metadata), Some(source_revision));
    assert_eq!(
        metadata
            .get("source_revision")
            .and_then(|value| value.as_u64()),
        Some(source_revision)
    );
}

#[test]
fn test_catalog_media_inspect_snapshot_rejects_stale_cache_generation_insert() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);
    let (node_id, _source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "clip.mp4", &minimal_mp4(&["vide"]), 8);
    let snapshot = router
        .snapshot_catalog_media_inspect(node_id)
        .expect("media inspect snapshot");
    let cache = snapshot.decrypted_chunk_cache.clone();

    cache.clear("test");
    let before = cache.stats();
    let _ = inspect_catalog_media_snapshot(&snapshot, || false);
    let after = cache.stats();

    assert_eq!(after.entries, 0);
    assert_eq!(after.inserts, before.inserts);
    assert!(after.misses > before.misses);
}
