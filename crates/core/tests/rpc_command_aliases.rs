//! ADR-004: legacy RPC command aliases must remain supported.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_catalog_sync_init_legacy_alias_is_supported() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let canonical = router.handle(&RpcRequest::new("catalog:sync:init", serde_json::json!({})));
    assert_rpc_ok(&canonical);

    let legacy = router.handle(&RpcRequest::new("catalog:syncInit", serde_json::json!({})));
    assert_rpc_ok(&legacy);

    let c = canonical.result().unwrap();
    let l = legacy.result().unwrap();

    // Minimal contract: both commands return the same v2 sharded shape.
    assert_eq!(c.get("format").and_then(|v| v.as_str()), Some("sharded"));
    assert_eq!(l.get("format").and_then(|v| v.as_str()), Some("sharded"));
    assert!(c.get("root_version").and_then(|v| v.as_u64()).is_some());
    assert!(l.get("root_version").and_then(|v| v.as_u64()).is_some());
    assert!(c.get("shards").and_then(|v| v.as_array()).is_some());
    assert!(l.get("shards").and_then(|v| v.as_array()).is_some());
    assert!(c.get("eager_data").is_some());
    assert!(l.get("eager_data").is_some());
}

#[test]
fn test_catalog_sync_shard_legacy_alias_is_supported() {
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

    let legacy = router.handle(&RpcRequest::new(
        "catalog:shard:sync",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_ok(&legacy);

    let c = canonical.result().unwrap();
    let l = legacy.result().unwrap();

    assert_eq!(c.get("shard_id").and_then(|v| v.as_str()), Some("docs"));
    assert_eq!(l.get("shard_id").and_then(|v| v.as_str()), Some("docs"));

    assert_eq!(
        c.get("requires_full_load").and_then(|v| v.as_bool()),
        l.get("requires_full_load").and_then(|v| v.as_bool())
    );
    assert!(
        c.get("deltas").and_then(|v| v.as_array()).is_some(),
        "deltas must be an array"
    );
    assert!(
        l.get("deltas").and_then(|v| v.as_array()).is_some(),
        "deltas must be an array"
    );
}
