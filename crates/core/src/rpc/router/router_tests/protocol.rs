use super::fixtures::*;
use super::*;

#[test]
fn test_ping_pong() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest::new("ping", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(response.is_ok());
}

#[test]
fn core_capabilities_reports_remote_media_features() {
    let (mut router, _temp_dir) = create_test_router();

    let response = router.handle(&RpcRequest::new("core:capabilities", serde_json::json!({})));

    assert!(response.is_ok());
    let result = response.result().expect("capabilities result");
    assert_eq!(
        result["protocol_version"],
        crate::rpc::types::PROTOCOL_VERSION
    );
    let features = result["features"]
        .as_array()
        .expect("features array")
        .iter()
        .filter_map(|feature| feature.as_str())
        .collect::<Vec<_>>();
    assert!(features.contains(&"media_inspection_cache_v1"));
    assert!(features.contains(&"remote_media_inspection_split_v1"));
    assert!(features.contains(&"remote_rpc_json_multiplex_v1"));
    assert!(features.contains(&"remote_rpc_priority_lock_v1"));
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
