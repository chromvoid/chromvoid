use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{prepare_file, router_with_storage, try_download_file, OLD_VAULT_PASSWORD};
use crate::test_helpers::*;

fn catalog_save_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert_rpc_ok(&create_dir(&mut router, "stable"));
        router.save().expect("baseline save");
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        if unlock_vault(&mut router, OLD_VAULT_PASSWORD).is_ok() {
            let _ = create_dir(&mut router, "after-fault");
            let _ = router.save();
        }
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    let items = get_items(&list_dir(&mut router, "/"));
    assert!(find_item_by_name(&items, "stable").is_some());
    handle
}

fn shard_compaction_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert_rpc_ok(&create_dir(&mut router, "docs"));
        router.save().expect("baseline docs shard save");
        assert_rpc_ok(&create_dir_at(&mut router, "/docs", "a"));
        router.save().expect("delta a save");
        assert_rpc_ok(&create_dir_at(&mut router, "/docs", "b"));
        router.save().expect("delta b save");
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        if unlock_vault(&mut router, OLD_VAULT_PASSWORD).is_ok() {
            let _ = router.handle(&RpcRequest::new(
                "catalog:shard:compact",
                serde_json::json!({"shard_id": "docs"}),
            ));
        }
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    let docs = get_items(&list_dir(&mut router, "/docs"));
    assert!(find_item_by_name(&docs, "a").is_some());
    assert!(find_item_by_name(&docs, "b").is_some());
    handle
}

fn catalog_delete_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let node_id;
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        node_id = prepare_file(&mut router, "delete-me.bin", b"delete-safe");
    }

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let _ = router.handle(&RpcRequest::new(
            "catalog:delete",
            serde_json::json!({"node_id": node_id}),
        ));
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    if let Some(bytes) = try_download_file(&mut router, node_id) {
        assert_eq!(bytes, b"delete-safe");
    }
    handle
}

#[test]
fn catalog_save_fail_on_each_selected_operation_preserves_previous_catalog() {
    for operation in [
        StorageOperation::WriteChunkAtomic,
        StorageOperation::DeleteChunk,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, catalog_save_scenario);
    }
}

#[test]
fn shard_compaction_fail_on_each_selected_operation_keeps_catalog_loadable() {
    for operation in [
        StorageOperation::WriteChunkAtomic,
        StorageOperation::DeleteChunk,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, shard_compaction_scenario);
    }
}

#[test]
fn catalog_delete_fail_on_each_selected_operation_keeps_catalog_loadable() {
    for operation in [
        StorageOperation::WriteChunkAtomic,
        StorageOperation::DeleteChunk,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, catalog_delete_scenario);
    }
}

#[test]
fn catalog_save_write_fault_preserves_previous_catalog() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        assert_rpc_ok(&create_dir(&mut router, "stable"));
        router.save().expect("baseline save");
    }

    let (fault_storage, handle) = fault_injecting_storage(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::WriteChunkAtomic,
            fail_on: 1,
        }),
    )
    .expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        let response = create_dir(&mut router, "after-fault");
        assert!(!response.is_ok(), "faulted catalog mutation save must fail");
    }
    assert!(
        handle
            .operations()
            .contains(&StorageOperation::WriteChunkAtomic),
        "fault harness should observe catalog chunk writes"
    );

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    let items = get_items(&list_dir(&mut router, "/"));
    assert!(find_item_by_name(&items, "stable").is_some());
    assert!(find_item_by_name(&items, "after-fault").is_none());
}
