//! Path utilities and guard functions for PassManager (ADR-028).

use super::super::super::commands::with_system_shard_guard_bypass;
use super::super::super::types::RpcResponse;
use crate::error::ErrorCode;
use crate::vault::VaultSession;
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) fn normalize_path_for_pm(path: &str) -> String {
    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() {
        return "/".to_string();
    }
    format!("/{}", parts.join("/"))
}

pub(super) fn is_passmanager_path(path: &str) -> bool {
    let p = normalize_path_for_pm(path);
    p == "/.passmanager" || p.starts_with("/.passmanager/")
}

pub(super) fn map_to_passmanager_path(path_opt: Option<&str>) -> Option<String> {
    let p = normalize_path_for_pm(path_opt.unwrap_or("/"));
    if p == "/" {
        return Some("/.passmanager".to_string());
    }
    if is_passmanager_path(&p) {
        return Some(p);
    }
    None
}

pub(super) fn map_entry_group_path_to_passmanager_path(path_opt: Option<&str>) -> Option<String> {
    let raw = path_opt.unwrap_or("/").trim();
    if raw.is_empty() || raw == "/" {
        return Some("/.passmanager".to_string());
    }

    if let Some(pm) = map_to_passmanager_path(Some(raw)) {
        return Some(pm);
    }

    let normalized = normalize_path_for_pm(raw);
    let relative = normalized.trim_start_matches('/');
    if relative.is_empty() {
        Some("/.passmanager".to_string())
    } else {
        Some(format!("/.passmanager/{relative}"))
    }
}

pub(super) fn is_valid_catalog_name(name: &str) -> bool {
    !name.is_empty() && !name.contains('/') && !name.contains('\0') && name != "." && name != ".."
}

pub(super) fn validate_passmanager_group_path(pm_path: &str) -> bool {
    if pm_path == "/.passmanager" {
        return true;
    }
    let rel = pm_path.trim_start_matches("/.passmanager/");
    rel.split('/')
        .filter(|segment| !segment.is_empty())
        .all(is_valid_catalog_name)
}

pub(super) fn node_in_passmanager(session: &VaultSession, node_id: u64) -> bool {
    session
        .catalog()
        .get_path(node_id)
        .map(|p| is_passmanager_path(&p))
        .unwrap_or(false)
}

pub(super) fn ensure_passmanager_root_exists(
    session: &mut VaultSession,
) -> Result<(), RpcResponse> {
    if session.catalog().find_by_path("/.passmanager").is_some() {
        return Ok(());
    }

    let created =
        with_system_shard_guard_bypass(|| session.catalog_mut().create_dir("/", ".passmanager"));

    match created {
        Ok(_) => Ok(()),
        Err(crate::error::Error::NameExists(_)) => Ok(()),
        Err(e) => Err(RpcResponse::error(
            e.to_string(),
            Some(ErrorCode::InternalError),
        )),
    }
}

/// Verify that a given node_id belongs to the passmanager shard.
pub(super) fn check_pm_access(session: &VaultSession, node_id: u64) -> Result<(), RpcResponse> {
    if !node_in_passmanager(session, node_id) {
        return Err(RpcResponse::error(
            "Access denied",
            Some(ErrorCode::AccessDenied),
        ));
    }
    Ok(())
}

pub(super) fn entry_id_from_data(data: &serde_json::Value) -> Option<String> {
    data.get("entry_id")
        .and_then(|v| v.as_str())
        .or_else(|| data.get("id").and_then(|v| v.as_str()))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

pub(super) fn group_path_from_entry_path(path: &str) -> String {
    let normalized = normalize_path_for_pm(path);
    let group = normalized
        .strip_prefix("/.passmanager")
        .unwrap_or("")
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    if group.is_empty() {
        "/".to_string()
    } else {
        group.to_string()
    }
}

pub(super) fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
