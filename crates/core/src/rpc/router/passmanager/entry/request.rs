use crate::rpc::request_parse::{field_present_any, optional_str_any, required_non_empty_str_any};

use super::super::error::PassmanagerCommandError;
use super::super::path::entry_id_from_data;
use super::super::secret::normalize_secret_value;
use super::sanitize::{normalize_entry_type, normalized_payment_card_meta};
use super::tags::normalize_credential_tags;

pub(super) struct EntryCreateSecret {
    pub(super) secret_type: &'static str,
    pub(super) value: String,
}

pub(super) struct EntryCreateRequest {
    pub(super) entry: EntrySaveRequest,
    pub(super) secrets: Vec<EntryCreateSecret>,
}

pub(super) struct EntrySaveRequest {
    pub(super) title: String,
    pub(super) entry_type: String,
    pub(super) payment_card: Option<serde_json::Value>,
    pub(super) requested_entry_id: Option<String>,
    pub(super) has_group_path: bool,
    pub(super) group_path: Option<String>,
    pub(super) created_ts: Option<u64>,
    pub(super) updated_ts: Option<u64>,
    pub(super) urls: Option<serde_json::Value>,
    pub(super) username: Option<serde_json::Value>,
    pub(super) otps: Option<serde_json::Value>,
    pub(super) import_source: Option<serde_json::Value>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) icon_ref: Option<String>,
}

pub(super) struct EntryIdRequest {
    pub(super) entry_id: String,
}

pub(super) struct EntryMoveRequest {
    pub(super) entry_id: String,
    pub(super) target_group_path: Option<String>,
}

pub(super) struct EntryRenameRequest {
    pub(super) entry_id: String,
    pub(super) new_name: String,
}

pub(super) fn parse_entry_save_request(
    data: &serde_json::Value,
) -> Result<EntrySaveRequest, PassmanagerCommandError> {
    let title = required_non_empty_str_any(data, "title", &[], "title")
        .map_err(|response| {
            PassmanagerCommandError::from_rpc_response(response, "title is required")
        })?
        .to_string();
    let entry_type = normalize_entry_type(data)?.to_string();
    let payment_card = normalized_payment_card_meta(data)?;
    if entry_type == "payment_card" && payment_card.is_none() {
        return Err(PassmanagerCommandError::empty_payload(
            "payment_card is required for entry_type=payment_card",
        ));
    }

    Ok(EntrySaveRequest {
        title,
        entry_type,
        payment_card,
        requested_entry_id: entry_id_from_data(data),
        has_group_path: field_present_any(data, "group_path", &["groupPath"]),
        group_path: optional_str_any(data, "group_path", &["groupPath"]).map(ToString::to_string),
        created_ts: timestamp_from_value(data.get("createdTs").or_else(|| data.get("created_ts"))),
        updated_ts: timestamp_from_value(data.get("updatedTs").or_else(|| data.get("updated_ts"))),
        urls: data.get("urls").cloned(),
        username: data.get("username").cloned(),
        otps: data.get("otps").cloned(),
        import_source: data
            .get("import_source")
            .or_else(|| data.get("importSource"))
            .cloned(),
        tags: data.get("tags").map(normalize_credential_tags),
        icon_ref: optional_str_any(data, "iconRef", &["icon_ref"]).map(ToString::to_string),
    })
}

pub(super) fn parse_entry_create_request(
    data: &serde_json::Value,
) -> Result<EntryCreateRequest, PassmanagerCommandError> {
    let entry = parse_entry_save_request(data)?;
    if entry.requested_entry_id.is_none() {
        return Err(PassmanagerCommandError::empty_payload(
            "entry_id is required",
        ));
    }

    let secrets = match data.get("secrets") {
        None | Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::Object(secrets)) => Some(secrets),
        Some(_) => {
            return Err(PassmanagerCommandError::empty_payload(
                "secrets must be an object",
            ))
        }
    };

    let password = parse_optional_secret(secrets, "password")?;
    let note = parse_optional_secret(secrets, "note")?;
    let card_pan = parse_optional_secret(secrets, "card_pan")?;
    let card_cvv = parse_optional_secret(secrets, "card_cvv")?;

    let mut out = Vec::new();
    match entry.entry_type.as_str() {
        "login" => {
            if card_pan.is_some() || card_cvv.is_some() {
                return Err(PassmanagerCommandError::empty_payload(
                    "card secrets are incompatible with entry_type=login",
                ));
            }
            if let Some(value) = password {
                out.push(EntryCreateSecret {
                    secret_type: "password",
                    value: normalize_secret_value("password", &value)?,
                });
            }
        }
        "payment_card" => {
            if password.is_some() {
                return Err(PassmanagerCommandError::empty_payload(
                    "password is incompatible with entry_type=payment_card",
                ));
            }
            let card_pan = card_pan.ok_or_else(|| {
                PassmanagerCommandError::empty_payload(
                    "secrets.card_pan is required for entry_type=payment_card",
                )
            })?;
            out.push(EntryCreateSecret {
                secret_type: "card_pan",
                value: normalize_secret_value("card_pan", &card_pan)?,
            });
            if let Some(value) = card_cvv {
                out.push(EntryCreateSecret {
                    secret_type: "card_cvv",
                    value: normalize_secret_value("card_cvv", &value)?,
                });
            }
        }
        _ => unreachable!("entry type is normalized by parse_entry_save_request"),
    }
    if let Some(value) = note {
        out.push(EntryCreateSecret {
            secret_type: "note",
            value: normalize_secret_value("note", &value)?,
        });
    }

    Ok(EntryCreateRequest {
        entry,
        secrets: out,
    })
}

fn parse_optional_secret(
    secrets: Option<&serde_json::Map<String, serde_json::Value>>,
    key: &str,
) -> Result<Option<String>, PassmanagerCommandError> {
    match secrets.and_then(|secrets| secrets.get(key)) {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(PassmanagerCommandError::empty_payload(format!(
            "secrets.{key} must be a string"
        ))),
    }
}

pub(super) fn parse_entry_id_request(
    data: &serde_json::Value,
) -> Result<EntryIdRequest, PassmanagerCommandError> {
    entry_id_from_data(data)
        .map(|entry_id| EntryIdRequest { entry_id })
        .ok_or_else(|| PassmanagerCommandError::empty_payload("entry_id is required"))
}

pub(super) fn parse_entry_move_request(
    data: &serde_json::Value,
) -> Result<EntryMoveRequest, PassmanagerCommandError> {
    Ok(EntryMoveRequest {
        entry_id: parse_entry_id_request(data)?.entry_id,
        target_group_path: optional_str_any(data, "target_group_path", &[])
            .map(ToString::to_string),
    })
}

pub(super) fn parse_entry_rename_request(
    data: &serde_json::Value,
) -> Result<EntryRenameRequest, PassmanagerCommandError> {
    Ok(EntryRenameRequest {
        entry_id: parse_entry_id_request(data)?.entry_id,
        new_name: required_non_empty_str_any(data, "new_title", &[], "new_title")
            .map_err(|response| {
                PassmanagerCommandError::from_rpc_response(response, "new_title is required")
            })?
            .to_string(),
    })
}

pub(super) fn timestamp_from_value(value: Option<&serde_json::Value>) -> Option<u64> {
    let value = value?;
    if let Some(value) = value.as_u64() {
        return (value > 0).then_some(value);
    }
    if let Some(value) = value.as_i64() {
        return (value > 0).then_some(value as u64);
    }
    value
        .as_f64()
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.floor() as u64)
}

pub(super) fn timestamp_from_map(
    map: &serde_json::Map<String, serde_json::Value>,
    camel_key: &str,
    snake_key: &str,
) -> Option<u64> {
    timestamp_from_value(map.get(camel_key).or_else(|| map.get(snake_key)))
}
