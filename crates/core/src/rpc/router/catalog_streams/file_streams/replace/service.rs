use std::io::Read;

use serde_json::Value;

use crate::catalog::CatalogMediaInfo;
use crate::rpc::commands::{is_system_path_guarded, normalize_path};
use crate::rpc::stream::RpcInputStream;
use crate::rpc::types::CatalogFileReplaceResponse;
use crate::vault::VaultSession;

use super::super::super::super::blob_finalize::{
    finalize_blob_write, BlobFinalizationDelta, BlobFinalizationInput,
};
use super::super::super::super::state::RpcRouter;
use super::super::super::file_replace_tx::{cleanup_file_replace_marker, restore_chunks};
use super::chunks::{replace_chunks, ChunkReplacement};
use super::error::{ReplaceCommandError, ReplaceResult};
use super::request::ReplaceRequest;

struct ReplaceTargetSnapshot {
    old_size: u64,
    old_mime_type: Option<String>,
    old_media_info: Option<CatalogMediaInfo>,
    old_media_inspected_revision: u64,
    old_modtime: u64,
    old_source_revision: u64,
    chunk_size: u32,
}

pub(super) fn replace_file(
    router: &mut RpcRouter,
    data: &Value,
    stream: Option<RpcInputStream>,
) -> ReplaceResult<CatalogFileReplaceResponse> {
    let session = router
        .session
        .as_mut()
        .ok_or_else(ReplaceCommandError::vault_required)?;
    let request = ReplaceRequest::parse(data)?;
    let target = validate_target(session, &request)?;

    let stream = stream.ok_or_else(ReplaceCommandError::no_stream)?;
    let mut reader = stream.into_reader();
    let mut content = Vec::new();
    if let Err(error) = reader.read_to_end(&mut content) {
        return Err(ReplaceCommandError::internal(format!(
            "Failed to read stream: {error}"
        )));
    }
    if content.len() as u64 != request.size {
        return Err(ReplaceCommandError::size_mismatch());
    }
    session.invalidate_decrypted_chunk_cache_for_node(request.node_id);

    let chunk_size = target.chunk_size as u64;
    if chunk_size == 0 {
        return Err(ReplaceCommandError::internal("Invalid chunk size"));
    }

    let node_id32: u32 = request
        .node_id
        .try_into()
        .map_err(|_| ReplaceCommandError::internal("Invalid node_id"))?;
    let vault_key = *session.vault_key();

    let replacement = replace_chunks(
        &router.storage,
        &vault_key,
        node_id32,
        target.old_size,
        request.size,
        chunk_size,
        &content,
        target.old_source_revision,
    )?;

    #[cfg(test)]
    if data
        .get("debug_crash_after_canonical_commit")
        .and_then(|value| value.as_bool())
        == Some(true)
    {
        return Err(ReplaceCommandError::internal(
            "debug crash after canonical commit",
        ));
    }

    let result_mime_type = request
        .mime_type
        .clone()
        .or_else(|| target.old_mime_type.clone())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    if let Err(error) = finalize_blob_write(
        session,
        &router.storage,
        BlobFinalizationInput {
            node_id: request.node_id,
            size: Some(request.size),
            mime_type: request.mime_type.clone(),
            modtime: Some(replacement.modtime),
            source_revision: Some(replacement.source_revision),
            delta: BlobFinalizationDelta::Replace {
                size: request.size,
                mime_type: result_mime_type.clone(),
            },
        },
    ) {
        restore_after_finalization_failure(
            session,
            &router.storage,
            &vault_key,
            request.node_id,
            &target,
            &replacement,
        );
        return Err(ReplaceCommandError::from_blob_finalize_error(error));
    }

    let _ = session;
    if let Err(error) = router.save() {
        return Err(ReplaceCommandError::internal(format!(
            "Catalog save failed: {error}"
        )));
    }

    #[cfg(test)]
    if data
        .get("debug_crash_after_catalog_save")
        .and_then(|value| value.as_bool())
        == Some(true)
    {
        return Err(ReplaceCommandError::internal(
            "debug crash after catalog save",
        ));
    }

    let _ = cleanup_file_replace_marker(&router.storage, &vault_key, &replacement.transaction);

    Ok(CatalogFileReplaceResponse {
        node_id: request.node_id,
        size: request.size,
        mime_type: result_mime_type,
        modtime: replacement.modtime,
        source_revision: replacement.source_revision,
        media_info: None,
        media_inspected_revision: 0,
    })
}

fn validate_target(
    session: &VaultSession,
    request: &ReplaceRequest,
) -> ReplaceResult<ReplaceTargetSnapshot> {
    let path = match session.catalog().get_path(request.node_id) {
        Some(path) => normalize_path(&path),
        None => return Err(ReplaceCommandError::node_not_found()),
    };
    if is_system_path_guarded(&path) {
        return Err(ReplaceCommandError::access_denied());
    }

    let Some(node) = session.catalog().find_by_id(request.node_id) else {
        return Err(ReplaceCommandError::node_not_found());
    };
    if !node.is_file() {
        return Err(ReplaceCommandError::not_file());
    }
    if let Some(expected) = request.expected_source_revision {
        if !request.overwrite && node.source_revision() != expected {
            return Err(ReplaceCommandError::stale_source());
        }
    }

    Ok(ReplaceTargetSnapshot {
        old_size: node.size,
        old_mime_type: node.mime_type.clone(),
        old_media_info: node.media_info.clone(),
        old_media_inspected_revision: node.media_inspected_revision,
        old_modtime: node.modtime,
        old_source_revision: node.source_revision(),
        chunk_size: if node.chunk_size == 0 {
            crate::types::DEFAULT_CHUNK_SIZE
        } else {
            node.chunk_size
        },
    })
}

fn restore_after_finalization_failure(
    session: &mut VaultSession,
    storage: &crate::storage::Storage,
    vault_key: &[u8; crate::types::KEY_SIZE],
    node_id: u64,
    target: &ReplaceTargetSnapshot,
    replacement: &ChunkReplacement,
) {
    let _ = restore_chunks(storage, &replacement.backups);
    let _ = cleanup_file_replace_marker(storage, vault_key, &replacement.transaction);
    if let Some(node) = session.catalog_mut().find_by_id_mut(node_id) {
        node.size = target.old_size;
        node.mime_type = target.old_mime_type.clone();
        node.media_info = target.old_media_info.clone();
        node.media_inspected_revision = target.old_media_inspected_revision;
        node.modtime = target.old_modtime;
        node.source_revision = target.old_source_revision;
    }
}
