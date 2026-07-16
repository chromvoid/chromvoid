use super::fixtures::*;
use super::*;
use base64::{engine::general_purpose, Engine as _};

#[test]
fn test_catalog_file_patch_updates_dirty_ranges_only_contract() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "story.txt", b"hello world", 4);

    let result = patch_test_file(
        &mut router,
        node_id,
        11,
        source_revision,
        &[(6, b"rust".as_slice())],
    );
    let next_revision = result
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");
    assert!(next_revision > source_revision);

    let (_meta, bytes) = read_catalog_download(&mut router, node_id);
    assert_eq!(bytes, b"hello rustd");
}

#[test]
fn test_catalog_file_patch_truncates_without_reupload_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "story.txt", b"hello world", 4);

    let result = patch_test_file(&mut router, node_id, 5, source_revision, &[]);
    assert_eq!(result.get("size").and_then(|value| value.as_u64()), Some(5));

    let (_meta, bytes) = read_catalog_download(&mut router, node_id);
    assert_eq!(bytes, b"hello");
}

#[test]
fn test_catalog_file_patch_rejects_stale_revision() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_test_router(&mut router);

    let (node_id, source_revision) =
        prepare_test_file_with_chunk_size(&mut router, "story.txt", b"hello world", 4);

    let response = router.handle(&RpcRequest::new(
        "catalog:file:patch",
        serde_json::json!({
            "node_id": node_id,
            "size": 11,
            "expected_source_revision": source_revision.saturating_sub(1),
            "patches": [{
                "offset": 0,
                "content_base64": general_purpose::STANDARD.encode(b"H"),
            }],
        }),
    ));

    assert!(!response.is_ok());
    assert_eq!(response.code(), Some("ERR_STALE_SOURCE"));
}

fn patch_test_file(
    router: &mut RpcRouter,
    node_id: u64,
    size: u64,
    expected_source_revision: u64,
    patches: &[(u64, &[u8])],
) -> serde_json::Value {
    let patches = patches
        .iter()
        .map(|(offset, bytes)| {
            serde_json::json!({
                "offset": offset,
                "content_base64": general_purpose::STANDARD.encode(bytes),
            })
        })
        .collect::<Vec<_>>();
    let response = router.handle(&RpcRequest::new(
        "catalog:file:patch",
        serde_json::json!({
            "node_id": node_id,
            "size": size,
            "expected_source_revision": expected_source_revision,
            "patches": patches,
        }),
    ));
    response
        .result()
        .unwrap_or_else(|| panic!("expected patch success, got {response:?}"))
        .clone()
}
