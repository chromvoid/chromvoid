//! Resolves an external `entry_id` to its catalog node id.

use crate::vault::VaultSession;

use super::super::path::node_in_passmanager;
use super::io::{collect_entry_dir_ids_with_meta, read_entry_meta_json};

pub(in crate::rpc::router::passmanager) fn resolve_entry_node_id(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    entry_id: &str,
) -> Option<u64> {
    if let Ok(node_id) = entry_id.parse::<u64>() {
        if node_in_passmanager(session, node_id) {
            return Some(node_id);
        }
    }

    let pm_root = session.catalog().find_by_path("/.passmanager")?;
    let mut node_ids = Vec::<u64>::new();
    collect_entry_dir_ids_with_meta(pm_root, &mut node_ids);

    for node_id in node_ids {
        let Some(meta) = read_entry_meta_json(session, storage, node_id) else {
            continue;
        };
        let meta_id = meta
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| meta.get("entry_id").and_then(|v| v.as_str()));
        if meta_id == Some(entry_id) {
            return Some(node_id);
        }
    }

    None
}
