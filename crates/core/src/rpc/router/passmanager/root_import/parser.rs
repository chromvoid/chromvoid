use super::super::{group, icon, path};
use super::error::RootImportError;
use super::types::RootImportPayload;
use crate::rpc::request_parse::{optional_bool_any, optional_str_any, required_array_any};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub(super) fn parse_root_import_payload(
    data: &Value,
) -> Result<RootImportPayload<'_>, RootImportError> {
    let import_mode = optional_str_any(data, "mode", &[]).unwrap_or("merge");
    if !matches!(import_mode, "merge" | "replace" | "restore") {
        return Err(RootImportError::empty_payload(
            "mode must be one of: merge, replace, restore",
        ));
    }

    let allow_destructive =
        optional_bool_any(data, "allow_destructive", &["allowDestructive"]).unwrap_or(false);
    let requires_destructive = matches!(import_mode, "replace" | "restore");
    if requires_destructive && !allow_destructive {
        return Err(RootImportError::access_denied(
            "destructive root import requires allow_destructive=true",
        ));
    }

    let folders = required_array_any(data, "folders", &[], "folders")
        .map_err(RootImportError::from_rpc_response)?;
    validate_folders(folders)?;

    let entries = required_array_any(data, "entries", &[], "entries")
        .map_err(RootImportError::from_rpc_response)?;
    validate_entries(entries)?;

    Ok(RootImportPayload {
        folders,
        entries,
        imported_tags: parse_tags(data)?,
        imported_group_meta: parse_group_meta(data)?,
        should_clear_existing: requires_destructive && allow_destructive,
    })
}

fn parse_tags(data: &Value) -> Result<Vec<String>, RootImportError> {
    let Some(tags_value) = data.get("tags") else {
        return Ok(Vec::new());
    };
    if !tags_value.is_array() {
        return Err(RootImportError::empty_payload("tags must be string[]"));
    }
    Ok(super::super::tags::normalize_tag_catalog_from_value(tags_value))
}

fn parse_group_meta(
    data: &Value,
) -> Result<BTreeMap<String, group::GroupMetaValue>, RootImportError> {
    let folders_meta_items: &[Value] =
        match data.get("folders_meta").or_else(|| data.get("foldersMeta")) {
            Some(folders_meta) => folders_meta
                .as_array()
                .map(Vec::as_slice)
                .ok_or_else(|| RootImportError::empty_payload("folders_meta must be object[]"))?,
            None => &[],
        };

    let mut imported_group_meta = BTreeMap::new();
    for item in folders_meta_items {
        let Some(item_obj) = item.as_object() else {
            return Err(RootImportError::empty_payload(
                "folders_meta must be object[]",
            ));
        };

        let Some(path_raw) = item_obj.get("path").and_then(|v| v.as_str()) else {
            return Err(RootImportError::empty_payload(
                "folders_meta.path is required",
            ));
        };
        let Some(path) = group::normalize_group_meta_path(path_raw) else {
            return Err(RootImportError::invalid_path(
                "folders_meta.path is invalid",
            ));
        };

        let icon_ref = normalize_group_meta_icon_ref(item_obj)?;
        let description = normalize_group_meta_description(item_obj)?;
        if icon_ref.is_some() || description.is_some() {
            imported_group_meta.insert(
                path,
                group::GroupMetaValue {
                    icon_ref,
                    description,
                },
            );
        }
    }

    Ok(imported_group_meta)
}

fn normalize_group_meta_icon_ref(
    item_obj: &Map<String, Value>,
) -> Result<Option<String>, RootImportError> {
    let icon_ref_value = item_obj.get("icon_ref").or_else(|| item_obj.get("iconRef"));
    match icon_ref_value {
        Some(value) if value.is_null() => Ok(None),
        Some(value) => {
            let Some(icon_ref) = value.as_str().map(str::trim).filter(|v| !v.is_empty()) else {
                return Err(RootImportError::empty_payload(
                    "folders_meta.icon_ref must be string or null",
                ));
            };
            if !icon::is_valid_icon_ref(icon_ref) {
                return Err(RootImportError::empty_payload(
                    "folders_meta.icon_ref has invalid format",
                ));
            }
            Ok(Some(icon_ref.to_string()))
        }
        None => Ok(None),
    }
}

fn normalize_group_meta_description(
    item_obj: &Map<String, Value>,
) -> Result<Option<String>, RootImportError> {
    match item_obj.get("description") {
        Some(value) if value.is_null() => Ok(None),
        Some(value) => {
            let Some(description_raw) = value.as_str() else {
                return Err(RootImportError::empty_payload(
                    "folders_meta.description must be string or null",
                ));
            };
            let normalized = description_raw.trim();
            if normalized.is_empty() {
                Ok(None)
            } else {
                Ok(Some(normalized.to_string()))
            }
        }
        None => Ok(None),
    }
}

fn validate_folders(folders: &[Value]) -> Result<(), RootImportError> {
    for folder in folders {
        let Some(folder_path) = folder.as_str() else {
            return Err(RootImportError::empty_payload("folders must be string[]"));
        };
        let Some(pm_path) = path::map_entry_group_path_to_passmanager_path(Some(folder_path))
        else {
            return Err(RootImportError::access_denied("Access denied"));
        };
        if !path::validate_passmanager_group_path(&pm_path) {
            return Err(RootImportError::empty_payload(
                "folder path contains invalid segment",
            ));
        }
    }

    Ok(())
}

fn validate_entries(entries: &[Value]) -> Result<(), RootImportError> {
    for entry in entries {
        let entry_obj = entry_object(entry)?;
        let title = entry_title(entry_obj)?;
        if !path::is_valid_catalog_name(title) {
            return Err(RootImportError::empty_payload(
                "entry title contains invalid characters",
            ));
        }

        let folder_path = entry_folder_path(entry_obj)?;
        let Some(pm_folder_path) =
            path::map_entry_group_path_to_passmanager_path(Some(folder_path))
        else {
            return Err(RootImportError::access_denied("Access denied"));
        };
        if !path::validate_passmanager_group_path(&pm_folder_path) {
            return Err(RootImportError::empty_payload(
                "entry folderPath contains invalid segment",
            ));
        }
    }

    Ok(())
}

pub(super) fn entry_object(entry: &Value) -> Result<&Map<String, Value>, RootImportError> {
    entry
        .as_object()
        .ok_or_else(|| RootImportError::empty_payload("entries must be object[]"))
}

pub(super) fn entry_title<'a>(
    entry_obj: &'a Map<String, Value>,
) -> Result<&'a str, RootImportError> {
    match entry_obj.get("title").and_then(|v| v.as_str()) {
        Some(value) if !value.trim().is_empty() => Ok(value.trim()),
        _ => Err(RootImportError::empty_payload("entry title is required")),
    }
}

pub(super) fn entry_folder_path<'a>(
    entry_obj: &'a Map<String, Value>,
) -> Result<&'a str, RootImportError> {
    match entry_obj
        .get("folderPath")
        .or_else(|| entry_obj.get("groupPath"))
    {
        Some(value) if value.is_null() => Ok("/"),
        Some(value) => value
            .as_str()
            .ok_or_else(|| RootImportError::empty_payload("entry folderPath must be string")),
        None => Ok("/"),
    }
}
