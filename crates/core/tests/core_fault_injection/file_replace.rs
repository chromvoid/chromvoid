use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::test_util::{
    fault_injecting_storage, FaultHandle, FaultRule, StorageOperation,
};
use chromvoid_core::storage::Storage;
use tempfile::TempDir;

use crate::harness::run_fail_on_each;
use crate::support::{
    download_file, prepare_file, prepare_file_with_chunk_size, router_with_storage,
    OLD_VAULT_PASSWORD,
};
use crate::test_helpers::*;

fn file_replace_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let original = b"original bytes across chunk tail".to_vec();
    let replacement = b"new bytes".to_vec();
    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        prepare_file_with_chunk_size(&mut router, "file.bin", &original, Some(8))
    };

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        if unlock_vault(&mut router, OLD_VAULT_PASSWORD).is_ok() {
            let request = RpcRequest::new(
                "catalog:file:replace",
                serde_json::json!({
                    "node_id": node_id,
                    "size": replacement.len() as u64,
                    "conflict_mode": "overwrite",
                }),
            );
            let _ = router.handle_with_stream(
                &request,
                Some(RpcInputStream::from_bytes(replacement.clone())),
            );
        }
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    let bytes = download_file(&mut router, node_id);
    assert!(
        bytes == original || bytes == replacement,
        "file replace must leave either original or replacement bytes, got {bytes:?}"
    );
    handle
}

#[test]
fn file_replace_fail_on_each_selected_operation_keeps_a_valid_file() {
    for operation in [
        StorageOperation::WriteChunkAtomic,
        StorageOperation::DeleteChunk,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, file_replace_scenario);
    }
}

#[test]
fn file_replace_write_fault_keeps_existing_file_readable() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let original = b"original bytes".to_vec();
    let replacement = b"replacement bytes that should not win".to_vec();
    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        prepare_file(&mut router, "file.bin", &original)
    };

    let (fault_storage, _handle) = fault_injecting_storage(
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
        let request = RpcRequest::new(
            "catalog:file:replace",
            serde_json::json!({
                "node_id": node_id,
                "size": replacement.len() as u64,
                "conflict_mode": "overwrite",
            }),
        );
        match router.handle_with_stream(&request, Some(RpcInputStream::from_bytes(replacement))) {
            RpcReply::Json(response) => assert!(!response.is_ok(), "replace should fail"),
            RpcReply::Stream(_) | RpcReply::RangeStream(_) => panic!("replace must return JSON"),
        }
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    assert_eq!(download_file(&mut router, node_id), original);
}
