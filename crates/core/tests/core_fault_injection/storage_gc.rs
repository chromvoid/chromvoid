use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{
    download_file, prepare_file, router_with_storage, vault_key_for_storage,
    write_storage_gc_manifest, OLD_VAULT_PASSWORD, STORAGE_GC_ORPHAN_CHUNK,
};
use crate::test_helpers::*;

fn storage_gc_manifest_recovery_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let live_node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        prepare_file(&mut router, "live.bin", b"live bytes")
    };

    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        storage
            .write_chunk_atomic(STORAGE_GC_ORPHAN_CHUNK, b"orphan bytes")
            .expect("write orphan");
        let vault_key = vault_key_for_storage(&storage, keystore.as_ref(), OLD_VAULT_PASSWORD);
        write_storage_gc_manifest(&storage, &vault_key, STORAGE_GC_ORPHAN_CHUNK);
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    {
        let mut router = router_with_storage(storage.clone(), keystore);
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert_eq!(download_file(&mut router, live_node_id), b"live bytes");
    }
    assert!(!storage
        .chunk_exists(STORAGE_GC_ORPHAN_CHUNK)
        .expect("orphan cleaned after retry"));
    handle
}

#[test]
fn storage_gc_manifest_recovery_fail_on_each_selected_operation_retries_safely() {
    for operation in [StorageOperation::DeleteChunk, StorageOperation::Sync] {
        run_fail_on_each(operation, storage_gc_manifest_recovery_scenario);
    }
}
