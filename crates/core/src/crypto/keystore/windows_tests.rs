use super::*;

#[test]
fn webauthn_probe_returns_unavailable_when_api_missing() {
    let status = probe_webauthn_capability_with(|| None);
    assert_eq!(
        status,
        WindowsWebAuthnCapability::Unavailable {
            reason: "UNSUPPORTED: Windows WebAuthn C API is unavailable".to_string(),
        }
    );
}

#[test]
fn webauthn_probe_returns_unavailable_when_api_version_too_low() {
    let status = probe_webauthn_capability_with(|| Some(0));
    assert_eq!(
        status,
        WindowsWebAuthnCapability::Unavailable {
            reason: "UNSUPPORTED: Windows WebAuthn C API version 0 is below required 1".to_string(),
        }
    );
}

#[test]
fn webauthn_probe_returns_available_for_supported_version() {
    let status = probe_webauthn_capability_with(|| Some(1));
    assert_eq!(
        status,
        WindowsWebAuthnCapability::Available { api_version: 1 }
    );
}
