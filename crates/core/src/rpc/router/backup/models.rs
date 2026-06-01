//! Active local-backup session state.

use super::super::backup_pack::BackupChunkManifest;
use super::super::session_lifecycle::ExpiringSessionMeta;
use crate::storage::StorageTempArtifact;

#[derive(Clone, Debug)]
pub(in crate::rpc::router) struct BackupLocalMetadata {
    pub(in crate::rpc::router) metadata: String,
    pub(in crate::rpc::router) master_salt: String,
    pub(in crate::rpc::router) master_verify: String,
}

/// Active local-backup session state.
#[derive(Debug)]
pub(in crate::rpc::router) struct BackupLocalSession {
    pub(in crate::rpc::router) id: String,
    pub(in crate::rpc::router) manifest: BackupChunkManifest,
    pub(in crate::rpc::router) chunk_offsets: Vec<u64>,
    pub(in crate::rpc::router) pack_file: StorageTempArtifact,
    pub(in crate::rpc::router) metadata: Option<BackupLocalMetadata>,
    pub(in crate::rpc::router) meta: ExpiringSessionMeta,
}
