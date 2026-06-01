use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{
    passmanager_otp_is_readable, router_with_storage, save_passmanager_otp_secret,
    OLD_VAULT_PASSWORD,
};
use crate::test_helpers::*;

fn passmanager_otp_sidecar_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert!(save_passmanager_otp_secret(&mut router, "JBSWY3DPEHPK3PXP"));
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let _ = save_passmanager_otp_secret(&mut router, "JBSWY3DPEHPK3PXQ");
    }

    assert!(
        passmanager_otp_is_readable(&temp_dir, keystore),
        "OTP sidecar recovery must leave an old or new secret readable"
    );
    handle
}

fn passmanager_root_import_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:root:import",
            serde_json::json!({
                "folders": ["/old"],
                "entries": [{
                    "id": "old-entry",
                    "title": "Old Entry",
                    "folderPath": "/old"
                }]
            }),
        )));
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let _ = router.handle(&RpcRequest::new(
            "passmanager:root:import",
            serde_json::json!({
                "mode": "replace",
                "allow_destructive": true,
                "folders": ["/new"],
                "entries": [{
                    "id": "new-entry",
                    "title": "New Entry",
                    "folderPath": "/new"
                }]
            }),
        ));
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut reopened = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, OLD_VAULT_PASSWORD));
    let export = reopened.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&export);
    let entries = export
        .result()
        .and_then(|value| value.get("root"))
        .and_then(|root| root.get("entries"))
        .and_then(|entries| entries.as_array())
        .expect("entries");
    let has_old = entries
        .iter()
        .any(|entry| entry.get("id").and_then(|value| value.as_str()) == Some("old-entry"));
    let has_new = entries
        .iter()
        .any(|entry| entry.get("id").and_then(|value| value.as_str()) == Some("new-entry"));
    assert!(
        has_old ^ has_new,
        "root import recovery must leave either old or new root, not a mixed root: {entries:?}"
    );
    handle
}

#[test]
fn passmanager_root_import_fail_on_each_selected_operation_keeps_old_or_new_root() {
    for operation in [
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
        StorageOperation::DeleteChunk,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, passmanager_root_import_scenario);
    }
}

#[test]
fn passmanager_otp_sidecar_fail_on_each_selected_operation_keeps_secret_readable() {
    for operation in [
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
        StorageOperation::DeleteChunk,
    ] {
        run_fail_on_each(operation, passmanager_otp_sidecar_scenario);
    }
}
