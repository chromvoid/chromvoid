//! System shard registry (ADR-028).
//!
//! Centralized source of truth for system shard identification.
//! System shards (`.passmanager`, `.wallet`) must not be exposed through
//! external generic `catalog:*` surfaces.
//!
//! MVP list: `.passmanager`, `.wallet`.
//! Future naming convention: `.cv-*` (policy only, not enforced here).

const SYSTEM_SHARD_IDS: &[&str] = &[".passmanager", ".wallet"];

/// Check whether `shard_id` is a system (protected) shard.
///
/// ```
/// use chromvoid_core::catalog::system_shard::is_system_shard_id;
/// assert!(is_system_shard_id(".passmanager"));
/// assert!(is_system_shard_id(".wallet"));
/// assert!(!is_system_shard_id("documents"));
/// ```
pub fn is_system_shard_id(shard_id: &str) -> bool {
    SYSTEM_SHARD_IDS.contains(&shard_id)
}

/// Extract the shard id (first path component) from a catalog path.
///
/// Returns `None` for root `/` or empty input. Handles double slashes.
///
/// ```
/// use chromvoid_core::catalog::system_shard::shard_id_from_path;
/// assert_eq!(shard_id_from_path("/.passmanager/group/entry"), Some(".passmanager".to_string()));
/// assert_eq!(shard_id_from_path("/docs"), Some("docs".to_string()));
/// assert_eq!(shard_id_from_path("/"), None);
/// ```
pub fn shard_id_from_path(path: &str) -> Option<String> {
    path.split('/')
        .filter(|s| !s.is_empty())
        .next()
        .map(|s| s.to_string())
}

/// Check whether `path` targets a node inside (or at the root of) a system shard.
///
/// ```
/// use chromvoid_core::catalog::system_shard::is_system_path;
/// assert!(is_system_path("/.passmanager"));
/// assert!(is_system_path("/.wallet"));
/// assert!(!is_system_path("/docs"));
/// assert!(!is_system_path("/"));
/// ```
pub fn is_system_path(path: &str) -> bool {
    match shard_id_from_path(path) {
        Some(id) => is_system_shard_id(&id),
        None => false,
    }
}

#[cfg(test)]
#[path = "system_shard_tests.rs"]
mod tests;
