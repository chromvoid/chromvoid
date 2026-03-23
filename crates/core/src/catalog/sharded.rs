//! Sharded catalog manager

use std::collections::HashMap;

use crate::error::{Error, Result};

use super::delta::{apply_deltas, DeltaEntry, DeltaLog};
use super::shard::{LoadStrategy, RootIndex, Shard, ShardMeta};
use super::CatalogNode;

const DEFAULT_SHARD_SIZE: usize = 1000;
const PASSMANAGER_SHARD_ID: &str = ".passmanager";

pub struct ShardedCatalogManager {
    root_index: RootIndex,
    loaded_shards: HashMap<String, Shard>,
    delta_logs: HashMap<String, DeltaLog>,
    dirty_shards: Vec<String>,
}

impl ShardedCatalogManager {
    pub fn new() -> Self {
        Self {
            root_index: RootIndex::new(),
            loaded_shards: HashMap::new(),
            delta_logs: HashMap::new(),
            dirty_shards: Vec::new(),
        }
    }

    pub fn from_root_index(root_index: RootIndex) -> Self {
        Self {
            root_index,
            loaded_shards: HashMap::new(),
            delta_logs: HashMap::new(),
            dirty_shards: Vec::new(),
        }
    }

    pub fn root_index(&self) -> &RootIndex {
        &self.root_index
    }

    pub fn root_index_mut(&mut self) -> &mut RootIndex {
        &mut self.root_index
    }

    pub fn list_shards(&self) -> Vec<&ShardMeta> {
        self.root_index.shards.values().collect()
    }

    pub fn get_shard(&self, shard_id: &str) -> Option<&Shard> {
        self.loaded_shards.get(shard_id)
    }

    pub fn is_shard_loaded(&self, shard_id: &str) -> bool {
        self.loaded_shards.contains_key(shard_id)
    }

    pub fn load_shard(&mut self, shard_id: &str, shard: Shard) {
        self.loaded_shards.insert(shard_id.to_string(), shard);
    }

    pub fn load_shard_with_deltas(
        &mut self,
        shard_id: &str,
        mut shard: Shard,
        deltas: &[DeltaEntry],
    ) {
        if !deltas.is_empty() {
            apply_deltas(&mut shard.root, deltas);
            shard.version = deltas.last().map(|d| d.seq).unwrap_or(shard.version);
        }
        self.loaded_shards.insert(shard_id.to_string(), shard);
    }

    pub fn eager_shard_ids(&self) -> Vec<String> {
        self.root_index
            .eager_shards()
            .iter()
            .map(|s| s.shard_id.clone())
            .collect()
    }

    pub fn mark_dirty(&mut self, shard_id: &str) {
        if !self.dirty_shards.contains(&shard_id.to_string()) {
            self.dirty_shards.push(shard_id.to_string());
        }
    }

    pub fn dirty_shards(&self) -> &[String] {
        &self.dirty_shards
    }

    pub fn clear_dirty(&mut self) {
        self.dirty_shards.clear();
    }

    pub fn add_delta(&mut self, shard_id: &str, entry: DeltaEntry) {
        let log = self
            .delta_logs
            .entry(shard_id.to_string())
            .or_insert_with(|| DeltaLog::new(shard_id));
        log.push(entry);

        if let Some(meta) = self.root_index.get_shard_mut(shard_id) {
            meta.record_delta(log.to_version);
        }

        self.mark_dirty(shard_id);
    }

    pub fn get_delta_log(&self, shard_id: &str) -> Option<&DeltaLog> {
        self.delta_logs.get(shard_id)
    }

    pub fn should_compact(&self, shard_id: &str) -> bool {
        self.delta_logs
            .get(shard_id)
            .map(|log| log.should_compact())
            .unwrap_or(false)
    }

    pub fn compact_shard(&mut self, shard_id: &str) -> Result<()> {
        let shard = self
            .loaded_shards
            .get_mut(shard_id)
            .ok_or_else(|| Error::InvalidPath(format!("Shard not loaded: {}", shard_id)))?;

        shard.compact();

        if let Some(log) = self.delta_logs.get_mut(shard_id) {
            log.clear();
        }

        if let Some(meta) = self.root_index.get_shard_mut(shard_id) {
            meta.clear_deltas();
            meta.update_stats(shard.node_count(), shard.size());
        }

        Ok(())
    }
}

impl Default for ShardedCatalogManager {
    fn default() -> Self {
        Self::new()
    }
}

pub fn split_into_shards(root: &CatalogNode, max_nodes_per_shard: Option<usize>) -> Vec<Shard> {
    let _max_nodes = max_nodes_per_shard.unwrap_or(DEFAULT_SHARD_SIZE);
    let mut shards = Vec::new();

    for child in root.children() {
        let shard_id = child.name.clone();
        let shard = Shard::new(&shard_id, child.clone());
        shards.push(shard);
    }

    shards
}

pub fn create_root_index_from_shards(shards: &[Shard]) -> RootIndex {
    let mut index = RootIndex::new();

    for shard in shards {
        let strategy = if shard.shard_id == PASSMANAGER_SHARD_ID {
            LoadStrategy::Eager
        } else {
            LoadStrategy::Lazy
        };

        let mut meta = ShardMeta::new(&shard.shard_id, strategy);
        meta.update_stats(shard.node_count(), shard.size());
        meta.version = shard.version;
        meta.base_version = shard.base_version;

        index.upsert_shard(meta);
    }

    index
}

pub fn merge_shards_to_catalog(shards: &[Shard]) -> CatalogNode {
    let mut root = CatalogNode::new_root();

    for shard in shards {
        root.add_child(shard.root.clone());
    }

    root
}

#[cfg(test)]
#[path = "sharded_tests.rs"]
mod tests;
