//! Windows keystore backend.
//!
//! Implementation uses the Windows Credential Store via the `keyring` crate.

pub type WindowsKeystore = super::KeyringKeystore;

pub const WEBAUTHN_MIN_API_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WindowsWebAuthnCapability {
    Available { api_version: u32 },
    Unavailable { reason: String },
}

pub fn probe_webauthn_capability() -> WindowsWebAuthnCapability {
    probe_webauthn_capability_with(default_webauthn_api_version)
}

pub fn probe_webauthn_capability_with(
    probe: impl Fn() -> Option<u32>,
) -> WindowsWebAuthnCapability {
    let Some(version) = probe() else {
        return WindowsWebAuthnCapability::Unavailable {
            reason: "UNSUPPORTED: Windows WebAuthn C API is unavailable".to_string(),
        };
    };

    if version < WEBAUTHN_MIN_API_VERSION {
        return WindowsWebAuthnCapability::Unavailable {
            reason: format!(
                "UNSUPPORTED: Windows WebAuthn C API version {version} is below required {}",
                WEBAUTHN_MIN_API_VERSION
            ),
        };
    }

    WindowsWebAuthnCapability::Available {
        api_version: version,
    }
}

#[cfg(target_os = "windows")]
fn default_webauthn_api_version() -> Option<u32> {
    #[link(name = "webauthn")]
    unsafe extern "system" {
        fn WebAuthNGetApiVersionNumber() -> u32;
    }

    Some(unsafe { WebAuthNGetApiVersionNumber() })
}

#[cfg(not(target_os = "windows"))]
fn default_webauthn_api_version() -> Option<u32> {
    None
}

#[cfg(test)]
#[path = "windows_tests.rs"]
mod tests;
