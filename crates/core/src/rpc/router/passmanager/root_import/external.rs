//! Shared catalog naming for external credential formats.
use super::super::{entry, path};
use crate::{
    catalog::CatalogNode, error::ErrorCode, rpc::types::RpcResponse, storage::Storage,
    vault::VaultSession,
};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn safe_name(value: &str) -> String {
    let replaced = value.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "-");
    let name = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        "Untitled".into()
    } else {
        name
    }
}
pub(super) fn folder_path(value: &str) -> String {
    value
        .replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty())
        .map(safe_name)
        .collect::<Vec<_>>()
        .join("/")
}
#[derive(Clone)]
struct ExistingEntry {
    id: String,
    group: String,
}

fn reserve_paths(node: &CatalogNode, parent: &str, occupied: &mut BTreeSet<String>) {
    for child in node.children() {
        let path = format!("{parent}/{}", child.name);
        occupied.insert(path.clone());
        reserve_paths(child, &path, occupied);
    }
}

pub(super) fn resolve_entries(
    session: &VaultSession,
    storage: &Storage,
    normalized: &mut Value,
    preserve_existing: bool,
    legacy_ids: &BTreeMap<String, String>,
) -> Result<u32, RpcResponse> {
    let has_import_ids = normalized["entries"]
        .as_array()
        .expect("normalized entries")
        .iter()
        .any(|entry| entry.get("id").and_then(Value::as_str).is_some());
    let mut existing = BTreeMap::<String, ExistingEntry>::new();
    let mut legacy = BTreeMap::<String, ExistingEntry>::new();
    let mut occupied = BTreeSet::new();
    if preserve_existing {
        if let Some(root) = session.catalog().find_by_path("/.passmanager") {
            reserve_paths(root, "/.passmanager", &mut occupied);
            let mut nodes = Vec::new();
            if has_import_ids {
                entry::collect_entry_dir_ids_with_meta(root, &mut nodes);
            }
            for node in nodes {
                let metadata = entry::load_entry_meta_required(session, storage, node)
                    .map_err(|error| error.into_rpc_response())?;
                let id = metadata
                    .get("id")
                    .or_else(|| metadata.get("entry_id"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| node.to_string());
                let location = session.catalog().get_path(node).ok_or_else(|| {
                    RpcResponse::error(
                        "Cannot inspect existing credential location",
                        Some(ErrorCode::InternalError),
                    )
                })?;
                let group = path::group_path_from_entry_path(&location);
                let source = metadata
                    .get("import_source")
                    .or_else(|| metadata.get("importSource"));
                let original = source
                    .and_then(|source| {
                        source
                            .get("original_id")
                            .or_else(|| source.get("originalId"))
                    })
                    .and_then(Value::as_str)
                    .filter(|id| !id.is_empty());
                if source.is_some_and(|source| source.get("format").is_none()) {
                    if let Some(original) = original {
                        legacy.insert(
                            original.to_owned(),
                            ExistingEntry {
                                id: id.clone(),
                                group: group.clone(),
                            },
                        );
                    }
                }
                for key in std::iter::once(id.as_str()).chain(original) {
                    if existing.get(key).is_some_and(|old| old.id != id) {
                        return Err(RpcResponse::error(
                            "Existing credential import identifiers are ambiguous",
                            Some(ErrorCode::EmptyPayload),
                        ));
                    }
                    existing.insert(
                        key.to_owned(),
                        ExistingEntry {
                            id: id.clone(),
                            group: group.clone(),
                        },
                    );
                }
            }
        }
    }
    for folder in normalized["folders"]
        .as_array()
        .expect("normalized folders")
    {
        let mut parent = "/.passmanager".to_string();
        for part in folder
            .as_str()
            .expect("normalized folder")
            .split('/')
            .filter(|part| !part.is_empty())
        {
            parent.push('/');
            parent.push_str(part);
            occupied.insert(parent.clone());
        }
    }
    let mut legacy_claims = BTreeMap::<&str, usize>::new();
    for item in normalized["entries"]
        .as_array()
        .expect("normalized entries")
    {
        if let Some(id) = item
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !existing.contains_key(*id))
        {
            if let Some(alias) = legacy_ids.get(id) {
                *legacy_claims.entry(alias.as_str()).or_default() += 1;
            }
        }
    }
    let mut matched_targets = BTreeSet::new();
    let mut legacy_matches = 0;
    let mut suffixes = BTreeMap::<String, usize>::new();
    for item in normalized["entries"]
        .as_array_mut()
        .expect("normalized entries")
    {
        let original = item.get("id").and_then(Value::as_str);
        let mut found = original.and_then(|id| existing.get(id));
        if found.is_none() {
            if let Some(alias) = original.and_then(|id| legacy_ids.get(id)) {
                if let Some(candidate) = legacy.get(alias) {
                    if legacy_claims.get(alias.as_str()).copied().unwrap_or(0) != 1 {
                        return Err(RpcResponse::error("Imported sources share a legacy record identifier; export each source separately", Some(ErrorCode::EmptyPayload)));
                    }
                    found = Some(candidate);
                    legacy_matches += 1;
                }
            }
        }
        if let Some(found) = found {
            if !matched_targets.insert(found.id.as_str()) {
                return Err(RpcResponse::error(
                    "Multiple imported records match one existing credential",
                    Some(ErrorCode::EmptyPayload),
                ));
            }
            item["id"] = Value::String(found.id.clone());
            item["folderPath"] = Value::String(found.group.clone());
            continue;
        }
        let group = item["folderPath"]
            .as_str()
            .expect("normalized folder")
            .trim_matches('/');
        let parent = if group.is_empty() {
            "/.passmanager".into()
        } else {
            format!("/.passmanager/{group}")
        };
        let name = item["title"].as_str().expect("normalized title");
        let next = suffixes.entry(format!("{parent}/{name}")).or_insert(1);
        loop {
            let candidate = if *next == 1 {
                name.to_owned()
            } else {
                format!("{name} ({next})")
            };
            *next += 1;
            if occupied.insert(format!("{parent}/{candidate}")) {
                item["title"] = Value::String(candidate);
                break;
            }
        }
    }
    Ok(legacy_matches)
}
