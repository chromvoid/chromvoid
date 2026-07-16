use std::collections::HashSet;

use crate::error::ErrorCode;
use crate::rpc::request_parse::required_non_empty_str_any;

use super::super::error::PassmanagerCommandError;
use super::is_valid_icon_ref;
use super::normalize::normalize_background_color_value;
use super::types::ICON_GET_MANY_MAX_REFS;

pub(super) struct IconPutRequest {
    pub(super) background_color: Option<String>,
}

pub(super) struct IconGetRequest {
    pub(super) icon_ref: String,
}

pub(super) struct IconGetManyRequest {
    pub(super) icon_refs: Vec<String>,
}

pub(super) struct IconSetMetaRequest {
    pub(super) icon_ref: String,
    pub(super) background_color: Option<String>,
}

pub(super) fn parse_icon_put_request(
    data: &serde_json::Value,
) -> Result<IconPutRequest, PassmanagerCommandError> {
    Ok(IconPutRequest {
        background_color: parse_optional_background_color(data)?,
    })
}

pub(super) fn parse_icon_get_request(
    data: &serde_json::Value,
) -> Result<IconGetRequest, PassmanagerCommandError> {
    Ok(IconGetRequest {
        icon_ref: required_non_empty_str_any(data, "icon_ref", &[], "icon_ref")
            .map_err(|response| {
                PassmanagerCommandError::from_rpc_response(response, "icon_ref is required")
            })?
            .to_string(),
    })
}

pub(super) fn parse_icon_get_many_request(
    data: &serde_json::Value,
) -> Result<IconGetManyRequest, PassmanagerCommandError> {
    let Some(values) = data
        .get("icon_refs")
        .or_else(|| data.get("iconRefs"))
        .and_then(serde_json::Value::as_array)
    else {
        return Err(PassmanagerCommandError::empty_payload(
            "icon_refs must be a non-empty array",
        ));
    };

    let mut seen = HashSet::with_capacity(values.len());
    let mut icon_refs = Vec::with_capacity(values.len().min(ICON_GET_MANY_MAX_REFS));
    for value in values {
        let Some(icon_ref) = value.as_str().map(str::trim) else {
            return Err(PassmanagerCommandError::empty_payload(
                "icon_refs must contain strings",
            ));
        };
        if !is_valid_icon_ref(icon_ref) {
            return Err(PassmanagerCommandError::empty_payload(
                "invalid icon_ref format",
            ));
        }
        if seen.insert(icon_ref.to_string()) {
            icon_refs.push(icon_ref.to_string());
        }
    }

    if icon_refs.is_empty() {
        return Err(PassmanagerCommandError::empty_payload(
            "icon_refs must be a non-empty array",
        ));
    }
    if icon_refs.len() > ICON_GET_MANY_MAX_REFS {
        return Err(PassmanagerCommandError::empty_payload(format!(
            "icon_refs exceeds maximum of {ICON_GET_MANY_MAX_REFS} unique refs"
        )));
    }

    Ok(IconGetManyRequest { icon_refs })
}

pub(super) fn parse_icon_set_meta_request(
    data: &serde_json::Value,
) -> Result<IconSetMetaRequest, PassmanagerCommandError> {
    let Some(background_value) = data
        .get("background_color")
        .or_else(|| data.get("backgroundColor"))
    else {
        return Err(PassmanagerCommandError::new(
            "background_color is required",
            Some(ErrorCode::EmptyPayload),
        ));
    };

    Ok(IconSetMetaRequest {
        icon_ref: required_non_empty_str_any(data, "icon_ref", &["iconRef"], "icon_ref")
            .map_err(|response| {
                PassmanagerCommandError::from_rpc_response(response, "icon_ref is required")
            })?
            .to_string(),
        background_color: normalize_background_color_value(background_value)?,
    })
}

fn parse_optional_background_color(
    data: &serde_json::Value,
) -> Result<Option<String>, PassmanagerCommandError> {
    let Some(value) = data
        .get("background_color")
        .or_else(|| data.get("backgroundColor"))
    else {
        return Ok(None);
    };

    normalize_background_color_value(value)
}
