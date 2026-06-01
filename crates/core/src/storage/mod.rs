//! Flat chunk-based storage
//!
//! This module implements the storage layer with:
//! - Flat directory structure: `chunks/{name[0]}/{name[1:3]}/{name}`
//! - Salt file management
//! - Chunk read/write/delete operations

mod backend;
mod chunk;
mod flat;
mod format;

pub(crate) use backend::{StorageArtifact, StorageErasePreview, StorageTempNamespace};
pub use chunk::EncryptedChunk;
pub use flat::Storage;
pub(crate) use flat::StorageTempArtifact;
pub use format::FormatVersionFile;

#[cfg(any(test, debug_assertions))]
pub mod test_util {
    pub use super::backend::fault::{FaultHandle, FaultRule, StorageOperation};

    use super::Storage;
    use crate::error::Result;

    pub fn fault_injecting_storage(
        base_path: impl AsRef<std::path::Path>,
        rule: Option<FaultRule>,
    ) -> Result<(Storage, FaultHandle)> {
        Storage::fault_injecting_for_tests(base_path, rule)
    }
}
