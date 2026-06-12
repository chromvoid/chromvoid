use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard};

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

    fn get_entry(
        &self,
        node_id: u64,
        source_revision: u64,
        tier: &str,
        storage_version: u32,
    ) -> Option<DerivativeIndexEntry> {
        self.entries
            .iter()
            .find(|entry| {
                derivative_entry_matches(entry, node_id, source_revision, tier, storage_version)
            })
            .cloned()
    }
}

#[derive(Debug, Default)]
pub(crate) struct DerivativeIndexState {
    state: Mutex<DerivativeIndexCacheState>,
}

#[derive(Debug, Default)]
struct DerivativeIndexCacheState {
    record: Option<DerivativeIndexRecord>,
    touch_dirty: bool,
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

fn derivative_entry_matches(
    entry: &DerivativeIndexEntry,
    node_id: u64,
    source_revision: u64,
    tier: &str,
    storage_version: u32,
) -> bool {
    entry.node_id == node_id
        && entry.source_revision == source_revision
        && entry.tier == tier
        && entry.storage_version == storage_version
}

fn cached_record_mut<'a>(
    state: &'a mut DerivativeIndexCacheState,
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> Result<&'a mut DerivativeIndexRecord> {
    if state.record.is_none() {
        state.record = Some(load_index(storage, vault_key)?);
    }
    Ok(state
        .record
        .as_mut()
        .expect("derivative index record loaded"))
}

fn upsert_entry(record: &mut DerivativeIndexRecord, entry: DerivativeIndexEntry) {
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
}

fn build_derivative_entry(
    record: &DerivativeIndexRecord,
    node_id: u64,
    source_revision: u64,
    tier: String,
    storage_version: u32,
    meta_chunk_name: String,
    part_count: u32,
    total_bytes: u64,
) -> DerivativeIndexEntry {
    let now = now_millis();
    let created_at = record
        .get_entry(node_id, source_revision, &tier, storage_version)
        .map(|entry| entry.created_at)
        .unwrap_or(now);

    DerivativeIndexEntry {
        node_id,
        source_revision,
        tier,
        storage_version,
        meta_chunk_name,
        part_count,
        total_bytes,
        created_at,
        last_accessed_at: now,
    }
}

impl DerivativeIndexState {
    fn lock_state(&self) -> MutexGuard<'_, DerivativeIndexCacheState> {
        match self.state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                tracing::warn!("derivative-index-cache:poisoned_recovered");
                self.state.clear_poison();
                let mut guard = poisoned.into_inner();
                *guard = DerivativeIndexCacheState::default();
                guard
            }
        }
    }

    pub(crate) fn invalidate(&self) {
        *self.lock_state() = DerivativeIndexCacheState::default();
    }

    pub(crate) fn flush(&self, storage: &Storage, vault_key: &[u8; KEY_SIZE]) -> Result<()> {
        let mut state = self.lock_state();
        if !state.touch_dirty {
            return Ok(());
        }

        if let Some(record) = state.record.as_ref() {
            save_index(storage, vault_key, record)?;
        }
        state.touch_dirty = false;
        Ok(())
    }

    pub(crate) fn stats(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
    ) -> Result<DerivativeIndexStats> {
        let mut state = self.lock_state();
        let record = cached_record_mut(&mut state, storage, vault_key)?;
        Ok(record.stats())
    }

    pub(crate) fn get_derivative_entry(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        node_id: u64,
        source_revision: u64,
        tier: &str,
        storage_version: u32,
    ) -> Result<Option<DerivativeIndexEntry>> {
        let mut state = self.lock_state();
        let record = cached_record_mut(&mut state, storage, vault_key)?;
        Ok(record.get_entry(node_id, source_revision, tier, storage_version))
    }

    pub(crate) fn save_derivative_entry(
        &self,
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
        let mut state = self.lock_state();
        let stats = {
            let record = cached_record_mut(&mut state, storage, vault_key)?;
            let entry = build_derivative_entry(
                record,
                node_id,
                source_revision,
                tier,
                storage_version,
                meta_chunk_name,
                part_count,
                total_bytes,
            );
            upsert_entry(record, entry);
            let stats = record.stats();
            save_index(storage, vault_key, record)?;
            stats
        };
        state.touch_dirty = false;
        Ok(stats)
    }

    pub(crate) fn touch_derivative_entry(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        node_id: u64,
        source_revision: u64,
        tier: &str,
        storage_version: u32,
    ) -> Result<bool> {
        let mut state = self.lock_state();
        let record = cached_record_mut(&mut state, storage, vault_key)?;
        let Some(entry) = record.entries.iter_mut().find(|entry| {
            derivative_entry_matches(entry, node_id, source_revision, tier, storage_version)
        }) else {
            return Ok(false);
        };

        entry.last_accessed_at = now_millis();
        state.touch_dirty = true;
        Ok(true)
    }

    pub(crate) fn delete_indexed_derivatives_for_node(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        node_id: u64,
    ) -> Result<DerivativeIndexStats> {
        let mut state = self.lock_state();
        let touch_dirty = state.touch_dirty;
        let (changed, stats) = {
            let record = cached_record_mut(&mut state, storage, vault_key)?;
            let remove_keys = record
                .entries
                .iter()
                .filter(|entry| entry.node_id == node_id)
                .map(DerivativeIndexEntry::key)
                .collect::<HashSet<_>>();
            let removed = remove_entries_by_key(storage, vault_key, record, &remove_keys)?;
            let stats = record.stats();
            if removed || touch_dirty {
                save_index(storage, vault_key, record)?;
            }
            (removed || touch_dirty, stats)
        };
        if changed {
            state.touch_dirty = false;
        }
        Ok(stats)
    }

    pub(crate) fn delete_stale_derivatives_for_node(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        node_id: u64,
        current_source_revision: u64,
    ) -> Result<DerivativeIndexStats> {
        let mut state = self.lock_state();
        let touch_dirty = state.touch_dirty;
        let (changed, stats) = {
            let record = cached_record_mut(&mut state, storage, vault_key)?;
            let remove_keys = record
                .entries
                .iter()
                .filter(|entry| {
                    entry.node_id == node_id && entry.source_revision != current_source_revision
                })
                .map(DerivativeIndexEntry::key)
                .collect::<HashSet<_>>();
            let removed = remove_entries_by_key(storage, vault_key, record, &remove_keys)?;
            let stats = record.stats();
            if removed || touch_dirty {
                save_index(storage, vault_key, record)?;
            }
            (removed || touch_dirty, stats)
        };
        if changed {
            state.touch_dirty = false;
        }
        Ok(stats)
    }

    pub(crate) fn compact_derivatives(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        max_indexed_bytes: u64,
        protected_revisions: &HashMap<u64, u64>,
    ) -> Result<DerivativeIndexStats> {
        let mut state = self.lock_state();
        let touch_dirty = state.touch_dirty;
        let (changed, stats) = {
            let record = cached_record_mut(&mut state, storage, vault_key)?;
            let compacted = compact_record(
                storage,
                vault_key,
                record,
                max_indexed_bytes,
                protected_revisions,
            )?;
            let stats = record.stats();
            if compacted || touch_dirty {
                save_index(storage, vault_key, record)?;
            }
            (compacted || touch_dirty, stats)
        };
        if changed {
            state.touch_dirty = false;
        }
        Ok(stats)
    }
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

#[allow(dead_code)]
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
    let next_entry = build_derivative_entry(
        &record,
        node_id,
        source_revision,
        tier,
        storage_version,
        meta_chunk_name,
        part_count,
        total_bytes,
    );
    upsert_entry(&mut record, next_entry);

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
    Ok(load_index(storage, vault_key)?.get_entry(node_id, source_revision, tier, storage_version))
}

pub(crate) fn put_derivative_entry(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    entry: DerivativeIndexEntry,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    upsert_entry(&mut record, entry);

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

#[allow(dead_code)]
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
        derivative_entry_matches(entry, node_id, source_revision, tier, storage_version)
    }) else {
        return Ok(false);
    };

    entry.last_accessed_at = now_millis();
    save_index(storage, vault_key, &record)?;
    Ok(true)
}

#[allow(dead_code)]
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

fn compact_record(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    record: &mut DerivativeIndexRecord,
    max_indexed_bytes: u64,
    protected_revisions: &HashMap<u64, u64>,
) -> Result<bool> {
    let mut indexed_bytes = record.stats().indexed_bytes;
    if indexed_bytes <= max_indexed_bytes {
        return Ok(false);
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
    let mut removed = remove_entries_by_key(storage, vault_key, record, &remove_keys)?;

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
        removed = remove_entries_by_key(storage, vault_key, record, &remove_keys)? || removed;
    }

    Ok(removed)
}

#[allow(dead_code)]
pub(crate) fn compact_derivatives(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    max_indexed_bytes: u64,
    protected_revisions: &HashMap<u64, u64>,
) -> Result<DerivativeIndexStats> {
    let mut record = load_index(storage, vault_key)?;
    if compact_record(
        storage,
        vault_key,
        &mut record,
        max_indexed_bytes,
        protected_revisions,
    )? {
        save_index(storage, vault_key, &record)?;
    }
    Ok(record.stats())
}
