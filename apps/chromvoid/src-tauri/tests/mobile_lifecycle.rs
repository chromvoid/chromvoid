use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_lib::{
    mobile_background_lock_adapter, mobile_biometric_auth_for_tests, mobile_foreground_is_unlocked,
    mobile_set_test_biometric_override, BiometricAuthError, CoreAdapter, LocalCoreAdapter,
    TestBiometricOverride,
};
use serde_json::json;
use std::sync::Once;

static BIOMETRIC_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static TEST_ENV_INIT: Once = Once::new();

fn enable_local_core_test_keystore() {
    TEST_ENV_INIT.call_once(|| {
        std::env::set_var("CHROMVOID_TEST_INMEMORY_KEYSTORE", "1");
        std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1");
    });
}

fn unlocked_adapter() -> (tempfile::TempDir, Box<dyn CoreAdapter>) {
    enable_local_core_test_keystore();

    let tmp = tempfile::tempdir().expect("tempdir");
    let storage_root = tmp.path().join("storage");

    let mut adapter = LocalCoreAdapter::new(storage_root).expect("LocalCoreAdapter::new");
    adapter.set_master_key(Some("test-master-password".to_string()));

    let setup = RpcRequest::new(
        "master:setup".to_string(),
        json!({"master_password": "test-master-password"}),
    );
    match adapter.handle(&setup) {
        RpcResponse::Success { .. } => {}
        other => panic!("master:setup failed: {other:?}"),
    }

    let unlock = RpcRequest::new("vault:unlock".to_string(), json!({"password": "test"}));
    match adapter.handle(&unlock) {
        RpcResponse::Success { .. } => {}
        other => panic!("vault:unlock failed: {other:?}"),
    }

    (tmp, Box::new(adapter))
}

#[test]
fn mobile_background_locks_when_unlocked() {
    let (_tmp, mut adapter) = unlocked_adapter();
    assert!(
        adapter.is_unlocked(),
        "precondition: adapter must be unlocked"
    );

    let locked = mobile_background_lock_adapter(adapter.as_mut(), true);
    assert!(locked, "background notify should lock unlocked vault");
    assert!(
        !adapter.is_unlocked(),
        "vault must be locked after background notify"
    );
}

#[test]
fn mobile_background_is_noop_when_already_locked() {
    let (_tmp, mut adapter) = unlocked_adapter();

    // First call locks.
    assert!(mobile_background_lock_adapter(adapter.as_mut(), true));
    assert!(!adapter.is_unlocked());

    // Second call should be a no-op.
    let locked = mobile_background_lock_adapter(adapter.as_mut(), true);
    assert!(
        !locked,
        "second background notify should return false for already-locked vault"
    );
    assert!(!adapter.is_unlocked());
}

#[test]
fn mobile_background_is_noop_when_setting_disabled() {
    let (_tmp, mut adapter) = unlocked_adapter();
    assert!(
        adapter.is_unlocked(),
        "precondition: adapter must be unlocked"
    );

    let locked = mobile_background_lock_adapter(adapter.as_mut(), false);
    assert!(
        !locked,
        "background notify should not lock when background locking is disabled"
    );
    assert!(
        adapter.is_unlocked(),
        "vault must remain unlocked when background locking is disabled"
    );
}

#[test]
fn mobile_foreground_reports_current_unlock_state() {
    let (_tmp, mut adapter) = unlocked_adapter();
    assert!(mobile_foreground_is_unlocked(adapter.as_ref()));

    let _ = mobile_background_lock_adapter(adapter.as_mut(), true);
    assert!(
        !mobile_foreground_is_unlocked(adapter.as_ref()),
        "foreground must report locked state after background lock"
    );
}

#[test]
fn mobile_biometric_auth_reports_success_with_mocked_native_bridge() {
    let _guard = BIOMETRIC_TEST_LOCK.lock().expect("biometric test lock");
    mobile_set_test_biometric_override(Some(TestBiometricOverride {
        available: Some(true),
        auth_result: Some(Ok(())),
    }));

    let out = mobile_biometric_auth_for_tests(Some("Unlock vault".to_string()))
        .expect("expected mocked biometric auth success");
    assert_eq!(
        out.get("authenticated").and_then(|v| v.as_bool()),
        Some(true)
    );

    mobile_set_test_biometric_override(None);
}

#[test]
fn mobile_biometric_auth_maps_denied_error_from_native_bridge() {
    let _guard = BIOMETRIC_TEST_LOCK.lock().expect("biometric test lock");
    mobile_set_test_biometric_override(Some(TestBiometricOverride {
        available: Some(true),
        auth_result: Some(Err(BiometricAuthError::denied(
            "Biometric authentication failed",
        ))),
    }));

    let err = mobile_biometric_auth_for_tests(Some("Unlock vault".to_string()))
        .expect_err("expected mocked biometric denial");
    assert_eq!(err.1.as_deref(), Some("BIOMETRIC_DENIED"));

    mobile_set_test_biometric_override(None);
}

#[test]
fn mobile_biometric_auth_maps_cancelled_error_from_native_bridge() {
    let _guard = BIOMETRIC_TEST_LOCK.lock().expect("biometric test lock");
    mobile_set_test_biometric_override(Some(TestBiometricOverride {
        available: Some(true),
        auth_result: Some(Err(BiometricAuthError::cancelled("User cancelled prompt"))),
    }));

    let err = mobile_biometric_auth_for_tests(Some("Unlock vault".to_string()))
        .expect_err("expected mocked biometric cancellation");
    assert_eq!(err.1.as_deref(), Some("BIOMETRIC_CANCELLED"));

    mobile_set_test_biometric_override(None);
}

#[test]
fn mobile_biometric_auth_maps_internal_error_from_native_bridge() {
    let _guard = BIOMETRIC_TEST_LOCK.lock().expect("biometric test lock");
    mobile_set_test_biometric_override(Some(TestBiometricOverride {
        available: Some(true),
        auth_result: Some(Err(BiometricAuthError::internal(
            "Biometric bridge state is unavailable",
        ))),
    }));

    let err = mobile_biometric_auth_for_tests(Some("Continue to ChromVoid".to_string()))
        .expect_err("expected mocked biometric internal error");
    assert_eq!(err.1.as_deref(), Some("BIOMETRIC_INTERNAL"));

    mobile_set_test_biometric_override(None);
}
