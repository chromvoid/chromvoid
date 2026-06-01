#![cfg_attr(
    not(any(test, target_os = "android", target_os = "windows")),
    allow(dead_code)
)]

use serde_json::{json, Value};

#[cfg(test)]
pub const CREDENTIAL_PROVIDER_LIST_COMMAND: &str = "credential_provider:list";
pub const CREDENTIAL_PROVIDER_STATUS_COMMAND: &str = "credential_provider:status";

pub fn credential_provider_status_bool(status: &Value, field: &str, context: &str) -> bool {
    match status.get(field).and_then(|value| value.as_bool()) {
        Some(value) => value,
        None => {
            tracing::warn!(
                context = %context,
                field = field,
                "credential provider status missing boolean field"
            );
            false
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasskeyLiteCommand {
    Create,
    Get,
    Query,
}

impl PasskeyLiteCommand {
    pub fn rpc_command(self) -> &'static str {
        match self {
            Self::Create => "credential_provider:passkey:create",
            Self::Get => "credential_provider:passkey:get",
            Self::Query => "credential_provider:passkey:query",
        }
    }

    pub fn bridge_command_name(self) -> &'static str {
        match self {
            Self::Create => "create",
            Self::Get => "get",
            Self::Query => "query",
        }
    }

    pub fn from_bridge_command(command: &str) -> Option<Self> {
        match command.trim() {
            "create" | "credential_provider:passkey:create" => Some(Self::Create),
            "get" | "credential_provider:passkey:get" => Some(Self::Get),
            "query" | "credential_provider:passkey:query" => Some(Self::Query),
            _ => None,
        }
    }

    #[cfg(test)]
    pub fn from_bridge_event(event: &str) -> Option<Self> {
        match event.trim() {
            "passkey_create" => Some(Self::Create),
            "passkey_get" => Some(Self::Get),
            "passkey_query" => Some(Self::Query),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasskeyLiteRequest {
    pub command: PasskeyLiteCommand,
    pub payload: Value,
}

#[cfg(test)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CredentialProviderRoute {
    PasskeysLite {
        command: &'static str,
        payload: Value,
    },
    PasswordProviderFallback {
        command: &'static str,
        payload: Value,
        unsupported_reason: String,
    },
}

#[cfg(test)]
impl CredentialProviderRoute {
    pub fn passkeys_lite(command: PasskeyLiteCommand, payload: Value) -> Self {
        Self::PasskeysLite {
            command: command.rpc_command(),
            payload,
        }
    }

    pub fn password_provider_fallback(
        payload: Value,
        unsupported_reason: impl Into<String>,
    ) -> Self {
        Self::PasswordProviderFallback {
            command: CREDENTIAL_PROVIDER_LIST_COMMAND,
            payload,
            unsupported_reason: unsupported_reason.into(),
        }
    }
}

pub fn passkey_native_request_payload(
    platform: &str,
    platform_version_major: u64,
    metadata: &Value,
) -> Value {
    json!({
        "platform": platform,
        "platform_version_major": platform_version_major,
        "metadata": metadata,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_bridge_events_and_commands_consistently() {
        assert_eq!(
            PasskeyLiteCommand::from_bridge_event("passkey_create"),
            Some(PasskeyLiteCommand::Create)
        );
        assert_eq!(
            PasskeyLiteCommand::from_bridge_event("passkey_get"),
            Some(PasskeyLiteCommand::Get)
        );
        assert_eq!(
            PasskeyLiteCommand::from_bridge_command("credential_provider:passkey:create"),
            Some(PasskeyLiteCommand::Create)
        );
        assert_eq!(
            PasskeyLiteCommand::from_bridge_command("get"),
            Some(PasskeyLiteCommand::Get)
        );
    }

    #[test]
    fn route_helpers_keep_command_surface_stable() {
        let passkeys = CredentialProviderRoute::passkeys_lite(
            PasskeyLiteCommand::Create,
            json!({"platform":"android"}),
        );
        match passkeys {
            CredentialProviderRoute::PasskeysLite { command, .. } => {
                assert_eq!(command, "credential_provider:passkey:create");
            }
            other => panic!("unexpected route: {other:?}"),
        }

        let passkey_query = CredentialProviderRoute::passkeys_lite(
            PasskeyLiteCommand::Query,
            json!({"platform":"android"}),
        );
        match passkey_query {
            CredentialProviderRoute::PasskeysLite { command, .. } => {
                assert_eq!(command, "credential_provider:passkey:query");
            }
            other => panic!("unexpected route: {other:?}"),
        }

        let fallback = CredentialProviderRoute::password_provider_fallback(
            json!({"platform":"windows"}),
            "UNSUPPORTED: unavailable",
        );
        match fallback {
            CredentialProviderRoute::PasswordProviderFallback {
                command,
                unsupported_reason,
                ..
            } => {
                assert_eq!(command, CREDENTIAL_PROVIDER_LIST_COMMAND);
                assert_eq!(unsupported_reason, "UNSUPPORTED: unavailable");
            }
            other => panic!("unexpected route: {other:?}"),
        }
    }
}
