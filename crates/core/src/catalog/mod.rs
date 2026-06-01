//! Catalog management
//!
//! This module provides:
//! - CatalogNode: represents files and directories
//! - CatalogManager: CRUD operations on the catalog
//! - Serialization to/from JSON
//! - Sharded catalog support (v2)

pub mod delta;
mod manager;
mod node;
mod path;
mod serialize;
pub mod shard;
pub mod sharded;
pub mod system_shard;
mod traversal;

pub use manager::CatalogManager;
pub use node::{CatalogMediaInfo, CatalogMediaKind, CatalogNode};
pub use serialize::{deserialize_catalog, serialize_catalog};

pub use delta::{
    apply_delta, apply_deltas, DeltaEntry, DeltaLog, DeltaOp, PartialNode, MAX_DELTAS,
    MAX_DELTA_SIZE,
};
pub use shard::{LoadStrategy, RootIndex, Shard, ShardMeta};
pub use sharded::{
    create_root_index_from_shards, merge_shards_to_catalog, split_into_shards,
    ShardedCatalogManager,
};
pub use system_shard::{
    eager_system_shard_ids, is_eager_system_shard_id, is_system_path, is_system_shard_id,
    shard_id_from_path, PASSKEYS_SHARD_ID, PASSMANAGER_SHARD_ID, WALLET_SHARD_ID,
};
