mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_malformed_json_request() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest {
        v: 1,
        command: "ping".to_string(),
        data: serde_json::json!(null),
    };
    let response = router.handle(&request);
    assert_rpc_ok(&response);
}

#[test]
fn test_missing_command_data() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let request = RpcRequest::new("catalog:createDir", serde_json::json!({}));
    let response = router.handle(&request);
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_unsupported_protocol_version() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest {
        v: 99,
        command: "ping".to_string(),
        data: serde_json::json!({}),
    };
    let response = router.handle(&request);
    assert!(!response.is_ok());
}

#[test]
fn test_empty_request_data_for_required_fields() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let request = RpcRequest::new("catalog:rename", serde_json::json!({}));
    let response = router.handle(&request);
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_wrong_field_types() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let request = RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": "not_a_number", "new_name": "test"}),
    );
    let response = router.handle(&request);
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_unknown_command() {
    let (mut router, _temp_dir) = create_test_router();

    let request = RpcRequest::new("unknown:command", serde_json::json!({}));
    let response = router.handle(&request);
    assert_rpc_error(&response, "UNKNOWN_COMMAND");
}

#[test]
fn test_catalog_operations_require_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let commands = vec![
        ("catalog:list", serde_json::json!({})),
        ("catalog:createDir", serde_json::json!({"name": "test"})),
        (
            "catalog:rename",
            serde_json::json!({"node_id": 1, "new_name": "test"}),
        ),
        ("catalog:delete", serde_json::json!({"node_id": 1})),
        (
            "catalog:move",
            serde_json::json!({"node_id": 1, "new_parent_path": "/"}),
        ),
    ];

    for (cmd, data) in commands {
        let request = RpcRequest::new(cmd, data);
        let response = router.handle(&request);
        assert!(!response.is_ok(), "Command {} should require vault", cmd);
    }
}

#[test]
fn test_double_unlock_fails() {
    let (mut router, _temp_dir) = create_test_router();

    unlock_vault(&mut router, "test");

    let request = RpcRequest::new("vault:unlock", serde_json::json!({"password": "another"}));
    let response = router.handle(&request);
    assert_rpc_error(&response, "VAULT_ALREADY_UNLOCKED");
}

#[test]
fn test_operations_on_nonexistent_nodes() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": 99999, "new_name": "test"}),
    ));
    assert_rpc_error(&response, "NODE_NOT_FOUND");

    let response = router.handle(&RpcRequest::new(
        "catalog:delete",
        serde_json::json!({"node_id": 99999}),
    ));
    // ADR-004: delete is idempotent (deleting missing nodes succeeds).
    assert_rpc_ok(&response);

    let response = router.handle(&RpcRequest::new(
        "catalog:move",
        serde_json::json!({"node_id": 99999, "new_parent_path": "/"}),
    ));
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_create_dir_with_invalid_parent() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "test", "parent_path": "/nonexistent"}),
    ));
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_create_duplicate_name() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "existing");

    let response = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "existing"}),
    ));
    assert_rpc_error(&response, "NAME_EXIST");
}

#[test]
fn test_rename_to_existing_name() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "dir1");
    create_dir(&mut router, "dir2");

    let items = get_items(&list_dir(&mut router, "/"));
    let node_id = find_item_by_name(&items, "dir1")
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();

    let response = router.handle(&RpcRequest::new(
        "catalog:rename",
        serde_json::json!({"node_id": node_id, "new_name": "dir2"}),
    ));
    assert_rpc_error(&response, "NAME_EXIST");
}

#[test]
fn test_move_to_nonexistent_path() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "source");

    let items = get_items(&list_dir(&mut router, "/"));
    let node_id = find_item_by_name(&items, "source")
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();

    let response = router.handle(&RpcRequest::new(
        "catalog:move",
        serde_json::json!({"node_id": node_id, "new_parent_path": "/nonexistent"}),
    ));
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}
