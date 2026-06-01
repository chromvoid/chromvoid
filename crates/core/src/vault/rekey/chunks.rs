use std::collections::BTreeSet;

use crate::crypto::{decrypt, encrypt};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::types::ChunkPair;

pub(super) fn copy_chunk(
    storage: &Storage,
    old_key: &[u8; KEY_SIZE],
    new_key: &[u8; KEY_SIZE],
    pair: &ChunkPair,
) -> Result<()> {
    let encrypted = storage.read_chunk(&pair.old_name)?;
    let plain = decrypt(&encrypted, old_key, pair.old_name.as_bytes())?;
    let next = encrypt(&plain, new_key, pair.new_name.as_bytes())?;
    storage.write_chunk_atomic(&pair.new_name, &next)
}

pub(super) fn rollback_staged_chunks(storage: &Storage, chunk_names: &[String]) {
    for name in chunk_names {
        let _ = storage.delete_chunk(name);
    }
}

pub(super) fn delete_chunks(storage: &Storage, chunk_names: &[String]) -> Result<u64> {
    let mut deleted = 0u64;
    for name in unique(chunk_names.to_vec()) {
        if storage.chunk_exists(&name)? {
            storage.delete_chunk(&name)?;
            deleted = deleted.saturating_add(1);
        }
    }
    Ok(deleted)
}

pub(super) fn unique(names: Vec<String>) -> Vec<String> {
    names
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
