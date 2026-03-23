//! Group meta structures and handler free functions for PassManager.

use super::super::super::commands::{handle_catalog_create_dir, with_system_shard_guard_bypass};
use super::super::super::types::RpcResponse;
use super::entry::{collect_entry_dir_ids_with_meta, read_entry_meta_json};
use super::icon::{
    is_valid_icon_ref, load_icon_index, parse_icon_ref_sha, passmanager_icons_disabled_response,
    read_file_bytes_by_path, write_file_bytes_at_path, PASSMANAGER_ICONS_ENABLED,
};
use super::path::{
    ensure_passmanager_root_exists, map_entry_group_path_to_passmanager_path,
    validate_passmanager_group_path,
};
use crate::error::ErrorCode;
use crate::vault::VaultSession;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

pub(super) const PASSMANAGER_GROUP_META_PATH: &str = "/.passmanager/.groups-meta.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(super) struct GroupMetaRecord {
    pub(super) path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) icon_ref: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(super) struct GroupMetaFile {
    #[serde(default)]
    pub(super) groups: Vec<GroupMetaRecord>,
}

pub(super) fn normalize_group_meta_path(path: &str) -> Option<String> {
    let pm_path = map_entry_group_path_to_passmanager_path(Some(path))?;
    if !validate_passmanager_group_path(&pm_path) {
        return None;
    }

    if pm_path == "/.passmanager" {
        return Some("/".to_string());
    }

    let rel = pm_path.trim_start_matches("/.passmanager/");
    if rel.is_empty() {
        Some("/".to_string())
    } else {
        Some(format!("/{rel}"))
    }
}

pub(super) fn load_group_meta_map(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<BTreeMap<String, String>, RpcResponse> {
    let Some(bytes) = read_file_bytes_by_path(session, storage, PASSMANAGER_GROUP_META_PATH)?
    else {
        return Ok(BTreeMap::new());
    };

    let parsed = serde_json::from_slice::<GroupMetaFile>(&bytes).map_err(|e| {
        RpcResponse::error(
            format!("Failed to parse group meta index: {e}"),
            Some(ErrorCode::InternalError),
        )
    })?;

    let mut map = BTreeMap::new();
    for item in parsed.groups {
        let Some(path) = normalize_group_meta_path(&item.path) else {
            continue;
        };
        let Some(icon_ref) = item.icon_ref else {
            continue;
        };
        if is_valid_icon_ref(&icon_ref) {
            map.insert(path, icon_ref);
        }
    }

    Ok(map)
}

pub(super) fn save_group_meta_map(
    session: &mut VaultSession,
    storage: &crate::storage::Storage,
    map: &BTreeMap<String, String>,
) -> RpcResponse {
    let payload = GroupMetaFile {
        groups: map
            .iter()
            .map(|(path, icon_ref)| GroupMetaRecord {
                path: path.clone(),
                icon_ref: Some(icon_ref.clone()),
            })
            .collect(),
    };

    let bytes = match serde_json::to_vec(&payload) {
        Ok(v) => v,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to serialize group meta index: {e}"),
                Some(ErrorCode::InternalError),
            )
        }
    };

    write_file_bytes_at_path(
        session,
        storage,
        "/.passmanager",
        ".groups-meta.json",
        &bytes,
        "application/json",
    )
}

fn collect_group_paths(node: &crate::catalog::CatalogNode, parent: &str, out: &mut Vec<String>) {
    for child in node.children() {
        if !child.is_dir() {
            continue;
        }
        // Skip system directories (e.g. .icons) — they are not user groups.
        if child.name.starts_with('.') {
            continue;
        }
        if child
            .find_child("meta.json")
            .filter(|n| n.is_file())
            .is_some()
        {
            continue;
        }
        let rel = if parent.is_empty() {
            child.name.clone()
        } else {
            format!("{parent}/{}", child.name)
        };
        out.push(format!("/{rel}"));
        collect_group_paths(child, &rel, out);
    }
}

pub(super) fn collect_reachable_entry_icon_refs(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> HashSet<String> {
    let mut reachable = HashSet::new();
    let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
        return reachable;
    };

    let mut node_ids = Vec::<u64>::new();
    collect_entry_dir_ids_with_meta(pm_root, &mut node_ids);

    for node_id in node_ids {
        let Some(meta) = read_entry_meta_json(session, storage, node_id) else {
            continue;
        };
        let icon_ref = meta
            .get("iconRef")
            .and_then(|v| v.as_str())
            .or_else(|| meta.get("icon_ref").and_then(|v| v.as_str()));
        if let Some(icon_ref) = icon_ref {
            if is_valid_icon_ref(icon_ref) {
                reachable.insert(icon_ref.to_string());
            }
        }
    }

    reachable
}

pub(super) fn handle_ensure(s: &mut VaultSession, data: &serde_json::Value) -> RpcResponse {
    if let Err(resp) = ensure_passmanager_root_exists(s) {
        return resp;
    }
    let path = match data.get("path").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => return RpcResponse::error("path is required", Some(ErrorCode::EmptyPayload)),
    };
    let Some(pm_path) = map_entry_group_path_to_passmanager_path(Some(path)) else {
        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
    };

    if pm_path == "/.passmanager" {
        return RpcResponse::success(serde_json::Value::Null);
    }

    let rel = pm_path.trim_start_matches("/.passmanager/");
    let mut parent = "/.passmanager".to_string();
    for segment in rel.split('/').filter(|s| !s.is_empty()) {
        let current = format!("{parent}/{segment}");
        if s.catalog().find_by_path(&current).is_none() {
            let created = with_system_shard_guard_bypass(|| {
                handle_catalog_create_dir(
                    s,
                    &serde_json::json!({
                        "name": segment,
                        "parent_path": parent,
                    }),
                )
            });
            if !created.is_ok() {
                return created;
            }
        }
        parent = current;
    }

    RpcResponse::success(serde_json::Value::Null)
}

pub(super) fn handle_list(s: &VaultSession, _data: &serde_json::Value) -> RpcResponse {
    let Some(pm_root) = s.catalog().find_by_path("/.passmanager") else {
        return RpcResponse::success(serde_json::json!({"groups": Vec::<String>::new()}));
    };

    let mut groups = Vec::<String>::new();
    collect_group_paths(pm_root, "", &mut groups);
    groups.sort();
    groups.dedup();

    RpcResponse::success(serde_json::json!({"groups": groups}))
}

pub(super) fn handle_set_meta(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    let path = match data.get("path").and_then(|v| v.as_str()) {
        Some(v) if !v.trim().is_empty() => v.trim(),
        _ => return RpcResponse::error("path is required", Some(ErrorCode::EmptyPayload)),
    };
    let Some(normalized_path) = normalize_group_meta_path(path) else {
        return RpcResponse::error("invalid group path", Some(ErrorCode::InvalidPath));
    };

    let has_icon_ref_field = data.get("icon_ref").is_some() || data.get("iconRef").is_some();
    if !has_icon_ref_field {
        return RpcResponse::error("icon_ref is required", Some(ErrorCode::EmptyPayload));
    }

    let icon_ref_opt = if let Some(value) = data.get("icon_ref").or_else(|| data.get("iconRef")) {
        if value.is_null() {
            None
        } else {
            let Some(icon_ref) = value.as_str().map(str::trim).filter(|v| !v.is_empty()) else {
                return RpcResponse::error(
                    "icon_ref must be string or null",
                    Some(ErrorCode::EmptyPayload),
                );
            };
            if !is_valid_icon_ref(icon_ref) {
                return RpcResponse::error(
                    "invalid icon_ref format",
                    Some(ErrorCode::EmptyPayload),
                );
            }
            Some(icon_ref.to_string())
        }
    } else {
        None
    };

    if let Err(resp) = ensure_passmanager_root_exists(s) {
        return resp;
    }

    if let Some(icon_ref) = icon_ref_opt.as_deref() {
        let Some(sha) = parse_icon_ref_sha(icon_ref) else {
            return RpcResponse::error("invalid icon_ref format", Some(ErrorCode::EmptyPayload));
        };
        let index = match load_icon_index(s, storage) {
            Ok(index) => index,
            Err(resp) => return resp,
        };
        if !index.icons.iter().any(|item| item.sha256 == sha) {
            return RpcResponse::error("icon_not_found", Some(ErrorCode::NodeNotFound));
        }
    }

    let mut group_meta = match load_group_meta_map(s, storage) {
        Ok(map) => map,
        Err(resp) => return resp,
    };

    if let Some(icon_ref) = icon_ref_opt {
        group_meta.insert(normalized_path, icon_ref);
    } else {
        group_meta.remove(&normalized_path);
    }

    let saved = save_group_meta_map(s, storage, &group_meta);
    if !saved.is_ok() {
        return saved;
    }

    RpcResponse::success(serde_json::Value::Null)
}
