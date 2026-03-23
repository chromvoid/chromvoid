//! Sync-related RPC types

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

/// Sync init response (sharded)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct SyncInitResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    pub format: String,
    pub nodes: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct ShardMetaResponse {
    pub shard_id: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_count: u64,
    pub strategy: String,
    pub has_deltas: bool,
    pub loaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct ListShardsResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub root_version: u64,
    pub shards: Vec<ShardMetaResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct LoadShardResponse {
    pub shard_id: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    pub root: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct SyncShardResponse {
    pub shard_id: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub current_version: u64,
    pub deltas: Value,
    pub requires_full_load: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CompactShardResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub new_version: u64,
    pub chunks_written: u32,
}
