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
    prepare_file, read_passmanager_secret, router_with_storage, save_passmanager_secret,
    try_download_file, OLD_VAULT_PASSWORD,
};
use crate::test_helpers::*;

fn single_blob_secret_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert!(save_passmanager_secret(
            &mut router,
            "single-blob-entry",
            "old"
        ));
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let _ = save_passmanager_secret(&mut router, "single-blob-entry", "new");
    }

    let value = read_passmanager_secret(&temp_dir, keystore, "single-blob-entry");
    assert!(
        matches!(value.as_deref(), Some("old" | "new")),
        "single blob recovery must leave old or new secret readable, got {value:?}"
    );
    handle
}

fn single_blob_erase_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let node_id;
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        node_id = prepare_file(&mut router, "erase-secret.bin", b"old secret");
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let _ = router.handle(&RpcRequest::new(
            "catalog:secret:erase",
            serde_json::json!({"node_id": node_id}),
        ));
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    let bytes = try_download_file(&mut router, node_id).expect("file remains readable");
    assert!(
        bytes == b"old secret" || bytes.is_empty(),
        "blob erase recovery must leave old bytes or an empty blob, got {bytes:?}"
    );
    handle
}

#[test]
fn single_blob_secret_fail_on_each_selected_operation_keeps_readable_secret() {
    for operation in [
        StorageOperation::WriteChunkAtomic,
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
        StorageOperation::DeleteChunk,
    ] {
        run_fail_on_each(operation, single_blob_secret_scenario);
    }
}

#[test]
fn single_blob_erase_fail_on_each_selected_operation_keeps_old_or_empty_blob() {
    for operation in [
        StorageOperation::WriteChunkAtomic,
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
        StorageOperation::DeleteChunk,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, single_blob_erase_scenario);
    }
}
