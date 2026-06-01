use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{exactly_one_master_password_is_valid, setup_master, MASTER_PASSWORD};

fn master_rekey_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = RpcRouter::new(storage).with_master_key(MASTER_PASSWORD);
        setup_master(&mut router);
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = RpcRouter::new(fault_storage).with_master_key(MASTER_PASSWORD);
        let _ = router.handle(&RpcRequest::new(
            "master:rekey",
            serde_json::json!({
                "current_password": MASTER_PASSWORD,
                "new_master_password": "new correct horse staple",
            }),
        ));
    }

    exactly_one_master_password_is_valid(&temp_dir, MASTER_PASSWORD, "new correct horse staple");
    handle
}

#[test]
fn master_rekey_fail_on_each_selected_operation_keeps_one_valid_master_password() {
    for operation in [
        StorageOperation::WriteArtifactAtomic,
        StorageOperation::WriteArtifactTemp,
        StorageOperation::SyncArtifactTemp,
        StorageOperation::RenameArtifactTemp,
        StorageOperation::SyncArtifactParent,
        StorageOperation::RemoveArtifact,
    ] {
        run_fail_on_each(operation, master_rekey_scenario);
    }
}

#[test]
fn master_rekey_remove_artifact_fault_leaves_one_valid_master_password() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = RpcRouter::new(storage).with_master_key(MASTER_PASSWORD);
    setup_master(&mut router);

    let (fault_storage, _handle) = fault_injecting_storage(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::RemoveArtifact,
            fail_on: 2,
        }),
    )
    .expect("fault storage");
    let mut fault_router = RpcRouter::new(fault_storage).with_master_key(MASTER_PASSWORD);
    let _ = fault_router.handle(&RpcRequest::new(
        "master:rekey",
        serde_json::json!({
            "current_password": MASTER_PASSWORD,
            "new_master_password": "new correct horse staple",
        }),
    ));
    exactly_one_master_password_is_valid(&temp_dir, MASTER_PASSWORD, "new correct horse staple");
}
