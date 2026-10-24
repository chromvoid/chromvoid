use super::wallet_tests::rpc;
use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::json;

#[tokio::test]
async fn auto_lock_bridge_emits_revocation_and_rejects_old_activity() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault")).unwrap();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    let initial = runtime.snapshot().unwrap();
    runtime
        .set_auto_lock_timeout(initial.generation, 1)
        .unwrap();
    assert!(matches!(
        runtime.snapshot().unwrap().phase,
        AirPhase::Locked
    ));
    assert!(matches!(
        runtime.record_user_activity(initial.generation),
        Err(BridgeError::SessionRevoked)
    ));
    assert_eq!(
        rpc(
            &runtime,
            1,
            "vault:unlock",
            json!({"password":"synthetic idle bridge"})
        )
        .await["ok"],
        true
    );
    let unlocked = runtime.snapshot().unwrap();
    runtime.record_user_activity(unlocked.generation).unwrap();
    let locked = tokio::time::timeout(Duration::from_secs(5), async {
        let mut sequence = unlocked.sequence;
        loop {
            let batch = runtime.events(sequence).await.unwrap();
            sequence = batch.snapshot.sequence;
            if matches!(batch.snapshot.phase, AirPhase::Locked) && !batch.snapshot.cleanup_pending {
                break batch.snapshot;
            }
        }
    })
    .await
    .expect("Rust idle lock must reach the native lifecycle stream");
    assert!(locked.generation > unlocked.generation);
    assert!(matches!(
        runtime.record_user_activity(unlocked.generation),
        Err(BridgeError::SessionRevoked)
    ));
    assert!(matches!(
        runtime.set_auto_lock_timeout(unlocked.generation, 0),
        Err(BridgeError::SessionRevoked)
    ));
    runtime.set_auto_lock_timeout(locked.generation, 0).unwrap();
    let inactive = runtime.deactivate().unwrap();
    assert!(matches!(
        runtime.record_user_activity(inactive.generation),
        Err(BridgeError::SessionRevoked)
    ));
    assert!(matches!(
        runtime.set_auto_lock_timeout(inactive.generation, 0),
        Err(BridgeError::SessionRevoked)
    ));
    runtime.shutdown().unwrap();
}
