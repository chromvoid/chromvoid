use serde::{Deserialize, Serialize};

use crate::rpc::derivative_index::DerivativeIndexEntry;
use crate::storage::Storage;

#[derive(Clone)]
pub struct DerivativeWriteIntent {
    pub node_id: u64,
    pub source_version: u64,
    pub tier: String,
    pub version: u32,
    pub size: u64,
    pub name: String,
    pub mime_type: String,
    pub file_extension: String,
    pub chunk_size: u32,
}

pub type CatalogDerivativeWriteRequest = DerivativeWriteIntent;

#[derive(Clone)]
pub struct DerivativeWriteSnapshot {
    pub storage: Storage,
    pub vault_key: [u8; crate::types::KEY_SIZE],
    pub node_id: u64,
    pub source_version: u64,
    pub tier: String,
    pub version: u32,
    pub size: u64,
    pub name: String,
    pub mime_type: String,
    pub file_extension: String,
    pub chunk_size: u32,
}

pub type CatalogDerivativeWriteSnapshot = DerivativeWriteSnapshot;

pub struct DerivativeWriteResult {
    pub part_count: u32,
    pub chunk_names: Vec<String>,
}

pub type CatalogDerivativeWriteResult = DerivativeWriteResult;

#[derive(Debug)]
pub struct DerivativeWriteError {
    pub message: String,
    pub cancelled: bool,
}

pub type CatalogDerivativeWriteError = DerivativeWriteError;

#[derive(Debug)]
pub(crate) struct DerivativeCommitError {
    pub(crate) message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct DerivativeStreamMetaRecord {
    pub(crate) name: String,
    pub(crate) mime_type: String,
    pub(crate) size: u64,
    pub(crate) chunk_size: u32,
    pub(crate) file_extension: String,
}

pub(crate) struct ValidatedDerivativeRead {
    pub(crate) meta: DerivativeStreamMetaRecord,
    pub(crate) entry: DerivativeIndexEntry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct DerivativeBackupChunk {
    pub(super) original_name: String,
    pub(super) backup_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct DerivativeWriteTxPayload {
    pub(super) node_id: u64,
    pub(super) source_revision: u64,
    pub(super) tier: String,
    pub(super) version: u32,
    pub(super) old_entry: Option<DerivativeIndexEntry>,
    pub(super) backup_chunks: Vec<DerivativeBackupChunk>,
    pub(super) new_chunk_names: Vec<String>,
    pub(super) new_meta_chunk_name: String,
    pub(super) stale_tail_names: Vec<String>,
}

pub(crate) struct DerivativeStore;
