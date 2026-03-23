mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use test_helpers::*;

#[test]
fn test_catalog_delete_removes_file_chunks() {
    let (mut router, temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = vec![7u8; (3 * 1024 * 1024) + 7];
    let total_size = data.len() as u64;
    let chunk_size: u32 = 1024 * 1024;

    let prepare = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "to-delete.bin",
            "size": total_size,
            "chunk_size": chunk_size,
        }),
    ));
    assert_rpc_ok(&prepare);
    let node_id = get_node_id(&prepare);

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": total_size,
            "offset": 0,
        }),
    );

    match router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let before = storage.list_chunks().expect("list chunks (before)");
    assert!(
        !before.is_empty(),
        "expected at least one storage chunk before delete"
    );

    let del = router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_rpc_ok(&del);

    let after = storage.list_chunks().expect("list chunks (after)");
    assert!(after.is_empty(), "expected no chunks after delete");
}
