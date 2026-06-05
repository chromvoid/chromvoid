use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::entry::{credential_tag_key, normalize_credential_tag_catalog};
use super::error::PassmanagerCommandError;
use super::file_store::{read_file_bytes_by_path, stage_file_bytes_at_path};
use crate::error::ErrorCode;
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::rpc::types::RpcResponse;
use crate::vault::VaultSession;

const PASSMANAGER_TAG_META_PATH: &str = "/.passmanager/.tags-meta.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct TagMetaFile {
    #[serde(default)]
    tags: Vec<String>,
}

pub(super) fn normalize_tag_catalog_from_value(value: &Value) -> Vec<String> {
    normalize_credential_tag_catalog(value)
}

pub(super) fn normalize_tag_catalog_from_labels(labels: impl IntoIterator<Item = String>) -> Vec<String> {
    normalize_credential_tag_catalog(&Value::Array(labels.into_iter().map(Value::String).collect()))
}

pub(super) fn merge_tag_catalogs(catalogs: impl IntoIterator<Item = Vec<String>>) -> Vec<String> {
    let mut by_key = BTreeMap::<String, String>::new();
    for catalog in catalogs {
        for label in catalog {
            let key = credential_tag_key(&label);
            if key.is_empty() || by_key.contains_key(&key) {
                continue;
            }
            by_key.insert(key, label);
        }
    }

    by_key.into_values().collect()
}

pub(super) fn extract_entry_tags(entries: &[Value]) -> Vec<String> {
    let mut catalogs = Vec::new();
    for entry in entries {
        let Some(tags) = entry.get("tags") else {
            continue;
        };
        catalogs.push(normalize_tag_catalog_from_value(tags));
    }
    merge_tag_catalogs(catalogs)
}

pub(super) fn load_tag_catalog(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<Vec<String>, PassmanagerCommandError> {
    let Some(bytes) = read_file_bytes_by_path(session, storage, PASSMANAGER_TAG_META_PATH)? else {
        return Ok(Vec::new());
    };

    let parsed = serde_json::from_slice::<TagMetaFile>(&bytes).map_err(|error| {
        PassmanagerCommandError::new(
            format!("Failed to parse tag meta index: {error}"),
            Some(ErrorCode::InternalError),
        )
    })?;

    Ok(normalize_tag_catalog_from_labels(parsed.tags))
}

pub(super) fn stage_tag_catalog(
    uow: &mut DomainUnitOfWork<'_>,
    tags: &[String],
) -> Result<(), PassmanagerCommandError> {
    let payload = TagMetaFile {
        tags: normalize_tag_catalog_from_labels(tags.iter().cloned()),
    };
    let bytes = serde_json::to_vec(&payload).map_err(|error| {
        PassmanagerCommandError::new(
            format!("Failed to serialize tag meta index: {error}"),
            Some(ErrorCode::InternalError),
        )
    })?;

    stage_file_bytes_at_path(
        uow,
        "/.passmanager",
        ".tags-meta.json",
        &bytes,
        "application/json",
    )
}

pub(super) fn handle_set_catalog(
    _session: &VaultSession,
    _storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> RpcResponse {
    let Some(tags_value) = data.get("tags") else {
        return RpcResponse::error("tags is required", Some(ErrorCode::EmptyPayload));
    };
    if !tags_value.is_array() {
        return RpcResponse::error("tags must be string[]", Some(ErrorCode::EmptyPayload));
    }

    let tags = normalize_tag_catalog_from_value(tags_value);
    match stage_tag_catalog(uow, &tags) {
        Ok(()) => RpcResponse::success(Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}
