use serde_json::Value;

use super::request::{excluded_credential_ids, optional_str};
use super::types::{PasskeyCredentialSource, PasskeyError, ES256_ALGORITHM};

pub(super) fn validate_rp_id(rp_id: &str) -> Result<(), PasskeyError> {
    let valid = !rp_id.is_empty()
        && rp_id.len() <= 253
        && !rp_id.starts_with('.')
        && !rp_id.ends_with('.')
        && rp_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.');
    if valid {
        Ok(())
    } else {
        Err(PasskeyError::new("INVALID_CONTEXT", "rp.id is invalid"))
    }
}

pub(super) fn require_es256(request: &Value) -> Result<(), PasskeyError> {
    let Some(params) = request.get("pubKeyCredParams").and_then(|v| v.as_array()) else {
        return Err(PasskeyError::new(
            "EMPTY_PAYLOAD",
            "pubKeyCredParams is required",
        ));
    };
    let has_es256 = params
        .iter()
        .any(|param| param.get("alg").and_then(|v| v.as_i64()) == Some(ES256_ALGORITHM));
    if has_es256 {
        Ok(())
    } else {
        Err(PasskeyError::new("UNSUPPORTED", "ES256 is required"))
    }
}

pub(super) fn require_attestation_none(request: &Value) -> Result<(), PasskeyError> {
    match optional_str(request, "attestation").unwrap_or("none") {
        "none" => Ok(()),
        _ => Err(PasskeyError::new(
            "UNSUPPORTED",
            "Only attestation=none is supported",
        )),
    }
}

pub(super) fn reject_excluded_credentials(
    request: &Value,
    existing_sources: &[PasskeyCredentialSource],
) -> Result<(), PasskeyError> {
    for id in excluded_credential_ids(request) {
        if existing_sources
            .iter()
            .any(|source| source.credential_id_b64url == id)
        {
            return Err(PasskeyError::new(
                "ACCESS_DENIED",
                "Excluded credential already exists",
            ));
        }
    }
    Ok(())
}
