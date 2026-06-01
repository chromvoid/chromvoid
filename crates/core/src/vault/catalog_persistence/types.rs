use serde::{Deserialize, Serialize};

use crate::catalog::{CatalogManager, RootIndex};
use crate::durable_tx::DurableTxPhase;

#[derive(Debug)]
pub(in crate::vault) struct CatalogLoadOutcome {
    pub(in crate::vault) catalog: CatalogManager,
    pub(in crate::vault) kind: CatalogLoadKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::vault) enum CatalogLoadKind {
    LoadedSharded,
    NoCatalog,
}

#[derive(Debug)]
pub(in crate::vault) struct CatalogSaveOutcome {
    pub(in crate::vault) root_version: u64,
    pub(in crate::vault) shard_count: usize,
}

#[derive(Debug)]
pub(crate) struct PreparedShardCompaction {
    pub(crate) new_chunks: Vec<String>,
    pub(crate) old_chunks: Vec<String>,
    pub(crate) new_version: u64,
    pub(crate) chunks_written: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CatalogCommitRecord {
    pub(crate) v: u8,
    pub(crate) id: String,
    pub(crate) phase: DurableTxPhase,
    pub(crate) root_version: u64,
    pub(crate) new_chunks: Vec<String>,
    pub(crate) old_chunks: Vec<String>,
    pub(crate) root_index: RootIndex,
}
