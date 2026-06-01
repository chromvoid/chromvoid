//! Vault management with Plausible Deniability
//!
//! This module implements:
//! - Vault unlock/lock operations
//! - Plausible Deniability (any password opens "some" vault)
//! - Session management

pub(crate) mod catalog_persistence;
pub(crate) mod decrypted_chunk_cache;
mod loading;
mod rekey;
mod session;

pub(crate) use decrypted_chunk_cache::{DecryptedChunkCache, DecryptedChunkCacheKey};
pub use rekey::{VaultRekeyProgress, VaultRekeyRequest, VaultRekeyResult};
pub use session::{Vault, VaultSession};
