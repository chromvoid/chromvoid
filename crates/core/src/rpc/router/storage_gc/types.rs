use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(in crate::rpc::router) struct StorageGcCandidate {
    pub(in crate::rpc::router) name: String,
    pub(in crate::rpc::router) bytes: u64,
    pub(in crate::rpc::router) sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(in crate::rpc::router) struct StorageGcScanSession {
    pub(in crate::rpc::router) gc_id: String,
    pub(in crate::rpc::router) candidates: Vec<StorageGcCandidate>,
    pub(in crate::rpc::router) total_bytes: u64,
    pub(in crate::rpc::router) created_at_ms: u64,
    pub(in crate::rpc::router) last_accessed_at_ms: u64,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct StorageGcScanOptions {
    pub(super) include_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct StorageGcDeleteManifest {
    pub(super) version: u8,
    pub(super) gc_id: String,
    pub(super) candidates: Vec<StorageGcCandidate>,
}

pub(super) enum StorageGcDeleteManifestRead {
    Missing,
    Valid(StorageGcDeleteManifest),
    Corrupt,
}

#[derive(Debug, Clone)]
pub(super) struct StorageGcDeleteResult {
    pub(super) gc_id: String,
    pub(super) deleted_chunks: Vec<String>,
    pub(super) deleted_bytes: u64,
    pub(super) skipped_chunks: Vec<String>,
}
