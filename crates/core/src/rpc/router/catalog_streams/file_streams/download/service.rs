use serde_json::Value;

use crate::rpc::commands::{is_system_path_guarded, normalize_path};
use crate::rpc::stream::{
    RpcOutputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcStreamMeta,
};

use super::super::super::super::blob_range_reader::CatalogBlobRangeReader;
use super::super::super::super::blob_reader::CatalogBlobReader;
use super::super::super::super::state::RpcRouter;
use super::super::common::record_source_revision_delta;
use super::error::{DownloadCommandError, DownloadResult};
use super::request::{DownloadRangeRequest, DownloadRequest};

pub(super) fn download_file(router: &RpcRouter, data: &Value) -> DownloadResult<RpcOutputStream> {
    let session = router
        .session
        .as_ref()
        .ok_or_else(DownloadCommandError::vault_required)?;
    let request = DownloadRequest::parse(data)?;

    if let Some(path) = session.catalog().get_path(request.node_id) {
        if is_system_path_guarded(&path) {
            return Err(DownloadCommandError::access_denied());
        }
    }

    let node = session
        .catalog()
        .find_by_id(request.node_id)
        .ok_or_else(DownloadCommandError::node_not_found)?;
    if !node.is_file() {
        return Err(DownloadCommandError::not_file_internal());
    }

    let node_id32: u32 = request
        .node_id
        .try_into()
        .map_err(|_| DownloadCommandError::invalid_node_id())?;

    Ok(RpcOutputStream {
        meta: RpcStreamMeta {
            name: node.name.clone(),
            mime_type: node
                .mime_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            size: node.size,
            chunk_size: node.chunk_size,
        },
        reader: Box::new(CatalogBlobReader::new(
            router.storage.clone(),
            session.vault_key(),
            node_id32,
        )),
    })
}

pub(super) fn download_range(
    router: &mut RpcRouter,
    data: &Value,
) -> DownloadResult<RpcRangeOutputStream> {
    let session = router
        .session
        .as_mut()
        .ok_or_else(DownloadCommandError::vault_required)?;
    let request = DownloadRangeRequest::parse(data)?;

    let path = session
        .catalog()
        .get_path(request.node_id)
        .map(|path| normalize_path(&path))
        .ok_or_else(DownloadCommandError::node_not_found)?;
    if is_system_path_guarded(&path) {
        return Err(DownloadCommandError::access_denied());
    }

    let mut revision_update: Option<(String, u64, u64)> = None;
    let (name, mime_type, file_size, chunk_size, source_revision) = {
        let node = session
            .catalog_mut()
            .find_by_id_mut(request.node_id)
            .ok_or_else(DownloadCommandError::node_not_found)?;
        if !node.is_file() {
            return Err(DownloadCommandError::not_file_internal());
        }
        if node.size == 0 {
            return Err(DownloadCommandError::media_range_invalid("File is empty"));
        }
        let previous = node.source_revision();
        let source_revision = node.ensure_source_revision();
        if previous == 0 && source_revision != 0 {
            revision_update = Some((path.clone(), node.modtime, source_revision));
        }
        (
            node.name.clone(),
            node.mime_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            node.size,
            node.chunk_size,
            source_revision,
        )
    };

    if let Some((path, modtime, source_revision)) = revision_update {
        record_source_revision_delta(
            session,
            request.node_id,
            &path,
            modtime,
            source_revision,
            None,
            None,
        );
    }

    if source_revision != request.expected_source_revision {
        return Err(DownloadCommandError::media_stream_stale());
    }
    if chunk_size == 0 {
        return Err(DownloadCommandError::internal("Invalid chunk size"));
    }
    if request.offset >= file_size || request.length > file_size.saturating_sub(request.offset) {
        return Err(DownloadCommandError::media_range_invalid(
            "Range is not satisfiable",
        ));
    }

    let node_id32: u32 = request
        .node_id
        .try_into()
        .map_err(|_| DownloadCommandError::invalid_node_id())?;
    let cache = session.decrypted_chunk_cache();
    let cache_generation = session.decrypted_chunk_cache_generation();

    Ok(RpcRangeOutputStream {
        meta: RpcRangeStreamMeta {
            name,
            mime_type,
            file_size,
            chunk_size,
            range_offset: request.offset,
            range_length: request.length,
            source_revision,
        },
        reader: Box::new(CatalogBlobRangeReader::new_cached(
            router.storage.clone(),
            session.vault_key(),
            node_id32,
            source_revision,
            cache,
            cache_generation,
            request.offset,
            request.length,
            chunk_size,
            file_size,
        )),
    })
}
