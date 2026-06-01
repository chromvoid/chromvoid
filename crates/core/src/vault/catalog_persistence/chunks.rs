use std::collections::HashSet;

use crate::catalog::ShardMeta;
use crate::crypto::shard_snapshot_chunk_name;
use crate::crypto::{catalog_commit_chunk_name, delta_chunk_name, root_index_chunk_name};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::root_index::read_root_index;

pub(crate) struct CatalogChunkSetService<'a> {
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
}

impl<'a> CatalogChunkSetService<'a> {
    pub(crate) fn new(storage: &'a Storage, vault_key: &'a [u8; KEY_SIZE]) -> Self {
        Self { storage, vault_key }
    }

    pub(crate) fn live_catalog_chunk_names(&self) -> Result<HashSet<String>> {
        let mut live = HashSet::new();
        let root_name = root_index_chunk_name(self.vault_key, 0);
        if self.storage.chunk_exists(&root_name)? {
            live.insert(root_name.clone());
        }
        let commit_name = catalog_commit_chunk_name(self.vault_key);
        if self.storage.chunk_exists(&commit_name)? {
            live.insert(commit_name);
        }

        let Some(root_index) = read_root_index(self.storage, self.vault_key, &root_name)? else {
            return Ok(live);
        };
        for meta in root_index.shards.values() {
            live.extend(chunks_for_meta(self.vault_key, meta));
        }
        Ok(live)
    }
}

pub(crate) fn chunks_for_meta(vault_key: &[u8; KEY_SIZE], meta: &ShardMeta) -> Vec<String> {
    let mut chunks = vec![shard_snapshot_chunk_name(
        vault_key,
        &meta.shard_id,
        meta.snapshot_seq,
    )];
    if meta.has_deltas {
        let from = meta.base_version.saturating_add(1);
        let to = meta.last_delta_seq;
        for seq in from..=to {
            chunks.push(delta_chunk_name(vault_key, &meta.shard_id, seq));
        }
    }
    chunks
}

pub(crate) fn delete_chunks(storage: &Storage, chunks: &[String]) -> Result<()> {
    for chunk in chunks {
        storage.delete_chunk(chunk)?;
    }
    Ok(())
}

pub(crate) fn unique(mut chunks: Vec<String>) -> Vec<String> {
    chunks.sort();
    chunks.dedup();
    chunks
}
