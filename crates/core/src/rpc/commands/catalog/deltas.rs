//! Shared delta helpers for catalog commands with multi-node mutations.

use crate::catalog::{CatalogNode, DeltaEntry};
use crate::vault::VaultSession;

use super::super::guards::{normalize_path, parent_dir, shard_id_from_path, shard_relative_path};

pub(super) fn record_delete_delta(session: &mut VaultSession, full_path: &str, node_id: u64) {
    let path = normalize_path(full_path);
    if let Some(shard_id) = shard_id_from_path(&path) {
        if let Some(rel_path) = shard_relative_path(&shard_id, &path) {
            if rel_path != "/" {
                session.record_delta(
                    &shard_id,
                    DeltaEntry::delete(0, rel_path).with_node_id(node_id),
                );
            }
        }
    }
}

pub(super) fn record_create_delta_for_path(
    session: &mut VaultSession,
    full_path: &str,
    node: &CatalogNode,
) {
    let path = normalize_path(full_path);
    let parent = parent_dir(&path);
    if parent == "/" {
        return;
    }

    if let Some(shard_id) = shard_id_from_path(&path) {
        if let Some(rel_parent) = shard_relative_path(&shard_id, &parent) {
            session.record_delta(&shard_id, DeltaEntry::create(0, rel_parent, node.clone()));
        }
    }
}
