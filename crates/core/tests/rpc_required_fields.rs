mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_required_fields_vault_unlock() {
    let (mut router, _temp_dir) = create_test_router();

    let resp = router.handle(&RpcRequest::new("vault:unlock", serde_json::json!({})));
    assert_rpc_error(&resp, "EMPTY_PAYLOAD");
}

#[test]
fn test_required_fields_master_setup() {
    let (mut router, _temp_dir) = create_test_router();

    let resp = router.handle(&RpcRequest::new("master:setup", serde_json::json!({})));
    assert_rpc_error(&resp, "EMPTY_PAYLOAD");
}

#[test]
fn test_required_fields_catalog_mutations() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_error(
        &router.handle(&RpcRequest::new("catalog:createDir", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new("catalog:rename", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:rename",
            serde_json::json!({"node_id": 1}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new("catalog:delete", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new("catalog:move", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:move",
            serde_json::json!({"node_id": 1}),
        )),
        "EMPTY_PAYLOAD",
    );

    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:prepareUpload",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:prepareUpload",
            serde_json::json!({"name": "file.bin"}),
        )),
        "EMPTY_PAYLOAD",
    );
}

#[test]
fn test_required_fields_stream_placeholders() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_error(
        &router.handle(&RpcRequest::new("catalog:upload", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new("catalog:download", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:secret:write",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:secret:read",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
}

#[test]
fn test_required_fields_shard_commands() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:shard:load",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:sync:shard",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:shard:compact",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
}

#[test]
fn test_required_fields_vault_export() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "vault:export:start",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "vault:export:downloadChunk",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "vault:export:finish",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
}

#[test]
fn test_required_fields_admin_and_erase() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_error(
        &router.handle(&RpcRequest::new("admin:backup", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new("admin:restore", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new("admin:erase", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );

    assert_rpc_error(
        &router.handle(&RpcRequest::new("erase:execute", serde_json::json!({}))),
        "EMPTY_PAYLOAD",
    );
}

#[test]
fn test_required_fields_backup_restore_local() {
    let (mut router, _temp_dir) = create_test_router();

    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "backup:local:downloadChunk",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "backup:local:getMetadata",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "backup:local:finish",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );

    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "restore:local:validate",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "restore:local:start",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "restore:local:uploadChunk",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "restore:local:commit",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
}

#[test]
fn test_required_fields_otp_and_secret_erase() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "catalog:secret:erase",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
}
