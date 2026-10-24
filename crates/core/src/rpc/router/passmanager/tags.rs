mod catalog;
pub(super) use catalog::{delete, read_page, resolve_selected_keys, save};

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
const CREDENTIAL_TAG_COLOR_IDS: &[&str] =
    &["violet", "green", "blue", "pink", "amber", "orange", "cyan"];

pub(in crate::rpc::router::passmanager) type TagCatalogMeta =
    BTreeMap<String, CredentialTagMetaValue>;

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub(in crate::rpc::router::passmanager) struct CredentialTagMetaValue {
    #[serde(rename = "colorId", alias = "color_id")]
    pub(in crate::rpc::router::passmanager) color_id: String,
}

impl CredentialTagMetaValue {
    fn new(color_id: String) -> Self {
        Self { color_id }
    }
}

#[derive(Debug, Default)]
pub(in crate::rpc::router::passmanager) struct TagCatalogData {
    pub(in crate::rpc::router::passmanager) tags: Vec<String>,
    pub(in crate::rpc::router::passmanager) meta: TagCatalogMeta,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct TagMetaFile {
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    meta: Option<serde_json::Map<String, Value>>,
}

pub(super) fn normalize_tag_catalog_from_value(value: &Value) -> Vec<String> {
    normalize_credential_tag_catalog(value)
}

pub(super) fn normalize_tag_catalog_from_labels(
    labels: impl IntoIterator<Item = String>,
) -> Vec<String> {
    normalize_credential_tag_catalog(&Value::Array(
        labels.into_iter().map(Value::String).collect(),
    ))
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

fn normalize_tag_color_id(value: &Value) -> Option<String> {
    let color_id = value
        .as_object()
        .and_then(|meta| meta.get("colorId").or_else(|| meta.get("color_id")))
        .and_then(Value::as_str)?;
    if CREDENTIAL_TAG_COLOR_IDS.contains(&color_id) {
        Some(color_id.to_string())
    } else {
        None
    }
}

pub(super) fn normalize_tag_catalog_meta_from_value(
    value: &Value,
    catalog_tags: &[String],
) -> TagCatalogMeta {
    let Some(raw_meta) = value.as_object() else {
        return BTreeMap::new();
    };

    let allowed_keys = normalize_tag_catalog_from_labels(catalog_tags.iter().cloned())
        .into_iter()
        .map(|label| credential_tag_key(&label))
        .collect::<std::collections::BTreeSet<_>>();
    let mut meta = BTreeMap::new();
    for (raw_key, raw_value) in raw_meta {
        let key = credential_tag_key(raw_key);
        if key.is_empty() || !allowed_keys.contains(&key) {
            continue;
        }
        let Some(color_id) = normalize_tag_color_id(raw_value) else {
            continue;
        };
        meta.insert(key, CredentialTagMetaValue::new(color_id));
    }

    meta
}

pub(super) fn prune_tag_catalog_meta(
    meta: &TagCatalogMeta,
    catalog_tags: &[String],
) -> TagCatalogMeta {
    let allowed_keys = normalize_tag_catalog_from_labels(catalog_tags.iter().cloned())
        .into_iter()
        .map(|label| credential_tag_key(&label))
        .collect::<std::collections::BTreeSet<_>>();
    meta.iter()
        .filter_map(|(key, value)| {
            let normalized_key = credential_tag_key(key);
            if normalized_key.is_empty() || !allowed_keys.contains(&normalized_key) {
                return None;
            }
            if CREDENTIAL_TAG_COLOR_IDS.contains(&value.color_id.as_str()) {
                Some((normalized_key, value.clone()))
            } else {
                None
            }
        })
        .collect()
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

pub(super) fn load_tag_catalog_data(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<TagCatalogData, PassmanagerCommandError> {
    let Some(bytes) = read_file_bytes_by_path(session, storage, PASSMANAGER_TAG_META_PATH)? else {
        return Ok(TagCatalogData::default());
    };

    let parsed = serde_json::from_slice::<TagMetaFile>(&bytes).map_err(|error| {
        PassmanagerCommandError::new(
            format!("Failed to parse tag meta index: {error}"),
            Some(ErrorCode::InternalError),
        )
    })?;

    let tags = normalize_tag_catalog_from_labels(parsed.tags);
    let meta = normalize_tag_catalog_meta_from_value(
        &Value::Object(parsed.meta.unwrap_or_default()),
        &tags,
    );
    Ok(TagCatalogData { tags, meta })
}

pub(super) fn serialize_tag_catalog_file(
    tags: &[String],
    meta: &TagCatalogMeta,
) -> Result<Vec<u8>, PassmanagerCommandError> {
    let tags = normalize_tag_catalog_from_labels(tags.iter().cloned());
    let meta = prune_tag_catalog_meta(meta, &tags);
    let payload = TagMetaFile {
        tags,
        meta: Some(
            meta.into_iter()
                .map(|(key, value)| {
                    serde_json::to_value(value)
                        .map(|value| (key, value))
                        .map_err(|error| {
                            PassmanagerCommandError::new(
                                format!("Failed to serialize tag meta index: {error}"),
                                Some(ErrorCode::InternalError),
                            )
                        })
                })
                .collect::<Result<serde_json::Map<String, Value>, PassmanagerCommandError>>()?,
        ),
    };
    serde_json::to_vec(&payload).map_err(|error| {
        PassmanagerCommandError::new(
            format!("Failed to serialize tag meta index: {error}"),
            Some(ErrorCode::InternalError),
        )
    })
}

pub(super) fn stage_tag_catalog(
    uow: &mut DomainUnitOfWork<'_>,
    tags: &[String],
    meta: &TagCatalogMeta,
) -> Result<(), PassmanagerCommandError> {
    let bytes = serialize_tag_catalog_file(tags, meta)?;

    stage_file_bytes_at_path(
        uow,
        "/.passmanager",
        ".tags-meta.json",
        &bytes,
        "application/json",
    )
}

pub(super) fn handle_set_catalog(
    session: &VaultSession,
    storage: &crate::storage::Storage,
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
    let meta = match data.get("tag_meta").or_else(|| data.get("tagMeta")) {
        Some(value) => normalize_tag_catalog_meta_from_value(value, &tags),
        None => match load_tag_catalog_data(session, storage) {
            Ok(existing) => prune_tag_catalog_meta(&existing.meta, &tags),
            Err(error) => return error.into_rpc_response(),
        },
    };
    match stage_tag_catalog(uow, &tags, &meta) {
        Ok(()) => RpcResponse::success(Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}
