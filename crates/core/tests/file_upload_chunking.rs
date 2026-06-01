//! ADR-004: upload must split into multiple storage chunks.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use test_helpers::*;

#[test]
fn test_upload_splits_into_multiple_chunks_based_on_chunk_size() {
    let (mut router, temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"0123456789".to_vec();
    let total_size = data.len() as u64;
    let chunk_size: u32 = 4;

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": "chunked.bin",
            "total_size": total_size,
            "size": total_size,
            "offset": 0,
            "chunk_size": chunk_size,
        }),
    );

    match router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let chunks = storage.list_chunks().expect("list chunks");

    let expected_chunks = (total_size + (chunk_size as u64) - 1) / (chunk_size as u64);
    assert!(
        chunks.len() as u64 >= expected_chunks,
        "ADR-004: upload must create at least {expected_chunks} file chunks; storage also contains catalog metadata chunks"
    );
}
