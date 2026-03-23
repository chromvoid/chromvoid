use crate::credential_provider_contract::{CredentialProviderRoute, PasskeyLiteCommand};
use serde_json::{json, Value};

const IOS_PASSKEYS_LITE_MIN_VERSION: u64 = 17;
const MACOS_PASSKEYS_LITE_MIN_VERSION: u64 = 14;

const BRIDGE_FORBIDDEN_SECRET_KEYS: &[&str] = &[
    "password",
    "secret",
    "otp",
    "token",
    "assertion",
    "private_key",
    "privatekey",
];

type AppleCredentialRoute = CredentialProviderRoute;

#[derive(Debug, Clone, PartialEq, Eq)]
struct AppleCredentialBridgeRequest {
    event: String,
    platform: String,
    platform_version_major: u64,
    metadata: Value,
}

impl AppleCredentialBridgeRequest {
    fn new(
        event: impl Into<String>,
        platform: impl Into<String>,
        platform_version_major: u64,
        metadata: Value,
    ) -> Self {
        Self {
            event: event.into(),
            platform: platform.into(),
            platform_version_major,
            metadata,
        }
    }
}

struct AppleCredentialRequestMapper;

impl AppleCredentialRequestMapper {
    fn map(request: &AppleCredentialBridgeRequest) -> AppleCredentialRoute {
        let _sanitized_metadata = sanitize_ipc_metadata(&request.metadata);
        let command_payload = json!({
            "platform": request.platform,
            "platform_version_major": request.platform_version_major,
        });

        match PasskeyLiteCommand::from_bridge_event(&request.event) {
            Some(command) => {
                if let Some(reason) = passkeys_lite_unsupported_reason(
                    &request.platform,
                    request.platform_version_major,
                ) {
                    return AppleCredentialRoute::password_provider_fallback(
                        command_payload,
                        reason,
                    );
                }
                AppleCredentialRoute::passkeys_lite(command, command_payload)
            }
            None => AppleCredentialRoute::password_provider_fallback(
                command_payload,
                "UNSUPPORTED: unrecognized apple bridge request event",
            ),
        }
    }
}

fn passkeys_lite_unsupported_reason(platform: &str, platform_version_major: u64) -> Option<String> {
    match platform {
        "ios" if platform_version_major >= IOS_PASSKEYS_LITE_MIN_VERSION => None,
        "ios" => Some(format!(
            "UNSUPPORTED: passkeys_lite requires iOS {}+",
            IOS_PASSKEYS_LITE_MIN_VERSION
        )),
        "macos" if platform_version_major >= MACOS_PASSKEYS_LITE_MIN_VERSION => None,
        "macos" => Some(format!(
            "UNSUPPORTED: passkeys_lite requires macOS {}+",
            MACOS_PASSKEYS_LITE_MIN_VERSION
        )),
        _ => {
            Some("UNSUPPORTED: apple credential adapter requires ios or macos platform".to_string())
        }
    }
}

fn sanitize_ipc_metadata(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (key, item) in map {
                let key_lower = key.to_ascii_lowercase();
                if BRIDGE_FORBIDDEN_SECRET_KEYS
                    .iter()
                    .any(|forbidden| key_lower.contains(forbidden))
                {
                    continue;
                }
                out.insert(key.clone(), sanitize_ipc_metadata(item));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(sanitize_ipc_metadata).collect()),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => value.clone(),
    }
}

#[test]
fn maps_ios_17_plus_passkey_create_to_passkeys_lite_command() {
    let request = AppleCredentialBridgeRequest::new(
        "passkey_create",
        "ios",
        17,
        json!({"rp_id":"example.com", "username":"alice"}),
    );

    let route = AppleCredentialRequestMapper::map(&request);
    match route {
        AppleCredentialRoute::PasskeysLite { command, payload } => {
            assert_eq!(command, "credential_provider:passkey:create");
            assert_eq!(
                payload.get("platform").and_then(|v| v.as_str()),
                Some("ios")
            );
            assert_eq!(
                payload
                    .get("platform_version_major")
                    .and_then(|v| v.as_u64()),
                Some(17)
            );
            assert!(payload.get("metadata").is_none());
        }
        other => panic!("unexpected route: {other:?}"),
    }
}

#[test]
fn maps_macos_14_plus_passkey_get_to_passkeys_lite_command() {
    let request = AppleCredentialBridgeRequest::new(
        "passkey_get",
        "macos",
        14,
        json!({"rp_id":"example.com"}),
    );

    let route = AppleCredentialRequestMapper::map(&request);
    match route {
        AppleCredentialRoute::PasskeysLite { command, payload } => {
            assert_eq!(command, "credential_provider:passkey:get");
            assert_eq!(
                payload.get("platform").and_then(|v| v.as_str()),
                Some("macos")
            );
            assert!(payload.get("metadata").is_none());
        }
        other => panic!("unexpected route: {other:?}"),
    }
}

#[test]
fn falls_back_to_password_provider_below_ios_gate() {
    let request =
        AppleCredentialBridgeRequest::new("passkey_get", "ios", 16, json!({"rp_id":"example.com"}));

    let route = AppleCredentialRequestMapper::map(&request);
    match route {
        AppleCredentialRoute::PasswordProviderFallback {
            command,
            unsupported_reason,
            ..
        } => {
            assert_eq!(command, "credential_provider:list");
            assert_eq!(
                unsupported_reason,
                "UNSUPPORTED: passkeys_lite requires iOS 17+"
            );
        }
        other => panic!("unexpected route: {other:?}"),
    }
}

#[test]
fn falls_back_to_password_provider_below_macos_gate() {
    let request = AppleCredentialBridgeRequest::new(
        "passkey_create",
        "macos",
        13,
        json!({"rp_id":"example.com"}),
    );

    let route = AppleCredentialRequestMapper::map(&request);
    match route {
        AppleCredentialRoute::PasswordProviderFallback {
            command,
            unsupported_reason,
            ..
        } => {
            assert_eq!(command, "credential_provider:list");
            assert_eq!(
                unsupported_reason,
                "UNSUPPORTED: passkeys_lite requires macOS 14+"
            );
        }
        other => panic!("unexpected route: {other:?}"),
    }
}

#[test]
fn sanitizes_secret_fields_from_ipc_metadata() {
    let input = json!({
        "rp_id": "example.com",
        "username": "alice",
        "password": "should-not-cross-ipc",
        "otp": "123456",
        "nested": {
            "token": "drop",
            "hint": "keep"
        }
    });

    let sanitized = sanitize_ipc_metadata(&input);
    assert_eq!(
        sanitized.get("rp_id").and_then(|v| v.as_str()),
        Some("example.com")
    );
    assert_eq!(
        sanitized.get("username").and_then(|v| v.as_str()),
        Some("alice")
    );
    assert!(sanitized.get("password").is_none());
    assert!(sanitized.get("otp").is_none());
    let nested = sanitized
        .get("nested")
        .and_then(|v| v.as_object())
        .expect("nested object");
    assert!(nested.get("token").is_none());
    assert_eq!(nested.get("hint").and_then(|v| v.as_str()), Some("keep"));
}
