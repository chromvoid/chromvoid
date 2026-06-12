use serde_json::Value;

use super::encoding::decode_b64url;
use super::types::PasskeyError;
use super::validation::validate_rp_id;

pub(super) fn public_key_request(data: &Value) -> &Value {
    let request = data.get("request").unwrap_or(data);
    request.get("publicKey").unwrap_or(request)
}

pub(super) fn object_field<'a>(value: &'a Value, key: &str) -> Result<&'a Value, PasskeyError> {
    let field = value
        .get(key)
        .ok_or_else(|| PasskeyError::new("EMPTY_PAYLOAD", format!("{key} is required")))?;
    if !field.is_object() {
        return Err(PasskeyError::new(
            "EMPTY_PAYLOAD",
            format!("{key} must be an object"),
        ));
    }
    Ok(field)
}

pub(super) fn required_str<'a>(value: &'a Value, key: &str) -> Result<&'a str, PasskeyError> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| PasskeyError::new("EMPTY_PAYLOAD", format!("{key} is required")))
}

pub(super) fn optional_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

pub(super) fn decode_b64url_field(value: &Value, key: &str) -> Result<Vec<u8>, PasskeyError> {
    let raw = required_str(value, key)?;
    decode_b64url(raw)
        .map_err(|_| PasskeyError::new("INVALID_CONTEXT", format!("{key} is invalid")))
}

pub(super) fn rp_id_from_get_request(request: &Value) -> Result<String, PasskeyError> {
    if let Some(rp_id) = optional_str(request, "rpId") {
        validate_rp_id(rp_id)?;
        return Ok(rp_id.to_string());
    }
    if let Some(rp_id) = request
        .get("rp")
        .and_then(|rp| rp.get("id"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        validate_rp_id(rp_id)?;
        return Ok(rp_id.to_string());
    }
    Err(PasskeyError::new("EMPTY_PAYLOAD", "rpId is required"))
}

pub(super) fn allow_credential_ids(request: &Value) -> Result<Vec<String>, PasskeyError> {
    let Some(allow) = request.get("allowCredentials").and_then(|v| v.as_array()) else {
        return Ok(Vec::new());
    };
    let mut ids = Vec::new();
    for credential in allow {
        if let Some(id) = credential.get("id").and_then(|v| v.as_str()) {
            decode_b64url(id).map_err(|_| {
                PasskeyError::new("INVALID_CONTEXT", "allowCredentials.id is invalid")
            })?;
            ids.push(id.to_string());
        }
    }
    Ok(ids)
}

pub(super) fn excluded_credential_ids(request: &Value) -> impl Iterator<Item = &str> {
    request
        .get("excludeCredentials")
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .filter_map(|credential| credential.get("id").and_then(|id| id.as_str()))
}

pub(super) fn request_has_client_data_hash(request: &Value) -> bool {
    request_client_data_hash_value(request).is_some()
}

pub(super) fn request_client_data_hash_value(request: &Value) -> Option<&str> {
    optional_str(request, "clientDataHash").or_else(|| optional_str(request, "client_data_hash"))
}
