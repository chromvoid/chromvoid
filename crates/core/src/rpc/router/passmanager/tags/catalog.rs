//! Metadata-only tag catalog and atomic cross-entry mutations.
use std::collections::BTreeMap;

use serde_json::{json, Value};

use super::{
    load_tag_catalog_data, stage_tag_catalog, CredentialTagMetaValue, CREDENTIAL_TAG_COLOR_IDS,
};
use crate::{
    error::ErrorCode,
    rpc::{
        router::{
            domain_uow::DomainUnitOfWork,
            passmanager::{
                entry::{
                    collect_entry_dir_ids_with_meta, credential_tag_key,
                    normalize_credential_tag_catalog, normalize_credential_tags,
                    read_entry_meta_json, stage_entry_meta_json,
                },
                error::PassmanagerCommandError,
                path::now_unix_ms,
            },
        },
        types::{
            CredentialTagSummary, PassmanagerTagDeleteRequest, PassmanagerTagPageRequest,
            PassmanagerTagPageResponse, PassmanagerTagSaveRequest,
        },
    },
    storage::Storage,
    vault::VaultSession,
};

type Catalog = BTreeMap<String, CredentialTagSummary>;

fn entry_ids(session: &VaultSession) -> Vec<u64> {
    let mut ids = Vec::new();
    if let Some(root) = session.catalog().find_by_path("/.passmanager") {
        collect_entry_dir_ids_with_meta(root, &mut ids);
    }
    ids.sort_unstable();
    ids
}

fn metadata(
    session: &VaultSession,
    storage: &Storage,
    id: u64,
) -> Result<Value, PassmanagerCommandError> {
    read_entry_meta_json(session, storage, id)
        .filter(Value::is_object)
        .ok_or_else(|| PassmanagerCommandError::internal("Credential metadata could not be read"))
}

fn labels(meta: &Value) -> Vec<String> {
    meta.get("tags")
        .map(normalize_credential_tags)
        .unwrap_or_default()
}

fn fallback_color(key: &str) -> String {
    // Same unsigned UTF-16 hash as the existing TypeScript catalog.
    let hash = key.encode_utf16().fold(0u32, |hash, unit| {
        hash.wrapping_mul(31).wrapping_add(u32::from(unit))
    });
    CREDENTIAL_TAG_COLOR_IDS[hash as usize % CREDENTIAL_TAG_COLOR_IDS.len()].to_owned()
}

fn collect(session: &VaultSession, storage: &Storage) -> Result<Catalog, PassmanagerCommandError> {
    let stored = load_tag_catalog_data(session, storage)?;
    let mut catalog = Catalog::new();
    for label in stored.tags {
        let key = credential_tag_key(&label);
        let color_id = stored
            .meta
            .get(&key)
            .map(|meta| meta.color_id.clone())
            .unwrap_or_else(|| fallback_color(&key));
        catalog.insert(
            key.clone(),
            CredentialTagSummary {
                key,
                label,
                color_id,
                count: 0,
            },
        );
    }
    for id in entry_ids(session) {
        for label in labels(&metadata(session, storage, id)?) {
            let key = credential_tag_key(&label);
            let row = catalog
                .entry(key.clone())
                .or_insert_with(|| CredentialTagSummary {
                    color_id: fallback_color(&key),
                    key,
                    label,
                    count: 0,
                });
            row.count = row
                .count
                .checked_add(1)
                .ok_or_else(|| PassmanagerCommandError::internal("Tag count exceeds capacity"))?;
        }
    }
    Ok(catalog)
}

pub(in crate::rpc::router::passmanager) fn read_page(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<PassmanagerTagPageResponse, PassmanagerCommandError> {
    let request: PassmanagerTagPageRequest = serde_json::from_value(data.clone())
        .map_err(|_| PassmanagerCommandError::empty_payload("Invalid tag page request"))?;
    if !(1..=100).contains(&request.limit) {
        return Err(PassmanagerCommandError::empty_payload(
            "Tag page limit is out of bounds",
        ));
    }
    let catalog = collect(session, storage)?;
    let end = u64::from(request.offset) + u64::from(request.limit);
    let next_offset = if end < catalog.len() as u64 {
        Some(
            u32::try_from(end)
                .map_err(|_| PassmanagerCommandError::internal("Tag catalog exceeds capacity"))?,
        )
    } else {
        None
    };
    Ok(PassmanagerTagPageResponse {
        tags: catalog
            .into_values()
            .skip(request.offset as usize)
            .take(request.limit as usize)
            .collect(),
        next_offset,
    })
}

fn stage_catalog(
    uow: &mut DomainUnitOfWork<'_>,
    catalog: &Catalog,
) -> Result<(), PassmanagerCommandError> {
    let tags = catalog
        .values()
        .map(|tag| tag.label.clone())
        .collect::<Vec<_>>();
    let meta = catalog
        .values()
        .map(|tag| {
            (
                tag.key.clone(),
                CredentialTagMetaValue::new(tag.color_id.clone()),
            )
        })
        .collect();
    stage_tag_catalog(uow, &tags, &meta)
}

fn replace_assignments(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    source: &str,
    replacement: Option<&str>,
) -> Result<(), PassmanagerCommandError> {
    for id in entry_ids(session) {
        let mut meta = metadata(session, storage, id)?;
        let old = labels(&meta);
        if !old.iter().any(|label| credential_tag_key(label) == source) {
            continue;
        }
        let tags: Vec<String> = old
            .into_iter()
            .filter_map(|label| {
                if credential_tag_key(&label) == source {
                    replacement.map(str::to_owned)
                } else {
                    Some(label)
                }
            })
            .collect();
        let object = meta.as_object_mut().ok_or_else(|| {
            PassmanagerCommandError::internal("Credential metadata is not an object")
        })?;
        if tags.is_empty() {
            object.remove("tags");
        } else {
            object.insert("tags".into(), json!(tags));
        }
        object.insert("updatedTs".into(), json!(now_unix_ms()));
        stage_entry_meta_json(uow, id, &meta)?;
    }
    Ok(())
}

pub(in crate::rpc::router::passmanager) fn save(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<CredentialTagSummary, PassmanagerCommandError> {
    let request: PassmanagerTagSaveRequest = serde_json::from_value(data.clone())
        .map_err(|_| PassmanagerCommandError::empty_payload("Invalid tag save request"))?;
    let label = normalize_credential_tag_catalog(&json!([request.label]))
        .into_iter()
        .next()
        .ok_or_else(|| {
            PassmanagerCommandError::empty_payload("Tag label must contain 1 to 32 characters")
        })?;
    if !CREDENTIAL_TAG_COLOR_IDS.contains(&request.color_id.as_str()) {
        return Err(PassmanagerCommandError::empty_payload("Invalid tag color"));
    }
    let key = credential_tag_key(&label);
    let source = request.source_key.as_deref().map(credential_tag_key);
    let mut catalog = collect(session, storage)?;
    let count = match source.as_ref() {
        Some(source) => {
            catalog
                .get(source)
                .ok_or_else(|| PassmanagerCommandError::node_not_found("Tag not found"))?
                .count
        }
        None => 0,
    };
    if catalog.contains_key(&key) && source.as_ref() != Some(&key) {
        return Err(PassmanagerCommandError::new(
            "Tag already exists",
            Some(ErrorCode::NameExist),
        ));
    }
    if let Some(source) = &source {
        // Color-only updates do not rewrite credential metadata or revisions.
        if catalog.get(source).is_some_and(|tag| tag.label != label) {
            replace_assignments(session, storage, uow, source, Some(&label))?;
        }
        catalog.remove(source);
    }
    let tag = CredentialTagSummary {
        key: key.clone(),
        label,
        color_id: request.color_id,
        count,
    };
    catalog.insert(key, tag.clone());
    stage_catalog(uow, &catalog)?;
    Ok(tag)
}

pub(in crate::rpc::router::passmanager) fn delete(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<(), PassmanagerCommandError> {
    let request: PassmanagerTagDeleteRequest = serde_json::from_value(data.clone())
        .map_err(|_| PassmanagerCommandError::empty_payload("Invalid tag delete request"))?;
    let key = credential_tag_key(&request.key);
    let mut catalog = collect(session, storage)?;
    if catalog.remove(&key).is_none() {
        return Err(PassmanagerCommandError::node_not_found("Tag not found"));
    }
    replace_assignments(session, storage, uow, &key, None)?;
    stage_catalog(uow, &catalog)
}

/// Resolve explicit identities before staging an entry mutation. Empty selection clears tags.
pub(in crate::rpc::router::passmanager) fn resolve_selected_keys(
    session: &VaultSession,
    storage: &Storage,
    keys: &[String],
) -> Result<Vec<String>, PassmanagerCommandError> {
    use super::super::entry::CREDENTIAL_TAG_MAX_PER_ENTRY;
    if keys.len() > CREDENTIAL_TAG_MAX_PER_ENTRY
        || keys.iter().collect::<std::collections::HashSet<_>>().len() != keys.len()
    {
        return Err(PassmanagerCommandError::empty_payload(
            "Invalid tag selection",
        ));
    }
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let catalog = collect(session, storage)?;
    keys.iter()
        .map(|key| {
            catalog
                .get(key)
                .map(|tag| tag.label.clone())
                .ok_or_else(|| {
                    PassmanagerCommandError::empty_payload("Selected tag is no longer available")
                })
        })
        .collect()
}
