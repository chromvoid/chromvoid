use std::io::Read;
use std::sync::Arc;

mod error;

use crate::catalog::CatalogMediaInfo;
use crate::media_inspector::{
    inspect_media_info, is_iso_bmff_candidate, MediaByteReader, MediaInspectionError,
    MediaInspectionInput,
};
use crate::rpc::commands::{
    is_system_path_guarded, normalize_path, shard_id_from_path, shard_relative_path,
};
use crate::storage::Storage;
use crate::vault::{DecryptedChunkCache, VaultSession};

use super::blob_range_reader::CatalogBlobRangeReader;
use super::state::RpcRouter;

pub use error::{
    MediaInspectCommandError as CatalogMediaInspectCommandError,
    MediaInspectResult as CatalogMediaInspectResult,
};

pub(in crate::rpc::router) fn inspect_catalog_media(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> CatalogMediaInspectResult<serde_json::Value> {
    let node_id = required_node_id(data)?;

    let session = router
        .session
        .as_ref()
        .ok_or_else(CatalogMediaInspectCommandError::vault_required)?;

    let path = session
        .catalog()
        .get_path(node_id)
        .map(|path| normalize_path(&path))
        .ok_or_else(CatalogMediaInspectCommandError::node_not_found)?;
    if is_system_path_guarded(&path) {
        return Err(CatalogMediaInspectCommandError::access_denied());
    }

    let node = session
        .catalog()
        .find_by_id(node_id)
        .ok_or_else(CatalogMediaInspectCommandError::node_not_found)?;
    if !node.is_file() {
        return Err(CatalogMediaInspectCommandError::not_file());
    }

    let node_id32: u32 = node_id
        .try_into()
        .map_err(|_| CatalogMediaInspectCommandError::invalid_node_id())?;
    let vault_key = *session.vault_key();
    let name = node.name.clone();
    let mime_type = node.mime_type.clone();
    let size = node.size;
    let chunk_size = if node.chunk_size == 0 {
        crate::types::DEFAULT_CHUNK_SIZE
    } else {
        node.chunk_size
    };
    let source_revision = node.source_revision();
    let cache = session.decrypted_chunk_cache();
    let cache_generation = session.decrypted_chunk_cache_generation();
    let media_info = node.media_info.clone();
    let media_inspected_revision = node.media_inspected_revision;
    let inspection_candidate = is_iso_bmff_candidate(&name, mime_type.as_deref());
    if media_info.is_some()
        || (inspection_candidate
            && source_revision != 0
            && media_inspected_revision == source_revision)
    {
        tracing::info!(
            "perf:media_inspection event=cached_skip command=catalog:media:inspect cached_skip=true node_id={} source_revision={} media_inspected_revision={}",
            node_id,
            source_revision,
            media_inspected_revision
        );
        return Ok(serde_json::json!({
            "node_id": node_id,
            "media_info": media_info,
            "source_revision": source_revision,
            "media_inspected_revision": media_inspected_revision,
        }));
    }

    let snapshot = CatalogMediaInspectSnapshot {
        storage: router.storage.clone(),
        vault_key,
        node_id,
        node_id32,
        path,
        name,
        mime_type,
        size,
        chunk_size,
        source_revision,
        decrypted_chunk_cache: cache,
        decrypted_chunk_cache_generation: cache_generation,
        media_info,
        media_inspected_revision,
        inspection_candidate,
        inspection_complete: false,
    };

    let media_inspection = inspect_catalog_media_snapshot(&snapshot, || false);
    let (media_info, media_inspected_revision) = match media_inspection {
        Ok(media_info) => {
            let media_inspected_revision = if media_info.is_some() || inspection_candidate {
                source_revision
            } else {
                0
            };
            (media_info, media_inspected_revision)
        }
        Err(error) => {
            tracing::warn!(
                "perf:media_inspection event=failed command=catalog:media:inspect node_id={} source_revision={} error={:?}",
                node_id,
                source_revision,
                error
            );
            (None, 0)
        }
    };

    router.commit_catalog_media_inspect(&snapshot, media_info, media_inspected_revision)
}

fn required_node_id(data: &serde_json::Value) -> CatalogMediaInspectResult<u64> {
    data.get("node_id")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| CatalogMediaInspectCommandError::empty_payload("node_id"))
}

#[derive(Clone)]
pub struct CatalogMediaInspectSnapshot {
    pub storage: Storage,
    pub vault_key: [u8; crate::types::KEY_SIZE],
    pub node_id: u64,
    pub node_id32: u32,
    pub path: String,
    pub name: String,
    pub mime_type: Option<String>,
    pub size: u64,
    pub chunk_size: u32,
    pub source_revision: u64,
    pub decrypted_chunk_cache: Arc<DecryptedChunkCache>,
    pub decrypted_chunk_cache_generation: u64,
    pub media_info: Option<CatalogMediaInfo>,
    pub media_inspected_revision: u64,
    pub inspection_candidate: bool,
    pub inspection_complete: bool,
}

struct CancellableCatalogMediaByteReader<'a, F>
where
    F: Fn() -> bool,
{
    snapshot: &'a CatalogMediaInspectSnapshot,
    is_cancelled: F,
}

impl<F> MediaByteReader for CancellableCatalogMediaByteReader<'_, F>
where
    F: Fn() -> bool,
{
    fn read_range(&mut self, offset: u64, length: u64) -> Result<Vec<u8>, MediaInspectionError> {
        if (self.is_cancelled)() {
            return Err(MediaInspectionError::Cancelled);
        }

        let mut reader = CatalogBlobRangeReader::new_cached(
            self.snapshot.storage.clone(),
            &self.snapshot.vault_key,
            self.snapshot.node_id32,
            self.snapshot.source_revision,
            Arc::clone(&self.snapshot.decrypted_chunk_cache),
            self.snapshot.decrypted_chunk_cache_generation,
            offset,
            length,
            self.snapshot.chunk_size,
            self.snapshot.size,
        );
        let mut bytes = vec![0; length as usize];
        reader
            .read_exact(&mut bytes)
            .map_err(|error| MediaInspectionError::ReadFailed(error.to_string()))?;

        if (self.is_cancelled)() {
            return Err(MediaInspectionError::Cancelled);
        }
        Ok(bytes)
    }
}

pub fn inspect_catalog_media_snapshot<F>(
    snapshot: &CatalogMediaInspectSnapshot,
    is_cancelled: F,
) -> Result<Option<CatalogMediaInfo>, MediaInspectionError>
where
    F: Fn() -> bool,
{
    inspect_media_info(MediaInspectionInput {
        file_name: &snapshot.name,
        mime_type: snapshot.mime_type.as_deref(),
        size: snapshot.size,
        reader: CancellableCatalogMediaByteReader {
            snapshot,
            is_cancelled,
        },
    })
}

fn record_media_inspection_delta(
    session: &mut VaultSession,
    node_id: u64,
    path: &str,
    source_revision: Option<u64>,
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
    let mut fields = crate::catalog::PartialNode::default();
    fields.source_revision = source_revision;
    fields.media_info = media_info;
    fields.media_inspected_revision = media_inspected_revision;
    session.record_delta(
        &shard_id,
        crate::catalog::DeltaEntry::update(0, rel_path, fields).with_node_id(node_id),
    );
}

impl RpcRouter {
    pub fn snapshot_catalog_media_inspect(
        &mut self,
        node_id: u64,
    ) -> CatalogMediaInspectResult<CatalogMediaInspectSnapshot> {
        let session = self
            .session
            .as_mut()
            .ok_or_else(CatalogMediaInspectCommandError::vault_required)?;

        let path = session
            .catalog()
            .get_path(node_id)
            .map(|path| normalize_path(&path))
            .ok_or_else(CatalogMediaInspectCommandError::node_not_found)?;
        if is_system_path_guarded(&path) {
            return Err(CatalogMediaInspectCommandError::access_denied());
        }

        let node_id32 = node_id
            .try_into()
            .map_err(|_| CatalogMediaInspectCommandError::invalid_node_id())?;
        let (
            previous_source_revision,
            source_revision,
            name,
            mime_type,
            size,
            chunk_size,
            media_info,
            media_inspected_revision,
            inspection_candidate,
            inspection_complete,
            media_inspected_revision_changed,
        ) = {
            let node = session
                .catalog_mut()
                .find_by_id_mut(node_id)
                .ok_or_else(CatalogMediaInspectCommandError::node_not_found)?;
            if !node.is_file() {
                return Err(CatalogMediaInspectCommandError::not_file());
            }
            let previous_source_revision = node.source_revision();
            let source_revision = node.ensure_source_revision();
            let mut media_inspected_revision_changed = false;
            if node.media_info.is_some()
                && source_revision != 0
                && node.media_inspected_revision != source_revision
            {
                node.media_inspected_revision = source_revision;
                media_inspected_revision_changed = true;
            }
            let inspection_candidate = is_iso_bmff_candidate(&node.name, node.mime_type.as_deref());
            let inspection_complete = node.media_info.is_some()
                || (inspection_candidate
                    && source_revision != 0
                    && node.media_inspected_revision == source_revision);
            (
                previous_source_revision,
                source_revision,
                node.name.clone(),
                node.mime_type.clone(),
                node.size,
                if node.chunk_size == 0 {
                    crate::types::DEFAULT_CHUNK_SIZE
                } else {
                    node.chunk_size
                },
                node.media_info.clone(),
                node.media_inspected_revision,
                inspection_candidate,
                inspection_complete,
                media_inspected_revision_changed,
            )
        };
        if (previous_source_revision == 0 && source_revision != 0)
            || media_inspected_revision_changed
        {
            record_media_inspection_delta(
                session,
                node_id,
                &path,
                (previous_source_revision == 0 && source_revision != 0).then_some(source_revision),
                None,
                media_inspected_revision_changed.then_some(media_inspected_revision),
            );
        }

        Ok(CatalogMediaInspectSnapshot {
            storage: self.storage.clone(),
            vault_key: *session.vault_key(),
            node_id,
            node_id32,
            path,
            name,
            mime_type,
            size,
            chunk_size,
            source_revision,
            decrypted_chunk_cache: session.decrypted_chunk_cache(),
            decrypted_chunk_cache_generation: session.decrypted_chunk_cache_generation(),
            media_info,
            media_inspected_revision,
            inspection_candidate,
            inspection_complete,
        })
    }

    pub fn commit_catalog_media_inspect(
        &mut self,
        snapshot: &CatalogMediaInspectSnapshot,
        media_info: Option<CatalogMediaInfo>,
        media_inspected_revision: u64,
    ) -> CatalogMediaInspectResult<serde_json::Value> {
        let changed = {
            let Some(session) = self.session.as_mut() else {
                return Err(CatalogMediaInspectCommandError::vault_required());
            };
            let Some(node) = session.catalog_mut().find_by_id_mut(snapshot.node_id) else {
                return Err(CatalogMediaInspectCommandError::node_not_found());
            };
            if node.source_revision() != snapshot.source_revision {
                return Ok(serde_json::json!({
                    "node_id": snapshot.node_id,
                    "media_info": node.media_info,
                    "source_revision": node.source_revision(),
                    "media_inspected_revision": node.media_inspected_revision,
                    "stale": true,
                }));
            }

            let changed = node.media_info != media_info
                || node.media_inspected_revision != media_inspected_revision;
            if changed {
                node.media_info = media_info.clone();
                node.media_inspected_revision = media_inspected_revision;
            }
            changed
        };

        if changed {
            if let Some(session) = self.session.as_mut() {
                record_media_inspection_delta(
                    session,
                    snapshot.node_id,
                    &snapshot.path,
                    None,
                    Some(media_info.clone()),
                    Some(media_inspected_revision),
                );
            }
            if let Err(error) = self.save() {
                return Err(CatalogMediaInspectCommandError::internal(format!(
                    "Catalog save failed: {error}"
                )));
            }
        }

        Ok(serde_json::json!({
            "node_id": snapshot.node_id,
            "media_info": media_info,
            "source_revision": snapshot.source_revision,
            "media_inspected_revision": media_inspected_revision,
        }))
    }
}
