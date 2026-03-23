use super::*;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde_json::{json, Value};
use std::collections::VecDeque;

use crate::core_adapter::types::{CoreAdapter, CoreMode};

struct ScriptedAdapter {
    commands: Vec<String>,
    responses: VecDeque<RpcResponse>,
}

impl ScriptedAdapter {
    fn new(responses: Vec<RpcResponse>) -> Self {
        Self {
            commands: Vec::new(),
            responses: VecDeque::from(responses),
        }
    }
}

impl CoreAdapter for ScriptedAdapter {
    fn mode(&self) -> CoreMode {
        CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.commands.push(req.command.clone());
        self.responses
            .pop_front()
            .unwrap_or_else(|| RpcResponse::success(json!({})))
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

struct RemoteAdapter;

impl CoreAdapter for RemoteAdapter {
    fn mode(&self) -> CoreMode {
        CoreMode::Remote {
            host: crate::core_adapter::RemoteHost::MobileBle {
                device_id: "peer-1".to_string(),
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

    fn take_events(&mut self) -> Vec<Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}

fn test_flags() -> WindowsCredentialFeatureFlags {
    WindowsCredentialFeatureFlags {
        password_provider_baseline: true,
        passkeys_lite: true,
        plugin_surface_ready: true,
    }
}

#[test]
fn status_keeps_password_provider_baseline_when_passkeys_probe_unavailable() {
    let status = status_from_probe(
        &test_flags(),
        WebAuthnCapability::Unavailable {
            reason: "UNSUPPORTED: Windows WebAuthn C API is unavailable".to_string(),
        },
    );

    assert!(status.password_provider_ready);
    assert!(!status.passkeys_lite_ready);
    assert_eq!(
        status.unsupported_reason.as_deref(),
        Some("UNSUPPORTED: Windows WebAuthn C API is unavailable")
    );
}

#[test]
fn status_returns_plugin_maturity_unsupported_when_flag_not_ready() {
    let mut flags = test_flags();
    flags.plugin_surface_ready = false;

    let status = status_from_probe(&flags, WebAuthnCapability::Available { api_version: 1 });

    assert!(status.password_provider_ready);
    assert!(!status.passkeys_lite_ready);
    assert_eq!(
        status.unsupported_reason.as_deref(),
        Some("UNSUPPORTED: Windows credential provider plugin surface is not production-ready")
    );
}

#[test]
fn mapper_falls_back_to_password_provider_when_passkeys_unavailable() {
    let status = WindowsCredentialStatus {
        password_provider_ready: true,
        passkeys_lite_ready: false,
        webauthn_api_version: None,
        unsupported_reason: Some(
            "UNSUPPORTED: Windows credential provider plugin surface is not production-ready"
                .to_string(),
        ),
    };

    let route = WindowsCredentialRequestMapper::map(
        &WindowsCredentialBridgeRequest::new("passkey_get", json!({"rp_id": "example.com"})),
        &status,
    );

    match route {
        WindowsCredentialRoute::PasswordProviderFallback {
            command,
            unsupported_reason,
            ..
        } => {
            assert_eq!(command, "credential_provider:list");
            assert_eq!(
                unsupported_reason,
                "UNSUPPORTED: Windows credential provider plugin surface is not production-ready"
            );
        }
        other => panic!("unexpected route: {other:?}"),
    }
}

#[test]
fn passkey_requests_return_deterministic_unsupported_when_plugin_not_ready() {
    let mut adapter = ScriptedAdapter::new(vec![]);
    let mut flags = test_flags();
    flags.plugin_surface_ready = false;

    let request = PasskeyLiteRequest {
        command: PasskeyLiteCommand::Create,
        payload: json!({"rp_id": "example.com"}),
    };

    let err = WindowsPasskeyAdapter::with_probe(&mut adapter, flags, || {
        WebAuthnCapability::Available { api_version: 1 }
    })
    .handle(&request)
    .expect_err("plugin-not-ready branch must fail closed");

    assert_eq!(err.code, "UNSUPPORTED");
    assert_eq!(
        err.message,
        "UNSUPPORTED: Windows credential provider plugin surface is not production-ready"
    );
    assert!(adapter.commands.is_empty());
}

#[test]
fn passkey_requests_fail_closed_when_adapter_is_not_local() {
    let mut adapter = RemoteAdapter;
    let request = PasskeyLiteRequest {
        command: PasskeyLiteCommand::Get,
        payload: json!({"rp_id": "example.com"}),
    };

    let err = WindowsPasskeyAdapter::with_probe(&mut adapter, test_flags(), || {
        WebAuthnCapability::Available { api_version: 1 }
    })
    .handle(&request)
    .expect_err("non-local adapter path must fail closed");

    assert_eq!(err.code, "POLICY_DENIED");
    assert_eq!(
        err.message,
        "Windows passkey adapter requires local Core adapter mode"
    );
}

#[test]
fn passkey_requests_fail_closed_when_provider_is_disabled() {
    let mut adapter = ScriptedAdapter::new(vec![RpcResponse::success(json!({
        "enabled": false,
        "vault_open": true
    }))]);

    let request = PasskeyLiteRequest {
        command: PasskeyLiteCommand::Get,
        payload: json!({"rp_id": "example.com"}),
    };

    let err = WindowsPasskeyAdapter::with_probe(&mut adapter, test_flags(), || {
        WebAuthnCapability::Available { api_version: 1 }
    })
    .handle(&request)
    .expect_err("disabled provider path must fail closed");

    assert_eq!(err.code, "PROVIDER_DISABLED");
    assert_eq!(
        err.message,
        "Passkeys unavailable: provider is disabled in settings"
    );
}

#[test]
fn passkey_requests_map_provider_unavailable_unsupported_consistently() {
    let mut adapter = ScriptedAdapter::new(vec![
        RpcResponse::success(json!({
            "enabled": true,
            "vault_open": true
        })),
        RpcResponse::error(
            "UNSUPPORTED: passkeys-lite create/get handshake remains adapter-owned",
            Some("PROVIDER_UNAVAILABLE"),
        ),
    ]);

    let request = PasskeyLiteRequest {
        command: PasskeyLiteCommand::Get,
        payload: json!({"rp_id": "example.com"}),
    };

    let err = WindowsPasskeyAdapter::with_probe(&mut adapter, test_flags(), || {
        WebAuthnCapability::Available { api_version: 1 }
    })
    .handle(&request)
    .expect_err("unsupported provider-unavailable branch must map consistently");

    assert_eq!(err.code, "UNSUPPORTED");
    assert_eq!(
        err.message,
        "UNSUPPORTED: passkeys-lite create/get handshake remains adapter-owned"
    );
}

#[test]
fn passkey_requests_do_policy_preflight_before_dispatch() {
    let mut adapter = ScriptedAdapter::new(vec![RpcResponse::success(json!({
        "enabled": true,
        "vault_open": false
    }))]);

    let request = PasskeyLiteRequest {
        command: PasskeyLiteCommand::Get,
        payload: json!({"rp_id": "example.com"}),
    };

    let err = WindowsPasskeyAdapter::with_probe(&mut adapter, test_flags(), || {
        WebAuthnCapability::Available { api_version: 1 }
    })
    .handle(&request)
    .expect_err("vault-locked path must fail closed");

    assert_eq!(err.code, "VAULT_REQUIRED");
    assert_eq!(
        adapter.commands,
        vec!["credential_provider:status".to_string()]
    );
}
