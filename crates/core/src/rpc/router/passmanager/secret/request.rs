use crate::rpc::request_parse::optional_str_any;

use super::super::error::PassmanagerCommandError;
use super::super::path::entry_id_from_data;
use super::types::{SecretSaveRequest, SecretTargetRequest};

pub(super) fn parse_secret_save_request(
    data: &serde_json::Value,
) -> Result<SecretSaveRequest, PassmanagerCommandError> {
    let target = parse_secret_target_request(data)?;
    let Some(value_raw) = data.get("value") else {
        return Err(PassmanagerCommandError::empty_payload("value is required"));
    };
    let Some(value) = value_raw.as_str() else {
        return Err(PassmanagerCommandError::empty_payload(
            "value must be string; use passmanager:secret:delete for null",
        ));
    };

    Ok(SecretSaveRequest::new(
        target.entry_id,
        target.secret_type,
        value.to_string(),
    ))
}

pub(super) fn parse_secret_target_request(
    data: &serde_json::Value,
) -> Result<SecretTargetRequest, PassmanagerCommandError> {
    let Some(entry_id) = entry_id_from_data(data) else {
        return Err(PassmanagerCommandError::empty_payload(
            "entry_id is required",
        ));
    };
    let Some(secret_type) = optional_str_any(data, "secret_type", &["type"]) else {
        return Err(PassmanagerCommandError::empty_payload(
            "secret_type is required",
        ));
    };

    Ok(SecretTargetRequest::new(entry_id, secret_type.to_string()))
}
