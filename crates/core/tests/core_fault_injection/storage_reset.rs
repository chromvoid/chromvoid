use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{router_with_storage, setup_master};

fn storage_reset_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let chunk_name = "3453453453453453453453453453453453453453453453453453453453453453";
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage.clone(), keystore.clone());
        setup_master(&mut router);
        storage.get_or_create_salt().expect("create vault salt");
        storage
            .write_chunk(chunk_name, b"reset candidate")
            .expect("write reset candidate chunk");
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    let _ = fault_storage.erase_all();

    {
        let storage = Storage::new(temp_dir.path()).expect("storage after fault");
        let mut router = router_with_storage(storage, keystore.clone());
        setup_master(&mut router);
    }

    let retry = Storage::new(temp_dir.path()).expect("retry storage");
    retry.erase_all().expect("retry reset");
    assert!(retry.list_chunks().expect("list chunks").is_empty());
    {
        let mut router =
            router_with_storage(Storage::new(temp_dir.path()).expect("storage"), keystore);
        setup_master(&mut router);
    }

    handle
}

#[test]
fn storage_reset_fail_on_each_selected_operation_keeps_master_material_retryable() {
    for operation in [
        StorageOperation::DeleteChunk,
        StorageOperation::RemoveArtifact,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, storage_reset_scenario);
    }
}
