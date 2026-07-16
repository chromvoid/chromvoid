use crate::catalog::RootIndex;
use std::collections::{HashMap, HashSet};

use crate::catalog::{
    apply_deltas, CatalogManager, CatalogNode, DeltaEntry, DeltaOp, Shard, ShardMeta, MAX_DELTAS,
};
use crate::crypto::shard_snapshot_chunk_name;
use crate::crypto::{decrypt, delta_chunk_name, encrypt, root_index_chunk_name};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::chunks::chunks_for_meta;
use super::chunks::{delete_chunks, unique};
use super::compaction::CatalogCompactionService;
use super::root_index::read_root_index;
use super::root_index::write_root_index;
use super::transaction::CatalogCommitService;
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
            meta.update_root_summary(&shard.root);
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
        let mut snapshot_rewritten_shards = HashSet::new();
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
            snapshot_rewritten_shards.insert(base.shard_id.clone());
        }

        for deltas in pending_deltas.values() {
            for delta in deltas {
                let delta_plain = serde_json::to_vec(delta)?;
                if delta_plain.len() > crate::catalog::MAX_DELTA_SIZE {
                    return Err(Error::InvalidDataFormat("delta too large".to_string()));
                }
            }
        }

        let mut snapshot_fallback_shards = HashSet::new();
        for (shard_id, deltas) in pending_deltas.iter() {
            if deltas.is_empty() || snapshot_rewritten_shards.contains(shard_id) {
                continue;
            }
            let Some(meta) = root_index.get_shard(shard_id) else {
                continue;
            };
            let Some(intended_shard) = shards.iter().find(|shard| shard.shard_id == *shard_id)
            else {
                continue;
            };
            let assigned_deltas = assign_delta_sequences(deltas, meta.version.saturating_add(1));
            if pending_delta_chain_reaches_limit(meta, assigned_deltas.len())
                || self.pending_delta_chain_needs_snapshot_fallback(
                    meta,
                    &assigned_deltas,
                    intended_shard,
                )?
            {
                snapshot_fallback_shards.insert(shard_id.clone());
            }
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

            if snapshot_rewritten_shards.contains(&shard_id) {
                deltas.clear();
                continue;
            }

            if snapshot_fallback_shards.contains(&shard_id) {
                let Some(shard) = shards.iter().find(|shard| shard.shard_id == shard_id) else {
                    deltas.clear();
                    continue;
                };
                let old_meta = previous_root_index
                    .as_ref()
                    .and_then(|index| index.shards.get(&shard_id));
                let pending_count = deltas.len() as u64;
                let new_version = root_index
                    .get_shard(&shard_id)
                    .map(|meta| meta.version.saturating_add(pending_count))
                    .unwrap_or(pending_count);
                self.write_full_snapshot_for_shard(
                    &mut root_index,
                    shard,
                    old_meta,
                    new_version,
                    &mut old_chunks,
                    &mut new_chunks,
                )?;
                deltas.clear();
                continue;
            }

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

            let should_compact = meta.has_deltas && meta.delta_count >= MAX_DELTAS;

            if should_compact {
                let prepared = CatalogCompactionService::new(self.storage, self.vault_key)
                    .prepare_shard_compaction(&mut root_index, &shard_id)?;
                new_chunks.extend(prepared.new_chunks);
                old_chunks.extend(prepared.old_chunks);
            }
        }

        let mut durable_new_chunks = Vec::with_capacity(new_chunks.len());
        for chunk in new_chunks {
            if self.storage.chunk_exists(&chunk)? {
                durable_new_chunks.push(chunk);
            }
        }

        CatalogCommitService::new(self.storage, self.vault_key).commit_root_index_update(
            &root_index,
            durable_new_chunks,
            old_chunks,
            format!("catalog-{}", catalog.version()),
        )?;

        Ok(CatalogSaveOutcome {
            root_version: root_index.root_version,
            shard_count: root_index.shards.len(),
        })
    }

    fn pending_delta_chain_needs_snapshot_fallback(
        &self,
        meta: &ShardMeta,
        assigned_deltas: &[DeltaEntry],
        intended_shard: &Shard,
    ) -> Result<bool> {
        let mut replayed = self.read_shard_snapshot(meta)?;
        if meta.has_deltas {
            let persisted_deltas = self.read_persisted_deltas(meta)?;
            apply_deltas(&mut replayed.root, &persisted_deltas)?;
        }

        let existing_root = replayed.root.clone();
        match apply_deltas(&mut replayed.root, assigned_deltas) {
            Ok(_) => {
                if catalog_nodes_replay_equivalent(&replayed.root, &intended_shard.root) {
                    return Ok(false);
                }

                ensure_snapshot_fallback_preserves_existing_nodes(
                    meta,
                    &existing_root,
                    &intended_shard.root,
                    assigned_deltas,
                )?;
                Ok(true)
            }
            Err(Error::CatalogDeltaReplayFailed(_)) => {
                ensure_snapshot_fallback_preserves_existing_nodes(
                    meta,
                    &existing_root,
                    &intended_shard.root,
                    assigned_deltas,
                )?;
                Ok(true)
            }
            Err(error) => Err(error),
        }
    }

    fn read_shard_snapshot(&self, meta: &ShardMeta) -> Result<Shard> {
        let snapshot_name =
            shard_snapshot_chunk_name(self.vault_key, &meta.shard_id, meta.snapshot_seq);
        let encrypted = self.storage.read_chunk(&snapshot_name)?;
        let plaintext = decrypt(&encrypted, self.vault_key, snapshot_name.as_bytes())?;
        Ok(serde_json::from_slice(&plaintext)?)
    }

    fn read_persisted_deltas(&self, meta: &ShardMeta) -> Result<Vec<DeltaEntry>> {
        if !meta.has_deltas {
            return Ok(Vec::new());
        }
        let from = meta.base_version.saturating_add(1);
        let to = meta.last_delta_seq;
        if from > to {
            return Ok(Vec::new());
        }
        let mut deltas = Vec::new();
        for seq in from..=to {
            let delta_name = delta_chunk_name(self.vault_key, &meta.shard_id, seq);
            let encrypted = self.storage.read_chunk(&delta_name)?;
            let plaintext = decrypt(&encrypted, self.vault_key, delta_name.as_bytes())?;
            let delta = serde_json::from_slice(&plaintext)?;
            deltas.push(delta);
        }
        Ok(deltas)
    }

    fn write_full_snapshot_for_shard(
        &self,
        root_index: &mut RootIndex,
        shard: &Shard,
        old_meta: Option<&ShardMeta>,
        new_version: u64,
        old_chunks: &mut Vec<String>,
        new_chunks: &mut Vec<String>,
    ) -> Result<()> {
        let Some(meta) = root_index.get_shard_mut(&shard.shard_id) else {
            return Ok(());
        };
        if let Some(old_meta) = old_meta {
            old_chunks.extend(chunks_for_meta(self.vault_key, old_meta));
            meta.snapshot_seq = old_meta.snapshot_seq.saturating_add(1);
        } else {
            meta.snapshot_seq = 0;
        }
        meta.version = new_version;
        meta.base_version = new_version;
        meta.has_deltas = false;
        meta.delta_count = 0;
        meta.last_delta_seq = new_version;
        meta.update_stats(shard.node_count(), shard.size());
        meta.update_root_summary(&shard.root);

        let mut snapshot = shard.clone();
        snapshot.version = new_version;
        snapshot.base_version = new_version;
        let snapshot_name =
            shard_snapshot_chunk_name(self.vault_key, &snapshot.shard_id, meta.snapshot_seq);
        let plain = serde_json::to_vec(&snapshot)?;
        let enc = encrypt(&plain, self.vault_key, snapshot_name.as_bytes())?;
        self.storage.write_chunk_atomic(&snapshot_name, &enc)?;
        new_chunks.push(snapshot_name);
        Ok(())
    }

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
            meta.update_root_summary(&shard.root);

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

fn assign_delta_sequences(deltas: &[DeltaEntry], first_seq: u64) -> Vec<DeltaEntry> {
    let mut next_seq = first_seq;
    deltas
        .iter()
        .cloned()
        .map(|mut delta| {
            delta.seq = next_seq;
            next_seq = next_seq.saturating_add(1);
            delta
        })
        .collect()
}

fn pending_delta_chain_reaches_limit(meta: &ShardMeta, pending_count: usize) -> bool {
    if pending_count == 0 {
        return false;
    }

    let persisted_count = if meta.has_deltas && meta.last_delta_seq >= meta.base_version {
        meta.last_delta_seq.saturating_sub(meta.base_version)
    } else {
        0
    };
    let persisted_count = persisted_count.max(meta.delta_count as u64);
    persisted_count.saturating_add(pending_count as u64) >= MAX_DELTAS as u64
}

fn has_existing_node_mutation_delta(deltas: &[DeltaEntry]) -> bool {
    deltas.iter().any(|delta| {
        matches!(
            delta.op,
            DeltaOp::Delete | DeltaOp::Move { .. } | DeltaOp::Update { .. }
        )
    })
}

fn ensure_snapshot_fallback_preserves_existing_nodes(
    meta: &ShardMeta,
    existing: &CatalogNode,
    intended: &CatalogNode,
    assigned_deltas: &[DeltaEntry],
) -> Result<()> {
    if !catalog_node_ids_unique(intended) {
        return Err(Error::InvalidDataFormat(format!(
            "refusing snapshot fallback with duplicate node ids (shard_id={})",
            meta.shard_id
        )));
    }

    if has_existing_node_mutation_delta(assigned_deltas)
        || catalog_preserves_existing_nodes(existing, intended)
    {
        return Ok(());
    }

    Err(Error::InvalidDataFormat(format!(
        "refusing snapshot fallback that would drop nodes without delete delta (shard_id={})",
        meta.shard_id
    )))
}

fn catalog_node_ids_unique(root: &CatalogNode) -> bool {
    let mut node_ids = HashSet::new();
    collect_catalog_node_ids(root, &mut node_ids)
}

fn collect_catalog_node_ids(node: &CatalogNode, node_ids: &mut HashSet<u64>) -> bool {
    node_ids.insert(node.node_id)
        && node
            .children()
            .iter()
            .all(|child| collect_catalog_node_ids(child, node_ids))
}

fn catalog_preserves_existing_nodes(existing: &CatalogNode, intended: &CatalogNode) -> bool {
    if !catalog_node_payload_equivalent(existing, intended) {
        return false;
    }

    existing.children().iter().all(|existing_child| {
        intended
            .children()
            .iter()
            .find(|intended_child| intended_child.node_id == existing_child.node_id)
            .map(|intended_child| catalog_preserves_existing_nodes(existing_child, intended_child))
            .unwrap_or(false)
    })
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

fn catalog_nodes_replay_equivalent(
    replayed: &crate::catalog::CatalogNode,
    intended: &crate::catalog::CatalogNode,
) -> bool {
    if !catalog_node_payload_equivalent(replayed, intended) {
        return false;
    }

    let replayed_children = replayed.children();
    let intended_children = intended.children();
    replayed_children.len() == intended_children.len()
        && replayed_children
            .iter()
            .zip(intended_children)
            .all(|(replayed, intended)| catalog_nodes_replay_equivalent(replayed, intended))
}

fn catalog_node_payload_equivalent(
    left: &crate::catalog::CatalogNode,
    right: &crate::catalog::CatalogNode,
) -> bool {
    if left.node_id != right.node_id
        || left.node_type != right.node_type
        || left.name != right.name
        || left.size != right.size
        || left.chunk_size != right.chunk_size
        || left.mime_type != right.mime_type
        || left.media_info != right.media_info
        || left.media_inspected_revision != right.media_inspected_revision
        || left.source_revision != right.source_revision
        || left.link_to != right.link_to
    {
        return false;
    }

    !left.is_file() || (left.birthtime == right.birthtime && left.modtime == right.modtime)
}
