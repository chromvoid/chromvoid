use super::*;
use crate::crypto::keystore::InMemoryKeystore;
use crate::rpc::types::RpcRequest;
use crate::storage::Storage;
use std::sync::Arc;
use tempfile::TempDir;

fn create_test_router() -> (RpcRouter, TempDir) {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let router = RpcRouter::new(storage).with_keystore(Arc::new(InMemoryKeystore::new()));
    (router, temp_dir)
}

#[test]
fn test_ping_pong() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest::new("ping", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(response.is_ok());
}

#[test]
fn test_unknown_command() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest::new("unknown:command", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(!response.is_ok());
}

#[test]
fn test_vault_unlock_lock() {
    let (mut router, _temp_dir) = create_test_router();

    assert!(!router.is_unlocked());

    let request = RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test_password"}),
    );
    let response = router.handle(&request);
    assert!(response.is_ok());
    assert!(router.is_unlocked());

    let request = RpcRequest::new("vault:lock", serde_json::json!({}));
    let response = router.handle(&request);
    assert!(response.is_ok());
    assert!(!router.is_unlocked());
}

#[test]
fn test_vault_status() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest::new("vault:status", serde_json::json!({}));
    let response = router.handle(&request);
    assert!(response.is_ok());

    let result = response.result().unwrap();
    assert_eq!(result.get("is_unlocked").unwrap().as_bool().unwrap(), false);

    let unlock_request = RpcRequest::new("vault:unlock", serde_json::json!({"password": "test"}));
    router.handle(&unlock_request);

    let response = router.handle(&request);
    let result = response.result().unwrap();
    assert_eq!(result.get("is_unlocked").unwrap().as_bool().unwrap(), true);
}

#[test]
fn test_catalog_requires_unlock() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest::new("catalog:list", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(!response.is_ok());
}

#[test]
fn test_catalog_crud() {
    let (mut router, _temp_dir) = create_test_router();

    let unlock = RpcRequest::new("vault:unlock", serde_json::json!({"password": "test"}));
    router.handle(&unlock);

    let create_dir = RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "documents"}),
    );
    let response = router.handle(&create_dir);
    assert!(response.is_ok());

    let node_id = response
        .result()
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();
    assert!(node_id > 0);

    let list = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&list);
    assert!(response.is_ok());

    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].get("name").unwrap().as_str().unwrap(), "documents");

    let rename = RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": node_id, "new_name": "docs"}),
    );
    let response = router.handle(&rename);
    assert!(response.is_ok());

    let list = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&list);
    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert_eq!(items[0].get("name").unwrap().as_str().unwrap(), "docs");

    let delete = RpcRequest::new("catalog:delete", serde_json::json!({"node_id": node_id}));
    let response = router.handle(&delete);
    assert!(response.is_ok());

    let list = RpcRequest::new("catalog:list", serde_json::json!({"path": "/"}));
    let response = router.handle(&list);
    let items = response
        .result()
        .unwrap()
        .get("items")
        .unwrap()
        .as_array()
        .unwrap();
    assert!(items.is_empty());
}

#[test]
fn test_catalog_sync_init() {
    let (mut router, _temp_dir) = create_test_router();

    let unlock = RpcRequest::new("vault:unlock", serde_json::json!({"password": "test"}));
    router.handle(&unlock);

    router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "docs"}),
    ));

    let sync = RpcRequest::new("catalog:sync:init", serde_json::json!({}));
    let response = router.handle(&sync);
    assert!(response.is_ok());

    let result = response.result().unwrap();
    assert_eq!(
        result.get("format").and_then(|v| v.as_str()),
        Some("sharded")
    );
    assert!(result.get("root_version").is_some());
    assert!(result.get("shards").is_some());
    assert!(result.get("eager_data").is_some());
}

#[test]
fn test_double_unlock_fails() {
    let (mut router, _temp_dir) = create_test_router();

    let unlock = RpcRequest::new("vault:unlock", serde_json::json!({"password": "test"}));

    let response1 = router.handle(&unlock);
    assert!(response1.is_ok());

    let response2 = router.handle(&unlock);
    assert!(!response2.is_ok());
}

#[test]
fn test_persistence_across_sessions() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");

    let ks = Arc::new(InMemoryKeystore::new());

    {
        let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
        let mut router = RpcRouter::new(storage).with_keystore(ks.clone());

        router.handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password": "test"}),
        ));

        router.handle(&RpcRequest::new(
            "catalog:createDir",
            serde_json::json!({"name": "persistent_dir"}),
        ));

        router.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
    }

    {
        let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
        let mut router = RpcRouter::new(storage).with_keystore(ks.clone());

        router.handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password": "test"}),
        ));

        let list = router.handle(&RpcRequest::new(
            "catalog:list",
            serde_json::json!({"path": "/"}),
        ));

        let items = list
            .result()
            .unwrap()
            .get("items")
            .unwrap()
            .as_array()
            .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].get("name").unwrap().as_str().unwrap(),
            "persistent_dir"
        );
    }
}
