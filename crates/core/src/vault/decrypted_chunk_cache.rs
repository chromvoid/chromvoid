use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use zeroize::Zeroizing;

#[cfg(target_os = "android")]
const DEFAULT_MAX_BYTES: usize = 4 * 1024 * 1024;
#[cfg(not(target_os = "android"))]
const DEFAULT_MAX_BYTES: usize = 8 * 1024 * 1024;

#[cfg(target_os = "android")]
const DEFAULT_MAX_ENTRIES: usize = 64;
#[cfg(not(target_os = "android"))]
const DEFAULT_MAX_ENTRIES: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DecryptedChunkCacheKey {
    pub node_id: u64,
    pub source_revision: u64,
    pub chunk_index: u64,
    pub chunk_size: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecryptedChunkCacheStats {
    pub entries: usize,
    pub bytes: usize,
    pub max_entries: usize,
    pub max_bytes: usize,
    pub generation: u64,
    pub hits: u64,
    pub misses: u64,
    pub inserts: u64,
    pub evictions: u64,
}

struct CacheEntry {
    plaintext: Zeroizing<Vec<u8>>,
    last_access: u64,
}

#[derive(Default)]
struct CacheState {
    entries: HashMap<DecryptedChunkCacheKey, CacheEntry>,
    bytes: usize,
    generation: u64,
    access_counter: u64,
    hits: u64,
    misses: u64,
    inserts: u64,
    evictions: u64,
}

pub struct DecryptedChunkCache {
    max_bytes: usize,
    max_entries: usize,
    state: Mutex<CacheState>,
}

impl DecryptedChunkCache {
    pub fn new_default() -> Self {
        Self::new(DEFAULT_MAX_BYTES, DEFAULT_MAX_ENTRIES)
    }

    pub fn new(max_bytes: usize, max_entries: usize) -> Self {
        Self {
            max_bytes,
            max_entries,
            state: Mutex::new(CacheState::default()),
        }
    }

    pub fn generation(&self) -> u64 {
        self.lock_state().generation
    }

    pub fn get(&self, key: &DecryptedChunkCacheKey) -> Option<Zeroizing<Vec<u8>>> {
        if key.source_revision == 0 || self.max_bytes == 0 || self.max_entries == 0 {
            return None;
        }

        let mut state = self.lock_state();
        state.access_counter = state.access_counter.saturating_add(1);
        let access = state.access_counter;
        let generation = state.generation;
        let cache_bytes = state.bytes;
        let entries = state.entries.len();

        let Some(entry) = state.entries.get_mut(key) else {
            state.misses = state.misses.saturating_add(1);
            tracing::debug!(
                "decrypted-chunk-cache:miss node_id={} source_revision={} chunk_index={} chunk_bytes={} cache_bytes={} entries={} generation={}",
                key.node_id,
                key.source_revision,
                key.chunk_index,
                key.chunk_size,
                cache_bytes,
                entries,
                generation
            );
            return None;
        };

        entry.last_access = access;
        let plaintext = entry.plaintext.clone();
        state.hits = state.hits.saturating_add(1);
        tracing::debug!(
            "decrypted-chunk-cache:hit node_id={} source_revision={} chunk_index={} chunk_bytes={} cache_bytes={} entries={} generation={}",
            key.node_id,
            key.source_revision,
            key.chunk_index,
            key.chunk_size,
            cache_bytes,
            entries,
            generation
        );
        Some(plaintext)
    }

    pub fn insert(&self, generation: u64, key: DecryptedChunkCacheKey, plaintext: &[u8]) {
        if key.source_revision == 0
            || self.max_bytes == 0
            || self.max_entries == 0
            || plaintext.is_empty()
            || plaintext.len() > self.max_bytes
        {
            return;
        }

        let mut state = self.lock_state();
        if state.generation != generation {
            tracing::debug!(
                "decrypted-chunk-cache:insert_stale node_id={} source_revision={} chunk_index={} chunk_bytes={} cache_bytes={} entries={} generation={}",
                key.node_id,
                key.source_revision,
                key.chunk_index,
                key.chunk_size,
                state.bytes,
                state.entries.len(),
                state.generation
            );
            return;
        }

        state.access_counter = state.access_counter.saturating_add(1);
        let access = state.access_counter;
        if let Some(previous) = state.entries.remove(&key) {
            state.bytes = state.bytes.saturating_sub(previous.plaintext.len());
        }

        state.bytes = state.bytes.saturating_add(plaintext.len());
        state.inserts = state.inserts.saturating_add(1);
        state.entries.insert(
            key,
            CacheEntry {
                plaintext: Zeroizing::new(plaintext.to_vec()),
                last_access: access,
            },
        );
        tracing::debug!(
            "decrypted-chunk-cache:insert node_id={} source_revision={} chunk_index={} chunk_bytes={} cache_bytes={} entries={} generation={}",
            key.node_id,
            key.source_revision,
            key.chunk_index,
            key.chunk_size,
            state.bytes,
            state.entries.len(),
            state.generation
        );
        self.evict_over_capacity(&mut state);
    }

    pub fn invalidate_node(&self, node_id: u64) {
        let mut state = self.lock_state();
        let mut removed_bytes = 0usize;
        state.entries.retain(|key, entry| {
            if key.node_id == node_id {
                removed_bytes = removed_bytes.saturating_add(entry.plaintext.len());
                false
            } else {
                true
            }
        });
        state.bytes = state.bytes.saturating_sub(removed_bytes);
        state.generation = state.generation.saturating_add(1);
        tracing::debug!(
            "decrypted-chunk-cache:invalidate_node node_id={} source_revision=0 chunk_index=0 chunk_bytes=0 cache_bytes={} entries={} generation={}",
            node_id,
            state.bytes,
            state.entries.len(),
            state.generation
        );
    }

    pub fn clear(&self, reason: &str) {
        let mut state = self.lock_state();
        state.clear_entries_and_advance_generation();
        tracing::debug!(
            "decrypted-chunk-cache:clear reason={} node_id=0 source_revision=0 chunk_index=0 chunk_bytes=0 cache_bytes=0 entries=0 generation={}",
            reason,
            state.generation
        );
    }

    pub fn stats(&self) -> DecryptedChunkCacheStats {
        let state = self.lock_state();
        DecryptedChunkCacheStats {
            entries: state.entries.len(),
            bytes: state.bytes,
            max_entries: self.max_entries,
            max_bytes: self.max_bytes,
            generation: state.generation,
            hits: state.hits,
            misses: state.misses,
            inserts: state.inserts,
            evictions: state.evictions,
        }
    }

    fn evict_over_capacity(&self, state: &mut CacheState) {
        while state.bytes > self.max_bytes || state.entries.len() > self.max_entries {
            let Some((&key, _)) = state
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_access)
            else {
                break;
            };
            let Some(entry) = state.entries.remove(&key) else {
                break;
            };
            state.bytes = state.bytes.saturating_sub(entry.plaintext.len());
            state.evictions = state.evictions.saturating_add(1);
            tracing::debug!(
                "decrypted-chunk-cache:evict node_id={} source_revision={} chunk_index={} chunk_bytes={} cache_bytes={} entries={} generation={}",
                key.node_id,
                key.source_revision,
                key.chunk_index,
                key.chunk_size,
                state.bytes,
                state.entries.len(),
                state.generation
            );
        }
    }

    fn lock_state(&self) -> MutexGuard<'_, CacheState> {
        match self.state.lock() {
            Ok(state) => state,
            Err(poisoned) => {
                tracing::warn!(
                    "decrypted-chunk-cache:poison_recovered clearing cache state after panic"
                );
                let mut state = poisoned.into_inner();
                state.clear_entries_and_advance_generation();
                self.state.clear_poison();
                state
            }
        }
    }
}

impl CacheState {
    fn clear_entries_and_advance_generation(&mut self) {
        self.entries.clear();
        self.bytes = 0;
        self.generation = self.generation.saturating_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(node_id: u64, source_revision: u64, chunk_index: u64) -> DecryptedChunkCacheKey {
        DecryptedChunkCacheKey {
            node_id,
            source_revision,
            chunk_index,
            chunk_size: 4,
        }
    }

    #[test]
    fn decrypted_chunk_cache_hits_after_insert() {
        let cache = DecryptedChunkCache::new(64, 4);
        let generation = cache.generation();
        cache.insert(generation, key(7, 11, 0), b"abcd");

        assert_eq!(&*cache.get(&key(7, 11, 0)).expect("cache hit"), b"abcd");
        let stats = cache.stats();
        assert_eq!(stats.entries, 1);
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.inserts, 1);
    }

    #[test]
    fn decrypted_chunk_cache_misses_for_different_revision() {
        let cache = DecryptedChunkCache::new(64, 4);
        cache.insert(cache.generation(), key(7, 11, 0), b"abcd");

        assert!(cache.get(&key(7, 12, 0)).is_none());
        let stats = cache.stats();
        assert_eq!(stats.misses, 1);
    }

    #[test]
    fn decrypted_chunk_cache_bypasses_zero_revision() {
        let cache = DecryptedChunkCache::new(64, 4);
        cache.insert(cache.generation(), key(7, 0, 0), b"abcd");

        assert!(cache.get(&key(7, 0, 0)).is_none());
        assert_eq!(cache.stats().entries, 0);
    }

    #[test]
    fn decrypted_chunk_cache_clear_advances_generation() {
        let cache = DecryptedChunkCache::new(64, 4);
        let generation = cache.generation();
        cache.insert(generation, key(7, 11, 0), b"abcd");

        cache.clear("test");

        let stats = cache.stats();
        assert_eq!(stats.entries, 0);
        assert_eq!(stats.bytes, 0);
        assert!(stats.generation > generation);
        assert!(cache.get(&key(7, 11, 0)).is_none());
    }

    #[test]
    fn decrypted_chunk_cache_rejects_stale_generation_insert() {
        let cache = DecryptedChunkCache::new(64, 4);
        let generation = cache.generation();
        cache.clear("test");

        cache.insert(generation, key(7, 11, 0), b"abcd");

        assert!(cache.get(&key(7, 11, 0)).is_none());
        assert_eq!(cache.stats().entries, 0);
    }

    #[test]
    fn decrypted_chunk_cache_evicts_lru_entry() {
        let cache = DecryptedChunkCache::new(8, 2);
        let generation = cache.generation();
        cache.insert(generation, key(7, 11, 0), b"aaaa");
        cache.insert(generation, key(7, 11, 1), b"bbbb");
        assert_eq!(&*cache.get(&key(7, 11, 0)).expect("cache hit"), b"aaaa");

        cache.insert(generation, key(7, 11, 2), b"cccc");

        assert!(cache.get(&key(7, 11, 1)).is_none());
        assert_eq!(&*cache.get(&key(7, 11, 0)).expect("cache hit"), b"aaaa");
        assert_eq!(&*cache.get(&key(7, 11, 2)).expect("cache hit"), b"cccc");
        assert_eq!(cache.stats().evictions, 1);
    }

    #[test]
    fn decrypted_chunk_cache_invalidate_node_removes_node_entries() {
        let cache = DecryptedChunkCache::new(64, 4);
        let generation = cache.generation();
        cache.insert(generation, key(7, 11, 0), b"aaaa");
        cache.insert(generation, key(8, 11, 0), b"bbbb");

        cache.invalidate_node(7);

        assert!(cache.get(&key(7, 11, 0)).is_none());
        assert_eq!(&*cache.get(&key(8, 11, 0)).expect("cache hit"), b"bbbb");
        assert_eq!(cache.stats().entries, 1);
        cache.insert(generation, key(7, 11, 1), b"cccc");
        assert!(cache.get(&key(7, 11, 1)).is_none());
    }

    #[test]
    fn decrypted_chunk_cache_recovers_from_poison_as_empty_cache() {
        let cache = DecryptedChunkCache::new(64, 4);
        let generation = cache.generation();
        cache.insert(generation, key(7, 11, 0), b"aaaa");

        let poisoned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let Ok(_guard) = cache.state.lock() else {
                panic!("cache must not be poisoned before the test panic");
            };
            panic!("poison decrypted chunk cache");
        }));
        assert!(poisoned.is_err());

        let recovered_generation = cache.generation();
        assert!(recovered_generation > generation);
        assert!(cache.get(&key(7, 11, 0)).is_none());

        cache.insert(recovered_generation, key(7, 12, 0), b"bbbb");
        assert_eq!(&*cache.get(&key(7, 12, 0)).expect("cache hit"), b"bbbb");
    }
}
