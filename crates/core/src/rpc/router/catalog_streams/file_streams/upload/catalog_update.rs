use crate::catalog::DeltaEntry;
use crate::rpc::commands::{normalize_path, shard_id_from_path, shard_relative_path};

use super::super::super::super::blob_finalize::{
    finalize_blob_write, BlobFinalizationDelta, BlobFinalizationInput,
};
use super::super::super::super::state::RpcRouter;
use super::context::require_session_mut;
use super::error::{UploadCommandError, UploadResult};
use super::tx::UploadSessionTransaction;

pub(super) fn apply_upload_catalog_update(
    router: &mut RpcRouter,
    transaction: &UploadSessionTransaction,
    total_size: u64,
) -> UploadResult<()> {
    let storage = router.storage.clone();
    let session = require_session_mut(router)?;
    let modtime = transaction
        .new_modtime
        .unwrap_or_else(super::super::common::current_timestamp_ms);
    let source_revision = transaction.new_source_revision.unwrap_or_else(|| {
        super::super::common::next_source_revision(
            transaction.old_source_revision.unwrap_or(0),
            modtime,
        )
    });

    if transaction.is_new {
        session
            .catalog_mut()
            .create_file_with_id(
                &transaction.parent_path,
                &transaction.name,
                transaction.node_id,
                total_size,
                transaction.mime_type.clone(),
            )
            .map_err(UploadCommandError::from_catalog_error)?;
        if transaction.chunk_size != crate::types::DEFAULT_CHUNK_SIZE {
            session
                .catalog_mut()
                .set_chunk_size(transaction.node_id, transaction.chunk_size)
                .map_err(UploadCommandError::from_catalog_error)?;
        }
        if let Some(node) = session.catalog_mut().find_by_id_mut(transaction.node_id) {
            node.modtime = modtime;
            node.source_revision = source_revision;
            node.media_info = None;
            node.media_inspected_revision = 0;
        }
        record_create_delta(session, transaction.node_id, &transaction.parent_path)?;
        session.invalidate_decrypted_chunk_cache_for_node(transaction.node_id);
        Ok(())
    } else {
        finalize_blob_write(
            session,
            &storage,
            BlobFinalizationInput {
                node_id: transaction.node_id,
                size: Some(total_size),
                mime_type: transaction.mime_type.clone(),
                modtime: Some(modtime),
                source_revision: Some(source_revision),
                delta: BlobFinalizationDelta::Upload {
                    size: total_size,
                    mime_type: transaction.mime_type.clone(),
                },
            },
        )
        .map(|_| ())
        .map_err(UploadCommandError::from_blob_finalize_error)
    }
}

fn record_create_delta(
    session: &mut crate::vault::VaultSession,
    node_id: u64,
    parent_path: &str,
) -> UploadResult<()> {
    let parent_norm = normalize_path(parent_path);
    if parent_norm == "/" {
        return Ok(());
    }
    let Some(shard_id) = shard_id_from_path(&parent_norm) else {
        return Ok(());
    };
    let Some(rel_parent) = shard_relative_path(&shard_id, &parent_norm) else {
        return Ok(());
    };
    let Some(node) = session.catalog().find_by_id(node_id).cloned() else {
        return Err(UploadCommandError::node_not_found("Node not found"));
    };
    session.record_delta(&shard_id, DeltaEntry::create(0, rel_parent, node));
    Ok(())
}
