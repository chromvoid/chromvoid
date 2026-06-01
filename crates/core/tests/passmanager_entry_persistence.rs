mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn router_for_path(storage_path: &std::path::Path, keystore: Arc<InMemoryKeystore>) -> RpcRouter {
    let storage = Storage::new(storage_path).expect("storage");
    RpcRouter::new(storage).with_keystore(keystore)
}

fn upload_create(
    router: &mut RpcRouter,
    name: &str,
    size: u64,
    parent_path: &str,
    mime_type: &str,
) -> chromvoid_core::rpc::types::RpcResponse {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "name": name,
                    "total_size": size,
                "size": size,
                    "offset": 0,
                "parent_path": parent_path,
                "mime_type": mime_type,
            }),
        ),
        Some(RpcInputStream::from_bytes(vec![0; size as usize])),
    );
    match reply {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
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
    let upload_resp = upload_create(
        &mut router,
        "meta.json",
        100,
        entry_path,
        "application/json",
    );
    assert_rpc_error(&upload_resp, "ACCESS_DENIED");
}
