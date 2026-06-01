//! Internal types for the local-restore commit pipeline.

use std::collections::HashSet;

pub(in crate::rpc::router::restore::local) struct RestoreCommitState {
    pub(in crate::rpc::router::restore::local) restored_chunks: u64,
    pub(in crate::rpc::router::restore::local) total_chunks: Option<u64>,
    pub(in crate::rpc::router::restore::local) chunk_names: HashSet<String>,
}

pub(in crate::rpc::router::restore::local) struct PortableMasterMaterial {
    pub(in crate::rpc::router::restore::local) master_salt: [u8; 16],
    pub(in crate::rpc::router::restore::local) master_verify: [u8; 32],
}

pub(in crate::rpc::router::restore::local) struct RestoreMetadata {
    pub(in crate::rpc::router::restore::local) vault_salt: Vec<u8>,
    pub(in crate::rpc::router::restore::local) pepper_wrapped: Vec<u8>,
    pub(in crate::rpc::router::restore::local) storage_format_v: u64,
}
