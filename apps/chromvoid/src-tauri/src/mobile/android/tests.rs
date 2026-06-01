use super::{autofill, biometric, bridge_contract, passkey, password_save, provider_status};
use crate::core_adapter::{CoreAdapter, RemoteHost};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chromvoid_core::license::{
    BuildPolicy, LicenseCert, LicenseStore, SignedCert, LICENSE_KEY_ID_2026_01,
};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

static SHARED_PROVIDER_TEST_LOCK: Mutex<()> = Mutex::new(());

fn unlocked_adapter() -> (tempfile::TempDir, Box<dyn crate::CoreAdapter>) {
    let tmp = tempfile::tempdir().expect("tempdir");
    let storage_root = tmp.path().join("storage");
    let license_store = test_pro_license_store(tmp.path().join("license"));

    let mut adapter =
        crate::LocalCoreAdapter::new_with_test_license_store(storage_root, license_store)
            .expect("LocalCoreAdapter::new_with_test_license_store");
    adapter.set_master_key(Some("test-master-password".to_string()));

    let setup = RpcRequest::new(
        "master:setup".to_string(),
        json!({"master_password": "test-master-password"}),
    );
    let _ = adapter.handle(&setup);

    let unlock = RpcRequest::new("vault:unlock".to_string(), json!({"password": "test"}));
    let _ = adapter.handle(&unlock);

    (tmp, Box::new(adapter))
}

fn test_pro_license_store(root: PathBuf) -> LicenseStore {
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let mut trusted_keys = BTreeMap::new();
    trusted_keys.insert(
        LICENSE_KEY_ID_2026_01.to_string(),
        signing_key.verifying_key(),
    );
    let store = LicenseStore::with_trusted_keys(root, BuildPolicy::Enforce, trusted_keys);
    let payload = LicenseCert {
        v: 1,
        kid: LICENSE_KEY_ID_2026_01.to_string(),
        license_id: "android-autofill-test".to_string(),
        featureset: "pro".to_string(),
        seat_limit: 1,
        device_fingerprint: store.device_fingerprint().expect("device fingerprint"),
        issued_at: "2026-05-22T00:00:00Z".to_string(),
        exp: None,
        source: Some("test".to_string()),
    };
    let payload_bytes = serde_json::to_vec(&payload).expect("license payload");
    let signature = signing_key.sign(&payload_bytes);
    store
        .install_cert(SignedCert {
            payload,
            signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        })
        .expect("install test pro license");
    store
}

fn ensure_entry(adapter: &mut dyn crate::CoreAdapter) {
    use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;

    set_bypass_system_shard_guards(true);
    let _ = adapter.handle(&RpcRequest::new(
        "catalog:createDir".to_string(),
        json!({"name": ".passmanager", "parent_path": "/"}),
    ));
    let entry = adapter.handle(&RpcRequest::new(
        "catalog:createDir".to_string(),
        json!({"name": "Example", "parent_path": "/.passmanager"}),
    ));
    let _ = entry
        .result()
        .and_then(|v| v.get("node_id"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let meta = serde_json::json!({
      "id": "cred-example",
      "title": "Example Account",
      "username": "alice@example.com",
      "urls": [{"value": "https://example.com/login", "match": "base_domain"}],
    })
    .to_string();
    let meta_resp = adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload".to_string(),
            json!({
                "name": "meta.json",
                "total_size": meta.len(),
                "size": meta.len(),
                "offset": 0,
                "parent_path": "/.passmanager/Example",
                "mime_type": "application/json",
            }),
        ),
        Some(chromvoid_core::rpc::RpcInputStream::from_bytes(
            meta.into_bytes(),
        )),
    );
    let meta_node = match meta_resp {
        chromvoid_core::rpc::RpcReply::Json(response) => response
            .result()
            .and_then(|v| v.get("node_id"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        _ => 0,
    };
    let _ = meta_node;

    let pwd = b"correct horse battery staple".to_vec();
    let pwd_resp = adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload".to_string(),
            json!({
                "name": ".password",
                "total_size": 0,
                "size": 0,
                "offset": 0,
                "parent_path": "/.passmanager/Example",
                "mime_type": "text/plain",
            }),
        ),
        Some(chromvoid_core::rpc::RpcInputStream::from_bytes(Vec::new())),
    );
    let pwd_node = match pwd_resp {
        chromvoid_core::rpc::RpcReply::Json(response) => response
            .result()
            .and_then(|v| v.get("node_id"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        _ => 0,
    };
    let _ = adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:secret:write".to_string(),
            json!({"node_id": pwd_node, "size": pwd.len()}),
        ),
        Some(chromvoid_core::rpc::RpcInputStream::from_bytes(pwd)),
    );

    let _ = adapter.handle(&RpcRequest::new(
        "passmanager:otp:setSecret".to_string(),
        json!({
          "entry_id": "cred-example",
          "label": "default",
          "secret": "JBSWY3DPEHPK3PXP",
          "encoding": "base32",
          "algorithm": "SHA1",
          "digits": 6,
          "period": 30,
        }),
    ));
    set_bypass_system_shard_guards(false);
}

struct ScriptedPasskeyAdapter {
    commands: Vec<String>,
    status_queue: VecDeque<Value>,
}

impl ScriptedPasskeyAdapter {
    fn new(status_queue: Vec<Value>) -> Self {
        Self {
            commands: Vec::new(),
            status_queue: VecDeque::from(status_queue),
        }
    }
}

impl crate::CoreAdapter for ScriptedPasskeyAdapter {
    fn mode(&self) -> crate::CoreMode {
        crate::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.commands.push(req.command.clone());
        match req.command.as_str() {
            "credential_provider:status" => {
                let status = self
                    .status_queue
                    .pop_front()
                    .unwrap_or_else(|| json!({"enabled": true, "vault_open": true}));
                RpcResponse::success(status)
            }
            "credential_provider:passkey:create" | "credential_provider:passkey:get" => {
                RpcResponse::success(json!({"credentialIdB64Url": "cred-a"}))
            }
            "credential_provider:passkey:query" => RpcResponse::success(json!({"passkeys": []})),
            _ => RpcResponse::error("unsupported command", Some("UNKNOWN_COMMAND")),
        }
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        _stream: Option<chromvoid_core::rpc::RpcInputStream>,
    ) -> chromvoid_core::rpc::RpcReply {
        chromvoid_core::rpc::RpcReply::Json(self.handle(req))
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn take_events(&mut self) -> Vec<Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}

#[test]
fn maps_success_state() {
    assert!(biometric::map_prompt_result(biometric::AUTH_STATE_SUCCESS, 0).is_ok());
}

#[test]
fn bridge_contract_wraps_payload_with_current_version() {
    let payload = json!({"ok": true, "result": {"enabled": true}});
    let encoded = bridge_contract::encode_response(payload.clone());

    assert_eq!(
        encoded
            .get("contract_version")
            .and_then(|value| value.as_u64()),
        Some(bridge_contract::ANDROID_BRIDGE_CONTRACT_VERSION)
    );
    assert_eq!(encoded.get("payload"), Some(&payload));
}

#[test]
fn bridge_contract_rejects_unknown_request_version() {
    let error = bridge_contract::decode_request(
        r#"{"contract_version":999,"payload":{"title":"github.com"}}"#,
    )
    .expect_err("expected contract mismatch");

    assert_eq!(
        error.get("code").and_then(|value| value.as_str()),
        Some("CONTRACT_MISMATCH")
    );
}

#[test]
fn maps_denied_state() {
    let err =
        biometric::map_prompt_result(biometric::AUTH_STATE_DENIED, 0).expect_err("expected denied");
    assert_eq!(err.code(), "BIOMETRIC_DENIED");
}

#[test]
fn maps_cancelled_state() {
    let err = biometric::map_prompt_result(biometric::AUTH_STATE_CANCELLED, 0)
        .expect_err("expected cancelled");
    assert_eq!(err.code(), "BIOMETRIC_CANCELLED");
}

#[test]
fn maps_android_error_code_with_ios_semantics() {
    use biometric::map_android_error_code;

    let denied = map_android_error_code(7); // BIOMETRIC_ERROR_LOCKOUT
    assert_eq!(denied.code(), "BIOMETRIC_DENIED");

    let cancelled = map_android_error_code(13); // BIOMETRIC_ERROR_NEGATIVE_BUTTON
    assert_eq!(cancelled.code(), "BIOMETRIC_CANCELLED");

    let unavailable = map_android_error_code(11); // BIOMETRIC_ERROR_NO_BIOMETRICS
    assert_eq!(unavailable.code(), "BIOMETRIC_UNAVAILABLE");
}

#[test]
fn password_save_requests_register_and_finish_once() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let runtime = password_save::AndroidPasswordSaveRuntimeState::new();
    let token = password_save::register_password_save_request(
        &runtime,
        password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        },
    )
    .expect("token");

    let (payload, state) = password_save::get_password_save_request(&runtime, &token)
        .expect("store")
        .expect("payload");
    assert_eq!(payload.password, "pw-123");
    assert_eq!(state, password_save::PasswordSaveRequestState::Pending);

    let launched =
        password_save::mark_password_save_request_launched(&runtime, &token).expect("launch");
    assert!(launched);
    let (_, state) = password_save::get_password_save_request(&runtime, &token)
        .expect("store")
        .expect("payload");
    assert_eq!(state, password_save::PasswordSaveRequestState::Launched);

    let finished = password_save::finish_password_save_request(
        &runtime,
        &token,
        password_save::AndroidPasswordSaveOutcome::Saved,
    )
    .expect("finish");
    assert!(finished);
    let (_, state) = password_save::get_password_save_request(&runtime, &token)
        .expect("store")
        .expect("state");
    assert_eq!(state, password_save::PasswordSaveRequestState::Saved);

    let duplicate = password_save::finish_password_save_request(
        &runtime,
        &token,
        password_save::AndroidPasswordSaveOutcome::Saved,
    )
    .expect("duplicate finish");
    assert!(!duplicate);
}

#[test]
fn password_save_requests_are_invalidated_explicitly() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let runtime = password_save::AndroidPasswordSaveRuntimeState::new();
    let token = password_save::register_password_save_request(
        &runtime,
        password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        },
    )
    .expect("token");

    let invalidated = password_save::invalidate_all_password_save_requests(&runtime, "background");
    assert_eq!(invalidated, 1);

    let (_, state) = password_save::get_password_save_request(&runtime, &token)
        .expect("store")
        .expect("state");
    assert_eq!(state, password_save::PasswordSaveRequestState::Dismissed);
}

#[test]
fn password_save_runtime_instances_do_not_share_requests() {
    let first = password_save::AndroidPasswordSaveRuntimeState::new();
    let second = password_save::AndroidPasswordSaveRuntimeState::new();
    let token = password_save::register_password_save_request(
        &first,
        password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        },
    )
    .expect("token");

    assert!(password_save::get_password_save_request(&first, &token)
        .expect("first store")
        .is_some());
    assert!(password_save::get_password_save_request(&second, &token)
        .expect("second store")
        .is_none());
}

#[test]
fn password_save_mark_launched_is_one_shot() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let runtime = password_save::AndroidPasswordSaveRuntimeState::new();
    let token = password_save::register_password_save_request(
        &runtime,
        password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        },
    )
    .expect("token");

    assert!(password_save::mark_password_save_request_launched(&runtime, &token).expect("launch"));
    assert!(
        !password_save::mark_password_save_request_launched(&runtime, &token)
            .expect("launch again")
    );
}

#[test]
fn runtime_password_save_request_fails_closed_for_terminal_states() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let runtime = password_save::AndroidPasswordSaveRuntimeState::new();
    let token = password_save::register_password_save_request(
        &runtime,
        password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        },
    )
    .expect("token");
    let _ = password_save::finish_password_save_request(
        &runtime,
        &token,
        password_save::AndroidPasswordSaveOutcome::Dismissed,
    )
    .expect("finish");

    let response = password_save::runtime_password_save_request_with_runtime(&runtime, &token);
    assert_eq!(response.get("ok").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        response.get("state").and_then(|v| v.as_str()),
        Some("dismissed")
    );
}

#[test]
fn autofill_adapter_lists_allowed_domain_and_reads_secret() {
    let (_tmp, mut adapter) = unlocked_adapter();
    ensure_entry(adapter.as_mut());

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let mut af = autofill::AndroidAutofillAdapter::new(adapter.as_mut());
    let listed = af.list(&context, false);
    assert!(listed.degraded.is_none(), "{:?}", listed.degraded);
    assert_eq!(listed.candidates.len(), 1);
    assert_eq!(listed.candidates[0].credential_id, "cred-example");

    let secret = af
        .get_secret(&context, "cred-example", None)
        .expect("allowed candidate must resolve secret");
    assert_eq!(secret.username, "alice@example.com");
    assert_eq!(
        secret.password.as_deref(),
        Some("correct horse battery staple")
    );
}

#[test]
fn autofill_adapter_returns_degraded_state_when_vault_locked() {
    let (_tmp, mut adapter) = unlocked_adapter();
    let _ = adapter.handle(&RpcRequest::new("vault:lock".to_string(), json!({})));

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let mut af = autofill::AndroidAutofillAdapter::new(adapter.as_mut());
    let listed = af.list(&context, false);
    let degraded = listed
        .degraded
        .expect("vault-locked flow must return degraded state");
    assert_eq!(degraded.code, "VAULT_REQUIRED");
    assert!(degraded.message.contains("unlock vault"));
}

#[test]
fn passkeys_lite_status_is_ready_on_api_34_plus() {
    let status = provider_status::android_provider_status_for_api(34);
    assert_eq!(
        status.passkeys_lite,
        provider_status::PasskeysLiteState::Ready
    );
    assert_eq!(
        status.password_provider,
        provider_status::ProviderPathState::Ready
    );
    assert_eq!(
        status.autofill_fallback,
        provider_status::ProviderPathState::Ready
    );
}

#[test]
fn passkeys_lite_status_uses_password_provider_and_autofill_on_api_28_to_33() {
    let status = provider_status::android_provider_status_for_api(33);
    assert_eq!(
        status.passkeys_lite,
        provider_status::PasskeysLiteState::Unsupported
    );
    assert_eq!(
        status.password_provider,
        provider_status::ProviderPathState::Ready
    );
    assert_eq!(
        status.autofill_fallback,
        provider_status::ProviderPathState::Ready
    );
    assert_eq!(
        status.unsupported_reason.as_deref(),
        Some("passkeys_lite requires Android API 34+"),
    );
}

#[test]
fn passkeys_lite_status_is_unsupported_below_api_28() {
    let status = provider_status::android_provider_status_for_api(27);
    assert_eq!(
        status.passkeys_lite,
        provider_status::PasskeysLiteState::Unsupported
    );
    assert_eq!(
        status.password_provider,
        provider_status::ProviderPathState::Unsupported
    );
    assert_eq!(
        status.autofill_fallback,
        provider_status::ProviderPathState::Unsupported
    );
    assert_eq!(
        status.unsupported_reason.as_deref(),
        Some("Credential provider requires Android API 28+"),
    );
}

#[test]
fn passkey_requests_fail_closed_when_adapter_is_not_local() {
    struct RemoteAdapter;

    impl crate::CoreAdapter for RemoteAdapter {
        fn mode(&self) -> crate::CoreMode {
            crate::CoreMode::Remote {
                host: RemoteHost::MobileBle {
                    device_id: "remote-device".to_string(),
                },
            }
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
            RpcResponse::success(json!({}))
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<serde_json::Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    let mut adapter = RemoteAdapter;
    let request = passkey::PasskeyLiteRequest {
        command: passkey::PasskeyLiteCommand::Get,
        payload: json!({"rp_id": "example.com"}),
    };
    let err = passkey::AndroidPasskeyAdapter::new(&mut adapter, 34)
        .handle(&request)
        .expect_err("non-local adapter path must fail closed");
    assert_eq!(err.code, "POLICY_DENIED");
    assert!(err.message.contains("local Core adapter"));
}

#[test]
fn passkey_requests_fail_closed_when_provider_is_disabled() {
    let mut adapter = ScriptedPasskeyAdapter::new(vec![json!({
        "enabled": false,
        "vault_open": true
    })]);
    let request = passkey::PasskeyLiteRequest {
        command: passkey::PasskeyLiteCommand::Get,
        payload: json!({"rp_id": "example.com"}),
    };

    let err = passkey::AndroidPasskeyAdapter::new(&mut adapter, 34)
        .handle(&request)
        .expect_err("disabled provider path must fail closed");

    assert_eq!(err.code, "PROVIDER_DISABLED");
    assert_eq!(
        err.message,
        "Passkeys unavailable: provider is disabled in settings"
    );
}

#[test]
fn passkey_requests_do_not_fall_back_to_autofill_list_path() {
    let mut adapter = ScriptedPasskeyAdapter::new(vec![json!({
        "enabled": true,
        "vault_open": true
    })]);
    let request = passkey::PasskeyLiteRequest {
        command: passkey::PasskeyLiteCommand::Create,
        payload: json!({"rp_id": "example.com"}),
    };

    let result = passkey::AndroidPasskeyAdapter::new(&mut adapter, 34)
        .handle(&request)
        .expect("passkey command must dispatch through Core");
    assert_eq!(
        result.get("credentialIdB64Url").and_then(|v| v.as_str()),
        Some("cred-a")
    );
    assert!(
        adapter
            .commands
            .iter()
            .all(|cmd| cmd != "credential_provider:list"),
        "passkey path must not route into autofill list fallback"
    );
}

#[test]
fn passkey_requests_require_policy_preflight_and_fail_closed() {
    let mut adapter = ScriptedPasskeyAdapter::new(vec![json!({
        "enabled": true,
        "vault_open": false
    })]);
    let request = passkey::PasskeyLiteRequest {
        command: passkey::PasskeyLiteCommand::Get,
        payload: json!({"rp_id": "example.com"}),
    };

    let err = passkey::AndroidPasskeyAdapter::new(&mut adapter, 34)
        .handle(&request)
        .expect_err("policy preflight must deny while vault is locked");
    assert_eq!(err.code, "VAULT_REQUIRED");
    assert_eq!(
        adapter.commands,
        vec!["credential_provider:status".to_string()]
    );
}

#[test]
fn runtime_autofill_bridge_round_trip_uses_allowlisted_session() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let (_tmp, mut adapter) = unlocked_adapter();
    ensure_entry(adapter.as_mut());
    super::register_test_provider_adapter(Arc::new(Mutex::new(adapter)));
    let runtime = super::AndroidAutofillRuntimeState::new();

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let listed = autofill::runtime_autofill_list_with_runtime(&runtime, &context, false);
    assert_eq!(listed.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert!(listed.get("debug").is_none());
    let session_id = listed
        .get("session_id")
        .and_then(|v| v.as_str())
        .expect("session_id");
    let candidates = listed
        .get("candidates")
        .and_then(|v| v.as_array())
        .expect("candidates");
    assert_eq!(candidates.len(), 1);

    let secret = autofill::runtime_autofill_get_secret_with_runtime(
        &runtime,
        session_id,
        "cred-example",
        None,
    );
    assert_eq!(secret.get("ok").and_then(|v| v.as_bool()), Some(true));
    let result = secret.get("result").expect("result");
    assert_eq!(
        result.get("password").and_then(|v| v.as_str()),
        Some("correct horse battery staple")
    );
}

#[test]
fn runtime_autofill_list_respects_debug_flag() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let (_tmp, mut adapter) = unlocked_adapter();
    ensure_entry(adapter.as_mut());
    super::register_test_provider_adapter(Arc::new(Mutex::new(adapter)));
    let runtime = super::AndroidAutofillRuntimeState::new();

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let without_debug = autofill::runtime_autofill_list_with_runtime(&runtime, &context, false);
    assert_eq!(
        without_debug.get("ok").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert!(without_debug.get("debug").is_none());

    let with_debug = autofill::runtime_autofill_list_with_runtime(&runtime, &context, true);
    assert_eq!(with_debug.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        with_debug
            .get("debug")
            .and_then(|v| v.get("entry_count"))
            .and_then(|v| v.as_u64()),
        Some(1)
    );
}

#[test]
fn runtime_autofill_close_session_invalidates_pending_session() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let (_tmp, mut adapter) = unlocked_adapter();
    ensure_entry(adapter.as_mut());
    super::register_test_provider_adapter(Arc::new(Mutex::new(adapter)));
    let runtime = super::AndroidAutofillRuntimeState::new();

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let listed = autofill::runtime_autofill_list_with_runtime(&runtime, &context, false);
    let session_id = listed
        .get("session_id")
        .and_then(|v| v.as_str())
        .expect("session_id")
        .to_string();

    let closed = autofill::runtime_autofill_close_session_with_runtime(&runtime, &session_id);
    assert_eq!(closed.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(closed.get("closed").and_then(|v| v.as_bool()), Some(true));

    let secret = autofill::runtime_autofill_get_secret_with_runtime(
        &runtime,
        &session_id,
        "cred-example",
        None,
    );
    assert_eq!(secret.get("ok").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        secret
            .get("degraded")
            .and_then(|v| v.get("code"))
            .and_then(|v| v.as_str()),
        Some("ACCESS_DENIED")
    );
}

#[test]
fn runtime_autofill_expired_session_is_pruned_before_secret_lookup() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let (_tmp, mut adapter) = unlocked_adapter();
    ensure_entry(adapter.as_mut());
    super::register_test_provider_adapter(Arc::new(Mutex::new(adapter)));
    let runtime = super::AndroidAutofillRuntimeState::new();

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let listed = autofill::runtime_autofill_list_with_runtime(&runtime, &context, false);
    let session_id = listed
        .get("session_id")
        .and_then(|v| v.as_str())
        .expect("session_id")
        .to_string();

    runtime
        .expire_session_for_tests(&session_id)
        .expect("expire session");

    let secret = autofill::runtime_autofill_get_secret_with_runtime(
        &runtime,
        &session_id,
        "cred-example",
        None,
    );
    assert_eq!(secret.get("ok").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        secret
            .get("degraded")
            .and_then(|v| v.get("code"))
            .and_then(|v| v.as_str()),
        Some("ACCESS_DENIED")
    );
}

#[test]
fn runtime_autofill_sessions_are_runtime_isolated() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let (_tmp, mut adapter) = unlocked_adapter();
    ensure_entry(adapter.as_mut());
    super::register_test_provider_adapter(Arc::new(Mutex::new(adapter)));
    let first = super::AndroidAutofillRuntimeState::new();
    let second = super::AndroidAutofillRuntimeState::new();

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let listed = autofill::runtime_autofill_list_with_runtime(&first, &context, false);
    let session_id = listed
        .get("session_id")
        .and_then(|v| v.as_str())
        .expect("session_id")
        .to_string();

    let second_secret = autofill::runtime_autofill_get_secret_with_runtime(
        &second,
        &session_id,
        "cred-example",
        None,
    );
    assert_eq!(
        second_secret.get("ok").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        second_secret
            .get("degraded")
            .and_then(|v| v.get("code"))
            .and_then(|v| v.as_str()),
        Some("ACCESS_DENIED")
    );

    let second_close = autofill::runtime_autofill_close_session_with_runtime(&second, &session_id);
    assert_eq!(
        second_close.get("closed").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        first
            .session_count_for_tests()
            .expect("first session count"),
        1
    );

    let first_secret = autofill::runtime_autofill_get_secret_with_runtime(
        &first,
        &session_id,
        "cred-example",
        None,
    );
    assert_eq!(first_secret.get("ok").and_then(|v| v.as_bool()), Some(true));
}

#[test]
fn runtime_autofill_session_store_poison_returns_provider_unavailable() {
    let runtime = super::AndroidAutofillRuntimeState::new();
    runtime.poison_sessions_for_tests();

    let closed = autofill::runtime_autofill_close_session_with_runtime(&runtime, "session-id");
    assert_eq!(closed.get("ok").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        closed
            .get("degraded")
            .and_then(|v| v.get("code"))
            .and_then(|v| v.as_str()),
        Some("PROVIDER_UNAVAILABLE")
    );
    assert_eq!(
        closed
            .get("degraded")
            .and_then(|v| v.get("message"))
            .and_then(|v| v.as_str()),
        Some("Autofill runtime session store unavailable")
    );
}

#[test]
fn runtime_autofill_public_wrapper_without_appstate_returns_provider_unavailable() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let listed = autofill::runtime_autofill_list(&context);
    assert_eq!(listed.get("ok").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        listed
            .get("degraded")
            .and_then(|v| v.get("code"))
            .and_then(|v| v.as_str()),
        Some("PROVIDER_UNAVAILABLE")
    );
}

#[test]
fn runtime_passkey_preflight_only_performs_local_policy_checks() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    struct LoggedPasskeyAdapter {
        commands: Arc<Mutex<Vec<String>>>,
        status_queue: VecDeque<Value>,
    }

    impl crate::CoreAdapter for LoggedPasskeyAdapter {
        fn mode(&self) -> crate::CoreMode {
            crate::CoreMode::Local
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            self.commands
                .lock()
                .expect("command log")
                .push(req.command.clone());
            match req.command.as_str() {
                "credential_provider:status" => {
                    let status = self
                        .status_queue
                        .pop_front()
                        .unwrap_or_else(|| json!({"enabled": true, "vault_open": true}));
                    RpcResponse::success(status)
                }
                _ => RpcResponse::error("unsupported command", Some("UNKNOWN_COMMAND")),
            }
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    let commands = Arc::new(Mutex::new(Vec::new()));
    let adapter = LoggedPasskeyAdapter {
        commands: commands.clone(),
        status_queue: VecDeque::from(vec![json!({
            "enabled": true,
            "vault_open": true
        })]),
    };
    super::register_test_provider_adapter(Arc::new(Mutex::new(
        Box::new(adapter) as Box<dyn crate::CoreAdapter>
    )));

    let response =
        passkey::runtime_passkey_preflight("create", json!({"rp_id": "example.com"}), 34);
    assert_eq!(response.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        response.get("command").and_then(|v| v.as_str()),
        Some("create")
    );
    assert_eq!(
        commands.lock().expect("command log").as_slice(),
        ["credential_provider:status"]
    );
}

#[test]
fn runtime_passkey_preflight_returns_spec_shaped_success_response() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    struct ReadyAdapter;

    impl crate::CoreAdapter for ReadyAdapter {
        fn mode(&self) -> crate::CoreMode {
            crate::CoreMode::Local
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            match req.command.as_str() {
                "credential_provider:status" => {
                    RpcResponse::success(json!({"enabled": true, "vault_open": true}))
                }
                _ => RpcResponse::error("unsupported command", Some("UNKNOWN_COMMAND")),
            }
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    super::register_test_provider_adapter(Arc::new(Mutex::new(
        Box::new(ReadyAdapter) as Box<dyn crate::CoreAdapter>
    )));

    let response = passkey::runtime_passkey_preflight("get", json!({"rp_id": "example.com"}), 34);
    assert_eq!(response.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert!(response
        .get("request_id")
        .and_then(|v| v.as_str())
        .is_some_and(|value| !value.trim().is_empty()));
    assert_eq!(
        response.get("command").and_then(|v| v.as_str()),
        Some("get")
    );
    assert_eq!(
        response
            .get("native_request")
            .and_then(|v| v.get("platform"))
            .and_then(|v| v.as_str()),
        Some("android")
    );
    assert_eq!(
        response
            .get("native_request")
            .and_then(|v| v.get("metadata"))
            .and_then(|v| v.get("rp_id"))
            .and_then(|v| v.as_str()),
        Some("example.com")
    );
    assert_eq!(
        response
            .get("policy")
            .and_then(|v| v.get("local_only"))
            .and_then(|v| v.as_bool()),
        Some(false)
    );
}

#[test]
fn runtime_passkey_preflight_rejects_api_33_without_policy_dispatch() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    struct LoggedAdapter {
        commands: Arc<Mutex<Vec<String>>>,
    }

    impl crate::CoreAdapter for LoggedAdapter {
        fn mode(&self) -> crate::CoreMode {
            crate::CoreMode::Local
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            self.commands
                .lock()
                .expect("command log")
                .push(req.command.clone());
            RpcResponse::success(json!({"enabled": true, "vault_open": true}))
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    let commands = Arc::new(Mutex::new(Vec::new()));
    super::register_test_provider_adapter(Arc::new(Mutex::new(Box::new(LoggedAdapter {
        commands: commands.clone(),
    })
        as Box<dyn crate::CoreAdapter>)));

    let response = passkey::runtime_passkey_preflight("get", json!({"rp_id": "example.com"}), 33);
    assert_eq!(response.get("ok").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        response.get("code").and_then(|v| v.as_str()),
        Some("UNSUPPORTED")
    );
    assert!(
        commands.lock().expect("command log").is_empty(),
        "API-level gate must reject passkeys before policy dispatch"
    );
}

#[test]
fn runtime_provider_status_keeps_surfaces_unavailable_below_min_api_even_when_bridge_is_ready() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    struct ReadyAdapter;

    impl crate::CoreAdapter for ReadyAdapter {
        fn mode(&self) -> crate::CoreMode {
            crate::CoreMode::Local
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            match req.command.as_str() {
                "credential_provider:status" => {
                    RpcResponse::success(json!({"enabled": true, "vault_open": true}))
                }
                _ => RpcResponse::error("unsupported command", Some("UNKNOWN_COMMAND")),
            }
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    super::register_test_provider_adapter(Arc::new(Mutex::new(
        Box::new(ReadyAdapter) as Box<dyn crate::CoreAdapter>
    )));

    let response = provider_status::runtime_provider_status(27);
    assert_eq!(response.get("ok").and_then(|v| v.as_bool()), Some(true));
    let result = response.get("result").expect("result");
    assert_eq!(
        result.get("runtime_ready").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(result.get("enabled").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        result.get("vault_open").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        result
            .get("autofill_surface_available")
            .and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        result
            .get("password_provider_surface_available")
            .and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        result
            .get("passkey_surface_available")
            .and_then(|v| v.as_bool()),
        Some(false)
    );
}

#[test]
fn runtime_provider_status_reports_truthful_bridge_readiness() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    let response = provider_status::runtime_provider_status(34);
    assert_eq!(response.get("ok").and_then(|v| v.as_bool()), Some(true));
    let result = response.get("result").expect("result");
    assert_eq!(
        result.get("android_api_level").and_then(|v| v.as_u64()),
        Some(34)
    );
    assert_eq!(
        result
            .get("autofill_surface_available")
            .and_then(|v| v.as_bool()),
        Some(super::runtime_ready())
    );
    assert_eq!(
        result
            .get("password_provider_surface_available")
            .and_then(|v| v.as_bool()),
        Some(super::runtime_ready())
    );
    assert_eq!(
        result
            .get("passkey_surface_available")
            .and_then(|v| v.as_bool()),
        Some(super::runtime_ready())
    );
}
