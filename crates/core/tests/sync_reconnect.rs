//! ADR-011: reconnect sync should return deltas (single-writer scenario).

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

#[test]
fn test_reconnect_sync_returns_deltas_for_changes() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    // Client A: initial change
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test_password");
        assert_rpc_ok(&create_dir(&mut router, "docs"));
        assert_rpc_ok(&create_dir_at(&mut router, "/docs", "a"));
        router.save().expect("save");
        lock_vault(&mut router);
    }

    // Client B: subsequent change
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test_password");
        assert_rpc_ok(&create_dir_at(&mut router, "/docs", "b"));
        router.save().expect("save");
        lock_vault(&mut router);
    }

    // Client A reconnects and asks for deltas.
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test_password");

        let response = router.handle(&RpcRequest::new(
            "catalog:sync:shard",
            serde_json::json!({"shard_id": "docs", "from_version": 0}),
        ));
        assert_rpc_ok(&response);
        let r = response.result().unwrap();

        assert!(
            r.get("current_version")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                > 0,
            "current_version must advance as changes are made"
        );
        assert_eq!(
            r.get("requires_full_load").and_then(|v| v.as_bool()),
            Some(false),
            "with available deltas, reconnect sync must not require full load"
        );
        assert!(
            r.get("deltas").and_then(|v| v.as_array()).is_some(),
            "deltas must be an array"
        );
        assert!(
            !r.get("deltas").unwrap().as_array().unwrap().is_empty(),
            "reconnect sync should include at least one delta"
        );
    }
}
