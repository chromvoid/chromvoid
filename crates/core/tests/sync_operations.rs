//! Integration tests for catalog sync operations (ADR-004 / ADR-003 target)

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

fn first_shard_id_from_sync_init(response: &chromvoid_core::rpc::types::RpcResponse) -> String {
    let result = response.result().expect("sync.init must return result");
    let shards = result
        .get("shards")
        .expect("sync.init result must include shards")
        .as_array()
        .expect("sync.init shards must be an array");
    assert!(
        !shards.is_empty(),
        "sync.init must return at least one shard"
    );
    shards[0]
        .get("shard_id")
        .expect("shard entry must include shard_id")
        .as_str()
        .expect("shard_id must be string")
        .to_string()
}

#[test]
fn test_sync_init_returns_sharded_shape() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    router.save().expect("save");

    let response = sync_init(&mut router);
    assert_rpc_ok(&response);

    let result = response.result().unwrap();
    assert_eq!(
        result.get("format").and_then(|v| v.as_str()),
        Some("sharded"),
        "ADR-004 expects v2 sync.init sharded response"
    );
    assert!(result.get("root_version").is_some());
    assert!(result.get("shards").is_some());
    assert!(result.get("eager_data").is_some());
}

#[test]
fn test_sync_init_shard_meta_and_eager_data_contract() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    // Ensure we have at least one non-eager shard.
    assert_rpc_ok(&create_dir(&mut router, "docs"));
    router.save().expect("save");

    let response = sync_init(&mut router);
    assert_rpc_ok(&response);
    let result = response.result().unwrap();

    let shards = result
        .get("shards")
        .and_then(|v| v.as_array())
        .expect("shards array");
    assert!(!shards.is_empty(), "expected at least one shard");

    let eager_data = result
        .get("eager_data")
        .and_then(|v| v.as_object())
        .expect("eager_data object");

    // ADR-028: system shards must not appear in sync:init.
    for shard in shards {
        let shard_id = shard
            .get("shard_id")
            .and_then(|v| v.as_str())
            .expect("shard_id");
        assert_ne!(
            shard_id, ".passmanager",
            "system shard must not appear in sync:init shards"
        );
        assert_ne!(
            shard_id, ".wallet",
            "system shard must not appear in sync:init shards"
        );

        let _version = shard
            .get("version")
            .and_then(|v| v.as_u64())
            .expect("version");
        let _size = shard.get("size").and_then(|v| v.as_u64()).expect("size");
        let _node_count = shard
            .get("node_count")
            .and_then(|v| v.as_u64())
            .expect("node_count");

        let strategy = shard
            .get("strategy")
            .and_then(|v| v.as_str())
            .expect("strategy");
        assert!(
            matches!(strategy, "eager" | "lazy" | "prefetch"),
            "unexpected strategy value: {strategy}"
        );

        let loaded = shard
            .get("loaded")
            .and_then(|v| v.as_bool())
            .expect("loaded");

        if loaded {
            let entry = eager_data
                .get(shard_id)
                .unwrap_or_else(|| panic!("expected eager_data entry for {shard_id}"));
            assert!(entry.get("version").and_then(|v| v.as_u64()).is_some());
            assert!(entry.get("root").is_some());
        } else {
            assert!(
                eager_data.get(shard_id).is_none(),
                "did not expect eager_data entry for non-eager shard {shard_id}"
            );
        }
    }

    // ADR-028: system shards must not appear in eager_data.
    assert!(
        eager_data.get(".passmanager").is_none(),
        ".passmanager must not appear in eager_data"
    );
    assert!(
        eager_data.get(".wallet").is_none(),
        ".wallet must not appear in eager_data"
    );
}

#[test]
fn test_sync_shard_returns_deltas_shape() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "test_dir");
    router.save().expect("save");

    let init = sync_init(&mut router);
    assert_rpc_ok(&init);
    let shard_id = first_shard_id_from_sync_init(&init);

    let response = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({"shard_id": shard_id, "from_version": 0}),
    ));

    assert_rpc_ok(&response);
    let result = response.result().unwrap();
    assert!(result.get("shard_id").is_some());
    assert!(result.get("current_version").is_some());
    assert!(result.get("deltas").is_some());
    assert!(result.get("requires_full_load").is_some());
}
