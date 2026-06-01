use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcInputStream;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{download_file, router_with_storage, OLD_VAULT_PASSWORD};
use crate::test_helpers::*;

fn upload_batch_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert_rpc_ok(&create_dir(&mut router, "stable"));
        router.save().expect("baseline save");
    }

    let bytes = b"batch upload bytes".to_vec();
    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let request = RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": "fault.bin",
                "total_size": bytes.len() as u64,
                "size": bytes.len() as u64,
                "offset": 0,
                "mime_type": "application/octet-stream",
            }),
        );
        let _ =
            router.handle_with_stream(&request, Some(RpcInputStream::from_bytes(bytes.clone())));
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    let items = get_items(&list_dir(&mut router, "/"));
    assert!(find_item_by_name(&items, "stable").is_some());
    if let Some(item) = find_item_by_name(&items, "fault.bin") {
        let node_id = item
            .get("node_id")
            .or_else(|| item.get("id"))
            .and_then(|value| value.as_u64())
            .expect("fault.bin node id");
        assert_eq!(download_file(&mut router, node_id), bytes);
    }
    handle
}

#[test]
fn upload_batch_fail_on_each_selected_operation_never_points_to_missing_chunks() {
    for operation in [
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
    ] {
        run_fail_on_each(operation, upload_batch_scenario);
    }
}
