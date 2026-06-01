use std::collections::HashMap;

use super::super::session_lifecycle::LONG_RUNNING_SESSION_IDLE_TTL_MS;
use super::error::{StorageGcError, StorageGcResult};
use super::types::StorageGcScanSession;

#[derive(Debug)]
pub(in crate::rpc::router) struct StorageGcScanRegistry {
    scans: HashMap<String, StorageGcScanSession>,
    idle_ttl_ms: u64,
}

impl Default for StorageGcScanRegistry {
    fn default() -> Self {
        Self {
            scans: HashMap::new(),
            idle_ttl_ms: LONG_RUNNING_SESSION_IDLE_TTL_MS,
        }
    }
}

impl StorageGcScanRegistry {
    pub(in crate::rpc::router) fn set_idle_ttl_ms(&mut self, ttl_ms: u64) {
        self.idle_ttl_ms = ttl_ms;
    }

    pub(super) fn expire_idle(&mut self, now_ms: u64) {
        let ttl = self.idle_ttl_ms;
        self.scans
            .retain(|_, scan| now_ms.saturating_sub(scan.last_accessed_at_ms) <= ttl);
    }

    pub(super) fn insert(&mut self, scan: StorageGcScanSession) {
        self.scans.insert(scan.gc_id.clone(), scan);
    }

    pub(super) fn get_refresh_cloned(
        &mut self,
        gc_id: &str,
        now_ms: u64,
    ) -> StorageGcResult<StorageGcScanSession> {
        let Some(scan) = self.scans.get_mut(gc_id) else {
            return Err(StorageGcError::scan_not_found());
        };
        scan.last_accessed_at_ms = now_ms;
        Ok(scan.clone())
    }

    pub(super) fn remove(&mut self, gc_id: &str) {
        self.scans.remove(gc_id);
    }

    pub(in crate::rpc::router) fn clear(&mut self) {
        self.scans.clear();
    }
}
