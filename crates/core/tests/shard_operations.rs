//! Integration tests for catalog shard operations

mod test_helpers;

use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_shard_list_returns_shards() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let request = RpcRequest::new("catalog:shard:list", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(response.is_ok());

    let result = response.result().unwrap();
    assert!(result.get("root_version").is_some());
    assert!(result.get("shards").is_some());
}

#[test]
fn test_shard_list_excludes_system_shards() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let request = RpcRequest::new("catalog:shard:list", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(response.is_ok());

    let result = response.result().unwrap();
    let shards = result.get("shards").unwrap().as_array().unwrap();
    for shard in shards {
        let sid = shard.get("shard_id").and_then(|v| v.as_str()).unwrap_or("");
        assert_ne!(
            sid, ".passmanager",
            "system shard .passmanager must not appear in shard:list"
        );
        assert_ne!(
            sid, ".wallet",
            "system shard .wallet must not appear in shard:list"
        );
    }
}

#[test]
fn test_shard_list_includes_user_shards() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    router.save().expect("save");

    let request = RpcRequest::new("catalog:shard:list", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(response.is_ok());

    let result = response.result().unwrap();
    let shards = result.get("shards").unwrap().as_array().unwrap();
    assert!(
        shards
            .iter()
            .any(|s| s.get("shard_id").and_then(|v| v.as_str()) == Some("docs")),
        "expected user shard 'docs' to be present in shard list"
    );
}

#[test]
fn test_shard_list_metadata_fields() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    router.save().expect("save");

    let request = RpcRequest::new("catalog:shard:list", serde_json::json!({}));
    let response = router.handle(&request);

    assert!(response.is_ok());

    let result = response.result().unwrap();
    let shards = result
        .get("shards")
        .unwrap()
        .as_array()
        .expect("shards must be array");
    if let Some(first) = shards.first() {
        assert!(first.get("shard_id").is_some());
        assert!(first.get("version").is_some());
        assert!(first.get("size").is_some());
        assert!(first.get("node_count").is_some());
        assert!(first.get("strategy").is_some());
        assert!(first.get("loaded").is_some());
    }
}

#[test]
fn test_shard_load_system_shard_denied() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let resp = router.handle(&RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": ".passmanager"}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");

    let resp = router.handle(&RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": ".wallet"}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_shard_load_nonexistent() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let request = RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": "nonexistent_shard"}),
    );
    let response = router.handle(&request);

    assert!(!response.is_ok());
    assert_rpc_error(&response, "SHARD_NOT_FOUND");
}

#[test]
fn test_shard_load_user_shard_allowed() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    router.save().expect("save");

    let request = RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": "docs"}),
    );
    let response = router.handle(&request);

    assert!(response.is_ok());
    let result = response.result().unwrap();
    assert!(result.get("shard_id").is_some());
    assert!(result.get("version").is_some());
    assert!(result.get("root").is_some());
}

#[test]
fn test_shard_load_passmanager_with_bypass() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    set_bypass_system_shard_guards(true);
    let create_pm = create_dir(&mut router, ".passmanager");
    assert!(create_pm.is_ok(), "should create .passmanager");

    let entry = create_dir_at(&mut router, "/.passmanager", "GitHub");
    assert!(entry.is_ok(), "should create entry dir");

    let list_resp = list_dir(&mut router, "/.passmanager");
    assert!(list_resp.is_ok());
    let items = get_items(&list_resp);
    assert!(
        items.len() >= 1,
        "catalog:list should return at least 1 child, got {}",
        items.len()
    );

    let load = router.handle(&RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": ".passmanager"}),
    ));
    assert!(load.is_ok());

    let result = load.result().unwrap();
    let root = result.get("root").expect("must have root");
    let children = root
        .get("c")
        .or_else(|| root.get("children"))
        .and_then(|v| v.as_array());
    assert!(
        children.is_some() && !children.unwrap().is_empty(),
        "shard:load root for .passmanager must include live children, got: {:?}",
        root
    );
    set_bypass_system_shard_guards(false);
}

#[test]
fn test_shard_sync_returns_deltas() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "dir");
    create_dir_at(&mut router, "/dir", "child");
    router.save().expect("save");

    let request = RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "dir", "from_version": 0}),
    );
    let response = router.handle(&request);

    assert!(response.is_ok());

    let result = response.result().unwrap();
    assert!(result.get("current_version").is_some());
    assert!(result.get("deltas").is_some());
    assert_eq!(
        result.get("requires_full_load").unwrap().as_bool().unwrap(),
        false
    );
}

#[test]
fn test_shard_sync_system_shard_denied() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let resp = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": ".passmanager", "from_version": 0}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");

    let resp = router.handle(&RpcRequest::new(
        "catalog:shard:sync",
        serde_json::json!({"shard_id": ".wallet", "from_version": 0}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_shard_sync_nonexistent_is_typed_error() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let request = RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "nonexistent_shard", "from_version": 0}),
    );
    let response = router.handle(&request);

    assert_rpc_error(&response, "SYNC_SHARD_NOT_FOUND");
}

#[test]
fn test_shard_compact_system_shard_denied() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let resp = router.handle(&RpcRequest::new(
        "catalog:shard:compact",
        serde_json::json!({"shard_id": ".passmanager"}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");

    let resp = router.handle(&RpcRequest::new(
        "catalog:shard:compact",
        serde_json::json!({"shard_id": ".wallet"}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_shard_compact_user_shard_allowed() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    router.save().expect("save");

    let request = RpcRequest::new(
        "catalog:shard:compact",
        serde_json::json!({"shard_id": "docs"}),
    );
    let response = router.handle(&request);

    assert!(response.is_ok());
    let result = response.result().unwrap();
    assert!(result.get("new_version").is_some());
    assert!(result.get("chunks_written").is_some());
}
