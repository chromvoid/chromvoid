use serde_json::Value;

use crate::error::ErrorCode;
use crate::passkeys::{decode_b64url, PasskeyInvocationContext};

use super::super::credential_types;
use super::error::PasskeysCommandError;

pub(super) struct PasskeyDeleteRequest<'a> {
    pub(super) credential_id: &'a str,
}

#[derive(Clone, Copy)]
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

pub(super) fn parse_passkey_invocation_context(
    data: &Value,
) -> Result<PasskeyInvocationContext, PasskeysCommandError> {
    let platform = parse_passkey_platform_request(data)?;
    let origin = data
        .get("origin")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| PasskeysCommandError::empty_payload("origin"))?;

    let request = public_key_request(data);
    if request
        .get("clientDataHash")
        .or_else(|| request.get("client_data_hash"))
        .is_some()
    {
        return Err(PasskeysCommandError::new(
            "clientDataHash must come from trusted provider context",
            ErrorCode::InvalidContext,
        ));
    }

    let client_data_hash = match data
        .get("clientDataHash")
        .or_else(|| data.get("client_data_hash"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => {
            let decoded = decode_b64url(value).map_err(|_| {
                PasskeysCommandError::new("clientDataHash is invalid", ErrorCode::InvalidContext)
            })?;
            if decoded.len() != 32 {
                return Err(PasskeysCommandError::new(
                    "clientDataHash must be 32 bytes",
                    ErrorCode::InvalidContext,
                ));
            }
            Some(decoded)
        }
        None => None,
    };

    let selected_credential_id = credential_id_from_data(data).map(str::to_string);
    if let Some(credential_id) = selected_credential_id.as_deref() {
        validate_credential_id(credential_id)?;
    }

    Ok(PasskeyInvocationContext {
        platform: platform.platform.to_string(),
        platform_version_major: platform.platform_version_major,
        origin: origin.to_string(),
        client_data_hash,
        selected_credential_id,
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

fn public_key_request(data: &Value) -> &Value {
    let request = data.get("request").unwrap_or(data);
    request.get("publicKey").unwrap_or(request)
}
