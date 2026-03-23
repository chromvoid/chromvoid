//! Flat chunk-based storage
//!
//! This module implements the storage layer with:
//! - Flat directory structure: `chunks/{name[0]}/{name[1:3]}/{name}`
//! - Salt file management
//! - Chunk read/write/delete operations

mod chunk;
mod flat;
mod format;

pub use chunk::EncryptedChunk;
pub use flat::Storage;
pub use format::FormatVersionFile;
