//! Dedicated reversible Trash catalog RPC handlers.

use serde_json::Value;

use crate::catalog::{CatalogNode, TRASH_SHARD_ID};
use crate::error::{Error, ErrorCode};
use crate::rpc::request_parse::{optional_str, required_u64};
use crate::rpc::types::{
    CatalogTrashEmptyResponse, CatalogTrashListItem, CatalogTrashListResponse,
    CatalogTrashResponse, CatalogTrashRestoreResponse, RpcResponse,
};
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::guards::{is_system_node, is_system_path_guarded, system_shard_denied};
use super::deltas::{record_create_delta_for_path, record_delete_delta};
use super::mutate::{collect_file_node_ids, CatalogDeleteCleanup};

struct CatalogTrashRequest {
    node_id: u64,
}

struct CatalogTrashRestoreRequest<'a> {
    node_id: u64,
    restore_parent_path: Option<&'a str>,
    new_name: Option<&'a str>,
}

fn parse_catalog_trash_request(data: &Value) -> Result<CatalogTrashRequest, RpcResponse> {
    Ok(CatalogTrashRequest {
        node_id: required_u64(data, "node_id")?,
    })
}

fn parse_catalog_trash_restore_request(
    data: &Value,
) -> Result<CatalogTrashRestoreRequest<'_>, RpcResponse> {
    Ok(CatalogTrashRestoreRequest {
        node_id: required_u64(data, "node_id")?,
        restore_parent_path: optional_str(data, "restore_parent_path"),
        new_name: optional_str(data, "new_name"),
    })
}

pub fn handle_catalog_trash(
    session: &mut VaultSession,
    data: &Value,
    storage: &Storage,
) -> RpcResponse {
    let request = match parse_catalog_trash_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    if is_system_node(session, request.node_id) {
        return system_shard_denied();
    }
    if let Err(response) = ensure_trash_shard_loaded(session, storage) {
        return response;
    }

    let old_path = session.catalog().get_path(request.node_id);
    match session.catalog_mut().trash_node(request.node_id) {
        Ok(node) => {
            if let Some(old_path) = old_path {
                record_delete_delta(session, &old_path, request.node_id);
            }
            if let Some(new_path) = session.catalog().get_path(request.node_id) {
                record_create_delta_for_path(session, &new_path, &node);
            }

            let Some(metadata) = node.trash else {
                return RpcResponse::error(
                    "Trash metadata missing after trash operation",
                    Some(ErrorCode::InternalError),
                );
            };

            RpcResponse::success(CatalogTrashResponse {
                node_id: request.node_id,
                original_path: metadata.original_path,
                deleted_at: metadata.deleted_at,
                trash_name: metadata.trash_name,
            })
        }
        Err(error) => catalog_error_response(error),
    }
}

pub fn handle_catalog_trash_list(session: &mut VaultSession, storage: &Storage) -> RpcResponse {
    if let Err(response) = ensure_trash_shard_loaded(session, storage) {
        return response;
    }

    match session.catalog().list_trash() {
        Ok(nodes) => RpcResponse::success(CatalogTrashListResponse {
            items: nodes.into_iter().map(trash_item_from_node).collect(),
        }),
        Err(error) => catalog_error_response(error),
    }
}

pub fn handle_catalog_trash_restore(
    session: &mut VaultSession,
    data: &Value,
    storage: &Storage,
) -> RpcResponse {
    let request = match parse_catalog_trash_restore_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    if request
        .restore_parent_path
        .map(is_system_path_guarded)
        .unwrap_or(false)
    {
        return system_shard_denied();
    }
    if let Err(response) = ensure_trash_shard_loaded(session, storage) {
        return response;
    }

    let old_path = session.catalog().get_path(request.node_id);
    match session.catalog_mut().restore_trashed_node(
        request.node_id,
        request.restore_parent_path,
        request.new_name,
    ) {
        Ok(node) => {
            if let Some(old_path) = old_path {
                record_delete_delta(session, &old_path, request.node_id);
            }
            let restored_path = session
                .catalog()
                .get_path(request.node_id)
                .unwrap_or_else(|| "/".to_string());
            record_create_delta_for_path(session, &restored_path, &node);

            RpcResponse::success(CatalogTrashRestoreResponse {
                node_id: request.node_id,
                restored_path,
            })
        }
        Err(error) => catalog_error_response(error),
    }
}

pub(in crate::rpc) fn handle_catalog_trash_empty_with_cleanup(
    session: &mut VaultSession,
    _data: &Value,
    storage: &Storage,
) -> (RpcResponse, CatalogDeleteCleanup) {
    if let Err(response) = ensure_trash_shard_loaded(session, storage) {
        return (response, CatalogDeleteCleanup::default());
    }

    let old_nodes = match session.catalog().list_trash() {
        Ok(nodes) => nodes.into_iter().cloned().collect::<Vec<_>>(),
        Err(error) => {
            return (
                catalog_error_response(error),
                CatalogDeleteCleanup::default(),
            )
        }
    };

    match session.catalog_mut().empty_trash() {
        Ok(removed) => {
            for node in &old_nodes {
                if let Some(old_path) = node
                    .trash
                    .as_ref()
                    .map(|metadata| format!("/.trash/{}", metadata.trash_name))
                {
                    record_delete_delta(session, &old_path, node.node_id);
                }
            }

            let mut file_node_ids = Vec::new();
            for node in &removed {
                collect_file_node_ids(node, &mut file_node_ids);
            }
            for file_id in &file_node_ids {
                session.invalidate_decrypted_chunk_cache_for_node(*file_id);
            }

            (
                RpcResponse::success(CatalogTrashEmptyResponse {
                    removed: removed.len() as u64,
                }),
                CatalogDeleteCleanup::from_nodes(&removed),
            )
        }
        Err(error) => (
            catalog_error_response(error),
            CatalogDeleteCleanup::default(),
        ),
    }
}

fn ensure_trash_shard_loaded(
    session: &mut VaultSession,
    storage: &Storage,
) -> Result<(), RpcResponse> {
    session
        .ensure_shard_loaded(storage, TRASH_SHARD_ID)
        .map_err(|error| RpcResponse::error(error.to_string(), Some(ErrorCode::DeltasLost)))
}

fn trash_item_from_node(node: &CatalogNode) -> CatalogTrashListItem {
    let original_path = node
        .trash
        .as_ref()
        .map(|metadata| metadata.original_path.clone())
        .unwrap_or_else(|| format!("/.trash/{}", node.name));
    let deleted_at = node
        .trash
        .as_ref()
        .map(|metadata| metadata.deleted_at)
        .unwrap_or(0);
    let trash_name = node
        .trash
        .as_ref()
        .map(|metadata| metadata.trash_name.clone())
        .unwrap_or_else(|| node.name.clone());

    CatalogTrashListItem {
        node_id: node.node_id,
        name: path_basename(&original_path).unwrap_or_else(|| node.name.clone()),
        is_dir: node.is_dir(),
        size: if node.is_file() {
            Some(node.size)
        } else {
            None
        },
        mime_type: node.mime_type.clone(),
        media_info: node.media_info.clone(),
        media_inspected_revision: node.media_inspected_revision,
        source_revision: node.source_revision(),
        created_at: node.birthtime,
        updated_at: node.modtime,
        original_path,
        deleted_at,
        trash_name,
    }
}

fn path_basename(path: &str) -> Option<String> {
    path.split('/')
        .filter(|part| !part.is_empty())
        .last()
        .map(ToString::to_string)
}

fn catalog_error_response(error: Error) -> RpcResponse {
    let code = match &error {
        Error::NodeNotFound(_) => ErrorCode::NodeNotFound,
        Error::NameExists(_) => ErrorCode::NameExist,
        Error::InvalidName(_) => ErrorCode::EmptyPayload,
        Error::InvalidPath(_) => ErrorCode::InvalidPath,
        Error::NotADirectory(_) => ErrorCode::NotADir,
        Error::CannotModifyRoot => ErrorCode::NodeNotFound,
        _ => ErrorCode::InternalError,
    };
    RpcResponse::error(error.to_string(), Some(code))
}
