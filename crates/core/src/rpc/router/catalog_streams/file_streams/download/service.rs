use serde_json::Value;

use crate::rpc::commands::{is_system_path_guarded, normalize_path};
use crate::rpc::stream::{
    RpcOutputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcStreamMeta,
};

use super::super::super::super::blob_range_reader::{CatalogBlobRangeReader, CatalogSourceReader};
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
    if router.session.is_none() {
        return Err(DownloadCommandError::vault_required());
    }
    let request = DownloadRangeRequest::parse(data)?;
    let (meta, reader) = open_range(
        router,
        request.node_id,
        request.expected_source_revision,
        Some((request.offset, request.length)),
    )?;
    Ok(RpcRangeOutputStream {
        meta,
        reader: Box::new(reader),
    })
}

impl RpcRouter {
    /// Open a revision-bound seekable source for split decoders. Reads happen outside
    /// the router; the runtime must revoke ownership and recheck revision before commit.
    pub fn open_catalog_source_reader(
        &mut self,
        node_id: u64,
        expected_source_revision: u64,
    ) -> Result<CatalogSourceReader, crate::rpc::types::RpcResponse> {
        open_range(self, node_id, expected_source_revision, None)
            .map(|(meta, reader)| CatalogSourceReader::new(meta, reader))
            .map_err(DownloadCommandError::into_rpc_response)
    }
}

fn open_range(
    router: &mut RpcRouter,
    node_id: u64,
    expected_source_revision: u64,
    range: Option<(u64, u64)>,
) -> DownloadResult<(RpcRangeStreamMeta, CatalogBlobRangeReader)> {
    let session = router
        .session
        .as_mut()
        .ok_or_else(DownloadCommandError::vault_required)?;
    let path = session
        .catalog()
        .get_path(node_id)
        .map(|path| normalize_path(&path))
        .ok_or_else(DownloadCommandError::node_not_found)?;
    if is_system_path_guarded(&path) {
        return Err(DownloadCommandError::access_denied());
    }

    let (name, mime_type, file_size, chunk_size, mut source_revision, modtime) = {
        let node = session
            .catalog()
            .find_by_id(node_id)
            .ok_or_else(DownloadCommandError::node_not_found)?;
        if !node.is_file() {
            return Err(DownloadCommandError::not_file_internal());
        }
        if node.size == 0 {
            return Err(DownloadCommandError::media_range_invalid("File is empty"));
        }
        (
            node.name.clone(),
            node.mime_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            node.size,
            node.chunk_size,
            node.source_revision(),
            node.modtime,
        )
    };

    // Opening each range must not dirty the catalog. Only a legacy file with
    // no revision needs mutation; the next metadata check can persist that change.
    if source_revision == 0 {
        source_revision = session
            .catalog_mut()
            .find_by_id_mut(node_id)
            .ok_or_else(DownloadCommandError::node_not_found)?
            .ensure_source_revision();
        record_source_revision_delta(
            session,
            node_id,
            &path,
            modtime,
            source_revision,
            None,
            None,
        );
    }

    if source_revision != expected_source_revision {
        return Err(DownloadCommandError::media_stream_stale());
    }
    if chunk_size == 0 {
        return Err(DownloadCommandError::internal("Invalid chunk size"));
    }
    let (offset, length) = range.unwrap_or((0, file_size));
    if offset >= file_size || length > file_size.saturating_sub(offset) {
        return Err(DownloadCommandError::media_range_invalid(
            "Range is not satisfiable",
        ));
    }

    let node_id32: u32 = node_id
        .try_into()
        .map_err(|_| DownloadCommandError::invalid_node_id())?;
    let cache = session.decrypted_chunk_cache();
    let cache_generation = session.decrypted_chunk_cache_generation();

    Ok((
        RpcRangeStreamMeta {
            name,
            mime_type,
            file_size,
            chunk_size,
            range_offset: offset,
            range_length: length,
            source_revision,
        },
        CatalogBlobRangeReader::new_cached(
            router.storage.clone(),
            session.vault_key(),
            node_id32,
            source_revision,
            cache,
            cache_generation,
            offset,
            length,
            chunk_size,
            file_size,
        ),
    ))
}
