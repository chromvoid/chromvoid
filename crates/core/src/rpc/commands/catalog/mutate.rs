//! `catalog:delete` and `catalog:move` handlers + chunk-cleanup helpers.

use serde_json::Value;

use crate::error::ErrorCode;
use crate::rpc::request_parse::{required_str, required_u64};
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
    ) -> std::result::Result<(), RpcResponse> {
        for file_id in &self.file_node_ids {
            crate::rpc::derivative_index::delete_indexed_derivatives_for_node(
                storage, vault_key, *file_id,
            )
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
    let request = match parse_catalog_move_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    if is_system_node(session, request.node_id) || is_system_path_guarded(request.new_parent_path) {
        return system_shard_denied();
    }

    move_catalog_node(session, request.node_id, request.new_parent_path)
}

struct CatalogMoveRequest<'a> {
    node_id: u64,
    new_parent_path: &'a str,
}

fn parse_catalog_move_request(data: &Value) -> Result<CatalogMoveRequest<'_>, RpcResponse> {
    Ok(CatalogMoveRequest {
        node_id: required_u64(data, "node_id")?,
        new_parent_path: required_str(data, "new_parent_path")?,
    })
}

pub(in crate::rpc) fn move_catalog_node(
    session: &mut VaultSession,
    node_id: u64,
    new_parent_path: &str,
) -> RpcResponse {
    if is_system_node(session, node_id) || is_system_path_guarded(new_parent_path) {
        return system_shard_denied();
    }

    let old_path = session
        .catalog()
        .get_path(node_id)
        .map(|p| normalize_path(&p));
    let node_clone = session.catalog().find_by_id(node_id).cloned();

    match session.catalog_mut().move_node(node_id, new_parent_path) {
        Ok(()) => {
            let new_parent_norm = normalize_path(new_parent_path);

            if let (Some(old_path), Some(node_clone)) = (old_path, node_clone) {
                let old_shard = shard_id_from_path(&old_path);
                let new_shard = shard_id_from_path(&new_parent_norm);

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
                                        0, rel_path, rel_parent, None,
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

            RpcResponse::success(Value::Null)
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
            RpcResponse::error(e.to_string(), Some(code))
        }
    }
}
