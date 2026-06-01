//! `catalog:list`, `catalog:createDir`, and `catalog:rename` handlers.

use serde_json::Value;

use crate::catalog::CatalogNode;
use crate::error::ErrorCode;
use crate::rpc::request_parse::{optional_str, required_str, required_u64};
use crate::vault::VaultSession;

use super::super::super::types::{
    CatalogListItem, CatalogListResponse, NodeCreatedResponse, RpcResponse,
};
use super::super::guards::{
    is_system_node, is_system_path_guarded, normalize_path, parent_dir, shard_id_from_path,
    shard_relative_path, system_shard_denied,
};

pub(super) fn catalog_list_item_from_node(node: &CatalogNode) -> CatalogListItem {
    CatalogListItem {
        node_id: node.node_id,
        name: node.name.clone(),
        is_dir: node.is_dir(),
        size: if node.is_file() {
            Some(node.size)
        } else {
            None
        },
        mime_type: node.mime_type.clone(),
        media_info: node.media_info.clone(),
        media_inspected_revision: node.media_inspected_revision,
        created_at: node.birthtime,
        updated_at: node.modtime,
    }
}

struct CatalogListRequest<'a> {
    path: &'a str,
}

fn parse_catalog_list_request(data: &Value) -> CatalogListRequest<'_> {
    CatalogListRequest {
        path: optional_str(data, "path").unwrap_or("/"),
    }
}

/// Handle catalog:list command
pub fn handle_catalog_list(session: &VaultSession, data: &Value) -> RpcResponse {
    let request = parse_catalog_list_request(data);
    let path = request.path;

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
                .map(|node| catalog_list_item_from_node(node))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{CatalogMediaInfo, CatalogMediaKind};

    #[test]
    fn catalog_list_item_includes_media_info() {
        let mut node = CatalogNode::new_file(
            12,
            "podcast.mp4".to_string(),
            2048,
            Some("video/mp4".to_string()),
        );
        node.media_info = Some(CatalogMediaInfo {
            kind: CatalogMediaKind::Audio,
            audio_tracks: 1,
            video_tracks: 0,
            playback_mime_type: Some("audio/mp4".to_string()),
        });

        let item = catalog_list_item_from_node(&node);

        assert_eq!(item.mime_type.as_deref(), Some("video/mp4"));
        assert_eq!(item.media_info, node.media_info);
        assert_eq!(item.media_inspected_revision, node.media_inspected_revision);
    }
}

struct CatalogCreateDirRequest<'a> {
    parent_path: &'a str,
    name: &'a str,
}

fn parse_catalog_create_dir_request(
    data: &Value,
) -> Result<CatalogCreateDirRequest<'_>, RpcResponse> {
    Ok(CatalogCreateDirRequest {
        parent_path: optional_str(data, "parent_path").unwrap_or("/"),
        name: required_str(data, "name")?,
    })
}

/// Handle catalog:createDir command
pub fn handle_catalog_create_dir(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let request = match parse_catalog_create_dir_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    create_catalog_dir(session, request.parent_path, request.name)
}

pub(in crate::rpc) fn create_catalog_dir(
    session: &mut VaultSession,
    parent_path: &str,
    name: &str,
) -> RpcResponse {
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

struct CatalogRenameRequest<'a> {
    node_id: u64,
    new_name: &'a str,
}

fn parse_catalog_rename_request(data: &Value) -> Result<CatalogRenameRequest<'_>, RpcResponse> {
    Ok(CatalogRenameRequest {
        node_id: required_u64(data, "node_id")?,
        new_name: required_str(data, "new_name")?,
    })
}

/// Handle catalog:rename command
pub fn handle_catalog_rename(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let request = match parse_catalog_rename_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    if is_system_node(session, request.node_id) {
        return system_shard_denied();
    }

    rename_catalog_node(session, request.node_id, request.new_name)
}

pub(in crate::rpc) fn rename_catalog_node(
    session: &mut VaultSession,
    node_id: u64,
    new_name: &str,
) -> RpcResponse {
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
                        } else {
                            // Top-level rename changes shard_id. RootIndex reconciliation plus
                            // full snapshot rewrite owns persistence for this boundary change.
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
