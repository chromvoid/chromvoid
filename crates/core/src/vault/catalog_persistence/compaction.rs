use crate::catalog::{DeltaEntry, RootIndex, Shard};
use crate::crypto::{decrypt, delta_chunk_name, encrypt, shard_snapshot_chunk_name};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::chunks::chunks_for_meta;
use super::transaction::CatalogCommitService;
use super::types::PreparedShardCompaction;

pub(in crate::vault) struct CatalogCompactionService<'a> {
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
}

impl<'a> CatalogCompactionService<'a> {
    pub(in crate::vault) fn new(storage: &'a Storage, vault_key: &'a [u8; KEY_SIZE]) -> Self {
        Self { storage, vault_key }
    }

    pub(in crate::vault) fn compact_shard(
        &self,
        mut root_index: RootIndex,
        shard_id: &str,
    ) -> Result<(RootIndex, u64, usize)> {
        CatalogCommitService::new(self.storage, self.vault_key).recover_incomplete_commit()?;

        let prepared = self.prepare_shard_compaction(&mut root_index, shard_id)?;
        if prepared.chunks_written == 0 {
            return Ok((root_index, prepared.new_version, 0));
        }

        CatalogCommitService::new(self.storage, self.vault_key).commit_root_index_update(
            &root_index,
            prepared.new_chunks,
            prepared.old_chunks,
            format!("catalog-compact-{}-{}", shard_id, prepared.new_version),
        )?;

        Ok((root_index, prepared.new_version, prepared.chunks_written))
    }

    pub(crate) fn prepare_shard_compaction(
        &self,
        root_index: &mut RootIndex,
        shard_id: &str,
    ) -> Result<PreparedShardCompaction> {
        let meta = match root_index.get_shard_mut(shard_id) {
            Some(meta) => meta,
            None if crate::catalog::is_eager_system_shard_id(shard_id) => {
                root_index.upsert_shard(crate::catalog::ShardMeta::eager_system(shard_id));
                root_index.get_shard_mut(shard_id).ok_or_else(|| {
                    Error::InvalidDataFormat("Shard meta insert failed".to_string())
                })?
            }
            None => {
                return Err(Error::InvalidDataFormat(format!(
                    "Shard not found: {}",
                    shard_id
                )))
            }
        };

        if !meta.has_deltas {
            return Ok(PreparedShardCompaction {
                new_chunks: Vec::new(),
                old_chunks: Vec::new(),
                new_version: meta.version,
                chunks_written: 0,
            });
        }

        let previous_meta = meta.clone();
        let snap_name =
            shard_snapshot_chunk_name(self.vault_key, shard_id, previous_meta.snapshot_seq);
        if !self.storage.chunk_exists(&snap_name)? {
            return Err(Error::ChunkNotFound(snap_name));
        }
        let snap_enc = self.storage.read_chunk(&snap_name)?;
        let snap_plain = decrypt(&snap_enc, self.vault_key, snap_name.as_bytes())?;
        let mut shard: Shard = serde_json::from_slice(&snap_plain)?;

        let from = previous_meta.base_version.saturating_add(1);
        let to = previous_meta.last_delta_seq;
        if from <= to {
            let mut deltas = Vec::new();
            for seq in from..=to {
                let delta_name = delta_chunk_name(self.vault_key, shard_id, seq);
                let delta_enc = self
                    .storage
                    .read_chunk(&delta_name)
                    .map_err(|_| Error::ChunkNotFound(delta_name.clone()))?;
                let delta_plain = decrypt(&delta_enc, self.vault_key, delta_name.as_bytes())
                    .map_err(|e| Error::DecryptionFailed(e.to_string()))?;
                let delta: DeltaEntry = serde_json::from_slice(&delta_plain)?;
                deltas.push(delta);
            }
            crate::catalog::apply_deltas(&mut shard.root, &deltas);
        }

        shard.version = previous_meta.version;
        shard.base_version = previous_meta.version;

        let new_snapshot_seq = previous_meta.snapshot_seq.saturating_add(1);
        let snapshot_name = shard_snapshot_chunk_name(self.vault_key, shard_id, new_snapshot_seq);
        let plain = serde_json::to_vec(&shard)?;
        let enc = encrypt(&plain, self.vault_key, snapshot_name.as_bytes())?;
        self.storage.write_chunk_atomic(&snapshot_name, &enc)?;

        let meta = root_index.get_shard_mut(shard_id).ok_or_else(|| {
            Error::InvalidDataFormat("Shard meta disappeared during compaction".to_string())
        })?;
        meta.clear_deltas();
        meta.last_delta_seq = meta.version;
        meta.snapshot_seq = new_snapshot_seq;
        meta.update_stats(shard.node_count(), shard.size());

        Ok(PreparedShardCompaction {
            new_chunks: vec![snapshot_name],
            old_chunks: chunks_for_meta(self.vault_key, &previous_meta),
            new_version: meta.version,
            chunks_written: 1,
        })
    }
}
