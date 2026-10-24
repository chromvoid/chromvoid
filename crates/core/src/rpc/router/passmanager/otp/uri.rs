//! Pure intake of user-supplied setup links. Never opens a URL or writes a vault.
use std::collections::HashMap;

use super::super::error::PassmanagerCommandError as Error;
use crate::{
    error::ErrorCode,
    rpc::{
        router::otp_sidecar::{validate_otp_secret, OtpSetSecretRequest},
        types::{PassmanagerOtpUriRequest, PassmanagerOtpUriResponse},
    },
};

fn invalid() -> Error {
    Error::new(
        "Invalid or unsupported OTP setup link",
        Some(ErrorCode::OtpSettingsInvalid),
    )
}
fn within(value: &str, limit: usize) -> bool {
    value.encode_utf16().count() <= limit
}
fn number(parameters: &HashMap<String, String>, name: &str, fallback: u64) -> Result<u64, Error> {
    let Some(value) = parameters
        .get(name)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    else {
        return Ok(fallback);
    };
    if !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(invalid());
    }
    value.parse().map_err(|_| invalid())
}
fn decode_label(value: &str) -> Result<String, Error> {
    let bytes = value.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'%'
            && (index + 2 >= bytes.len()
                || !bytes[index + 1..=index + 2]
                    .iter()
                    .all(u8::is_ascii_hexdigit))
        {
            return Err(invalid());
        }
    }
    percent_encoding::percent_decode_str(value)
        .decode_utf8()
        .map(|s| s.trim().to_string())
        .map_err(|_| invalid())
}

pub(in crate::rpc::router::passmanager) fn parse(
    request: PassmanagerOtpUriRequest,
) -> Result<PassmanagerOtpUriResponse, Error> {
    let input = request.uri.trim();
    if !within(input, 16 * 1024) {
        return Err(invalid());
    }
    let (scheme, suffix) = input.split_once("://").ok_or_else(invalid)?;
    if !scheme.eq_ignore_ascii_case("otpauth") {
        return Err(invalid());
    }
    let authority = suffix.split(['/', '?', '#']).next().ok_or_else(invalid)?;
    if !authority.eq_ignore_ascii_case("totp") && !authority.eq_ignore_ascii_case("hotp") {
        return Err(invalid());
    }
    let url = url::Url::parse(input).map_err(|_| invalid())?;
    if url.fragment().is_some() {
        return Err(invalid());
    }
    let mut parameters = HashMap::new();
    for (key, value) in url.query_pairs() {
        let key = key.trim().to_lowercase();
        if [
            "secret",
            "algorithm",
            "encoding",
            "digits",
            "period",
            "counter",
            "issuer",
        ]
        .contains(&key.as_str())
            && parameters.insert(key, value.into_owned()).is_some()
        {
            return Err(invalid());
        }
    }
    let secret = parameters
        .get("secret")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(invalid)?;
    if !within(secret, 4096) {
        return Err(invalid());
    }
    let path = decode_label(url.path().trim_start_matches('/'))?;
    let (path_issuer, account) = path
        .split_once(':')
        .map(|(issuer, account)| (issuer.trim(), account.trim()))
        .unwrap_or(("", path.as_str()));
    let issuer = parameters
        .get("issuer")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(path_issuer);
    let label = if !account.is_empty() {
        account
    } else if !issuer.is_empty() {
        issuer
    } else {
        request.fallback_label.as_deref().unwrap_or("").trim()
    };
    if [issuer, account, label]
        .iter()
        .any(|value| !within(value, 256) || value.contains('\0'))
    {
        return Err(invalid());
    }
    let otp_type = authority.to_uppercase();
    let digits = u8::try_from(number(&parameters, "digits", 6)?).map_err(|_| invalid())?;
    let period = u32::try_from(number(&parameters, "period", 30)?).map_err(|_| invalid())?;
    if period == 0 {
        return Err(invalid());
    }
    let counter = if otp_type == "HOTP" {
        Some(number(&parameters, "counter", 0)?)
    } else {
        None
    };
    let defaulted = |key: &str, fallback: &str| {
        parameters
            .get(key)
            .filter(|s| !s.is_empty())
            .cloned()
            .unwrap_or_else(|| fallback.to_string())
    };
    let validated = validate_otp_secret(OtpSetSecretRequest {
        node_id: 0,
        label: label.to_string(),
        secret: secret.to_string(),
        algorithm: defaulted("algorithm", "SHA1"),
        encoding: defaulted("encoding", "base32"),
        otp_type,
        digits,
        period,
        counter,
    })
    .map_err(|_| invalid())?;
    Ok(PassmanagerOtpUriResponse {
        settings: super::records::summary(&validated),
        secret: validated.secret,
        issuer: issuer.to_string(),
        account: account.to_string(),
    })
}
