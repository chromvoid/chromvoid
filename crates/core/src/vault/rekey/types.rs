use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct VaultRekeyRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRekeyProgress {
    pub phase: String,
    pub processed_chunks: u64,
    pub total_chunks: u64,
    pub can_cancel: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRekeyResult {
    pub migrated_chunks: u64,
    pub deleted_old_chunks: u64,
    pub preserved_unknown_chunks: u64,
    pub deleted_derivative_chunks: u64,
    pub duration_ms: u64,
    pub backup_recommended: bool,
}

#[derive(Debug, Clone)]
pub(super) struct ChunkPair {
    pub(super) old_name: String,
    pub(super) new_name: String,
}
