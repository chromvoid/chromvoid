use serde::{Deserialize, Serialize};

use crate::catalog::CatalogNode;

pub(super) const DOMAIN_UOW_TX_VERSION: u8 = 1;
pub(super) const DOMAIN_UOW_TX_KIND: &str = "domain-uow";
pub(super) const DOMAIN_UOW_TX_MARKER_CONTEXT: &[u8] = b"domain-uow-tx:v1";

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct DomainCommitOutcome {
    pub(super) chunks_written: usize,
}

impl DomainCommitOutcome {
    pub(in crate::rpc::router) fn chunks_written(&self) -> usize {
        self.chunks_written
    }
}

#[derive(Debug, Clone)]
pub(super) struct StagedBlobWrite {
    pub(super) canonical_name: String,
    pub(super) encrypted: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct DomainChunkBackup {
    pub(super) canonical_name: String,
    pub(super) backup_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct DomainUnitOfWorkPayload {
    pub(super) version: u8,
    pub(super) domain_id: String,
    pub(super) domain_path: String,
    pub(super) tx_id: String,
    pub(super) old_domain_root: Option<CatalogNode>,
    pub(super) new_domain_root: Option<CatalogNode>,
    pub(super) new_chunk_names: Vec<String>,
    pub(super) backups: Vec<DomainChunkBackup>,
}

pub(super) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(super) fn operation_id() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}
