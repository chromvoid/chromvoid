use serde_json::Value;

use super::models::WindowsCredentialStatus;
pub use crate::credential_provider_contract::CredentialProviderRoute as WindowsCredentialRoute;
use crate::credential_provider_contract::{passkey_native_request_payload, PasskeyLiteCommand};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowsCredentialBridgeRequest {
    pub event: String,
    pub metadata: Value,
}

impl WindowsCredentialBridgeRequest {
    pub fn new(event: impl Into<String>, metadata: Value) -> Self {
        Self {
            event: event.into(),
            metadata,
        }
    }
}

pub struct WindowsCredentialRequestMapper;

impl WindowsCredentialRequestMapper {
    pub fn map(
        request: &WindowsCredentialBridgeRequest,
        status: &WindowsCredentialStatus,
    ) -> WindowsCredentialRoute {
        let payload = passkey_native_request_payload(
            "windows",
            status.webauthn_api_version.unwrap_or(0) as u64,
            &request.metadata,
        );

        match PasskeyLiteCommand::from_bridge_event(&request.event) {
            Some(command) if status.passkeys_lite_ready => {
                WindowsCredentialRoute::passkeys_lite(command, payload)
            }
            Some(_) => WindowsCredentialRoute::password_provider_fallback(
                payload,
                status.unsupported_reason.clone().unwrap_or_else(|| {
                    "UNSUPPORTED: windows passkeys-lite is unavailable".to_string()
                }),
            ),
            None => WindowsCredentialRoute::password_provider_fallback(
                payload,
                "UNSUPPORTED: unrecognized windows credential bridge request event",
            ),
        }
    }
}
