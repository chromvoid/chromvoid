use crate::error::ErrorCode;
use crate::rpc::request_parse::{field_present_any, required_non_empty_str_any};

use super::super::error::PassmanagerCommandError;
use super::super::icon::is_valid_icon_ref;
use super::meta_store::normalize_group_meta_description;

pub(super) struct GroupPathRequest {
    pub(super) path: String,
}

pub(super) struct GroupSetMetaRequest {
    pub(super) path: String,
    pub(super) icon_ref_update: Option<Option<String>>,
    pub(super) description_update: Option<Option<String>>,
}

pub(super) fn parse_group_path_request(
    data: &serde_json::Value,
) -> Result<GroupPathRequest, PassmanagerCommandError> {
    Ok(GroupPathRequest {
        path: required_non_empty_str_any(data, "path", &[], "path")
            .map_err(|response| {
                PassmanagerCommandError::from_rpc_response(response, "path is required")
            })?
            .to_string(),
    })
}

pub(super) fn parse_group_set_meta_request(
    data: &serde_json::Value,
) -> Result<GroupSetMetaRequest, PassmanagerCommandError> {
    let path = parse_group_path_request(data)?.path;
    let has_icon_ref_field = field_present_any(data, "icon_ref", &["iconRef"]);
    let has_description_field = field_present_any(data, "description", &[]);
    if !has_icon_ref_field && !has_description_field {
        return Err(PassmanagerCommandError::new(
            "icon_ref or description is required",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    let icon_ref_update = if has_icon_ref_field {
        if let Some(value) = data.get("icon_ref").or_else(|| data.get("iconRef")) {
            if value.is_null() {
                Some(None)
            } else {
                let Some(icon_ref) = value.as_str().map(str::trim).filter(|v| !v.is_empty()) else {
                    return Err(PassmanagerCommandError::new(
                        "icon_ref must be string or null",
                        Some(ErrorCode::EmptyPayload),
                    ));
                };
                if !is_valid_icon_ref(icon_ref) {
                    return Err(PassmanagerCommandError::new(
                        "invalid icon_ref format",
                        Some(ErrorCode::EmptyPayload),
                    ));
                }
                Some(Some(icon_ref.to_string()))
            }
        } else {
            Some(None)
        }
    } else {
        None
    };

    let description_update = if has_description_field {
        match data.get("description") {
            Some(value) if value.is_null() => Some(None),
            Some(value) => {
                let Some(description_raw) = value.as_str() else {
                    return Err(PassmanagerCommandError::new(
                        "description must be string or null",
                        Some(ErrorCode::EmptyPayload),
                    ));
                };
                Some(normalize_group_meta_description(description_raw))
            }
            None => Some(None),
        }
    } else {
        None
    };

    Ok(GroupSetMetaRequest {
        path,
        icon_ref_update,
        description_update,
    })
}
