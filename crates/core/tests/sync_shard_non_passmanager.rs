//! Phase 3.2 + Phase 4.2: per-shard delta persistence and sync.shard semantics.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_sync_shard_for_lazy_shard_returns_deltas_and_load_is_current() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    // Create a shard at root, then mutate within it so it produces shard-local deltas.
    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "work"));
    router.save().expect("save");

    // sync.shard should now be available for the lazy shard.
    let sync = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": "docs", "from_version": 0}),
    ));
    assert_rpc_ok(&sync);
    let r = sync.result().unwrap();
    assert_eq!(
        r.get("requires_full_load").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(r.get("current_version").and_then(|v| v.as_u64()), Some(1));
    let deltas = r
        .get("deltas")
        .and_then(|v| v.as_array())
        .expect("deltas array");
    assert!(!deltas.is_empty(), "expected at least one delta for docs");
    assert_eq!(deltas[0].get("seq").and_then(|v| v.as_u64()), Some(1));

    // catalog:shard:load should return the current shard tree (snapshot + deltas applied).
    let load = router.handle(&RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": "docs"}),
    ));
    assert_rpc_ok(&load);
    let root = load.result().unwrap().get("root").expect("root field");
    assert_eq!(root.get("n").and_then(|v| v.as_str()), Some("docs"));
    let children = root
        .get("c")
        .and_then(|v| v.as_array())
        .expect("docs children");
    assert!(
        children
            .iter()
            .any(|c| c.get("n").and_then(|v| v.as_str()) == Some("work")),
        "expected 'work' to exist under docs"
    );
}
