use crate::error::ErrorCode;
use crate::rpc::request_parse::required_non_empty_str_any;

use super::super::error::PassmanagerCommandError;
use super::normalize::normalize_background_color_value;

pub(super) struct IconPutRequest {
    pub(super) background_color: Option<String>,
}

pub(super) struct IconGetRequest {
    pub(super) icon_ref: String,
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
