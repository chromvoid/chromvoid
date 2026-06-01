use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct DerivativeIndexEntry {
    pub(crate) node_id: u64,
    pub(crate) source_revision: u64,
    pub(crate) tier: String,
    pub(crate) storage_version: u32,
    pub(crate) meta_chunk_name: String,
    pub(crate) part_count: u32,
    pub(crate) total_bytes: u64,
    pub(crate) created_at: u64,
    pub(crate) last_accessed_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct DerivativeIndexRecord {
    #[serde(default)]
    entries: Vec<DerivativeIndexEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DerivativeIndexStats {
    pub(crate) indexed_count: usize,
    pub(crate) indexed_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct DerivativeEntryKey {
    node_id: u64,
    source_revision: u64,
    tier: String,
    storage_version: u32,
}

impl DerivativeIndexEntry {
    fn key(&self) -> DerivativeEntryKey {
        DerivativeEntryKey {
            node_id: self.node_id,
            source_revision: self.source_revision,
            tier: self.tier.clone(),
            storage_version: self.storage_version,
        }
    }
}

impl DerivativeIndexRecord {
    fn stats(&self) -> DerivativeIndexStats {
        DerivativeIndexStats {
            indexed_count: self.entries.len(),
            indexed_bytes: self
                .entries
                .iter()
                .fold(0u64, |sum, entry| sum.saturating_add(entry.total_bytes)),
        }
    }
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn index_chunk_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::derivative_index_chunk_name(vault_key)
}

fn load_index(storage: &Storage, vault_key: &[u8; KEY_SIZE]) -> Result<DerivativeIndexRecord> {
    let chunk_name = index_chunk_name(vault_key);
    let encrypted = match storage.read_chunk(&chunk_name) {
        Ok(encrypted) => encrypted,
        Err(Error::ChunkNotFound(_)) => return Ok(DerivativeIndexRecord::default()),
        Err(error) => return Err(error),
    };
    let decrypted = crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes())?;
    serde_json::from_slice(&decrypted)
        .map_err(|error| Error::InvalidDataFormat(format!("invalid derivative index: {error}")))
}

fn save_index(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    record: &DerivativeIndexRecord,
) -> Result<()> {
    let chunk_name = index_chunk_name(vault_key);
    if record.entries.is_empty() {
        storage.delete_chunk(&chunk_name)?;
        storage.sync()?;
        return Ok(());
    }

    let serialized = serde_json::to_vec(record)
        .map_err(|error| Error::InvalidDataFormat(format!("invalid derivative index: {error}")))?;
    let encrypted = crate::crypto::encrypt(&serialized, vault_key, chunk_name.as_bytes())?;
    storage.write_chunk_atomic(&chunk_name, &encrypted)?;
    storage.sync()?;
    Ok(())
}

fn delete_entry_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    entry: &DerivativeIndexEntry,
) -> Result<()> {
    storage.delete_chunk(&entry.meta_chunk_name)?;

    for part_index in 0..entry.part_count {
        let chunk_name = crate::crypto::derivative_chunk_name(
            vault_key,
            entry.node_id,
            entry.source_revision,
            &entry.tier,
            entry.storage_version,
            part_index,
        );
        storage.delete_chunk(&chunk_name)?;
    }

    Ok(())
}

fn remove_entries_by_key(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    record: &mut DerivativeIndexRecord,
    remove_keys: &HashSet<DerivativeEntryKey>,
) -> Result<bool> {
    if remove_keys.is_empty() {
        return Ok(false);
    }

    let mut removed = false;
    let mut retained = Vec::with_capacity(record.entries.len());
    for entry in record.entries.drain(..) {
        if remove_keys.contains(&entry.key()) {
            delete_entry_chunks(storage, vault_key, &entry)?;
            removed = true;
        } else {
            retained.push(entry);
        }
    }
    record.entries = retained;
    Ok(removed)
}

pub(crate) fn stats(storage: &Storage, vault_key: &[u8; KEY_SIZE]) -> Result<DerivativeIndexStats> {
    Ok(load_index(storage, vault_key)?.stats())
}

pub(crate) fn live_derivative_chunk_names(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> Result<HashSet<String>> {
    let mut live = HashSet::new();
    let index_name = index_chunk_name(vault_key);
    if storage.chunk_exists(&index_name)? {
        live.insert(index_name);
    }
    let record = load_index(storage, vault_key)?;
    for entry in record.entries {
        live.insert(entry.meta_chunk_name.clone());
        for part_index in 0..entry.part_count {
            live.insert(crate::crypto::derivative_chunk_name(
                vault_key,
                entry.node_id,
                entry.source_revision,
                &entry.tier,
                entry.storage_version,
                part_index,
            ));
        }
    }
    let derivative_tx_name = crate::crypto::derivative_write_tx_marker_name(vault_key);
    if storage.chunk_exists(&derivative_tx_name)? {
        live.insert(derivative_tx_name);
    }
    Ok(live)
}

pub(crate) fn upsert_derivative_entry(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    source_revision: u64,
    tier: String,
    storage_version: u32,
    meta_chunk_name: String,
    part_count: u32,
    total_bytes: u64,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    let now = now_millis();

    let mut next_entry = DerivativeIndexEntry {
        node_id,
        source_revision,
        tier,
        storage_version,
        meta_chunk_name,
        part_count,
        total_bytes,
        created_at: now,
        last_accessed_at: now,
    };
    let key = next_entry.key();

    if let Some(existing) = record.entries.iter_mut().find(|entry| entry.key() == key) {
        next_entry.created_at = existing.created_at;
        *existing = next_entry;
    } else {
        record.entries.push(next_entry);
    }

    save_index(storage, vault_key, &record)?;
    Ok(record.stats())
}

pub(crate) fn save_derivative_entry(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    source_revision: u64,
    tier: String,
    storage_version: u32,
    meta_chunk_name: String,
    part_count: u32,
    total_bytes: u64,
) -> Result<DerivativeIndexStats> {
    upsert_derivative_entry(
        storage,
        vault_key,
        node_id,
        source_revision,
        tier,
        storage_version,
        meta_chunk_name,
        part_count,
        total_bytes,
    )
}

pub(crate) fn get_derivative_entry(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    source_revision: u64,
    tier: &str,
    storage_version: u32,
) -> Result<Option<DerivativeIndexEntry>> {
    Ok(load_index(storage, vault_key)?
        .entries
        .into_iter()
        .find(|entry| {
            entry.node_id == node_id
                && entry.source_revision == source_revision
                && entry.tier == tier
                && entry.storage_version == storage_version
        }))
}

pub(crate) fn put_derivative_entry(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    entry: DerivativeIndexEntry,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    let key = entry.key();

    if let Some(existing) = record
        .entries
        .iter_mut()
        .find(|candidate| candidate.key() == key)
    {
        *existing = entry;
    } else {
        record.entries.push(entry);
    }

    save_index(storage, vault_key, &record)?;
    Ok(record.stats())
}

pub(crate) fn remove_derivative_entry(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    source_revision: u64,
    tier: &str,
    storage_version: u32,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    let before = record.entries.len();
    record.entries.retain(|entry| {
        !(entry.node_id == node_id
            && entry.source_revision == source_revision
            && entry.tier == tier
            && entry.storage_version == storage_version)
    });

    if record.entries.len() != before {
        save_index(storage, vault_key, &record)?;
    }
    Ok(record.stats())
}

pub(crate) fn touch_derivative_entry(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    source_revision: u64,
    tier: &str,
    storage_version: u32,
) -> Result<bool> {
    let mut record = load_index(storage, vault_key)?;
    let Some(entry) = record.entries.iter_mut().find(|entry| {
        entry.node_id == node_id
            && entry.source_revision == source_revision
            && entry.tier == tier
            && entry.storage_version == storage_version
    }) else {
        return Ok(false);
    };

    entry.last_accessed_at = now_millis();
    save_index(storage, vault_key, &record)?;
    Ok(true)
}

pub(crate) fn delete_indexed_derivatives_for_node(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    let remove_keys = record
        .entries
        .iter()
        .filter(|entry| entry.node_id == node_id)
        .map(DerivativeIndexEntry::key)
        .collect::<HashSet<_>>();

    if remove_entries_by_key(storage, vault_key, &mut record, &remove_keys)? {
        save_index(storage, vault_key, &record)?;
    }

    Ok(record.stats())
}

pub(crate) fn delete_stale_derivatives_for_node(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    current_source_revision: u64,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    let remove_keys = record
        .entries
        .iter()
        .filter(|entry| {
            entry.node_id == node_id && entry.source_revision != current_source_revision
        })
        .map(DerivativeIndexEntry::key)
        .collect::<HashSet<_>>();

    if remove_entries_by_key(storage, vault_key, &mut record, &remove_keys)? {
        save_index(storage, vault_key, &record)?;
    }

    Ok(record.stats())
}

fn is_protected(entry: &DerivativeIndexEntry, protected_revisions: &HashMap<u64, u64>) -> bool {
    protected_revisions
        .get(&entry.node_id)
        .is_some_and(|revision| *revision == entry.source_revision)
}

pub(crate) fn compact_derivatives(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    max_indexed_bytes: u64,
    protected_revisions: &HashMap<u64, u64>,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    let mut indexed_bytes = record.stats().indexed_bytes;
    if indexed_bytes <= max_indexed_bytes {
        return Ok(record.stats());
    }

    let mut stale_candidates = record
        .entries
        .iter()
        .filter(|entry| {
            protected_revisions
                .get(&entry.node_id)
                .is_some_and(|revision| *revision != entry.source_revision)
        })
        .cloned()
        .collect::<Vec<_>>();
    stale_candidates.sort_by_key(|entry| (entry.last_accessed_at, entry.created_at));

    let mut remove_keys = HashSet::new();
    for entry in stale_candidates {
        if indexed_bytes <= max_indexed_bytes {
            break;
        }
        indexed_bytes = indexed_bytes.saturating_sub(entry.total_bytes);
        remove_keys.insert(entry.key());
    }
    remove_entries_by_key(storage, vault_key, &mut record, &remove_keys)?;

    if indexed_bytes > max_indexed_bytes {
        let mut lru_candidates = record
            .entries
            .iter()
            .filter(|entry| !is_protected(entry, protected_revisions))
            .cloned()
            .collect::<Vec<_>>();
        lru_candidates.sort_by_key(|entry| (entry.last_accessed_at, entry.created_at));

        let mut remove_keys = HashSet::new();
        for entry in lru_candidates {
            if indexed_bytes <= max_indexed_bytes {
                break;
            }
            indexed_bytes = indexed_bytes.saturating_sub(entry.total_bytes);
            remove_keys.insert(entry.key());
        }
        remove_entries_by_key(storage, vault_key, &mut record, &remove_keys)?;
    }

    save_index(storage, vault_key, &record)?;
    Ok(record.stats())
}
