//! Integration tests for complete vault workflows
//!
//! These tests exercise the full functionality of the core library
//! through high-level scenarios that span multiple operations.

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::sync::Arc;
use tempfile::TempDir;

mod test_helpers;

use test_helpers::enable_fast_kdf_for_tests;

/// Helper to create a test router with temporary storage
fn create_test_router() -> (RpcRouter, TempDir) {
    enable_fast_kdf_for_tests();

    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let router = RpcRouter::new(storage).with_keystore(keystore);
    (router, temp_dir)
}

#[test]
fn test_complete_vault_workflow() {
    let (mut router, _temp_dir) = create_test_router();

    // Test 1: ping
    let request = RpcRequest::new("ping", serde_json::json!({}));
    let response = router.handle(&request);
    assert!(response.is_ok(), "ping should succeed");
    let result = response.result().unwrap();
    assert_eq!(result.get("pong").unwrap().as_bool().unwrap(), true);

    // Test 2: Initial vault status (locked)
    let request = RpcRequest::new("vault:status", serde_json::json!({}));
    let response = router.handle(&request);
    assert!(response.is_ok(), "status should succeed");
    let result = response.result().unwrap();
    assert_eq!(
        result.get("is_unlocked").unwrap().as_bool().unwrap(),
        false,
        "vault should be locked initially"
    );

    // Test 3: Unlock vault
    let request = RpcRequest::new("vault:unlock", serde_json::json!({"password": "test123"}));
    let response = router.handle(&request);
    assert!(
        response.is_ok(),
        "unlock should succeed: {:?}",
        response.error_message()
    );

    // Test 4: Vault status after unlock
    let request = RpcRequest::new("vault:status", serde_json::json!({}));
    let response = router.handle(&request);
    assert!(response.is_ok(), "status should succeed");
    let result = response.result().unwrap();
    assert_eq!(
        result.get("is_unlocked").unwrap().as_bool().unwrap(),
        true,
        "vault should be unlocked"
    );

    // Test 5: List root directory
    let request = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&request);
    assert!(response.is_ok(), "list should succeed");
    let result = response.result().unwrap();
    assert_eq!(
        result.get("current_path").unwrap().as_str().unwrap(),
        "/",
        "should be root path"
    );

    // Test 6: Create directory
    let request = RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "test-folder"}),
    );
    let response = router.handle(&request);
    assert!(
        response.is_ok(),
        "createDir should succeed: {:?}",
        response.error_message()
    );
    let node_id = response
        .result()
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();
    assert!(node_id > 0, "should have valid node_id");

    // Test 7: List root and verify directory exists
    let request = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&request);
    assert!(response.is_ok(), "list should succeed");
    let result = response.result().unwrap();
    let items = result.get("items").unwrap().as_array().unwrap();
    let test_folder = items
        .iter()
        .find(|item| item.get("name").unwrap().as_str().unwrap() == "test-folder");
    assert!(test_folder.is_some(), "test-folder should exist in list");
    assert_eq!(
        test_folder
            .unwrap()
            .get("is_dir")
            .unwrap()
            .as_bool()
            .unwrap(),
        true,
        "should be a directory"
    );

    // Test 8: Create nested directories
    let request = RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "passwords"}),
    );
    router.handle(&request);

    let request = RpcRequest::new("catalog:createDir", serde_json::json!({"name": "banking"}));
    router.handle(&request);

    // Test 9: Lock vault
    let request = RpcRequest::new("vault:lock", serde_json::json!({}));
    let response = router.handle(&request);
    assert!(
        response.is_ok(),
        "lock should succeed: {:?}",
        response.error_message()
    );

    // Test 10: Vault status after lock
    let request = RpcRequest::new("vault:status", serde_json::json!({}));
    let response = router.handle(&request);
    assert!(response.is_ok(), "status should succeed");
    let result = response.result().unwrap();
    assert_eq!(
        result.get("is_unlocked").unwrap().as_bool().unwrap(),
        false,
        "vault should be locked again"
    );

    // Test 11: Catalog operations should fail when locked
    let request = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&request);
    assert!(!response.is_ok(), "list should fail when vault is locked");
    assert_eq!(
        response.code().unwrap(),
        "VAULT_REQUIRED",
        "should have VAULT_REQUIRED error code"
    );
}

#[test]
fn test_nested_directory_workflow() {
    let (mut router, _temp_dir) = create_test_router();

    // Unlock vault
    router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test123"}),
    ));

    // Create parent directory
    router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "documents"}),
    ));

    // Create nested directories using parent_path
    let _ = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"parent_path": "/documents", "name": "work"}),
    ));

    let _ = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"parent_path": "/documents", "name": "personal"}),
    ));

    // List documents directory
    let list_response = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/documents"}),
    ));
    assert!(list_response.is_ok());

    let items = list_response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert_eq!(items.len(), 2);
    let names: Vec<_> = items
        .iter()
        .map(|i| i.get("name").unwrap().as_str().unwrap())
        .collect();
    assert!(names.contains(&"work"));
    assert!(names.contains(&"personal"));
}

#[test]
fn test_vault_persistence_workflow() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    // Session 1: Create and modify data
    {
        let storage = Storage::new(storage_path).expect("failed to create storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

        // Unlock with password
        router.handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password": "secure-password"}),
        ));

        // Create directories
        router.handle(&RpcRequest::new(
            "catalog:createDir",
            serde_json::json!({"name": "important"}),
        ));

        router.handle(&RpcRequest::new(
            "catalog:createDir",
            serde_json::json!({"name": "archive"}),
        ));

        // Lock and save
        router.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
    }

    // Session 2: Verify persistence
    {
        let storage = Storage::new(storage_path).expect("failed to create storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

        // Status should be locked
        let _ = router.handle(&RpcRequest::new("vault:status", serde_json::json!({})));
        assert!(!router.is_unlocked());

        // Unlock with same password
        let response = router.handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password": "secure-password"}),
        ));
        assert!(response.is_ok(), "should unlock with correct password");

        // Verify directories persist
        let response = router.handle(&RpcRequest::new(
            "catalog:list",
            serde_json::json!({"path": "/"}),
        ));
        assert!(response.is_ok());

        let items = response
            .result()
            .unwrap()
            .get("items")
            .unwrap()
            .as_array()
            .unwrap();
        assert_eq!(items.len(), 2, "should have 2 persisted directories");

        let names: Vec<_> = items
            .iter()
            .map(|i| i.get("name").unwrap().as_str().unwrap())
            .collect();
        assert!(names.contains(&"important"));
        assert!(names.contains(&"archive"));
    }
}

#[test]
fn test_error_handling_workflow() {
    let (mut router, _temp_dir) = create_test_router();

    // Test 1: Unknown command
    let response = router.handle(&RpcRequest::new("unknown:command", serde_json::json!({})));
    assert!(!response.is_ok());
    assert_eq!(response.code().unwrap(), "UNKNOWN_COMMAND");

    // Test 2: Catalog operations without unlock
    let response = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/"}),
    ));
    assert!(!response.is_ok());
    assert_eq!(response.code().unwrap(), "VAULT_REQUIRED");

    // Test 3: Double unlock should fail
    router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));
    let response = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));
    assert!(!response.is_ok());
    assert_eq!(response.code().unwrap(), "VAULT_ALREADY_UNLOCKED");

    // Test 4: Missing password parameter
    let (mut router2, _temp_dir2) = create_test_router();
    let response = router2.handle(&RpcRequest::new("vault:unlock", serde_json::json!({})));
    assert!(!response.is_ok());
}

#[test]
fn test_rename_delete_workflow() {
    let (mut router, _temp_dir) = create_test_router();

    // Unlock
    router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));

    // Create directory
    let response = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "old-name"}),
    ));
    let node_id = response
        .result()
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();

    // Rename
    let response = router.handle(&RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": node_id, "new_name": "new-name"}),
    ));
    assert!(response.is_ok());

    // Verify rename
    let response = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/"}),
    ));
    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    let renamed = items
        .iter()
        .find(|i| i.get("name").unwrap().as_str().unwrap() == "new-name");
    assert!(renamed.is_some());
    assert_eq!(
        renamed.unwrap().get("node_id").unwrap().as_u64().unwrap(),
        node_id
    );

    // Delete
    let response = router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": node_id}),
    ));
    assert!(response.is_ok());

    // Verify deletion
    let response = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/"}),
    ));
    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert!(items.is_empty());
}
