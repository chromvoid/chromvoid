use crate::catalog::CatalogMediaInfo;
use crate::rpc::commands::{normalize_path, shard_id_from_path, shard_relative_path};
use crate::storage::Storage;
use crate::vault::VaultSession;

#[derive(Debug, Clone)]
pub(super) enum BlobFinalizationDelta {
    SourceRevisionOnly,
    Replace {
        size: u64,
        mime_type: String,
    },
    Upload {
        size: u64,
        mime_type: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub(super) struct BlobFinalizationInput {
    pub(super) node_id: u64,
    pub(super) size: Option<u64>,
    pub(super) mime_type: Option<String>,
    pub(super) modtime: Option<u64>,
    pub(super) source_revision: Option<u64>,
    pub(super) delta: BlobFinalizationDelta,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct BlobFinalizationOutcome {
    pub(super) modtime: u64,
    pub(super) source_revision: u64,
}

#[derive(Debug)]
pub(super) enum BlobFinalizeError {
    NodeNotFound,
    DerivativeIndex(String),
}

pub(super) fn finalize_blob_write(
    session: &mut VaultSession,
    storage: &Storage,
    input: BlobFinalizationInput,
) -> Result<BlobFinalizationOutcome, BlobFinalizeError> {
    let path = session.catalog().get_path(input.node_id);
    let Some(node) = session.catalog_mut().find_by_id_mut(input.node_id) else {
        return Err(BlobFinalizeError::NodeNotFound);
    };

    if let Some(size) = input.size {
        node.size = size;
    }
    if let Some(mime_type) = input.mime_type {
        node.mime_type = Some(mime_type);
    }

    let (modtime, source_revision) = match (input.modtime, input.source_revision) {
        (Some(modtime), Some(source_revision)) => {
            node.modtime = modtime;
            node.source_revision = source_revision;
            (modtime, source_revision)
        }
        _ => {
            node.touch();
            let source_revision = node.bump_source_revision();
            (node.modtime, source_revision)
        }
    };
    node.media_info = None;
    node.media_inspected_revision = 0;

    session.invalidate_decrypted_chunk_cache_for_node(input.node_id);
    crate::rpc::derivative_index::delete_stale_derivatives_for_node(
        storage,
        session.vault_key(),
        input.node_id,
        source_revision,
    )
    .map_err(|error| {
        BlobFinalizeError::DerivativeIndex(format!("Derivative index update failed: {error}"))
    })?;

    if let Some(path) = path {
        match input.delta {
            BlobFinalizationDelta::SourceRevisionOnly => record_source_revision_delta(
                session,
                input.node_id,
                &path,
                modtime,
                source_revision,
                Some(None),
                Some(0),
            ),
            BlobFinalizationDelta::Replace { size, mime_type } => record_file_replace_delta(
                session,
                input.node_id,
                &path,
                size,
                &mime_type,
                modtime,
                source_revision,
                Some(None),
                Some(0),
            ),
            BlobFinalizationDelta::Upload { size, mime_type } => record_upload_delta(
                session,
                input.node_id,
                &path,
                size,
                mime_type,
                modtime,
                source_revision,
                Some(None),
                Some(0),
            ),
        }
    }

    Ok(BlobFinalizationOutcome {
        modtime,
        source_revision,
    })
}

fn record_source_revision_delta(
    session: &mut VaultSession,
    node_id: u64,
    path: &str,
    modtime: u64,
    source_revision: u64,
    media_info: Option<Option<CatalogMediaInfo>>,
    media_inspected_revision: Option<u64>,
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
    fields.media_info = media_info;
    fields.media_inspected_revision = media_inspected_revision;
    session.record_delta(
        &shard_id,
        crate::catalog::DeltaEntry::update(0, rel_path, fields).with_node_id(node_id),
    );
}

fn record_file_replace_delta(
    session: &mut VaultSession,
    node_id: u64,
    path: &str,
    size: u64,
    mime_type: &str,
    modtime: u64,
    source_revision: u64,
    media_info: Option<Option<CatalogMediaInfo>>,
    media_inspected_revision: Option<u64>,
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
    fields.size = Some(size);
    fields.mime_type = Some(mime_type.to_string());
    fields.modtime = Some(modtime);
    fields.source_revision = Some(source_revision);
    fields.media_info = media_info;
    fields.media_inspected_revision = media_inspected_revision;
    session.record_delta(
        &shard_id,
        crate::catalog::DeltaEntry::update(0, rel_path, fields).with_node_id(node_id),
    );
}

fn record_upload_delta(
    session: &mut VaultSession,
    node_id: u64,
    path: &str,
    size: u64,
    mime_type: Option<String>,
    modtime: u64,
    source_revision: u64,
    media_info: Option<Option<CatalogMediaInfo>>,
    media_inspected_revision: Option<u64>,
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
    fields.size = Some(size);
    fields.mime_type = mime_type;
    fields.modtime = Some(modtime);
    fields.source_revision = Some(source_revision);
    fields.media_info = media_info;
    fields.media_inspected_revision = media_inspected_revision;
    session.record_delta(
        &shard_id,
        crate::catalog::DeltaEntry::update(0, rel_path, fields).with_node_id(node_id),
    );
}
