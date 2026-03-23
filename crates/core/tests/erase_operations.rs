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
    let mut router = RpcRouter::new(storage).with_keystore(keystore);
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
}

#[test]
fn test_erase_execute_invalid_token() {
    let (mut router, _temp_dir) = create_router_with_master();

    // Token must be obtained via erase:confirm; a random one should be rejected.
    let response = erase_execute(&mut router, "invalid-token", MASTER_PASSWORD);
    // ADR-004: Erase токен невалиден/просрочен => ERASE_TOKEN_EXPIRED
    assert_rpc_error(&response, "ERASE_TOKEN_EXPIRED");
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
