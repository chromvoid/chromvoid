//! Path utility functions and system shard guard logic

use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::types::RpcResponse;

pub(crate) fn normalize_path(path: &str) -> String {
    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() {
        return "/".to_string();
    }
    format!("/{}", parts.join("/"))
}

pub(crate) fn shard_id_from_path(path: &str) -> Option<String> {
    let p = normalize_path(path);
    p.split('/')
        .filter(|s| !s.is_empty())
        .next()
        .map(|s| s.to_string())
}

pub(crate) fn shard_relative_path(shard_id: &str, path: &str) -> Option<String> {
    let p = normalize_path(path);
    let parts: Vec<&str> = p.split('/').filter(|s| !s.is_empty()).collect();
    if parts.is_empty() {
        return Some("/".to_string());
    }
    if parts[0] != shard_id {
        return None;
    }
    if parts.len() == 1 {
        return Some("/".to_string());
    }
    Some(format!("/{}", parts[1..].join("/")))
}

pub(crate) fn parent_dir(path: &str) -> String {
    let p = normalize_path(path);
    if p == "/" {
        return "/".to_string();
    }
    let parts: Vec<&str> = p.split('/').filter(|s| !s.is_empty()).collect();
    if parts.len() <= 1 {
        return "/".to_string();
    }
    format!("/{}", parts[..parts.len() - 1].join("/"))
}

thread_local! {
    static BYPASS_SYSTEM_SHARD_GUARDS: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

#[cfg(debug_assertions)]
pub fn set_bypass_system_shard_guards(bypass: bool) {
    BYPASS_SYSTEM_SHARD_GUARDS.with(|c| c.set(if bypass { 1 } else { 0 }));
}

pub(crate) fn with_system_shard_guard_bypass<T>(f: impl FnOnce() -> T) -> T {
    struct Guard;
    impl Drop for Guard {
        fn drop(&mut self) {
            BYPASS_SYSTEM_SHARD_GUARDS.with(|c| {
                let cur = c.get();
                if cur > 0 {
                    c.set(cur - 1);
                }
            });
        }
    }

    BYPASS_SYSTEM_SHARD_GUARDS.with(|c| c.set(c.get().saturating_add(1)));
    let _guard = Guard;
    f()
}

pub(crate) fn is_system_node(session: &VaultSession, node_id: u64) -> bool {
    if BYPASS_SYSTEM_SHARD_GUARDS.with(|c| c.get() > 0) {
        return false;
    }
    if let Some(path) = session.catalog().get_path(node_id) {
        crate::catalog::is_system_path(&path)
    } else {
        false
    }
}

pub(crate) fn is_system_path_guarded(path: &str) -> bool {
    if BYPASS_SYSTEM_SHARD_GUARDS.with(|c| c.get() > 0) {
        return false;
    }
    crate::catalog::is_system_path(path)
}

/// ADR-028: check whether a shard_id is a system shard, respecting the test bypass.
pub(crate) fn is_system_shard_id_guarded(shard_id: &str) -> bool {
    if BYPASS_SYSTEM_SHARD_GUARDS.with(|c| c.get() > 0) {
        return false;
    }
    crate::catalog::is_system_shard_id(shard_id)
}

pub(crate) fn system_shard_denied() -> RpcResponse {
    RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied))
}
