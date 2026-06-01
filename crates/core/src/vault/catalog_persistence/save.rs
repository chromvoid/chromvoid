use std::collections::HashMap;

#[cfg(test)]
use crate::catalog::RootIndex;
use crate::catalog::{CatalogManager, DeltaEntry, Shard, MAX_DELTAS};
use crate::crypto::shard_snapshot_chunk_name;
use crate::crypto::{decrypt, delta_chunk_name, encrypt, root_index_chunk_name};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::chunks::chunks_for_meta;
#[cfg(test)]
use super::chunks::{delete_chunks, unique};
use super::compaction::CatalogCompactionService;
use super::root_index::read_root_index;
#[cfg(test)]
use super::root_index::write_root_index;
use super::transaction::CatalogCommitService;
#[cfg(test)]
use super::types::CatalogCommitRecord;
use super::types::CatalogSaveOutcome;

pub(in crate::vault) struct CatalogSaveService<'a> {
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
}

impl<'a> CatalogSaveService<'a> {
    pub(in crate::vault) fn new(storage: &'a Storage, vault_key: &'a [u8; KEY_SIZE]) -> Self {
        Self { storage, vault_key }
    }

    pub(in crate::vault) fn save(
        &self,
        catalog: &CatalogManager,
        pending_deltas: &mut HashMap<String, Vec<DeltaEntry>>,
        persisted_deltas: &mut Vec<(String, DeltaEntry)>,
    ) -> Result<CatalogSaveOutcome> {
        CatalogCommitService::new(self.storage, self.vault_key).recover_incomplete_commit()?;

        let root_name = root_index_chunk_name(self.vault_key, 0);
        let previous_root_index = read_root_index(self.storage, self.vault_key, &root_name)?;
        let mut root_index = previous_root_index.clone().unwrap_or_default();
        root_index.root_version = catalog.version();

        let shards = persistence_shards(catalog);
        let mut new_shards = HashMap::new();
        for shard in &shards {
            let strategy = if crate::catalog::is_eager_system_shard_id(&shard.shard_id) {
                crate::catalog::LoadStrategy::Eager
            } else {
                crate::catalog::LoadStrategy::Lazy
            };

            let mut meta = root_index
                .shards
                .get(&shard.shard_id)
                .cloned()
                .unwrap_or_else(|| {
                    crate::catalog::ShardMeta::new(shard.shard_id.clone(), strategy)
                });
            meta.strategy = strategy;
            meta.context = format!("shard:{}", meta.shard_id);
            meta.update_stats(shard.node_count(), shard.size());
            new_shards.insert(meta.shard_id.clone(), meta);
        }

        let mut old_chunks = Vec::new();
        if let Some(previous_root_index) = &previous_root_index {
            for meta in previous_root_index.shards.values() {
                if !new_shards.contains_key(&meta.shard_id) {
                    old_chunks.extend(chunks_for_meta(self.vault_key, meta));
                }
            }
        }

        root_index.shards = new_shards;

        let mut new_chunks = Vec::new();
        for shard in &shards {
            let mut needs_write;
            let mut root_id_changed = false;
            let old_meta = previous_root_index
                .as_ref()
                .and_then(|index| index.shards.get(&shard.shard_id));
            let old_snapshot_seq = old_meta.map(|meta| meta.snapshot_seq).unwrap_or(0);
            let old_snapshot_name =
                shard_snapshot_chunk_name(self.vault_key, &shard.shard_id, old_snapshot_seq);

            needs_write = !self.storage.chunk_exists(&old_snapshot_name)?;
            if !needs_write {
                match self
                    .storage
                    .read_chunk(&old_snapshot_name)
                    .ok()
                    .and_then(|enc| {
                        decrypt(&enc, self.vault_key, old_snapshot_name.as_bytes()).ok()
                    })
                    .and_then(|plain| serde_json::from_slice::<Shard>(&plain).ok())
                {
                    Some(existing) if shard_snapshot_needs_rewrite(&existing, shard) => {
                        root_id_changed = true;
                        needs_write = true;
                    }
                    Some(_) => {}
                    None => needs_write = true,
                }
            }

            if !needs_write {
                continue;
            }

            let mut base = shard.clone();
            let Some(meta) = root_index.get_shard_mut(&base.shard_id) else {
                continue;
            };

            if root_id_changed {
                meta.increment_version();
            }

            if let Some(old_meta) = old_meta {
                old_chunks.extend(chunks_for_meta(self.vault_key, old_meta));
            }

            meta.clear_deltas();
            meta.last_delta_seq = meta.version;
            meta.snapshot_seq = if old_meta.is_some() {
                old_snapshot_seq.saturating_add(1)
            } else {
                0
            };
            base.version = meta.base_version;
            base.base_version = meta.base_version;

            let snapshot_name =
                shard_snapshot_chunk_name(self.vault_key, &base.shard_id, meta.snapshot_seq);
            let plain = serde_json::to_vec(&base)?;
            let enc = encrypt(&plain, self.vault_key, snapshot_name.as_bytes())?;
            new_chunks.push(snapshot_name.clone());
            self.storage.write_chunk_atomic(&snapshot_name, &enc)?;
        }

        let mut delta_shards: Vec<String> = pending_deltas.keys().cloned().collect();
        delta_shards.sort_by(|a, b| {
            let a_eager = crate::catalog::is_eager_system_shard_id(a);
            let b_eager = crate::catalog::is_eager_system_shard_id(b);
            match (a_eager, b_eager) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.cmp(b),
            }
        });

        for shard_id in delta_shards {
            let deltas = match pending_deltas.get_mut(&shard_id) {
                Some(d) if !d.is_empty() => d,
                _ => continue,
            };

            let Some(meta) = root_index.get_shard_mut(&shard_id) else {
                deltas.clear();
                continue;
            };

            let mut next_seq = meta.version.saturating_add(1);
            for delta in deltas.iter_mut() {
                delta.seq = next_seq;
                let delta_name = delta_chunk_name(self.vault_key, &shard_id, next_seq);
                let delta_plain = serde_json::to_vec(&*delta)?;
                if delta_plain.len() > crate::catalog::MAX_DELTA_SIZE {
                    return Err(Error::InvalidDataFormat("delta too large".to_string()));
                }
                let delta_enc = encrypt(&delta_plain, self.vault_key, delta_name.as_bytes())?;
                self.storage.write_chunk_atomic(&delta_name, &delta_enc)?;
                new_chunks.push(delta_name);
                persisted_deltas.push((shard_id.clone(), delta.clone()));
                meta.record_delta(next_seq);
                next_seq = next_seq.saturating_add(1);
            }

            deltas.clear();

            let should_compact = crate::catalog::is_eager_system_shard_id(&shard_id)
                && meta.has_deltas
                && meta.delta_count >= MAX_DELTAS;

            if should_compact {
                let prepared = CatalogCompactionService::new(self.storage, self.vault_key)
                    .prepare_shard_compaction(&mut root_index, &shard_id)?;
                new_chunks.extend(prepared.new_chunks);
                old_chunks.extend(prepared.old_chunks);
            }
        }

        new_chunks.retain(|chunk| self.storage.chunk_exists(chunk).unwrap_or(false));

        CatalogCommitService::new(self.storage, self.vault_key).commit_root_index_update(
            &root_index,
            new_chunks,
            old_chunks,
            format!("catalog-{}", catalog.version()),
        )?;

        Ok(CatalogSaveOutcome {
            root_version: root_index.root_version,
            shard_count: root_index.shards.len(),
        })
    }

    #[cfg(test)]
    pub(in crate::vault) fn rewrite_sharded_catalog_from_catalog(
        &self,
        catalog: &CatalogManager,
    ) -> Result<()> {
        let root_name = root_index_chunk_name(self.vault_key, 0);
        let previous_root_index = read_root_index(self.storage, self.vault_key, &root_name)?;
        let mut old_chunks = Vec::new();
        if let Some(previous_root_index) = &previous_root_index {
            for meta in previous_root_index.shards.values() {
                old_chunks.extend(chunks_for_meta(self.vault_key, meta));
            }
        }

        let shards = persistence_shards(catalog);
        let mut root_index = RootIndex::new();
        root_index.root_version = catalog.version();
        let mut new_chunks = Vec::new();

        for shard in &shards {
            let strategy = if crate::catalog::is_eager_system_shard_id(&shard.shard_id) {
                crate::catalog::LoadStrategy::Eager
            } else {
                crate::catalog::LoadStrategy::Lazy
            };
            let mut meta = previous_root_index
                .as_ref()
                .and_then(|index| index.shards.get(&shard.shard_id).cloned())
                .unwrap_or_else(|| {
                    crate::catalog::ShardMeta::new(shard.shard_id.clone(), strategy)
                });
            meta.strategy = strategy;
            meta.context = format!("shard:{}", meta.shard_id);
            meta.clear_deltas();
            meta.last_delta_seq = meta.version;
            meta.snapshot_seq = meta.snapshot_seq.saturating_add(1);
            meta.update_stats(shard.node_count(), shard.size());

            let mut snapshot = shard.clone();
            snapshot.version = meta.base_version;
            snapshot.base_version = meta.base_version;
            let shard_name =
                shard_snapshot_chunk_name(self.vault_key, &snapshot.shard_id, meta.snapshot_seq);
            let shard_plain = serde_json::to_vec(&snapshot)?;
            let shard_enc = encrypt(&shard_plain, self.vault_key, shard_name.as_bytes())?;
            self.storage.write_chunk_atomic(&shard_name, &shard_enc)?;
            new_chunks.push(shard_name);

            root_index.shards.insert(meta.shard_id.clone(), meta);
        }

        let record = CatalogCommitRecord {
            v: 1,
            id: format!("catalog-rewrite-{}", catalog.version()),
            phase: crate::durable_tx::DurableTxPhase::Committing,
            root_version: root_index.root_version,
            new_chunks: unique(new_chunks),
            old_chunks: unique(old_chunks),
            root_index: root_index.clone(),
        };
        let commit = CatalogCommitService::new(self.storage, self.vault_key);
        commit.write_commit_record(&record)?;
        write_root_index(self.storage, self.vault_key, &root_index)?;
        commit.delete_commit_record()?;
        delete_chunks(self.storage, &record.old_chunks)?;
        self.storage.sync()?;
        Ok(())
    }
}

fn persistence_shards(catalog: &CatalogManager) -> Vec<Shard> {
    let mut shards = crate::catalog::split_into_shards(catalog.root(), None);
    let mut next_synthetic_node_id = max_catalog_node_id(catalog.root()).saturating_add(1);
    for shard_id in crate::catalog::eager_system_shard_ids() {
        if !shards.iter().any(|s| s.shard_id == *shard_id) {
            shards.push(crate::catalog::Shard::new(
                *shard_id,
                crate::catalog::CatalogNode::new_dir(
                    next_synthetic_node_id,
                    (*shard_id).to_string(),
                ),
            ));
            next_synthetic_node_id = next_synthetic_node_id.saturating_add(1);
        }
    }
    shards
}

fn max_catalog_node_id(node: &crate::catalog::CatalogNode) -> u64 {
    node.children().iter().fold(node.node_id, |max_id, child| {
        max_id.max(max_catalog_node_id(child))
    })
}

fn shard_snapshot_needs_rewrite(existing: &Shard, current: &Shard) -> bool {
    if existing.root.node_id != current.root.node_id {
        return true;
    }

    if existing.root.is_file() || current.root.is_file() {
        return existing.root != current.root;
    }

    existing.root.node_type != current.root.node_type || existing.root.name != current.root.name
}
