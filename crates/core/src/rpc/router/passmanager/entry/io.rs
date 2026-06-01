//! Entry I/O helpers — meta.json read/write + dir ID collection.

use crate::vault::VaultSession;

use super::super::super::domain_read::{read_blob_by_node, DomainReadScope};
use super::super::super::domain_uow::DomainUnitOfWork;
use super::super::error::PassmanagerCommandError;
use super::super::path::is_passmanager_path;

pub(in crate::rpc::router::passmanager) fn collect_entry_dir_ids_with_meta(
    node: &crate::catalog::CatalogNode,
    out: &mut Vec<u64>,
) {
    for child in node.children() {
        if !child.is_dir() {
            continue;
        }
        if child
            .find_child("meta.json")
            .filter(|n| n.is_file())
            .is_some()
        {
            out.push(child.node_id);
        }
        collect_entry_dir_ids_with_meta(child, out);
    }
}

pub(in crate::rpc::router::passmanager) fn read_entry_meta_json(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    entry_node_id: u64,
) -> Option<serde_json::Value> {
    let entry_node = session.catalog().find_by_id(entry_node_id)?;
    let meta_node = entry_node.find_child("meta.json")?;
    if !meta_node.is_file() {
        return None;
    }

    let bytes = read_blob_by_node(
        session,
        storage,
        DomainReadScope::Passmanager,
        meta_node.node_id,
    )
    .ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub(in crate::rpc::router::passmanager) fn stage_entry_meta_json(
    uow: &mut DomainUnitOfWork<'_>,
    entry_node_id: u64,
    meta: &serde_json::Value,
) -> Result<(), PassmanagerCommandError> {
    let entry_path = match uow.catalog().get_path(entry_node_id) {
        Some(path) if is_passmanager_path(&path) => path,
        _ => return Err(PassmanagerCommandError::access_denied("Access denied")),
    };

    let encoded = serde_json::to_vec(meta).map_err(|error| {
        PassmanagerCommandError::internal(format!("Failed to encode entry metadata: {error}"))
    })?;

    uow.stage_blob_write(&entry_path, "meta.json", &encoded, "application/json")
        .map(|_| ())
        .map_err(|error| {
            PassmanagerCommandError::from_domain_uow_error(error, "Failed to write entry metadata")
        })
}

pub(in crate::rpc::router::passmanager) fn load_entry_meta_required(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    entry_node_id: u64,
) -> Result<serde_json::Value, PassmanagerCommandError> {
    read_entry_meta_json(session, storage, entry_node_id)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry metadata not found"))
}

pub(in crate::rpc::router::passmanager) fn entry_meta_object_mut(
    meta: &mut serde_json::Value,
) -> Result<&mut serde_json::Map<String, serde_json::Value>, PassmanagerCommandError> {
    meta.as_object_mut()
        .ok_or_else(|| PassmanagerCommandError::internal("meta.json must be an object"))
}
