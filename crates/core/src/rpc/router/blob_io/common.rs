use serde::{Deserialize, Serialize};

use crate::catalog::CatalogMediaInfo;

pub(super) const BLOB_WRITE_TX_VERSION: u8 = 1;
pub(super) const BLOB_WRITE_TX_KIND: &str = "blob-write";
pub(super) const BLOB_WRITE_TX_MARKER_CONTEXT: &[u8] = b"blob-write-tx:v1";
pub(super) const BLOB_ERASE_TX_VERSION: u8 = 1;
pub(super) const BLOB_ERASE_TX_KIND: &str = "blob-erase";
pub(super) const BLOB_ERASE_TX_MARKER_CONTEXT: &[u8] = b"blob-erase-tx:v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg(test)]
pub(in crate::rpc::router) struct BlobWriteOutcome {
    pub(in crate::rpc::router) node_id: u64,
    pub(in crate::rpc::router) size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct BlobWriteTransaction {
    pub(super) version: u8,
    pub(super) node_id: u64,
    pub(super) canonical_name: String,
    pub(super) backup_name: Option<String>,
    pub(super) old_size: u64,
    pub(super) old_modtime: u64,
    pub(super) old_source_revision: u64,
    pub(super) old_media_info: Option<CatalogMediaInfo>,
    pub(super) old_media_inspected_revision: u64,
    pub(super) new_size: u64,
    pub(super) new_modtime: u64,
    pub(super) new_source_revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct BlobEraseBackup {
    pub(super) canonical_name: String,
    pub(super) backup_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct BlobEraseTransaction {
    pub(super) version: u8,
    pub(super) node_id: u64,
    pub(super) canonical_names: Vec<String>,
    pub(super) backups: Vec<BlobEraseBackup>,
    pub(super) old_size: u64,
    pub(super) old_modtime: u64,
    pub(super) old_source_revision: u64,
    pub(super) old_media_info: Option<CatalogMediaInfo>,
    pub(super) old_media_inspected_revision: u64,
    pub(super) new_size: u64,
    pub(super) new_modtime: u64,
    pub(super) new_source_revision: u64,
}

pub(super) fn restore_catalog_node(
    session: &mut crate::vault::VaultSession,
    old_node: &crate::catalog::CatalogNode,
) {
    if let Some(node) = session.catalog_mut().find_by_id_mut(old_node.node_id) {
        *node = old_node.clone();
    }
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
