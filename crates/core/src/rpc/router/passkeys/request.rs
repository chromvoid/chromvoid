use serde_json::Value;

use super::super::credential_types;
use super::error::PasskeysCommandError;

pub(super) struct PasskeyDeleteRequest<'a> {
    pub(super) credential_id: &'a str,
}

pub(super) struct PasskeyPlatformRequest<'a> {
    platform: &'a str,
    platform_version_major: Option<u64>,
}

pub(super) fn parse_passkey_delete_request(
    data: &Value,
) -> Result<PasskeyDeleteRequest<'_>, PasskeysCommandError> {
    let Some(credential_id) = credential_id_from_data(data) else {
        return Err(PasskeysCommandError::empty_payload("credentialIdB64Url"));
    };
    Ok(PasskeyDeleteRequest { credential_id })
}

pub(super) fn parse_passkey_platform_request(
    data: &Value,
) -> Result<PasskeyPlatformRequest<'_>, PasskeysCommandError> {
    let platform = match data.get("platform").and_then(|value| value.as_str()) {
        Some(value) if !value.trim().is_empty() => value.trim(),
        _ => return Err(PasskeysCommandError::empty_payload("platform")),
    };
    Ok(PasskeyPlatformRequest {
        platform,
        platform_version_major: data
            .get("platform_version_major")
            .and_then(|value| value.as_u64()),
    })
}

pub(super) fn validate_credential_id(credential_id: &str) -> Result<(), PasskeysCommandError> {
    let valid = !credential_id.is_empty()
        && credential_id.len() <= 256
        && credential_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if valid {
        Ok(())
    } else {
        Err(PasskeysCommandError::invalid_credential_id())
    }
}

pub(super) fn validate_platform(
    request: PasskeyPlatformRequest<'_>,
) -> Result<(), PasskeysCommandError> {
    if request.platform.trim().eq_ignore_ascii_case("android")
        && request.platform_version_major.unwrap_or(0) >= 34
    {
        return Ok(());
    }
    if request.platform.trim().eq_ignore_ascii_case("ios")
        && request.platform_version_major.unwrap_or(0) >= 17
    {
        return Ok(());
    }
    if request.platform.trim().eq_ignore_ascii_case("macos")
        && request.platform_version_major.unwrap_or(0) >= 14
    {
        return Ok(());
    }
    let reason = credential_types::passkey_unsupported_reason(
        request.platform,
        request.platform_version_major,
    );
    Err(PasskeysCommandError::unsupported(reason))
}

fn credential_id_from_data(data: &Value) -> Option<&str> {
    data.get("credentialIdB64Url")
        .or_else(|| data.get("credential_id_b64url"))
        .or_else(|| data.get("credentialId"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}
