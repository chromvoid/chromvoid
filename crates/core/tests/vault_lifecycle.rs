//! Tests for vault lifecycle, persistence, and multiple vault scenarios

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn router_for_path(storage_path: &Path, keystore: Arc<InMemoryKeystore>) -> RpcRouter {
    let storage = Storage::new(storage_path).expect("storage");
    RpcRouter::new(storage).with_keystore(keystore)
}

// ============================================================================
// Vault lifecycle tests
// ============================================================================

#[test]
fn test_lock_saves_changes_automatically() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "test");
        create_dir(&mut router, "auto_saved");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "test");
        let items = get_items(&list_dir(&mut router, "/"));
        assert_eq!(items.len(), 1);
        assert_eq!(get_item_names(&items), vec!["auto_saved"]);
    }
}

#[test]
fn test_multiple_lock_unlock_cycles() {
    let (mut router, _temp_dir) = create_test_router();

    for i in 0..10 {
        let response = unlock_vault(&mut router, "test");
        assert_rpc_ok(&response);

        if i == 0 {
            create_dir(&mut router, "persistent");
        }

        let items = get_items(&list_dir(&mut router, "/"));
        assert_eq!(items.len(), 1);

        let response = lock_vault(&mut router);
        assert_rpc_ok(&response);
    }
}

#[test]
fn test_vault_status_transitions() {
    let (mut router, _temp_dir) = create_test_router();

    let status = router.handle(&RpcRequest::new("vault:status", serde_json::json!({})));
    let is_unlocked = status
        .result()
        .unwrap()
        .get("is_unlocked")
        .unwrap()
        .as_bool()
        .unwrap();
    assert!(!is_unlocked);

    unlock_vault(&mut router, "test");

    let status = router.handle(&RpcRequest::new("vault:status", serde_json::json!({})));
    let is_unlocked = status
        .result()
        .unwrap()
        .get("is_unlocked")
        .unwrap()
        .as_bool()
        .unwrap();
    assert!(is_unlocked);

    lock_vault(&mut router);

    let status = router.handle(&RpcRequest::new("vault:status", serde_json::json!({})));
    let is_unlocked = status
        .result()
        .unwrap()
        .get("is_unlocked")
        .unwrap()
        .as_bool()
        .unwrap();
    assert!(!is_unlocked);
}

#[test]
fn test_double_unlock_fails() {
    let (mut router, _temp_dir) = create_test_router();

    unlock_vault(&mut router, "test");

    let response = unlock_vault(&mut router, "test");
    assert_rpc_error(&response, "VAULT_ALREADY_UNLOCKED");
}

#[test]
fn test_lock_when_already_locked() {
    let (mut router, _temp_dir) = create_test_router();

    let response = lock_vault(&mut router);
    assert_rpc_ok(&response);

    let response = lock_vault(&mut router);
    assert_rpc_ok(&response);
}

#[test]
fn test_operations_after_lock() {
    let (mut router, _temp_dir) = create_test_router();

    unlock_vault(&mut router, "test");
    create_dir(&mut router, "test_dir");
    lock_vault(&mut router);

    let response = create_dir(&mut router, "another_dir");
    assert_rpc_error(&response, "VAULT_REQUIRED");

    let response = list_dir(&mut router, "/");
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

// ============================================================================
// Persistence tests
// ============================================================================

#[test]
fn test_persistence_across_sessions() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "persist");
        create_dir(&mut router, "dir1");
        create_dir(&mut router, "dir2");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "persist");

        let items = get_items(&list_dir(&mut router, "/"));
        assert_eq!(items.len(), 2);

        create_dir(&mut router, "dir3");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "persist");

        let items = get_items(&list_dir(&mut router, "/"));
        assert_eq!(items.len(), 3);
    }
}

#[test]
fn test_nested_structure_persistence() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "nested");

        create_dir(&mut router, "level1");
        create_dir_at(&mut router, "/level1", "level2");
        create_dir_at(&mut router, "/level1/level2", "level3");

        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "nested");

        assert_rpc_ok(&list_dir(&mut router, "/level1"));
        assert_rpc_ok(&list_dir(&mut router, "/level1/level2"));
        assert_rpc_ok(&list_dir(&mut router, "/level1/level2/level3"));
    }
}

// ============================================================================
// Multiple vaults tests
// ============================================================================

#[test]
fn test_multiple_vaults_in_same_storage() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    for i in 0..5 {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, &format!("vault_{}", i));
        create_dir(&mut router, &format!("data_{}", i));
        lock_vault(&mut router);
    }

    for i in 0..5 {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, &format!("vault_{}", i));
        let items = get_items(&list_dir(&mut router, "/"));

        assert_eq!(items.len(), 1);
        assert_eq!(get_item_names(&items), vec![format!("data_{}", i)]);
    }
}

#[test]
fn test_vault_switching() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = router_for_path(storage_path, keystore.clone());

    unlock_vault(&mut router, "vault_a");
    create_dir(&mut router, "a_data");
    lock_vault(&mut router);

    unlock_vault(&mut router, "vault_b");
    create_dir(&mut router, "b_data");
    lock_vault(&mut router);

    unlock_vault(&mut router, "vault_a");
    let items = get_items(&list_dir(&mut router, "/"));
    assert_eq!(get_item_names(&items), vec!["a_data"]);
    lock_vault(&mut router);

    unlock_vault(&mut router, "vault_b");
    let items = get_items(&list_dir(&mut router, "/"));
    assert_eq!(get_item_names(&items), vec!["b_data"]);
}

// ============================================================================
// Sync tests
// ============================================================================

fn root_version(response: &chromvoid_core::rpc::types::RpcResponse) -> u64 {
    response
        .result()
        .expect("sync.init must return result")
        .get("root_version")
        .expect("sync.init result must include root_version")
        .as_u64()
        .expect("root_version must be u64")
}

#[test]
fn test_sync_init_returns_catalog_structure() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "folder1");
    create_dir(&mut router, "folder2");

    let response = sync_init(&mut router);
    assert_rpc_ok(&response);

    let result = response.result().unwrap();
    // ADR-004: catalog:sync:init must support v2 sharded response.
    assert_eq!(
        result.get("format").and_then(|v| v.as_str()),
        Some("sharded"),
        "ADR-004 expects v2 sync.init sharded response"
    );
    assert!(result.get("root_version").is_some());
    assert!(result.get("shards").is_some());
    assert!(result.get("eager_data").is_some());
}

#[test]
fn test_version_increments_on_changes() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response1 = sync_init(&mut router);
    let version1 = root_version(&response1);

    create_dir(&mut router, "new_dir");

    let response2 = sync_init(&mut router);
    let version2 = root_version(&response2);

    assert!(
        version2 > version1,
        "root_version should increment after catalog changes"
    );
}

#[test]
fn test_root_version_persists_across_reopen() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    let version_before_reopen;
    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "test");

        create_dir(&mut router, "dir");
        let response = sync_init(&mut router);
        version_before_reopen = root_version(&response);
        assert!(
            version_before_reopen > 0,
            "root_version should increment after create"
        );

        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "test");

        let response = sync_init(&mut router);
        let version_after_reopen = root_version(&response);

        assert_eq!(
            version_after_reopen, version_before_reopen,
            "root_version must be durable and not reset on reopen"
        );
    }
}
