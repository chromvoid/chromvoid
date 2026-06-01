use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{
    prepare_file, read_derivative, router_with_storage, try_read_derivative, write_derivative,
    OLD_VAULT_PASSWORD,
};
use crate::test_helpers::*;

fn derivative_new_write_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        prepare_file(&mut router, "image.bin", b"image bytes")
    };

    let bytes = b"new derivative".to_vec();
    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let _ = write_derivative(&mut router, node_id, &bytes);
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    if let Some(read) = try_read_derivative(&mut router, node_id) {
        assert_eq!(read, bytes);
    }
    handle
}

fn derivative_overwrite_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let original_derivative = b"old derivative".to_vec();
    let new_derivative = b"new derivative".to_vec();
    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let node_id = prepare_file(&mut router, "image.bin", b"image bytes");
        assert!(write_derivative(&mut router, node_id, &original_derivative));
        node_id
    };

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let _ = write_derivative(&mut router, node_id, &new_derivative);
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    if let Some(read) = try_read_derivative(&mut router, node_id) {
        assert!(
            read == original_derivative || read == new_derivative,
            "derivative must recover to old or new bytes, got {read:?}"
        );
    }
    handle
}

#[test]
fn derivative_new_write_batch_fail_on_each_selected_operation_returns_clean_miss_or_complete() {
    for operation in [
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
    ] {
        run_fail_on_each(operation, derivative_new_write_scenario);
    }
}

#[test]
fn derivative_overwrite_batch_fail_on_each_selected_operation_never_returns_partial_data() {
    for operation in [
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
    ] {
        run_fail_on_each(operation, derivative_overwrite_scenario);
    }
}

#[test]
fn derivative_overwrite_fault_restores_previous_derivative() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let original_derivative = b"old derivative".to_vec();
    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let node_id = prepare_file(&mut router, "image.bin", b"image bytes");
        assert!(write_derivative(&mut router, node_id, &original_derivative));
        node_id
    };

    let (fault_storage, _handle) = fault_injecting_storage(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::RenameChunkBatchTemp,
            fail_on: 3,
        }),
    )
    .expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert!(
            !write_derivative(&mut router, node_id, b"new derivative"),
            "batch rename fault should fail derivative overwrite"
        );
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    assert_eq!(read_derivative(&mut router, node_id), original_derivative);
}

#[test]
fn derivative_overwrite_marker_cleanup_fault_recovers_new_derivative() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let original_derivative = b"old derivative".to_vec();
    let new_derivative = b"new derivative".to_vec();
    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let node_id = prepare_file(&mut router, "image.bin", b"image bytes");
        assert!(write_derivative(&mut router, node_id, &original_derivative));
        node_id
    };

    let (fault_storage, _handle) = fault_injecting_storage(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::DeleteChunk,
            fail_on: 3,
        }),
    )
    .expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert!(
            write_derivative(&mut router, node_id, &new_derivative),
            "cleanup fault happens after derivative index update"
        );
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    assert_eq!(read_derivative(&mut router, node_id), new_derivative);
}
