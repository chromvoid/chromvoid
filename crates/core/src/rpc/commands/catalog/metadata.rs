//! `catalog:source:metadata` handler.

use serde_json::Value;

use crate::catalog::CatalogNode;
use crate::error::ErrorCode;
use crate::rpc::request_parse::required_u64;
use crate::vault::VaultSession;

use super::super::super::types::{RpcResponse, SourceMetadataResponse};
use super::super::guards::{
    is_system_path_guarded, normalize_path, shard_id_from_path, shard_relative_path,
    system_shard_denied,
};

fn source_metadata_response_from_node(
    node: &CatalogNode,
    source_revision: u64,
    source_revision_initialized: bool,
) -> SourceMetadataResponse {
    SourceMetadataResponse {
        node_id: node.node_id,
        node_type: node.node_type,
        name: node.name.clone(),
        mime_type: node.mime_type.clone(),
        media_info: node.media_info.clone(),
        size: node.size,
        source_revision,
        media_inspected_revision: node.media_inspected_revision,
        source_revision_initialized,
    }
}

fn record_source_revision_delta(
    session: &mut VaultSession,
    node_id: u64,
    path: &str,
    modtime: u64,
    source_revision: u64,
) {
    let normalized = normalize_path(path);
    let Some(shard_id) = shard_id_from_path(&normalized) else {
        return;
    };
    let Some(rel_path) = shard_relative_path(&shard_id, &normalized) else {
        return;
    };
    if rel_path == "/" {
        return;
    }

    let mut fields = crate::catalog::PartialNode::default();
    fields.modtime = Some(modtime);
    fields.source_revision = Some(source_revision);
    session.record_delta(
        &shard_id,
        crate::catalog::DeltaEntry::update(0, rel_path, fields).with_node_id(node_id),
    );
}

struct SourceMetadataRequest {
    node_id: u64,
}

fn parse_source_metadata_request(data: &Value) -> Result<SourceMetadataRequest, RpcResponse> {
    Ok(SourceMetadataRequest {
        node_id: required_u64(data, "node_id")?,
    })
}

/// Handle catalog:source:metadata command.
pub fn handle_catalog_source_metadata(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let request = match parse_source_metadata_request(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    let path = match session.catalog().get_path(request.node_id) {
        Some(path) => normalize_path(&path),
        None => return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound)),
    };
    if is_system_path_guarded(&path) {
        return system_shard_denied();
    }

    let (response, modtime, source_revision, initialized) = {
        let Some(node) = session.catalog_mut().find_by_id_mut(request.node_id) else {
            return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound));
        };
        let previous = node.source_revision();
        let source_revision = node.ensure_source_revision();
        let initialized = previous == 0 && source_revision != 0;
        (
            source_metadata_response_from_node(node, source_revision, initialized),
            node.modtime,
            source_revision,
            initialized,
        )
    };

    if initialized {
        record_source_revision_delta(session, request.node_id, &path, modtime, source_revision);
    }

    RpcResponse::success(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{CatalogMediaInfo, CatalogMediaKind};

    #[test]
    fn source_metadata_response_includes_media_info() {
        let mut node = CatalogNode::new_file(
            8,
            "podcast.mp4".to_string(),
            4096,
            Some("video/mp4".to_string()),
        );
        node.media_info = Some(CatalogMediaInfo {
            kind: CatalogMediaKind::Audio,
            audio_tracks: 1,
            video_tracks: 0,
            playback_mime_type: Some("audio/mp4".to_string()),
        });

        let response = source_metadata_response_from_node(&node, 42, false);

        assert_eq!(response.mime_type.as_deref(), Some("video/mp4"));
        assert_eq!(response.media_info, node.media_info);
        assert_eq!(
            response.media_inspected_revision,
            node.media_inspected_revision
        );
        assert_eq!(response.source_revision, 42);
        assert!(!response.source_revision_initialized);
    }
}
