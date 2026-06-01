mod test_helpers;

use std::collections::HashSet;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use test_helpers::*;

#[test]
fn test_catalog_delete_defers_file_chunk_cleanup_to_storage_gc() {
    let (mut router, temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = vec![7u8; (3 * 1024 * 1024) + 7];
    let total_size = data.len() as u64;
    let chunk_size: u32 = 1024 * 1024;

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": "to-delete.bin",
            "total_size": total_size,
            "size": total_size,
            "offset": 0,
            "chunk_size": chunk_size,
        }),
    );

    let node_id =
        match router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(data))) {
            RpcReply::Json(r) => {
                assert_rpc_ok(&r);
                get_node_id(&r)
            }
            RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                panic!("catalog:upload must return JSON response")
            }
        };

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let before = storage.list_chunks().expect("list chunks (before)");
    assert!(
        !before.is_empty(),
        "expected at least one storage chunk before delete"
    );
    let before_chunks = before.iter().cloned().collect::<HashSet<_>>();

    let del = router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_rpc_ok(&del);

    let expected_file_chunks = total_size.div_ceil(chunk_size as u64) as usize;
    let gc_scan = router.handle(&RpcRequest::new(
        "admin:storage:gc:scan",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&gc_scan);
    let candidates = gc_scan
        .result()
        .and_then(|result| result.get("candidates"))
        .and_then(|value| value.as_array())
        .expect("gc candidates");
    let candidate_chunks = candidates
        .iter()
        .filter_map(|candidate| candidate.get("name").and_then(|value| value.as_str()))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let orphaned_uploaded_chunks = before_chunks.intersection(&candidate_chunks).count();
    assert!(
        orphaned_uploaded_chunks >= expected_file_chunks,
        "expected delete to leave at least {expected_file_chunks} uploaded chunks for GC, found {orphaned_uploaded_chunks}"
    );

    let gc_id = gc_scan
        .result()
        .and_then(|result| result.get("gc_id"))
        .and_then(|value| value.as_str())
        .expect("gc id");
    let gc_delete = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": gc_id,
            "confirm_delete": true,
        }),
    ));
    assert_rpc_ok(&gc_delete);
    let after_gc = storage.list_chunks().expect("list chunks after gc");
    let after_gc_chunks = after_gc.iter().cloned().collect::<HashSet<_>>();
    let removed_by_gc = before_chunks.difference(&after_gc_chunks).count();
    assert!(
        removed_by_gc >= expected_file_chunks,
        "expected GC to remove at least {expected_file_chunks} uploaded chunks, removed {removed_by_gc}"
    );
}
