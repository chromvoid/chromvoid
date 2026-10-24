use crate::provider_core::AdapterProviderCore;
use crate::test_support::*;
use crate::{autofill, bridge_contract, passkey, password_save, provider_status};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde_json::json;

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
    assert!(
        password_save::get_password_save_request(&runtime, &token)
            .expect("store")
            .is_none(),
        "finished request payload should be removed"
    );
    assert_eq!(
        password_save::pending_password_save_request_count(&runtime).expect("count"),
        0
    );

    let duplicate = password_save::finish_password_save_request(
        &runtime,
        &token,
        password_save::AndroidPasswordSaveOutcome::Saved,
    )
    .expect("duplicate finish");
    assert!(!duplicate);
}

#[test]
fn password_save_payload_debug_redacts_password() {
    let payload = password_save::AndroidPasswordSavePayload {
        title: "github.com".to_string(),
        username: "alice@example.com".to_string(),
        password: "pw-123".to_string(),
        urls: "https://github.com/login".to_string(),
    };

    let debug = format!("{payload:?}");

    assert!(!debug.contains("pw-123"));
    assert!(debug.contains("<redacted>"));
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

    assert!(
        password_save::get_password_save_request(&runtime, &token)
            .expect("store")
            .is_none(),
        "invalidated request payload should be removed"
    );
    assert_eq!(
        password_save::pending_password_save_request_count(&runtime).expect("count"),
        0
    );
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

    assert!(
        password_save::get_password_save_request(&first, &token)
            .expect("first store")
            .is_some()
    );
    assert!(
        password_save::get_password_save_request(&second, &token)
            .expect("second store")
            .is_none()
    );
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
fn runtime_password_save_request_fails_closed_after_finish() {
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
        response.get("message").and_then(|v| v.as_str()),
        Some("Password save request is no longer valid")
    );
}

#[test]
fn runtime_password_save_finish_ends_the_review_once() {
    let runtime = password_save::AndroidPasswordSaveRuntimeState::new();
    let token = password_save::register_password_save_request(
        &runtime,
        password_save::AndroidPasswordSavePayload {
            title: "example.com".to_string(),
            username: "alice@example.com".to_string(),
            password: "pw-123".to_string(),
            urls: "https://example.com".to_string(),
        },
    )
    .expect("token");

    let refused =
        password_save::runtime_password_save_finish_with_runtime(&runtime, &token, "kept");
    assert_eq!(refused.get("ok").and_then(|v| v.as_bool()), Some(false));

    let finished =
        password_save::runtime_password_save_finish_with_runtime(&runtime, &token, "saved");
    assert_eq!(finished.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        finished.get("finished").and_then(|v| v.as_bool()),
        Some(true)
    );

    let again =
        password_save::runtime_password_save_finish_with_runtime(&runtime, &token, "dismissed");
    assert_eq!(again.get("finished").and_then(|v| v.as_bool()), Some(false));
    let read = password_save::runtime_password_save_request_with_runtime(&runtime, &token);
    assert_eq!(read.get("ok").and_then(|v| v.as_bool()), Some(false));
}

#[test]
fn password_save_requests_are_removed_after_expiry() {
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
    assert!(
        password_save::force_password_save_request_age(
            &runtime,
            &token,
            std::time::Duration::from_secs(301),
        )
        .expect("age request")
    );

    assert!(
        password_save::get_password_save_request(&runtime, &token)
            .expect("store")
            .is_none(),
        "expired request payload should be removed"
    );
    assert_eq!(
        password_save::pending_password_save_request_count(&runtime).expect("count"),
        0
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

    let mut core = AdapterProviderCore(adapter.as_mut());
    let mut af = autofill::AndroidAutofillAdapter::new(&mut core);
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

    let mut core = AdapterProviderCore(adapter.as_mut());
    let mut af = autofill::AndroidAutofillAdapter::new(&mut core);
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

    impl chromvoid_client_runtime::adapter::CoreAdapter for RemoteAdapter {
        fn mode(&self) -> chromvoid_client_runtime::adapter::CoreMode {
            chromvoid_client_runtime::adapter::CoreMode::Remote {
                host: chromvoid_client_runtime::adapter::RemoteHost::TauriRemoteWss {
                    peer_id: "remote-device".to_string(),
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
    let err = passkey::AndroidPasskeyAdapter::new(&mut AdapterProviderCore(&mut adapter), 34)
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

    let err = passkey::AndroidPasskeyAdapter::new(&mut AdapterProviderCore(&mut adapter), 34)
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

    let result = passkey::AndroidPasskeyAdapter::new(&mut AdapterProviderCore(&mut adapter), 34)
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

    let err = passkey::AndroidPasskeyAdapter::new(&mut AdapterProviderCore(&mut adapter), 34)
        .handle(&request)
        .expect_err("policy preflight must deny while vault is locked");
    assert_eq!(err.code, "VAULT_REQUIRED");
    assert_eq!(
        adapter.commands,
        vec!["credential_provider:status".to_string()]
    );
}
