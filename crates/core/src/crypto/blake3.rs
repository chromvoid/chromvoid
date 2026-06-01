//! BLAKE3 hashing and chunk naming

use crate::types::KEY_SIZE;

/// Hash data using BLAKE3
///
/// # Returns
/// 32-byte hash
pub fn hash(data: &[u8]) -> [u8; KEY_SIZE] {
    *blake3::hash(data).as_bytes()
}

/// Generate a chunk name from vault key, context, and index
///
/// # Formula
/// `chunk_name = hex(BLAKE3(vault_key || context || chunk_index)[:32])`
///
/// # Parameters
/// - `vault_key`: 32-byte vault key
/// - `context`: Context bytes (e.g., "catalog" or node_id as bytes)
/// - `index`: Chunk index (0-based)
///
/// # Returns
/// 64-character hex string
pub fn chunk_name(vault_key: &[u8; KEY_SIZE], context: &[u8], index: u32) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(vault_key);
    hasher.update(context);
    hasher.update(&index.to_le_bytes());

    let hash = hasher.finalize();
    hex::encode(hash.as_bytes())
}

/// Generate a chunk name from vault key, context, and a 64-bit index.
///
/// ADR-003: delta sequence is a u64 and must not truncate.
pub fn chunk_name_u64(vault_key: &[u8; KEY_SIZE], context: &[u8], index: u64) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(vault_key);
    hasher.update(context);
    hasher.update(&index.to_le_bytes());

    let hash = hasher.finalize();
    hex::encode(hash.as_bytes())
}

/// Helper module for hex encoding (no external dependency)
mod hex {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    pub fn encode(data: &[u8]) -> String {
        let mut result = String::with_capacity(data.len() * 2);
        for byte in data {
            result.push(HEX_CHARS[(byte >> 4) as usize] as char);
            result.push(HEX_CHARS[(byte & 0x0F) as usize] as char);
        }
        result
    }
}

/// Context for catalog chunks
pub const CATALOG_CONTEXT: &[u8] = b"catalog";

/// Generate catalog chunk name
pub fn catalog_chunk_name(vault_key: &[u8; KEY_SIZE], index: u32) -> String {
    chunk_name(vault_key, CATALOG_CONTEXT, index)
}

pub const BLOB_CONTEXT: &[u8] = b"blob";

pub fn blob_chunk_idx(node_id: u32, part_index: u32) -> u64 {
    ((node_id as u64) << 32) | (part_index as u64)
}

pub fn blob_chunk_name(vault_key: &[u8; KEY_SIZE], node_id: u32, part_index: u32) -> String {
    let chunk_idx = blob_chunk_idx(node_id, part_index);
    chunk_name_u64(vault_key, BLOB_CONTEXT, chunk_idx)
}

pub const ROOT_INDEX_CONTEXT: &[u8] = b"catalog:root";
pub const CATALOG_COMMIT_CONTEXT: &[u8] = b"catalog:commit";

pub fn root_index_chunk_name(vault_key: &[u8; KEY_SIZE], index: u32) -> String {
    chunk_name(vault_key, ROOT_INDEX_CONTEXT, index)
}

pub fn catalog_commit_chunk_name(vault_key: &[u8; KEY_SIZE]) -> String {
    chunk_name(vault_key, CATALOG_COMMIT_CONTEXT, 0)
}

pub fn shard_chunk_name(vault_key: &[u8; KEY_SIZE], shard_id: &str, index: u32) -> String {
    let context = format!("shard:{}", shard_id);
    chunk_name(vault_key, context.as_bytes(), index)
}

pub fn shard_snapshot_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    shard_id: &str,
    snapshot_seq: u64,
) -> String {
    if snapshot_seq == 0 {
        return shard_chunk_name(vault_key, shard_id, 0);
    }

    let context = format!("shard:{}", shard_id);
    chunk_name_u64(vault_key, context.as_bytes(), snapshot_seq)
}

pub fn delta_chunk_name(vault_key: &[u8; KEY_SIZE], shard_id: &str, sequence: u64) -> String {
    // ADR-003: context is "delta:{shard_id}" and the sequence is the chunk index.
    let context = format!("delta:{}", shard_id);
    chunk_name_u64(vault_key, context.as_bytes(), sequence)
}

pub const OTP_CONTEXT: &[u8] = b"otp";

pub fn otp_chunk_name(vault_key: &[u8; KEY_SIZE], node_id: u64) -> String {
    let context = [OTP_CONTEXT, &node_id.to_le_bytes()].concat();
    chunk_name(vault_key, &context, 0)
}

pub fn derivative_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    source_version: u64,
    tier: &str,
    version: u32,
    part_index: u32,
) -> String {
    let context = format!("derivative:{node_id}:{source_version}:{tier}:{version}");
    chunk_name(vault_key, context.as_bytes(), part_index)
}

pub fn derivative_meta_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    source_version: u64,
    tier: &str,
    version: u32,
) -> String {
    let context = format!("derivative-meta:{node_id}:{source_version}:{tier}:{version}");
    chunk_name(vault_key, context.as_bytes(), 0)
}

pub const DERIVATIVE_INDEX_CONTEXT: &[u8] = b"derivative-index";
pub const DERIVATIVE_WRITE_TX_CONTEXT: &[u8] = b"derivative-write-tx";

pub fn derivative_index_chunk_name(vault_key: &[u8; KEY_SIZE]) -> String {
    chunk_name(vault_key, DERIVATIVE_INDEX_CONTEXT, 0)
}

pub fn derivative_write_tx_marker_name(vault_key: &[u8; KEY_SIZE]) -> String {
    chunk_name(vault_key, DERIVATIVE_WRITE_TX_CONTEXT, 0)
}

#[cfg(test)]
#[path = "blake3_tests.rs"]
mod tests;
