//! ADR-004 erase.* flow (target contract)

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

const MASTER_PASSWORD: &str = "correct horse battery staple";

fn create_router_with_master() -> (RpcRouter, TempDir) {
    enable_fast_kdf_for_tests();

    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage)
        .with_master_key(MASTER_PASSWORD)
        .with_keystore(keystore);
    let setup = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup);
    (router, temp_dir)
}

fn erase_confirm(router: &mut RpcRouter) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new("erase:confirm", serde_json::json!({})))
}

fn erase_initiate(router: &mut RpcRouter) -> chromvoid_core::rpc::types::RpcResponse {
    // Back-compat alias (ADR-004 table).
    router.handle(&RpcRequest::new("erase:initiate", serde_json::json!({})))
}

fn erase_execute(
    router: &mut RpcRouter,
    erase_token: &str,
    master_password: &str,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        "erase:execute",
        serde_json::json!({
            "erase_token": erase_token,
            "master_password": master_password,
        }),
    ))
}

#[test]
fn test_erase_confirm_returns_token_and_preview() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = erase_confirm(&mut router);
    assert_rpc_ok(&response);

    let result = response.result().unwrap();
    assert!(result.get("erase_token").is_some());
    assert!(result.get("devices").is_some());
    assert!(result.get("storage_paths").is_some());
}

#[test]
fn test_erase_initiate_alias_returns_token_and_preview() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = erase_initiate(&mut router);
    assert_rpc_ok(&response);

    let result = response.result().unwrap();
    assert!(result.get("erase_token").is_some());
    assert!(result.get("devices").is_some());
    assert!(result.get("storage_paths").is_some());
}

#[test]
fn test_erase_execute_invalid_master_password() {
    let (mut router, _temp_dir) = create_router_with_master();

    let confirm = erase_confirm(&mut router);
    assert_rpc_ok(&confirm);
    let token = confirm
        .result()
        .unwrap()
        .get("erase_token")
        .unwrap()
        .as_str()
        .unwrap();

    let response = erase_execute(&mut router, token, "wrong-password");
    assert_rpc_error(&response, "INVALID_MASTER_PASSWORD");
    assert_eq!(response.error_message(), Some("Invalid master password"));
}

#[test]
fn test_erase_execute_invalid_token() {
    let (mut router, _temp_dir) = create_router_with_master();

    // Token must be obtained via erase:confirm; a random one should be rejected.
    let response = erase_execute(&mut router, "invalid-token", MASTER_PASSWORD);
    // ADR-004: Erase token invalid / expired => ERASE TOKEN EXPIRED
    assert_rpc_error(&response, "ERASE_TOKEN_EXPIRED");
    assert_eq!(response.error_message(), Some("Erase token expired"));
}

#[test]
fn test_erase_execute_erases_storage() {
    let (mut router, temp_dir) = create_router_with_master();

    // Create some data to ensure erase is observable.
    unlock_vault(&mut router, "vault_password");
    create_dir(&mut router, "documents");
    lock_vault(&mut router);

    let confirm = erase_confirm(&mut router);
    assert_rpc_ok(&confirm);
    let token = confirm
        .result()
        .unwrap()
        .get("erase_token")
        .unwrap()
        .as_str()
        .unwrap();

    let response = erase_execute(&mut router, token, MASTER_PASSWORD);
    assert_rpc_ok(&response);

    // Target behavior: BLANK state (no master artifacts remain).
    assert!(!temp_dir.path().join("master.salt").exists());
    assert!(!temp_dir.path().join("master.verify").exists());

    // Chunk store must be cleared.
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let chunks = storage.list_chunks().expect("list chunks");
    assert!(chunks.is_empty());
}

#[test]
fn test_erase_execute_clears_backup_local_session_state() {
    let (mut router, _temp_dir) = create_router_with_master();
    // Local backup now requires an unlocked vault.
    unlock_vault(&mut router, "vault_password");

    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start);
    let backup_id = start
        .result()
        .unwrap()
        .get("backup_id")
        .and_then(|v| v.as_str())
        .expect("backup_id")
        .to_string();

    let confirm = erase_confirm(&mut router);
    assert_rpc_ok(&confirm);
    let token = confirm
        .result()
        .unwrap()
        .get("erase_token")
        .unwrap()
        .as_str()
        .unwrap();

    assert_rpc_ok(&erase_execute(&mut router, token, MASTER_PASSWORD));

    // After erase, any in-progress backup session state must be cleared.
    let finish = router.handle(&RpcRequest::new(
        "backup:local:finish",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_error(&finish, "NODE_NOT_FOUND");
}

#[test]
fn test_erase_execute_returns_stats_fields() {
    let (mut router, _temp_dir) = create_router_with_master();

    let confirm = erase_confirm(&mut router);
    assert_rpc_ok(&confirm);
    let token = confirm
        .result()
        .unwrap()
        .get("erase_token")
        .unwrap()
        .as_str()
        .unwrap();

    let response = erase_execute(&mut router, token, MASTER_PASSWORD);
    assert_rpc_ok(&response);

    // ADR-004 attachments: erase:execute returns a stats object.
    let result = response.result().expect("erase:execute must return result");
    assert!(result
        .get("erased_bytes")
        .and_then(|v| v.as_u64())
        .is_some());
    assert!(result
        .get("erased_chunks")
        .and_then(|v| v.as_u64())
        .is_some());
    assert!(result
        .get("time_elapsed_ms")
        .and_then(|v| v.as_u64())
        .is_some());
}

fn storage_bytes(
    root: &std::path::Path,
) -> std::collections::BTreeMap<std::path::PathBuf, Vec<u8>> {
    fn visit(
        root: &std::path::Path,
        path: &std::path::Path,
        files: &mut std::collections::BTreeMap<std::path::PathBuf, Vec<u8>>,
    ) {
        for entry in std::fs::read_dir(path).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(root, &path, files);
            } else {
                files.insert(
                    path.strip_prefix(root).unwrap().to_path_buf(),
                    std::fs::read(path).unwrap(),
                );
            }
        }
    }
    let mut files = std::collections::BTreeMap::new();
    visit(root, root, &mut files);
    files
}

#[test]
fn canceled_erase_preserves_bytes_and_key_and_requires_new_confirmation() {
    use chromvoid_core::crypto::keystore::Keystore;
    for cancel_at_check in [1, 2] {
        let (mut router, root, key) = create_test_router_with_keystore();
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "master:setup",
            serde_json::json!({"master_password":MASTER_PASSWORD}),
        )));
        unlock_vault(&mut router, "synthetic vault password");
        create_dir(&mut router, "cancel-preserved");
        lock_vault(&mut router);
        let before = storage_bytes(root.path());
        let pepper = key.load_storage_pepper().unwrap().unwrap();
        let review = erase_confirm(&mut router);
        let token = review.result().unwrap()["erase_token"].as_str().unwrap();
        let calls = std::cell::Cell::new(0);
        let response = router.handle_erase_execute_cancellable(
            &serde_json::json!({"erase_token":token, "master_password":MASTER_PASSWORD}),
            &|| {
                calls.set(calls.get() + 1);
                calls.get() == cancel_at_check
            },
            &mut || panic!("Canceled erase must not start deletion"),
        );
        assert_rpc_error(&response, "ERASE_TOKEN_EXPIRED");
        assert_eq!(calls.get(), cancel_at_check);
        assert_eq!(storage_bytes(root.path()), before);
        assert_eq!(key.load_storage_pepper().unwrap(), Some(pepper));
        assert_rpc_error(
            &erase_execute(&mut router, token, MASTER_PASSWORD),
            "ERASE_TOKEN_EXPIRED",
        );
        let next = erase_confirm(&mut router);
        let next_token = next.result().unwrap()["erase_token"].as_str().unwrap();
        assert_rpc_ok(&erase_execute(&mut router, next_token, MASTER_PASSWORD));
        assert_eq!(key.load_storage_pepper().unwrap(), None);
        assert_rpc_error(
            &erase_execute(&mut router, next_token, MASTER_PASSWORD),
            "ERASE_TOKEN_EXPIRED",
        );
    }
}

#[test]
fn locking_invalidates_erase_review_without_changing_storage() {
    let (mut router, root) = create_router_with_master();
    unlock_vault(&mut router, "synthetic vault password");
    create_dir(&mut router, "preserved-after-lock");
    lock_vault(&mut router);
    let before = storage_bytes(root.path());
    let review = erase_confirm(&mut router);
    let token = review.result().unwrap()["erase_token"].as_str().unwrap();
    lock_vault(&mut router);
    assert_rpc_error(
        &erase_execute(&mut router, token, MASTER_PASSWORD),
        "ERASE_TOKEN_EXPIRED",
    );
    assert_eq!(storage_bytes(root.path()), before);
}

#[test]
fn invalid_authorization_preserves_every_storage_artifact_and_pepper() {
    use chromvoid_core::crypto::keystore::Keystore;
    let (mut router, root, key) = create_test_router_with_keystore();
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password":MASTER_PASSWORD}),
    )));
    unlock_vault(&mut router, "synthetic vault password");
    create_dir(&mut router, "preserved-with-wrong-password");
    lock_vault(&mut router);
    let before = storage_bytes(root.path());
    let pepper = key.load_storage_pepper().unwrap().unwrap();
    let review = erase_confirm(&mut router);
    let token = review.result().unwrap()["erase_token"].as_str().unwrap();
    assert_rpc_error(
        &erase_execute(&mut router, token, "incorrect"),
        "INVALID_MASTER_PASSWORD",
    );
    assert_rpc_error(
        &erase_execute(&mut router, "different token", MASTER_PASSWORD),
        "ERASE_TOKEN_EXPIRED",
    );
    assert_eq!(storage_bytes(root.path()), before);
    assert_eq!(key.load_storage_pepper().unwrap(), Some(pepper));
}

#[test]
fn erase_does_not_report_success_when_primary_key_deletion_fails() {
    use chromvoid_core::crypto::keystore::{Keystore, KeystoreError};
    struct FailingDelete(InMemoryKeystore);
    impl Keystore for FailingDelete {
        fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
            self.0.load_storage_pepper()
        }
        fn store_storage_pepper(&self, value: [u8; 32]) -> Result<(), KeystoreError> {
            self.0.store_storage_pepper(value)
        }
        fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
            Err(KeystoreError::Unavailable)
        }
    }
    enable_fast_kdf_for_tests();
    let root = TempDir::new().unwrap();
    let key = Arc::new(FailingDelete(InMemoryKeystore::new()));
    let mut router = RpcRouter::new(Storage::new(root.path()).unwrap()).with_keystore(key.clone());
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password":MASTER_PASSWORD}),
    )));
    unlock_vault(&mut router, "synthetic vault password");
    create_dir(&mut router, "removed-but-key-cleanup-failed");
    let review = erase_confirm(&mut router);
    let token = review.result().unwrap()["erase_token"].as_str().unwrap();
    assert_rpc_error(
        &erase_execute(&mut router, token, MASTER_PASSWORD),
        "KEYSTORE_UNAVAILABLE",
    );
    assert!(key.load_storage_pepper().unwrap().is_some());
    assert!(Storage::new(root.path())
        .unwrap()
        .list_chunks()
        .unwrap()
        .is_empty());
    assert!(!root.path().join("master.verify").exists());
    assert!(!router.is_unlocked());
    assert_rpc_error(
        &erase_execute(&mut router, token, MASTER_PASSWORD),
        "ERASE_TOKEN_EXPIRED",
    );
}

#[test]
fn cancellation_during_failed_authentication_also_invalidates_erase_token() {
    let (mut router, root) = create_router_with_master();
    let before = storage_bytes(root.path());
    let review = erase_confirm(&mut router);
    let token = review.result().unwrap()["erase_token"].as_str().unwrap();
    let calls = std::cell::Cell::new(0);
    let response = router.handle_erase_execute_cancellable(
        &serde_json::json!({"erase_token":token, "master_password":"incorrect password"}),
        &|| {
            calls.set(calls.get() + 1);
            calls.get() == 2
        },
        &mut || panic!("Canceled erase must not start deletion"),
    );
    assert_rpc_error(&response, "ERASE_TOKEN_EXPIRED");
    assert_eq!(calls.get(), 2);
    assert_rpc_error(
        &erase_execute(&mut router, token, MASTER_PASSWORD),
        "ERASE_TOKEN_EXPIRED",
    );
    assert_eq!(storage_bytes(root.path()), before);
}

#[test]
fn failed_administrator_artifact_cleanup_still_deletes_primary_key() {
    use chromvoid_core::crypto::keystore::Keystore;
    use chromvoid_core::storage::test_util::{
        fault_injecting_storage, FaultRule, StorageOperation,
    };
    let (mut router, root, key) = create_test_router_with_keystore();
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password":MASTER_PASSWORD}),
    )));
    unlock_vault(&mut router, "synthetic vault password");
    create_dir(&mut router, "removed-before-cleanup-error");
    lock_vault(&mut router);
    drop(router);
    let (storage, _handle) = fault_injecting_storage(
        root.path(),
        Some(FaultRule {
            operation: StorageOperation::RemoveArtifact,
            // Reset removes format and vault salt, then cleanup removes master salt.
            fail_on: 4,
        }),
    )
    .unwrap();
    let mut router = RpcRouter::new(storage).with_keystore(key.clone());
    let review = erase_confirm(&mut router);
    let token = review.result().unwrap()["erase_token"].as_str().unwrap();
    assert_rpc_error(
        &erase_execute(&mut router, token, MASTER_PASSWORD),
        "INTERNAL_ERROR",
    );
    assert!(root.path().join("master.verify").exists());
    assert!(!root.path().join("master.salt").exists());
    assert!(key.load_storage_pepper().unwrap().is_none());
    assert!(Storage::new(root.path())
        .unwrap()
        .list_chunks()
        .unwrap()
        .is_empty());
}
