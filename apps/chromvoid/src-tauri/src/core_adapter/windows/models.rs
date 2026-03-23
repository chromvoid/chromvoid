pub use crate::credential_provider_contract::{PasskeyLiteCommand, PasskeyLiteRequest};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WebAuthnCapability {
    Available { api_version: u32 },
    Unavailable { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowsCredentialFeatureFlags {
    pub password_provider_baseline: bool,
    pub passkeys_lite: bool,
    pub plugin_surface_ready: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowsCredentialStatus {
    pub password_provider_ready: bool,
    pub passkeys_lite_ready: bool,
    pub webauthn_api_version: Option<u32>,
    pub unsupported_reason: Option<String>,
}
