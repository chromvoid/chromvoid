use super::{autofill, biometric, bridge_contract, passkey, password_save, provider_status};
use crate::core_adapter::{CoreAdapter, RemoteHost};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

static SHARED_PROVIDER_TEST_LOCK: Mutex<()> = Mutex::new(());

fn unlocked_adapter() -> (tempfile::TempDir, Box<dyn crate::CoreAdapter>) {
    let tmp = tempfile::tempdir().expect("tempdir");
    let storage_root = tmp.path().join("storage");

    let mut adapter = crate::LocalCoreAdapter::new(storage_root).expect("LocalCoreAdapter::new");
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
    let meta_resp = adapter.handle(&RpcRequest::new(
        "catalog:prepareUpload".to_string(),
        json!({
            "name": "meta.json",
            "size": meta.len(),
            "parent_path": "/.passmanager/Example",
            "mime_type": "application/json",
        }),
    ));
    let meta_node = meta_resp
        .result()
        .and_then(|v| v.get("node_id"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let _ = adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload".to_string(),
            json!({"node_id": meta_node, "size": meta.len(), "offset": 0}),
        ),
        Some(chromvoid_core::rpc::RpcInputStream::from_bytes(
            meta.into_bytes(),
        )),
    );

    let pwd = b"correct horse battery staple".to_vec();
    let pwd_resp = adapter.handle(&RpcRequest::new(
        "catalog:prepareUpload".to_string(),
        json!({
            "name": ".password",
            "size": pwd.len(),
            "parent_path": "/.passmanager/Example",
            "mime_type": "text/plain",
        }),
    ));
    let pwd_node = pwd_resp
        .result()
        .and_then(|v| v.get("node_id"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
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
                RpcResponse::error(
                    "UNSUPPORTED: passkeys_lite create/get handshake remains adapter-owned",
                    Some("PROVIDER_UNAVAILABLE"),
                )
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
    password_save::invalidate_all_password_save_requests("test_reset");
    let token =
        password_save::register_password_save_request(password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        })
        .expect("token");

    let (payload, state) = password_save::get_password_save_request(&token)
        .expect("store")
        .expect("payload");
    assert_eq!(payload.password, "pw-123");
    assert_eq!(state, password_save::PasswordSaveRequestState::Pending);

    let launched = password_save::mark_password_save_request_launched(&token).expect("launch");
    assert!(launched);
    let (_, state) = password_save::get_password_save_request(&token)
        .expect("store")
        .expect("payload");
    assert_eq!(state, password_save::PasswordSaveRequestState::Launched);

    let finished = password_save::finish_password_save_request(
        &token,
        password_save::AndroidPasswordSaveOutcome::Saved,
    )
    .expect("finish");
    assert!(finished);
    let (_, state) = password_save::get_password_save_request(&token)
        .expect("store")
        .expect("state");
    assert_eq!(state, password_save::PasswordSaveRequestState::Saved);

    let duplicate = password_save::finish_password_save_request(
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
    password_save::invalidate_all_password_save_requests("test_reset");
    let token =
        password_save::register_password_save_request(password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        })
        .expect("token");

    let invalidated = password_save::invalidate_all_password_save_requests("background");
    assert_eq!(invalidated, 1);

    let (_, state) = password_save::get_password_save_request(&token)
        .expect("store")
        .expect("state");
    assert_eq!(state, password_save::PasswordSaveRequestState::Dismissed);
}

#[test]
fn password_save_mark_launched_is_one_shot() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    password_save::invalidate_all_password_save_requests("test_reset");
    let token =
        password_save::register_password_save_request(password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        })
        .expect("token");

    assert!(password_save::mark_password_save_request_launched(&token).expect("launch"));
    assert!(!password_save::mark_password_save_request_launched(&token).expect("launch again"));
}

#[test]
fn runtime_password_save_request_fails_closed_for_terminal_states() {
    let _shared_provider_lock = SHARED_PROVIDER_TEST_LOCK
        .lock()
        .expect("shared provider test lock");
    password_save::invalidate_all_password_save_requests("test_reset");
    let token =
        password_save::register_password_save_request(password_save::AndroidPasswordSavePayload {
            title: "github.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://github.com/login".to_string(),
        })
        .expect("token");
    let _ = password_save::finish_password_save_request(
        &token,
        password_save::AndroidPasswordSaveOutcome::Dismissed,
    )
    .expect("finish");

    let response = password_save::runtime_password_save_request(&token);
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
    let listed = af.list(&context);
    assert!(listed.degraded.is_none());
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
    let listed = af.list(&context);
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

    let err = passkey::AndroidPasskeyAdapter::new(&mut adapter, 34)
        .handle(&request)
        .expect_err("passkey command remains adapter-owned until native bridge is wired");
    assert_eq!(err.code, "UNSUPPORTED");
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
    super::register_shared_app_adapter(Arc::new(Mutex::new(adapter)));

    let context = autofill::AutofillContext {
        origin: "https://app.example.com/login".to_string(),
        domain: "app.example.com".to_string(),
    };

    let listed = autofill::runtime_autofill_list(&context);
    assert_eq!(listed.get("ok").and_then(|v| v.as_bool()), Some(true));
    let session_id = listed
        .get("session_id")
        .and_then(|v| v.as_str())
        .expect("session_id");
    let candidates = listed
        .get("candidates")
        .and_then(|v| v.as_array())
        .expect("candidates");
    assert_eq!(candidates.len(), 1);

    let secret = autofill::runtime_autofill_get_secret(session_id, "cred-example", None);
    assert_eq!(secret.get("ok").and_then(|v| v.as_bool()), Some(true));
    let result = secret.get("result").expect("result");
    assert_eq!(
        result.get("password").and_then(|v| v.as_str()),
        Some("correct horse battery staple")
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
    super::register_shared_app_adapter(Arc::new(Mutex::new(
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

    super::register_shared_app_adapter(Arc::new(Mutex::new(
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
        Some(true)
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
    super::register_shared_app_adapter(Arc::new(Mutex::new(Box::new(LoggedAdapter {
        commands: commands.clone(),
    }) as Box<dyn crate::CoreAdapter>)));

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

    super::register_shared_app_adapter(Arc::new(Mutex::new(
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
