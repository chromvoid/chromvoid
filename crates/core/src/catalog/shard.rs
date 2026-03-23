//! Sharded catalog types
//!
//! Types for sharded catalog architecture (v2):
//! - RootIndex: top-level index with shard metadata
//! - ShardMeta: metadata for each shard
//! - Shard: actual shard data
//! - LoadStrategy: how to load a shard

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use super::CatalogNode;

/// Shard loading strategy
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum LoadStrategy {
    /// Load immediately on vault unlock (e.g., .passmanager)
    Eager,
    /// Load on first access
    Lazy,
    /// Load page by page (for large directories)
    Paginated,
}

impl Default for LoadStrategy {
    fn default() -> Self {
        Self::Lazy
    }
}

/// Metadata for a single shard
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct ShardMeta {
    /// Shard identifier (e.g., ".passmanager", "documents")
    pub shard_id: String,

    /// Context for chunk naming: "shard:{shard_id}"
    pub context: String,

    /// Current version of the shard
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,

    /// Base version (after last compaction)
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub base_version: u64,

    /// Size in bytes (approximate)
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,

    /// Number of nodes in this shard
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_count: u64,

    /// Loading strategy for this shard
    pub strategy: LoadStrategy,

    /// Whether there are unmerged deltas
    pub has_deltas: bool,

    /// Number of pending deltas
    pub delta_count: u32,

    /// Last delta sequence number
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub last_delta_seq: u64,
}

impl ShardMeta {
    /// Create new shard metadata
    pub fn new(shard_id: impl Into<String>, strategy: LoadStrategy) -> Self {
        let shard_id = shard_id.into();
        let context = format!("shard:{}", shard_id);
        Self {
            shard_id,
            context,
            version: 0,
            base_version: 0,
            size: 0,
            node_count: 0,
            strategy,
            has_deltas: false,
            delta_count: 0,
            last_delta_seq: 0,
        }
    }

    /// Create metadata for .passmanager shard (always eager)
    pub fn passmanager() -> Self {
        Self::new(".passmanager", LoadStrategy::Eager)
    }

    /// Update metadata after adding nodes
    pub fn update_stats(&mut self, node_count: u64, size: u64) {
        self.node_count = node_count;
        self.size = size;
    }

    /// Increment version
    pub fn increment_version(&mut self) {
        self.version += 1;
    }

    /// Record a delta
    pub fn record_delta(&mut self, delta_seq: u64) {
        self.delta_count += 1;
        self.last_delta_seq = delta_seq;
        self.has_deltas = true;
        self.version += 1;
    }

    /// Clear delta state after compaction
    pub fn clear_deltas(&mut self) {
        self.delta_count = 0;
        self.has_deltas = false;
        self.base_version = self.version;
    }
}

/// Root index - top-level metadata for sharded catalog
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct RootIndex {
    /// Format version (2 for sharded)
    pub v: u8,

    /// Format type
    pub format: String,

    /// Global version for sync
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub root_version: u64,

    /// Creation timestamp
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,

    /// Shard metadata by shard_id
    pub shards: HashMap<String, ShardMeta>,
}

impl RootIndex {
    /// Create a new root index
    pub fn new() -> Self {
        Self {
            v: 2,
            format: "sharded".to_string(),
            root_version: 0,
            created_at: current_timestamp(),
            shards: HashMap::new(),
        }
    }

    /// Add or update a shard
    pub fn upsert_shard(&mut self, meta: ShardMeta) {
        self.shards.insert(meta.shard_id.clone(), meta);
        self.root_version += 1;
    }

    /// Get shard metadata
    pub fn get_shard(&self, shard_id: &str) -> Option<&ShardMeta> {
        self.shards.get(shard_id)
    }

    /// Get mutable shard metadata
    pub fn get_shard_mut(&mut self, shard_id: &str) -> Option<&mut ShardMeta> {
        self.shards.get_mut(shard_id)
    }

    /// List all shards with eager strategy
    pub fn eager_shards(&self) -> Vec<&ShardMeta> {
        self.shards
            .values()
            .filter(|s| s.strategy == LoadStrategy::Eager)
            .collect()
    }

    /// List all shard IDs
    pub fn shard_ids(&self) -> Vec<&str> {
        self.shards.keys().map(|s| s.as_str()).collect()
    }

    /// Check if this is a v2 (sharded) catalog
    pub fn is_sharded(&self) -> bool {
        self.v == 2 && self.format == "sharded"
    }
}

impl Default for RootIndex {
    fn default() -> Self {
        Self::new()
    }
}

/// A shard containing a subtree of the catalog
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct Shard {
    /// Format version
    pub v: u8,

    /// Shard identifier
    pub shard_id: String,

    /// Current version
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,

    /// Base version (after last compaction)
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub base_version: u64,

    /// Root node of this shard's subtree
    pub root: CatalogNode,
}

impl Shard {
    /// Create a new shard
    pub fn new(shard_id: impl Into<String>, root: CatalogNode) -> Self {
        Self {
            v: 2,
            shard_id: shard_id.into(),
            version: 0,
            base_version: 0,
            root,
        }
    }

    /// Count nodes in this shard
    pub fn node_count(&self) -> u64 {
        self.root.count_nodes() as u64
    }

    /// Calculate approximate size
    pub fn size(&self) -> u64 {
        self.root.total_size()
    }

    /// Increment version
    pub fn increment_version(&mut self) {
        self.version += 1;
    }

    /// Update base version after compaction
    pub fn compact(&mut self) {
        self.base_version = self.version;
    }

    /// Check if there are pending deltas
    pub fn has_pending_deltas(&self) -> bool {
        self.version > self.base_version
    }
}

/// Get current timestamp in milliseconds
fn current_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
#[path = "shard_tests.rs"]
mod tests;
