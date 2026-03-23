//! Test helpers for integration tests

#![allow(dead_code)]

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::sync::{Arc, Once};
use tempfile::TempDir;

static FAST_KDF_INIT: Once = Once::new();

pub fn enable_fast_kdf_for_tests() {
    FAST_KDF_INIT.call_once(|| {
        if std::env::var_os("CHROMVOID_TEST_FAST_KDF").is_none() {
            std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1");
        }
    });
}

pub fn create_test_router_with_keystore() -> (RpcRouter, TempDir, Arc<InMemoryKeystore>) {
    enable_fast_kdf_for_tests();

    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let router = RpcRouter::new(storage).with_keystore(keystore.clone());
    (router, temp_dir, keystore)
}

pub fn create_test_router() -> (RpcRouter, TempDir) {
    let (router, temp_dir, _keystore) = create_test_router_with_keystore();
    (router, temp_dir)
}

pub fn unlock_vault(router: &mut RpcRouter, password: &str) -> RpcResponse {
    enable_fast_kdf_for_tests();

    let request = RpcRequest::new("vault:unlock", serde_json::json!({"password": password}));
    router.handle(&request)
}

pub fn lock_vault(router: &mut RpcRouter) -> RpcResponse {
    router.handle(&RpcRequest::new("vault:lock", serde_json::json!({})))
}

pub fn create_dir(router: &mut RpcRouter, name: &str) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": name}),
    ))
}

pub fn create_dir_at(router: &mut RpcRouter, parent_path: &str, name: &str) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"parent_path": parent_path, "name": name}),
    ))
}

pub fn list_dir(router: &mut RpcRouter, path: &str) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": path}),
    ))
}

pub fn rename_node(router: &mut RpcRouter, node_id: u64, new_name: &str) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": node_id, "new_name": new_name}),
    ))
}

pub fn delete_node(router: &mut RpcRouter, node_id: u64) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": node_id}),
    ))
}

pub fn move_node(router: &mut RpcRouter, node_id: u64, new_parent_path: &str) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:move",
        serde_json::json!({"node_id": node_id, "new_parent_path": new_parent_path}),
    ))
}

pub fn sync_init(router: &mut RpcRouter) -> RpcResponse {
    // ADR-004 (v2): canonical command name
    router.handle(&RpcRequest::new("catalog:sync:init", serde_json::json!({})))
}

pub fn assert_rpc_ok(response: &RpcResponse) {
    assert!(
        response.is_ok(),
        "Expected success, got error: {:?}",
        response.error_message()
    );
}

pub fn assert_rpc_error(response: &RpcResponse, expected_code: &str) {
    assert!(
        !response.is_ok(),
        "Expected error with code '{}', but got success",
        expected_code
    );
    assert_eq!(
        response.code().unwrap_or("NO_CODE"),
        expected_code,
        "Expected error code '{}', got '{:?}'",
        expected_code,
        response.code()
    );
}

pub fn get_node_id(response: &RpcResponse) -> u64 {
    response
        .result()
        .expect("response should have result")
        .get("node_id")
        .expect("result should have node_id")
        .as_u64()
        .expect("node_id should be u64")
}

pub fn get_items(response: &RpcResponse) -> Vec<serde_json::Value> {
    response
        .result()
        .expect("response should have result")
        .get("items")
        .expect("result should have items")
        .as_array()
        .expect("items should be array")
        .clone()
}

pub fn find_item_by_name<'a>(
    items: &'a [serde_json::Value],
    name: &str,
) -> Option<&'a serde_json::Value> {
    items.iter().find(|item| {
        item.get("name")
            .and_then(|n| n.as_str())
            .map(|n| n == name)
            .unwrap_or(false)
    })
}

pub fn get_item_names(items: &[serde_json::Value]) -> Vec<String> {
    items
        .iter()
        .filter_map(|item| {
            item.get("name")
                .and_then(|n| n.as_str())
                .map(|s| s.to_string())
        })
        .collect()
}

pub fn create_dir_tree(router: &mut RpcRouter, paths: &[&str]) -> Vec<u64> {
    let mut ids = Vec::new();
    for path in paths {
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if parts.is_empty() {
            continue;
        }

        let name = parts.last().unwrap();
        let parent = if parts.len() > 1 {
            format!("/{}", parts[..parts.len() - 1].join("/"))
        } else {
            "/".to_string()
        };

        let response = create_dir_at(router, &parent, name);
        if response.is_ok() {
            ids.push(get_node_id(&response));
        }
    }
    ids
}
