use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_lib::{
    mobile_background_lock_adapter, mobile_biometric_auth_for_tests, mobile_foreground_is_unlocked,
    mobile_set_test_biometric_override, AndroidAutofillAdapter, AutofillContext,
    BiometricAuthError, CoreAdapter, CoreMode, LocalCoreAdapter, TestBiometricOverride,
};
use serde_json::json;
use std::collections::VecDeque;

static BIOMETRIC_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

struct ScriptedAdapter {
    unlocked: bool,
    status_queue: VecDeque<serde_json::Value>,
    listed_candidates: Vec<serde_json::Value>,
    get_secret_called: bool,
    events: Vec<serde_json::Value>,
}

impl ScriptedAdapter {
    fn new(
        status_queue: Vec<serde_json::Value>,
        listed_candidates: Vec<serde_json::Value>,
    ) -> Self {
        Self {
            unlocked: true,
            status_queue: VecDeque::from(status_queue),
            listed_candidates,
            get_secret_called: false,
            events: Vec::new(),
        }
    }
}

impl CoreAdapter for ScriptedAdapter {
    fn mode(&self) -> CoreMode {
        CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        self.unlocked
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        match req.command.as_str() {
            "credential_provider:status" => {
                let status = self
                    .status_queue
                    .pop_front()
                    .unwrap_or_else(|| json!({"enabled": true, "vault_open": self.unlocked}));
                RpcResponse::success(status)
            }
            "credential_provider:list" => {
                RpcResponse::success(json!({"candidates": self.listed_candidates}))
            }
            "credential_provider:session:open" => {
                RpcResponse::success(json!({"provider_session": "test-provider-session"}))
            }
            "credential_provider:getSecret" => {
                self.get_secret_called = true;
                RpcResponse::success(json!({
                    "credential_id": "cred-example",
                    "username": "alice@example.com",
                    "password": "correct horse battery staple"
                }))
            }
            "credential_provider:session:close" => RpcResponse::success(json!({})),
            "vault:lock" => {
                self.unlocked = false;
                RpcResponse::success(json!({}))
            }
            _ => RpcResponse::error(
                format!("unsupported command in scripted adapter: {}", req.command),
                Some("UNKNOWN_COMMAND"),
            ),
        }
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        _stream: Option<RpcInputStream>,
    ) -> RpcReply {
        RpcReply::Json(self.handle(req))
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn take_events(&mut self) -> Vec<serde_json::Value> {
        std::mem::take(&mut self.events)
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}

fn unlocked_adapter() -> (tempfile::TempDir, Box<dyn CoreAdapter>) {
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

#[test]
fn mobile_autofill_list_surfaces_degraded_state_when_provider_disabled() {
    let mut adapter = ScriptedAdapter::new(
        vec![json!({"enabled": false, "vault_open": true})],
        vec![json!({
            "credential_id": "cred-example",
            "label": "Example",
            "username": "alice@example.com",
            "domain": "app.example.com",
            "match": "exact"
        })],
    );

    let context = AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let mut autofill = AndroidAutofillAdapter::new(&mut adapter);
    let listed = autofill.list(&context);
    assert!(
        listed.candidates.is_empty(),
        "provider-disabled flow must not return candidates"
    );

    let degraded = listed
        .degraded
        .expect("provider-disabled flow must expose degraded state");
    assert_eq!(degraded.code, "PROVIDER_DISABLED");
    assert!(degraded.message.contains("provider is disabled"));
}

#[test]
fn mobile_autofill_lock_transition_blocks_secret_retrieval() {
    let mut adapter = ScriptedAdapter::new(
        vec![
            json!({"enabled": true, "vault_open": true}),
            json!({"enabled": true, "vault_open": false}),
        ],
        vec![json!({
            "credential_id": "cred-example",
            "label": "Example",
            "username": "alice@example.com",
            "domain": "app.example.com",
            "match": "exact"
        })],
    );

    let context = AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let mut autofill = AndroidAutofillAdapter::new(&mut adapter);
    let listed = autofill.list(&context);
    assert!(
        listed.degraded.is_none(),
        "initial list must succeed while unlocked"
    );
    assert_eq!(
        listed.candidates.len(),
        1,
        "precondition: one allowlisted credential"
    );

    let err = autofill
        .get_secret(&context, "cred-example", None)
        .expect_err("locked transition must block secret retrieval");
    assert_eq!(err.code, "VAULT_REQUIRED");
    assert!(err.message.contains("unlock vault"));
    assert!(
        !adapter.get_secret_called,
        "adapter must fail closed before credential_provider:getSecret dispatch"
    );
}
