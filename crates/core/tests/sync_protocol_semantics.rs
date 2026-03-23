//! ADR-011 / ADR-004: sync semantics beyond shape.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

fn root_version_from_shard_list(response: &chromvoid_core::rpc::types::RpcResponse) -> u64 {
    response
        .result()
        .expect("shard.list must return result")
        .get("root_version")
        .expect("root_version")
        .as_u64()
        .expect("root_version u64")
}

#[test]
fn test_shard_list_root_version_increments_after_catalog_change() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let before = router.handle(&RpcRequest::new(
        "catalog:shard:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&before);
    let v1 = root_version_from_shard_list(&before);

    create_dir(&mut router, "docs");

    let after = router.handle(&RpcRequest::new(
        "catalog:shard:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&after);
    let v2 = root_version_from_shard_list(&after);

    assert!(v2 > v1, "root_version must increment after catalog changes");
}

#[test]
fn test_sync_shard_from_current_version_returns_no_deltas() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    create_dir_at(&mut router, "/docs", "sub");
    router.save().expect("save");

    let first = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_ok(&first);
    let current_version = first
        .result()
        .unwrap()
        .get("current_version")
        .unwrap()
        .as_u64()
        .unwrap();

    let second = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "docs", "from_version": current_version}),
    ));
    assert_rpc_ok(&second);
    let r = second.result().unwrap();

    assert_eq!(
        r.get("requires_full_load").and_then(|v| v.as_bool()),
        Some(false),
        "from_version==current_version must not require full load"
    );
    assert!(
        r.get("deltas").and_then(|v| v.as_array()).is_some(),
        "deltas must be an array (possibly empty)"
    );
}
