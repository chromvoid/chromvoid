use std::fs;
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
    exactly_one_vault_password_can_read_file, prepare_file, router_with_storage,
    NEW_VAULT_PASSWORD, OLD_VAULT_PASSWORD,
};
use crate::test_helpers::*;

fn vault_rekey_scenario(rule: Option<FaultRule>) -> FaultHandle {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let expected = b"secret".to_vec();
    let node_id = {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        prepare_file(&mut router, "secret.bin", &expected)
    };

    let (fault_storage, handle) =
        fault_injecting_storage(temp_dir.path(), rule).expect("fault storage");
    {
        let mut router = router_with_storage(fault_storage, keystore.clone());
        if unlock_vault(&mut router, OLD_VAULT_PASSWORD).is_ok() {
            let _ = router.handle(&RpcRequest::new(
                "vault:rekey",
                serde_json::json!({
                    "current_password": OLD_VAULT_PASSWORD,
                    "new_password": NEW_VAULT_PASSWORD,
                }),
            ));
        }
    }

    exactly_one_vault_password_can_read_file(&temp_dir, keystore, node_id, &expected);
    handle
}

#[test]
fn vault_rekey_fail_on_each_selected_operation_keeps_one_valid_password() {
    for operation in [
        StorageOperation::WriteChunkAtomic,
        StorageOperation::DeleteChunk,
        StorageOperation::Sync,
    ] {
        run_fail_on_each(operation, vault_rekey_scenario);
    }
}

#[test]
fn vault_rekey_write_fault_keeps_old_password_valid() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
        prepare_file(&mut router, "secret.bin", b"secret");
    }

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
        let response = router.handle(&RpcRequest::new(
            "vault:rekey",
            serde_json::json!({
                "current_password": OLD_VAULT_PASSWORD,
                "new_password": NEW_VAULT_PASSWORD,
            }),
        ));
        assert!(!response.is_ok(), "faulted rekey should fail");
    }

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    assert_rpc_ok(&list_dir(&mut router, "/"));
}

#[test]
fn vault_unlock_recovery_failure_clears_session() {
    let temp_dir = TempDir::new().expect("temp dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    {
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let mut router = router_with_storage(storage, keystore.clone());
        assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    }
    fs::write(temp_dir.path().join("rekey.transaction.json"), b"not-json")
        .expect("write invalid rekey transaction");

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    let unlock = unlock_vault(&mut router, OLD_VAULT_PASSWORD);
    assert_rpc_error(&unlock, "INTERNAL_ERROR");

    let list = list_dir(&mut router, "/");
    assert_rpc_error(&list, "VAULT_REQUIRED");
}
