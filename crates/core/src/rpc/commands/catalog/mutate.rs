//! `catalog:delete` and `catalog:move` handlers + chunk-cleanup helpers.

use serde_json::Value;

use crate::error::ErrorCode;
use crate::rpc::derivative_index::DerivativeIndexState;
use crate::rpc::request_parse::{optional_bool, optional_str, required_str, required_u64};
use crate::vault::VaultSession;

use super::super::super::types::RpcResponse;
use super::super::guards::{
    is_system_node, is_system_path_guarded, normalize_path, shard_id_from_path,
    shard_relative_path, system_shard_denied,
};
use super::derivative::derivative_index_error;

#[derive(Debug, Clone, Default)]
pub(in crate::rpc) struct CatalogDeleteCleanup {
    file_node_ids: Vec<u64>,
}

impl CatalogDeleteCleanup {
    pub(in crate::rpc) fn cleanup_derivatives(
        &self,
        storage: &crate::storage::Storage,
        vault_key: &[u8; crate::types::KEY_SIZE],
        derivative_index_state: &DerivativeIndexState,
    ) -> std::result::Result<(), RpcResponse> {
        for file_id in &self.file_node_ids {
            derivative_index_state
                .delete_indexed_derivatives_for_node(storage, vault_key, *file_id)
                .map_err(derivative_index_error)?;
        }
        Ok(())
    }
}

fn collect_file_node_ids(node: &crate::catalog::CatalogNode, out: &mut Vec<u64>) {
    if node.is_file() {
        out.push(node.node_id);
        return;
    }

    for child in node.children() {
        collect_file_node_ids(child, out);
    }
}

/// Handle catalog:delete command
pub fn handle_catalog_delete(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let (response, _) = handle_catalog_delete_with_cleanup(session, data);
    response
}

pub(in crate::rpc) fn handle_catalog_delete_with_cleanup(
    session: &mut VaultSession,
    data: &Value,
) -> (RpcResponse, CatalogDeleteCleanup) {
    let request = match parse_catalog_delete_request(data) {
        Ok(request) => request,
        Err(response) => return (response, CatalogDeleteCleanup::default()),
    };

    delete_catalog_node(session, request.node_id)
}

struct CatalogDeleteRequest {
    node_id: u64,
}

fn parse_catalog_delete_request(data: &Value) -> Result<CatalogDeleteRequest, RpcResponse> {
    Ok(CatalogDeleteRequest {
        node_id: required_u64(data, "node_id")?,
    })
}

pub(in crate::rpc) fn delete_catalog_node(
    session: &mut VaultSession,
    node_id: u64,
) -> (RpcResponse, CatalogDeleteCleanup) {
    if is_system_node(session, node_id) {
        return (system_shard_denied(), CatalogDeleteCleanup::default());
    }

    let mut file_node_ids: Vec<u64> = Vec::new();
    if let Some(node) = session.catalog().find_by_id(node_id) {
        collect_file_node_ids(node, &mut file_node_ids);
    }

    let old_path = session
        .catalog()
        .get_path(node_id)
        .map(|p| normalize_path(&p));

    match session.catalog_mut().delete(node_id) {
        Ok(()) => {
            if let Some(old_path) = old_path {
                if let Some(shard_id) = shard_id_from_path(&old_path) {
                    if let Some(rel_path) = shard_relative_path(&shard_id, &old_path) {
                        // Deleting a shard root is a RootIndex-level change. Skip per-shard deltas.
                        if rel_path != "/" {
                            session.record_delta(
                                &shard_id,
                                crate::catalog::DeltaEntry::delete(0, rel_path)
                                    .with_node_id(node_id),
                            );
                        }
                    }
                }
            }

            for file_id in &file_node_ids {
                session.invalidate_decrypted_chunk_cache_for_node(*file_id);
            }
            (
                RpcResponse::success(Value::Null),
                CatalogDeleteCleanup { file_node_ids },
            )
        }
        Err(e) => {
            match &e {
                // ADR-004: delete is idempotent.
                crate::error::Error::NodeNotFound(_) => {
                    session.invalidate_decrypted_chunk_cache_for_node(node_id);
                    (
                        RpcResponse::success(Value::Null),
                        CatalogDeleteCleanup::default(),
                    )
                }
                crate::error::Error::CannotModifyRoot => (
                    RpcResponse::error(e.to_string(), Some(ErrorCode::NodeNotFound)),
                    CatalogDeleteCleanup::default(),
                ),
                _ => (
                    RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
                    CatalogDeleteCleanup::default(),
                ),
            }
        }
    }
}

/// Handle catalog:move command
pub fn handle_catalog_move(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let (response, _) = handle_catalog_move_with_cleanup(session, data);
    response
}

pub(in crate::rpc) fn handle_catalog_move_with_cleanup(
    session: &mut VaultSession,
    data: &Value,
) -> (RpcResponse, CatalogDeleteCleanup) {
    let request = match parse_catalog_move_request(data) {
        Ok(request) => request,
        Err(response) => return (response, CatalogDeleteCleanup::default()),
    };

    if is_system_node(session, request.node_id) || is_system_path_guarded(request.new_parent_path) {
        return (system_shard_denied(), CatalogDeleteCleanup::default());
    }

    move_catalog_node_inner(
        session,
        request.node_id,
        request.new_parent_path,
        request.new_name,
        request.replace_existing,
    )
}

struct CatalogMoveRequest<'a> {
    node_id: u64,
    new_parent_path: &'a str,
    new_name: Option<&'a str>,
    replace_existing: bool,
}

fn parse_catalog_move_request(data: &Value) -> Result<CatalogMoveRequest<'_>, RpcResponse> {
    Ok(CatalogMoveRequest {
        node_id: required_u64(data, "node_id")?,
        new_parent_path: required_str(data, "new_parent_path")?,
        new_name: optional_str(data, "new_name"),
        replace_existing: optional_bool(data, "replace_existing").unwrap_or(false),
    })
}

fn move_catalog_node_inner(
    session: &mut VaultSession,
    node_id: u64,
    new_parent_path: &str,
    new_name: Option<&str>,
    replace_existing: bool,
) -> (RpcResponse, CatalogDeleteCleanup) {
    if is_system_node(session, node_id) || is_system_path_guarded(new_parent_path) {
        return (system_shard_denied(), CatalogDeleteCleanup::default());
    }

    let old_path = session
        .catalog()
        .get_path(node_id)
        .map(|p| normalize_path(&p));
    let current_name = session
        .catalog()
        .find_by_id(node_id)
        .map(|node| node.name.clone());
    let destination_name = new_name.map(str::to_string).or(current_name);
    let destination_path = destination_name
        .as_deref()
        .map(|name| join_catalog_path(new_parent_path, name));
    let replaced_node = if replace_existing {
        destination_path.as_deref().and_then(|path| {
            session
                .catalog()
                .find_by_path(path)
                .filter(|node| node.node_id != node_id)
                .cloned()
        })
    } else {
        None
    };
    let replaced_path = replaced_node
        .as_ref()
        .and_then(|node| session.catalog().get_path(node.node_id))
        .map(|path| normalize_path(&path));
    let mut replaced_file_node_ids = Vec::new();
    if let Some(node) = replaced_node.as_ref() {
        collect_file_node_ids(node, &mut replaced_file_node_ids);
    }

    match session.catalog_mut().move_node_with_options(
        node_id,
        new_parent_path,
        new_name,
        replace_existing,
    ) {
        Ok(()) => {
            let new_parent_norm = normalize_path(new_parent_path);
            if let (Some(replaced_node), Some(replaced_path)) =
                (replaced_node.as_ref(), replaced_path.as_ref())
            {
                if let Some(shard_id) = shard_id_from_path(replaced_path) {
                    if let Some(rel_path) = shard_relative_path(&shard_id, replaced_path) {
                        if rel_path != "/" {
                            session.record_delta(
                                &shard_id,
                                crate::catalog::DeltaEntry::delete(0, rel_path)
                                    .with_node_id(replaced_node.node_id),
                            );
                        }
                    }
                }
            }

            let node_clone = session.catalog().find_by_id(node_id).cloned();
            if let (Some(old_path), Some(node_clone)) = (old_path, node_clone) {
                let old_shard = shard_id_from_path(&old_path);
                let new_shard = shard_id_from_path(&new_parent_norm);
                let delta_new_name = new_name.map(str::to_string);

                match (old_shard, new_shard) {
                    (Some(old_shard), Some(new_shard)) if old_shard == new_shard => {
                        if let (Some(rel_path), Some(rel_parent)) = (
                            shard_relative_path(&old_shard, &old_path),
                            shard_relative_path(&old_shard, &new_parent_norm),
                        ) {
                            if rel_path != "/" {
                                session.record_delta(
                                    &old_shard,
                                    crate::catalog::DeltaEntry::move_node(
                                        0,
                                        rel_path,
                                        rel_parent,
                                        delta_new_name.clone(),
                                    )
                                    .with_node_id(node_id),
                                );
                            }
                        }
                    }
                    (Some(old_shard), Some(new_shard)) => {
                        // Cross-shard move: encode as delete+create.
                        if let (Some(rel_old), Some(rel_new_parent)) = (
                            shard_relative_path(&old_shard, &old_path),
                            shard_relative_path(&new_shard, &new_parent_norm),
                        ) {
                            if rel_old != "/" {
                                session.record_delta(
                                    &old_shard,
                                    crate::catalog::DeltaEntry::delete(0, rel_old)
                                        .with_node_id(node_id),
                                );
                            }
                            session.record_delta(
                                &new_shard,
                                crate::catalog::DeltaEntry::create(0, rel_new_parent, node_clone),
                            );
                        }
                    }
                    (Some(old_shard), None) => {
                        if let Some(rel_old) = shard_relative_path(&old_shard, &old_path) {
                            if rel_old != "/" {
                                session.record_delta(
                                    &old_shard,
                                    crate::catalog::DeltaEntry::delete(0, rel_old)
                                        .with_node_id(node_id),
                                );
                            }
                        }
                    }
                    (None, Some(new_shard)) => {
                        if let Some(rel_new_parent) =
                            shard_relative_path(&new_shard, &new_parent_norm)
                        {
                            session.record_delta(
                                &new_shard,
                                crate::catalog::DeltaEntry::create(0, rel_new_parent, node_clone),
                            );
                        }
                    }
                    (None, None) => {}
                }
            }

            for file_id in &replaced_file_node_ids {
                session.invalidate_decrypted_chunk_cache_for_node(*file_id);
            }
            (
                RpcResponse::success(Value::Null),
                CatalogDeleteCleanup {
                    file_node_ids: replaced_file_node_ids,
                },
            )
        }
        Err(e) => {
            let code = match &e {
                crate::error::Error::NodeNotFound(_) => ErrorCode::NodeNotFound,
                crate::error::Error::NameExists(_) => ErrorCode::NameExist,
                crate::error::Error::InvalidName(_) => ErrorCode::EmptyPayload,
                crate::error::Error::InvalidPath(_) => ErrorCode::NodeNotFound,
                crate::error::Error::NotADirectory(_) => ErrorCode::NotADir,
                crate::error::Error::CannotModifyRoot => ErrorCode::NodeNotFound,
                _ => ErrorCode::InternalError,
            };
            (
                RpcResponse::error(e.to_string(), Some(code)),
                CatalogDeleteCleanup::default(),
            )
        }
    }
}

fn join_catalog_path(parent_path: &str, name: &str) -> String {
    let parent = normalize_path(parent_path);
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{parent}/{name}")
    }
}
