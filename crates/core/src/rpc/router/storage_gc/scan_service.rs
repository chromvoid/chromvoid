use crate::storage::Storage;
use crate::vault::VaultSession;

use super::error::StorageGcResult;
use super::live_set::StorageGcLiveSetService;
use super::types::{StorageGcCandidate, StorageGcScanOptions, StorageGcScanSession};

pub(super) struct StorageGcScanService;

impl StorageGcScanService {
    pub(super) fn scan(
        storage: &Storage,
        session: &VaultSession,
        options: StorageGcScanOptions,
        now_ms: u64,
    ) -> StorageGcResult<StorageGcScanSession> {
        let _include_system = options.include_system;
        let live = StorageGcLiveSetService::collect(storage, session)?;
        let mut candidates = Vec::new();
        for name in storage.list_chunks()? {
            if live.contains(&name) {
                continue;
            }
            let bytes = storage.chunk_len(&name)?;
            let data = storage.read_chunk(&name)?;
            candidates.push(StorageGcCandidate {
                name,
                bytes,
                sha256: crate::crypto::sha256_hex(&data),
            });
        }
        candidates.sort_by(|a, b| a.name.cmp(&b.name));
        let total_bytes = candidates
            .iter()
            .fold(0u64, |sum, item| sum.saturating_add(item.bytes));
        Ok(StorageGcScanSession {
            gc_id: format!("storage-gc-{}", operation_id()),
            candidates,
            total_bytes,
            created_at_ms: now_ms,
            last_accessed_at_ms: now_ms,
        })
    }
}

fn operation_id() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}
