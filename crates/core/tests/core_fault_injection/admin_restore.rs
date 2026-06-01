use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{
    admin_backup_bytes, admin_restore_stream, build_admin_backup, prepare_file,
    restored_backup_is_readable, router_with_storage, setup_master, MASTER_PASSWORD,
    OLD_VAULT_PASSWORD,
};
use crate::test_helpers::*;

fn admin_restore_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let backup = build_admin_backup();
    let target_dir = TempDir::new().expect("target dir");
    let target_keystore = Arc::new(InMemoryKeystore::new());
    let (fault_storage, handle) =
        fault_injecting_storage(target_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, target_keystore.clone())
            .with_master_key(MASTER_PASSWORD);
        let _ = admin_restore_stream(&mut router, backup.clone());
    }

    if !restored_backup_is_readable(&target_dir, target_keystore.clone()) {
        let storage = Storage::new(target_dir.path()).expect("storage");
        let mut retry =
            router_with_storage(storage, target_keystore.clone()).with_master_key(MASTER_PASSWORD);
        assert_rpc_ok(&admin_restore_stream(&mut retry, backup));
        assert!(restored_backup_is_readable(&target_dir, target_keystore));
    }
    handle
}

#[test]
fn admin_restore_fail_on_each_selected_operation_recovers_or_completes() {
    for operation in [
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
        StorageOperation::WriteArtifactAtomic,
        StorageOperation::WriteArtifactTemp,
        StorageOperation::SyncArtifactTemp,
        StorageOperation::RenameArtifactTemp,
        StorageOperation::SyncArtifactParent,
        StorageOperation::RemoveArtifact,
    ] {
        run_fail_on_each(operation, admin_restore_scenario);
    }
}

#[test]
fn admin_restore_chunk_fault_recovers_before_retry() {
    let source_dir = TempDir::new().expect("source dir");
    let source_keystore = Arc::new(InMemoryKeystore::new());
    let backup = {
        let storage = Storage::new(source_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, source_keystore);
        router = router.with_master_key(MASTER_PASSWORD);
        setup_master(&mut router);
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        prepare_file(&mut router, "restore.bin", b"restore me");
        admin_backup_bytes(&mut router)
    };

    let target_dir = TempDir::new().expect("target dir");
    let target_keystore = Arc::new(InMemoryKeystore::new());
    let (fault_storage, _handle) = fault_injecting_storage(
        target_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::WriteChunkBatchTemp,
            fail_on: 1,
        }),
    )
    .expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, target_keystore.clone())
            .with_master_key(MASTER_PASSWORD);
        let response = admin_restore_stream(&mut router, backup.clone());
        assert!(!response.is_ok(), "faulted restore should fail");
    }

    let storage = Storage::new(target_dir.path()).expect("storage");
    let mut retry = router_with_storage(storage, target_keystore).with_master_key(MASTER_PASSWORD);
    let response = admin_restore_stream(&mut retry, backup);
    assert_rpc_ok(&response);
}
