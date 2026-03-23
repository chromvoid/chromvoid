//! Shared types for ChromVoid Core

use serde_repr::{Deserialize_repr, Serialize_repr};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

/// Node type in the catalog
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Deserialize_repr)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[repr(u8)]
pub enum NodeType {
    /// Directory/folder
    Dir = 0,
    /// Regular file
    File = 1,
    /// Symbolic link
    Symlink = 2,
}

impl Default for NodeType {
    fn default() -> Self {
        Self::Dir
    }
}

impl From<u8> for NodeType {
    fn from(value: u8) -> Self {
        match value {
            0 => Self::Dir,
            1 => Self::File,
            2 => Self::Symlink,
            _ => Self::Dir,
        }
    }
}

/// Default chunk size (16 KB)
pub const DEFAULT_CHUNK_SIZE: u32 = 16 * 1024;

/// Size of encryption nonce (12 bytes for ChaCha20-Poly1305)
pub const NONCE_SIZE: usize = 12;

/// Size of authentication tag (16 bytes for Poly1305)
pub const TAG_SIZE: usize = 16;

/// Size of derived keys (256 bits)
pub const KEY_SIZE: usize = 32;

/// Size of salt (128 bits)
pub const SALT_SIZE: usize = 16;

/// Argon2id parameters
pub mod argon2_params {
    // ADR-002: separate parameter sets for Desktop vs Mobile.

    /// Memory cost in KiB.
    #[cfg(any(target_os = "ios", target_os = "android"))]
    pub const MEMORY_COST: u32 = 64 * 1024; // 64 MiB
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    pub const MEMORY_COST: u32 = 256 * 1024; // 256 MiB

    /// Number of iterations.
    #[cfg(any(target_os = "ios", target_os = "android"))]
    pub const TIME_COST: u32 = 3;
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    pub const TIME_COST: u32 = 4;

    /// Degree of parallelism.
    #[cfg(any(target_os = "ios", target_os = "android"))]
    pub const PARALLELISM: u32 = 3;
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    pub const PARALLELISM: u32 = 4;
}
