mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use std::io::Read;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn router_for_path(storage_path: &std::path::Path, keystore: Arc<InMemoryKeystore>) -> RpcRouter {
    let storage = Storage::new(storage_path).expect("storage");
    RpcRouter::new(storage).with_keystore(keystore)
}

fn prepare_upload(
    router: &mut RpcRouter,
    name: &str,
    size: u64,
    parent_path: &str,
    mime_type: &str,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": name,
            "size": size,
            "parent_path": parent_path,
            "mime_type": mime_type,
        }),
    ))
}

fn upload_bytes(router: &mut RpcRouter, node_id: u64, bytes: Vec<u8>) {
    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": bytes.len(),
            "offset": 0,
        }),
    );

    match router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(bytes))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }
}

fn secret_write_bytes(router: &mut RpcRouter, node_id: u64, bytes: Vec<u8>) {
    let write_request = RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({
            "node_id": node_id,
            "size": bytes.len(),
        }),
    );

    match router.handle_with_stream(&write_request, Some(RpcInputStream::from_bytes(bytes))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:secret:write must return JSON response"),
    }
}

fn download_bytes(router: &mut RpcRouter, node_id: u64) -> Vec<u8> {
    let download_request = RpcRequest::new(
        "catalog:download",
        serde_json::json!({
            "node_id": node_id,
        }),
    );

    match router.handle_with_stream(&download_request, None) {
        RpcReply::Stream(mut out) => {
            let mut downloaded = Vec::new();
            out.reader
                .read_to_end(&mut downloaded)
                .expect("read stream");
            downloaded
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    }
}

fn secret_read_bytes(router: &mut RpcRouter, node_id: u64) -> Vec<u8> {
    let read_request = RpcRequest::new(
        "catalog:secret:read",
        serde_json::json!({
            "node_id": node_id,
        }),
    );

    match router.handle_with_stream(&read_request, None) {
        RpcReply::Stream(mut out) => {
            let mut downloaded = Vec::new();
            out.reader
                .read_to_end(&mut downloaded)
                .expect("read stream");
            downloaded
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    }
}

// ADR-028: generic catalog commands on /.passmanager are now denied.
// The passmanager.* domain API (Task 4) will handle this workflow.
#[test]
fn test_passmanager_entry_persists_across_restart() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    let mut router = router_for_path(storage_path, keystore.clone());
    assert_rpc_ok(&unlock_vault(&mut router, "test_password"));

    assert_rpc_error(&list_dir(&mut router, "/.passmanager"), "ACCESS_DENIED");
    assert_rpc_error(
        &create_dir_at(&mut router, "/.passmanager", "Example"),
        "ACCESS_DENIED",
    );

    let entry_path = "/.passmanager/Example";
    let upload_resp = prepare_upload(
        &mut router,
        "meta.json",
        100,
        entry_path,
        "application/json",
    );
    assert_rpc_error(&upload_resp, "ACCESS_DENIED");
}
