//! Legacy catalog sync commands are intentionally removed.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_legacy_catalog_sync_init_commands_are_unknown() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    for command in [
        "catalog:sync:init",
        "catalog:syncInit",
        "catalog:sync:delta",
    ] {
        let response = router.handle(&RpcRequest::new(command, serde_json::json!({})));
        assert_rpc_error(&response, "UNKNOWN_COMMAND");
    }
}

#[test]
fn test_catalog_sync_shard_is_the_only_shard_sync_command() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    create_dir_at(&mut router, "/docs", "sub");
    router.save().expect("save");

    let canonical = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_ok(&canonical);

    let c = canonical.result().unwrap();

    assert_eq!(c.get("shard_id").and_then(|v| v.as_str()), Some("docs"));
    assert!(
        c.get("deltas").and_then(|v| v.as_array()).is_some(),
        "deltas must be an array"
    );

    let legacy = router.handle(&RpcRequest::new(
        "catalog:shard:sync",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_error(&legacy, "UNKNOWN_COMMAND");
}
