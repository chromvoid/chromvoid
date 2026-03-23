use super::models::*;

pub fn status_from_probe(
    flags: &WindowsCredentialFeatureFlags,
    capability: WebAuthnCapability,
) -> WindowsCredentialStatus {
    let (webauthn_api_version, capability_reason) = match capability {
        WebAuthnCapability::Available { api_version } => (Some(api_version), None),
        WebAuthnCapability::Unavailable { reason } => (None, Some(reason)),
    };

    let passkeys_lite_ready = flags.passkeys_lite
        && flags.plugin_surface_ready
        && capability_reason.is_none()
        && webauthn_api_version.is_some();

    let unsupported_reason = if passkeys_lite_ready {
        None
    } else if !flags.passkeys_lite {
        Some("UNSUPPORTED: passkeys_lite feature flag is disabled on Windows".to_string())
    } else if !flags.plugin_surface_ready {
        Some(
            "UNSUPPORTED: Windows credential provider plugin surface is not production-ready"
                .to_string(),
        )
    } else {
        capability_reason
            .or_else(|| Some("UNSUPPORTED: windows passkeys-lite is unavailable".to_string()))
    };

    WindowsCredentialStatus {
        password_provider_ready: flags.password_provider_baseline,
        passkeys_lite_ready,
        webauthn_api_version,
        unsupported_reason,
    }
}
