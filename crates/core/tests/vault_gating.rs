//! ADR-004: commands that require an unlocked vault must return VAULT_REQUIRED.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use test_helpers::*;

#[test]
fn test_vault_gating_for_catalog_commands() {
    let (mut router, _temp_dir) = create_test_router();

    // Non-stream catalog commands.
    for cmd in [
        "catalog:list",
        "catalog:createDir",
        "catalog:rename",
        "catalog:delete",
        "catalog:move",
        "catalog:prepareUpload",
        "catalog:sync:init",
        "catalog:sync:delta",
        "catalog:shard:list",
        "catalog:shard:load",
        "catalog:sync:shard",
        "catalog:secret:erase",
        "catalog:subscribe",
        "catalog:unsubscribe",
    ] {
        let response = router.handle(&RpcRequest::new(cmd, serde_json::json!({})));
        assert_rpc_error(&response, "VAULT_REQUIRED");
    }

    let response = router.handle(&RpcRequest::new(
        "catalog:shard:compact",
        serde_json::json!({"shard_id": "user_shard"}),
    ));
    assert_rpc_error(&response, "VAULT_REQUIRED");

    // Stream commands must also be vault-gated.
    let upload = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": 1, "size": 1, "offset": 0}),
    );
    match router.handle_with_stream(&upload, Some(RpcInputStream::from_bytes(vec![0u8]))) {
        RpcReply::Json(r) => assert_rpc_error(&r, "VAULT_REQUIRED"),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    let download = RpcRequest::new("catalog:download", serde_json::json!({"node_id": 1}));
    match router.handle_with_stream(&download, None) {
        RpcReply::Json(r) => assert_rpc_error(&r, "VAULT_REQUIRED"),
        RpcReply::Stream(_) => panic!("expected JSON error response"),
    }

    let secret_write = RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({"node_id": 1, "size": 1, "offset": 0}),
    );
    match router.handle_with_stream(&secret_write, Some(RpcInputStream::from_bytes(vec![0u8]))) {
        RpcReply::Json(r) => assert_rpc_error(&r, "VAULT_REQUIRED"),
        RpcReply::Stream(_) => panic!("catalog:secret:write must return JSON response"),
    }

    let secret_read = RpcRequest::new("catalog:secret:read", serde_json::json!({"node_id": 1}));
    match router.handle_with_stream(&secret_read, None) {
        RpcReply::Json(r) => assert_rpc_error(&r, "VAULT_REQUIRED"),
        RpcReply::Stream(_) => panic!("expected JSON error response"),
    }
}

#[test]
fn test_vault_export_requires_unlock() {
    let (mut router, _temp_dir) = create_test_router();
    let response = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    assert_rpc_error(&response, "VAULT_NOT_UNLOCKED");
}
