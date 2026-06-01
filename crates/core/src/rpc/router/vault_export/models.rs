//! Active vault-export session state.

use super::super::session_lifecycle::ExpiringSessionMeta;
use crate::storage::StorageTempArtifact;

/// Active vault-export session holding a temporary tar file.
#[derive(Debug)]
pub(in crate::rpc::router) struct VaultExportSession {
    pub(in crate::rpc::router) id: String,
    pub(in crate::rpc::router) meta: ExpiringSessionMeta,
    pub(in crate::rpc::router) temp_file: StorageTempArtifact,
    pub(in crate::rpc::router) file_size: u64,
    pub(in crate::rpc::router) file_hash: String,
    pub(in crate::rpc::router) file_count: u64,
    pub(in crate::rpc::router) included_otp_secrets: bool,
    pub(in crate::rpc::router) chunk_size: usize,
}
