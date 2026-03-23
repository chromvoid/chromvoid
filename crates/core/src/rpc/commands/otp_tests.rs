use super::*;

use std::sync::Arc;

use crate::crypto::keystore::InMemoryKeystore;
use crate::rpc::types::RpcRequest;
use crate::rpc::RpcRouter;
use crate::storage::Storage;
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
fn test_passmanager_otp_generate_recovers_when_target_cache_is_stale() {
    let cache = OTP_TARGET_CACHE.get_or_init(|| Mutex::new(OtpTargetCache::default()));
    {
        let mut guard = cache.lock().expect("cache lock");
        *guard = OtpTargetCache::default();
    }

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
        let mut guard = cache.lock().expect("cache lock");
        assert!(
            guard.ready,
            "otp target cache should be ready after warm call"
        );
        guard.entries = vec![CachedEntryMeta {
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

    {
        let mut guard = cache.lock().expect("cache lock");
        let refreshed_to_non_root = guard.entries.iter().any(|entry| {
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
        *guard = OtpTargetCache::default();
    }
}
