//! Cryptographic primitives for ChromVoid
//!
//! This module provides:
//! - Key derivation (Argon2id)
//! - Encryption/decryption (ChaCha20-Poly1305)
//! - Hashing and chunk naming (BLAKE3)

mod argon2;
mod blake3;
mod chacha;
mod derive_vault_key;
pub mod keystore;
mod sha256;
mod storage_pepper;

pub use self::argon2::derive_vault_key;
pub use self::blake3::{
    blob_chunk_idx, blob_chunk_name, catalog_chunk_name, chunk_name, chunk_name_u64,
    delta_chunk_name, hash, otp_chunk_name, root_index_chunk_name, shard_chunk_name,
};
pub use self::chacha::{decrypt, encrypt};
pub use self::derive_vault_key::derive_vault_key_v2;

pub use self::sha256::{sha256_hex, sha256_hex_reader};

pub use self::storage_pepper::{StoragePepper, StoragePepperError, STORAGE_PEPPER_AAD};
