//! Regression tests for catalog:sync:manifest.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn catalog_sync_manifest_returns_bounded_root_summaries() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    assert_rpc_ok(&create_dir(&mut router, "media"));
    router.save().expect("save");

    let response = router.handle(&RpcRequest::new(
        "catalog:sync:manifest",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&response);

    let result = response.result().expect("manifest result");
    assert_eq!(
        result.get("format").and_then(|value| value.as_str()),
        Some("manifest")
    );
    assert!(
        result
            .get("manifest_budget_bytes")
            .and_then(|value| value.as_u64())
            .is_some(),
        "manifest must expose its payload budget"
    );

    let summaries = result
        .get("root_summaries")
        .and_then(|value| value.as_array())
        .expect("root_summaries array");
    let docs = summaries
        .iter()
        .find(|node| node.get("n").and_then(|value| value.as_str()) == Some("docs"))
        .expect("docs summary");
    assert_eq!(docs.get("h").and_then(|value| value.as_bool()), Some(true));
    assert!(
        docs.get("c").is_none(),
        "manifest root summaries must not include descendants"
    );
    assert!(
        !summaries
            .iter()
            .any(|node| node.get("n").and_then(|value| value.as_str()) == Some(".passmanager")),
        "system shards stay hidden"
    );

    let shards = result
        .get("shards")
        .and_then(|value| value.as_array())
        .expect("shards array");
    assert!(shards
        .iter()
        .any(|shard| { shard.get("shard_id").and_then(|value| value.as_str()) == Some("docs") }));
}
