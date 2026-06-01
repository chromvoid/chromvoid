use super::types::{CachedEntryMeta, CachedOtpMeta};
use crate::crypto::keystore::InMemoryKeystore;
use crate::rpc::types::{RpcRequest, RpcResponse};
use crate::rpc::RpcRouter;
use crate::storage::Storage;
use std::sync::Arc;
use tempfile::TempDir;

fn create_test_router() -> (RpcRouter, TempDir) {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let router = RpcRouter::new(storage).with_keystore(keystore);
    (router, temp_dir)
}

fn assert_ok(response: &RpcResponse) {
    assert!(
        response.is_ok(),
        "expected success, got code={:?} error={:?}",
        response.code(),
        response.error_message()
    );
}

fn unlock_vault(router: &mut RpcRouter) {
    let unlock = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "pw"}),
    ));
    assert_ok(&unlock);
}

#[test]
fn passmanager_otp_generate_recovers_when_router_target_cache_is_stale() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router);

    let otp_id = "otp-cache-stale";
    let created_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-cache-stale",
            "title": "EntryCacheStale",
            "otps": [{"id": otp_id, "label": "Primary"}],
        }),
    ));
    assert_ok(&created_entry);
    let entry_id = created_entry
        .result()
        .and_then(|r| r.get("entry_id"))
        .and_then(|v| v.as_str())
        .expect("entry_id")
        .to_string();

    let set_secret = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": otp_id,
            "entry_id": entry_id,
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30,
        }),
    ));
    assert_ok(&set_secret);

    let warm = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"otp_id": otp_id, "entry_id": entry_id, "ts": 0}),
    ));
    assert_ok(&warm);

    {
        let mut cache = router
            .passmanager_otp_target_cache
            .lock()
            .expect("otp target cache lock");
        assert!(
            cache.ready,
            "otp target cache should be ready after warm call"
        );
        cache.entries = vec![CachedEntryMeta {
            node_id: 0,
            entry_id: Some("entry-cache-stale".to_string()),
            otps: vec![CachedOtpMeta {
                id: Some(otp_id.to_string()),
                preferred_label: Some("Primary".to_string()),
            }],
        }];
    }

    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"otp_id": otp_id, "entry_id": "entry-cache-stale", "ts": 0}),
    ));
    assert_ok(&generated);
    let otp = generated
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp");
    assert_eq!(otp.len(), 6);

    let cache = router
        .passmanager_otp_target_cache
        .lock()
        .expect("otp target cache lock");
    let refreshed_to_non_root = cache.entries.iter().any(|entry| {
        entry.node_id != 0
            && entry
                .otps
                .iter()
                .any(|otp| otp.id.as_deref() == Some(otp_id))
    });
    assert!(
        refreshed_to_non_root,
        "cache should refresh to real non-root target after stale miss"
    );
}

#[test]
fn passmanager_otp_target_cache_is_router_scoped() {
    let (mut first, _first_dir) = create_test_router();
    unlock_vault(&mut first);
    let (mut second, _second_dir) = create_test_router();
    unlock_vault(&mut second);

    let first_entry = first.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-one",
            "title": "EntryOne",
            "otps": [{"id": "shared-otp", "label": "One"}],
        }),
    ));
    assert_ok(&first_entry);
    let first_set = first.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "shared-otp",
            "entry_id": "entry-one",
            "secret": "JBSWY3DPEHPK3PXP",
        }),
    ));
    assert_ok(&first_set);

    let first_generate = first.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"otp_id": "shared-otp", "entry_id": "entry-one", "ts": 0}),
    ));
    assert_ok(&first_generate);
    assert!(
        first
            .passmanager_otp_target_cache
            .lock()
            .expect("first otp target cache lock")
            .ready
    );

    let second_generate = second.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"otp_id": "shared-otp", "entry_id": "entry-one", "ts": 0}),
    ));
    assert_eq!(second_generate.code(), Some("OTP_SECRET_NOT_FOUND"));
    assert!(
        !second
            .passmanager_otp_target_cache
            .lock()
            .expect("second otp target cache lock")
            .ready
    );
}
