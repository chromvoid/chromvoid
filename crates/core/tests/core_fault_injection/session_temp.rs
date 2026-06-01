use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{router_with_storage, setup_master, MASTER_PASSWORD, OLD_VAULT_PASSWORD};
use crate::test_helpers::*;

fn backup_local_temp_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    let mut router = router_with_storage(fault_storage, keystore).with_master_key(MASTER_PASSWORD);
    setup_master(&mut router);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));

    let first = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    if !first.is_ok() {
        let retry = router.handle(&RpcRequest::new(
            "backup:local:start",
            serde_json::json!({}),
        ));
        assert_rpc_ok(&retry);
    }
    handle
}

fn vault_export_temp_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    let mut router = router_with_storage(fault_storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));

    let first = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    if !first.is_ok() {
        let retry = router.handle(&RpcRequest::new(
            "vault:export:start",
            serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
        ));
        assert_rpc_ok(&retry);
    }
    handle
}

#[test]
fn backup_local_temp_fail_on_each_selected_operation_leaves_session_retryable() {
    for operation in [
        StorageOperation::CreateTempFile,
        StorageOperation::SyncTempFile,
        StorageOperation::SyncTempNamespace,
    ] {
        run_fail_on_each(operation, backup_local_temp_scenario);
    }
}

#[test]
fn vault_export_temp_fail_on_each_selected_operation_leaves_session_retryable() {
    for operation in [
        StorageOperation::CreateTempFile,
        StorageOperation::SyncTempFile,
        StorageOperation::SyncTempNamespace,
    ] {
        run_fail_on_each(operation, vault_export_temp_scenario);
    }
}
