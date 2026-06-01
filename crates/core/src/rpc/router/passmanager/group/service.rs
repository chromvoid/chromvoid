use std::collections::HashSet;

use super::super::entry::{collect_entry_dir_ids_with_meta, read_entry_meta_json};
use super::super::error::PassmanagerCommandError;
use super::super::icon::{is_valid_icon_ref, load_icon_index, parse_icon_ref_sha};
use super::super::path::{
    map_entry_group_path_to_passmanager_path, validate_passmanager_group_path,
};
use super::meta_store::{
    load_group_meta_map_typed, normalize_group_meta_path, stage_group_meta_map,
};
use super::request::{GroupPathRequest, GroupSetMetaRequest};
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn ensure_group(
    uow: &mut DomainUnitOfWork<'_>,
    request: GroupPathRequest,
) -> Result<(), PassmanagerCommandError> {
    let Some(pm_path) = map_entry_group_path_to_passmanager_path(Some(&request.path)) else {
        return Err(PassmanagerCommandError::access_denied("Access denied"));
    };

    if pm_path == "/.passmanager" {
        return Ok(());
    }

    if !validate_passmanager_group_path(&pm_path) {
        return Err(PassmanagerCommandError::invalid_path("invalid group path"));
    }

    uow.ensure_dir(&pm_path).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure group")
    })
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

pub(in crate::rpc::router::passmanager) fn list_group_paths(session: &VaultSession) -> Vec<String> {
    let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
        return Vec::new();
    };

    let mut groups = Vec::<String>::new();
    collect_group_paths(pm_root, "", &mut groups);
    groups.sort();
    groups.dedup();
    groups
}

pub(super) fn delete_group(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: GroupPathRequest,
) -> Result<(), PassmanagerCommandError> {
    uow.ensure_dir("/.passmanager").map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure PassManager root")
    })?;

    let Some(normalized_path) = normalize_group_meta_path(&request.path) else {
        return Err(PassmanagerCommandError::invalid_path("invalid group path"));
    };

    if normalized_path == "/" {
        return Err(PassmanagerCommandError::access_denied(
            "cannot delete passmanager root",
        ));
    }

    let Some(pm_path) = map_entry_group_path_to_passmanager_path(Some(&request.path)) else {
        return Err(PassmanagerCommandError::access_denied("Access denied"));
    };

    if !validate_passmanager_group_path(&pm_path) {
        return Err(PassmanagerCommandError::invalid_path("invalid group path"));
    }

    if let Some(node_id) = session
        .catalog()
        .find_by_path(&pm_path)
        .map(|node| node.node_id)
    {
        uow.stage_delete_node(node_id).map_err(|error| {
            PassmanagerCommandError::from_domain_uow_error(error, "Failed to delete group")
        })?;
    }

    let prefix = format!("{normalized_path}/");
    let mut group_meta = load_group_meta_map_typed(session, storage)?;
    group_meta.retain(|key, _| key != &normalized_path && !key.starts_with(&prefix));

    stage_group_meta_map(uow, &group_meta)
}

pub(super) fn set_group_meta(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: GroupSetMetaRequest,
) -> Result<(), PassmanagerCommandError> {
    let Some(normalized_path) = normalize_group_meta_path(&request.path) else {
        return Err(PassmanagerCommandError::invalid_path("invalid group path"));
    };

    uow.ensure_dir("/.passmanager").map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure PassManager root")
    })?;

    if let Some(Some(icon_ref)) = request.icon_ref_update.as_ref() {
        let Some(sha) = parse_icon_ref_sha(icon_ref) else {
            return Err(PassmanagerCommandError::empty_payload(
                "invalid icon_ref format",
            ));
        };
        let index = load_icon_index(session, storage)?;
        if !index.icons.iter().any(|item| item.sha256 == sha) {
            return Err(PassmanagerCommandError::node_not_found("icon_not_found"));
        }
    }

    let mut group_meta = load_group_meta_map_typed(session, storage)?;

    let mut next_meta = group_meta
        .get(&normalized_path)
        .cloned()
        .unwrap_or_default();
    if let Some(icon_ref) = request.icon_ref_update {
        next_meta.icon_ref = icon_ref;
    }
    if let Some(description) = request.description_update {
        next_meta.description = description;
    }

    if next_meta.icon_ref.is_none() && next_meta.description.is_none() {
        group_meta.remove(&normalized_path);
    } else {
        group_meta.insert(normalized_path, next_meta);
    }

    stage_group_meta_map(uow, &group_meta)
}

pub(in crate::rpc::router::passmanager) fn collect_reachable_entry_icon_refs(
    session: &VaultSession,
    storage: &Storage,
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
