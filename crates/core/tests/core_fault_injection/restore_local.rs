use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{
    build_local_backup_pack, commit_restore_pack, retry_local_restore, router_with_storage,
    setup_master, start_restore_session, try_start_restore_session, upload_restore_pack,
    MASTER_PASSWORD,
};
use crate::test_helpers::*;

fn restore_local_upload_pack_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let backup = build_local_backup_pack();
    let target_dir = TempDir::new().expect("target dir");
    let target_keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(target_dir.path()).expect("storage");
        let mut router =
            router_with_storage(storage, target_keystore.clone()).with_master_key(MASTER_PASSWORD);
        setup_master(&mut router);
    }

    let (fault_storage, handle) =
        fault_injecting_storage(target_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, target_keystore.clone())
            .with_master_key(MASTER_PASSWORD);
        let restore_id = start_restore_session(&mut router);
        let _ = upload_restore_pack(
            &mut router,
            &restore_id,
            backup.manifest.clone(),
            backup.pack.clone(),
        );
    }

    let storage = Storage::new(target_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, target_keystore).with_master_key(MASTER_PASSWORD);
    let restore_id = start_restore_session(&mut router);
    assert_rpc_ok(&upload_restore_pack(
        &mut router,
        &restore_id,
        backup.manifest,
        backup.pack,
    ));
    handle
}

fn restore_local_commit_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let backup = build_local_backup_pack();
    let target_dir = TempDir::new().expect("target dir");
    let target_keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(target_dir.path()).expect("storage");
        let mut router =
            router_with_storage(storage, target_keystore.clone()).with_master_key(MASTER_PASSWORD);
        setup_master(&mut router);
    }

    let (fault_storage, handle) =
        fault_injecting_storage(target_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, target_keystore.clone())
            .with_master_key(MASTER_PASSWORD);
        if let Some(restore_id) = try_start_restore_session(&mut router) {
            if upload_restore_pack(
                &mut router,
                &restore_id,
                backup.manifest.clone(),
                backup.pack.clone(),
            )
            .is_ok()
            {
                let _ = commit_restore_pack(
                    &mut router,
                    &restore_id,
                    &backup.metadata,
                    &backup.master_salt,
                    &backup.master_verify,
                );
            }
        }
    }

    retry_local_restore(&target_dir, target_keystore, backup);
    handle
}

fn restore_local_commit_rollback_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let backup = build_local_backup_pack();
    let target_dir = TempDir::new().expect("target dir");
    let target_keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(target_dir.path()).expect("storage");
        let mut router = RpcRouter::new(storage).with_master_key(MASTER_PASSWORD);
        setup_master(&mut router);
    }

    let (fault_storage, handle) =
        fault_injecting_storage(target_dir.path(), rule).expect("fault storage");
    {
        let mut router = RpcRouter::new(fault_storage).with_master_key(MASTER_PASSWORD);
        if let Some(restore_id) = try_start_restore_session(&mut router) {
            if upload_restore_pack(
                &mut router,
                &restore_id,
                backup.manifest.clone(),
                backup.pack.clone(),
            )
            .is_ok()
            {
                let response = commit_restore_pack(
                    &mut router,
                    &restore_id,
                    &backup.metadata,
                    &backup.master_salt,
                    &backup.master_verify,
                );
                assert!(
                    !response.is_ok(),
                    "missing keystore should force artifact rollback"
                );
            }
        }
    }

    retry_local_restore(&target_dir, target_keystore, backup);
    handle
}

#[test]
fn restore_local_upload_pack_batch_fail_on_each_selected_operation_can_retry() {
    for operation in [
        StorageOperation::WriteChunkBatchTemp,
        StorageOperation::SyncChunkBatchTemp,
        StorageOperation::RenameChunkBatchTemp,
        StorageOperation::SyncChunkBatchParent,
    ] {
        run_fail_on_each(operation, restore_local_upload_pack_scenario);
    }
}

#[test]
fn restore_local_commit_fail_on_each_selected_operation_recovers_or_retries() {
    for operation in [
        StorageOperation::WriteArtifactAtomic,
        StorageOperation::WriteArtifactTemp,
        StorageOperation::SyncArtifactTemp,
        StorageOperation::RenameArtifactTemp,
        StorageOperation::SyncArtifactParent,
    ] {
        run_fail_on_each(operation, restore_local_commit_scenario);
    }
}

#[test]
fn restore_local_commit_artifact_cleanup_fault_remains_retryable() {
    run_fail_on_each(
        StorageOperation::RemoveArtifact,
        restore_local_commit_rollback_scenario,
    );
}
