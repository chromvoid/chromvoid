//! Catalog CRUD command handlers

use serde_json::Value;

use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::types::{
    CatalogListItem, CatalogListResponse, NodeCreatedResponse, RpcResponse, SyncInitResponse,
};
use super::guards::{
    is_system_node, is_system_path_guarded, normalize_path, parent_dir, shard_id_from_path,
    shard_relative_path, system_shard_denied,
};

/// Handle catalog:list command
pub fn handle_catalog_list(session: &VaultSession, data: &Value) -> RpcResponse {
    let path = data.get("path").and_then(|v| v.as_str()).unwrap_or("/");

    // ADR-028: deny listing inside system shards via generic catalog commands.
    if is_system_path_guarded(path) {
        return system_shard_denied();
    }

    match session.catalog().list(path) {
        Ok(nodes) => {
            let nodes = if path == "/" {
                nodes
                    .into_iter()
                    .filter(|n| !crate::catalog::is_system_shard_id(&n.name))
                    .collect::<Vec<_>>()
            } else {
                nodes
            };

            let items: Vec<CatalogListItem> = nodes
                .iter()
                .map(|node| CatalogListItem {
                    node_id: node.node_id,
                    name: node.name.clone(),
                    is_dir: node.is_dir(),
                    size: if node.is_file() {
                        Some(node.size)
                    } else {
                        None
                    },
                    mime_type: node.mime_type.clone(),
                    created_at: node.birthtime,
                    updated_at: node.modtime,
                })
                .collect();

            let response = CatalogListResponse {
                current_path: path.to_string(),
                items,
            };

            RpcResponse::success(response)
        }
        Err(e) => RpcResponse::error(e.to_string(), Some(ErrorCode::NodeNotFound)),
    }
}

/// Handle catalog:createDir command
pub fn handle_catalog_create_dir(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let name = match data.get("name").and_then(|v| v.as_str()) {
        Some(n) => n,
        None => return RpcResponse::error("name is required", Some(ErrorCode::EmptyPayload)),
    };

    let parent_path = data
        .get("parent_path")
        .and_then(|v| v.as_str())
        .unwrap_or("/");

    // ADR-028: deny creating dirs inside system shards.
    if is_system_path_guarded(parent_path) {
        return system_shard_denied();
    }
    // Also deny creating a system shard root at "/" (e.g. name=".passmanager").
    if parent_path == "/" && is_system_path_guarded(&format!("/{name}")) {
        return system_shard_denied();
    }

    match session.catalog_mut().create_dir(parent_path, name) {
        Ok(node_id) => {
            let parent_norm = normalize_path(parent_path);
            if parent_norm != "/" {
                if let Some(shard_id) = shard_id_from_path(&parent_norm) {
                    if let Some(rel_parent) = shard_relative_path(&shard_id, &parent_norm) {
                        if let Some(node) = session.catalog().find_by_id(node_id).cloned() {
                            session.record_delta(
                                &shard_id,
                                crate::catalog::DeltaEntry::create(0, rel_parent, node),
                            );
                        }
                    }
                }
            }

            RpcResponse::success(NodeCreatedResponse { node_id })
        }
        Err(e) => {
            let code = match &e {
                crate::error::Error::NameExists(_) => ErrorCode::NameExist,
                crate::error::Error::InvalidName(_) => ErrorCode::EmptyPayload,
                crate::error::Error::InvalidPath(_) => ErrorCode::NodeNotFound,
                crate::error::Error::NotADirectory(_) => ErrorCode::NotADir,
                _ => ErrorCode::InternalError,
            };
            RpcResponse::error(e.to_string(), Some(code))
        }
    }
}

/// Handle catalog:rename command
pub fn handle_catalog_rename(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    let new_name = match data.get("new_name").and_then(|v| v.as_str()) {
        Some(n) => n,
        None => return RpcResponse::error("new_name is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
    }

    let old_path = session
        .catalog()
        .get_path(node_id)
        .map(|p| normalize_path(&p));

    match session.catalog_mut().rename(node_id, new_name) {
        Ok(()) => {
            if let Some(old_path) = old_path {
                if let Some(shard_id) = shard_id_from_path(&old_path) {
                    if let Some(rel_path) = shard_relative_path(&shard_id, &old_path) {
                        // Renaming a shard root changes shard_id (complex). Skip for now.
                        if rel_path != "/" {
                            let rel_parent = parent_dir(&rel_path);
                            session.record_delta(
                                &shard_id,
                                crate::catalog::DeltaEntry::move_node(
                                    0,
                                    rel_path,
                                    rel_parent,
                                    Some(new_name.to_string()),
                                )
                                .with_node_id(node_id),
                            );
                        }
                    }
                }
            }

            RpcResponse::success(Value::Null)
        }
        Err(e) => {
            let code = match &e {
                crate::error::Error::NodeNotFound(_) => ErrorCode::NodeNotFound,
                crate::error::Error::NameExists(_) => ErrorCode::NameExist,
                crate::error::Error::InvalidName(_) => ErrorCode::EmptyPayload,
                crate::error::Error::CannotModifyRoot => ErrorCode::NodeNotFound,
                crate::error::Error::InvalidPath(_) => ErrorCode::NodeNotFound,
                _ => ErrorCode::InternalError,
            };
            RpcResponse::error(e.to_string(), Some(code))
        }
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

fn delete_file_chunks(
    storage: &crate::storage::Storage,
    vault_key: &[u8; crate::types::KEY_SIZE],
    node_id: u64,
) -> std::result::Result<(), RpcResponse> {
    let node_id32: u32 = node_id
        .try_into()
        .map_err(|_| RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError)))?;

    for index in 0u32.. {
        let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, index);
        let exists = storage
            .chunk_exists(&chunk_name)
            .map_err(|e| RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)))?;
        if !exists {
            break;
        }

        storage
            .delete_chunk(&chunk_name)
            .map_err(|e| RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)))?;
    }

    let otp_chunk = crate::crypto::otp_chunk_name(vault_key, node_id);
    let exists = storage
        .chunk_exists(&otp_chunk)
        .map_err(|e| RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)))?;
    if exists {
        storage
            .delete_chunk(&otp_chunk)
            .map_err(|e| RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)))?;
    }

    Ok(())
}

/// Handle catalog:delete command
pub fn handle_catalog_delete(
    session: &mut VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
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

            for file_id in file_node_ids {
                if let Err(r) = delete_file_chunks(storage, session.vault_key(), file_id) {
                    return r;
                }
            }

            RpcResponse::success(Value::Null)
        }
        Err(e) => {
            match &e {
                // ADR-004: delete is idempotent.
                crate::error::Error::NodeNotFound(_) => {
                    if let Err(r) = delete_file_chunks(storage, session.vault_key(), node_id) {
                        return r;
                    }
                    RpcResponse::success(Value::Null)
                }
                crate::error::Error::CannotModifyRoot => {
                    RpcResponse::error(e.to_string(), Some(ErrorCode::NodeNotFound))
                }
                _ => RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
            }
        }
    }
}

/// Handle catalog:move command
pub fn handle_catalog_move(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    let new_parent_path = match data.get("new_parent_path").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => {
            return RpcResponse::error("new_parent_path is required", Some(ErrorCode::EmptyPayload))
        }
    };

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
                                session.record_delta(
                                    &new_shard,
                                    crate::catalog::DeltaEntry::create(
                                        0,
                                        rel_new_parent,
                                        node_clone,
                                    ),
                                );
                            }
                        }
                    }
                    _ => {}
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

#[allow(dead_code)]
pub fn handle_catalog_sync_init(session: &VaultSession) -> RpcResponse {
    let root = session.catalog().root();

    match serde_json::to_value(root) {
        Ok(nodes) => {
            let response = SyncInitResponse {
                version: session.catalog().version(),
                format: "monolithic".to_string(),
                nodes,
            };
            RpcResponse::success(response)
        }
        Err(e) => RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
    }
}

pub fn handle_catalog_sync_delta(session: &VaultSession, data: &Value) -> RpcResponse {
    let from_version = data
        .get("from_version")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let current_version = session.catalog().version();

    // For now, return empty events - delta tracking not yet implemented
    let response = serde_json::json!({
        "current_version": current_version,
        "events": [],
        "requires_full_sync": from_version == 0 || from_version > current_version,
    });

    RpcResponse::success(response)
}
