use std::sync::Mutex;

use super::models::*;

pub struct SyncRuntimeState {
    state: Mutex<Option<SyncState>>,
}

impl SyncRuntimeState {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(None),
        }
    }

    /// Get or create sync state.
    pub fn with_state<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut SyncState) -> R,
    {
        let mut guard = self
            .state
            .lock()
            .map_err(|_| "Sync runtime mutex poisoned".to_string())?;
        if guard.is_none() {
            *guard = Some(SyncState::new());
        }
        let state = guard
            .as_mut()
            .ok_or_else(|| "Sync runtime state unavailable".to_string())?;
        Ok(f(state))
    }

    /// Reset sync state (e.g. on disconnect / mode switch back to Local).
    pub fn reset(&self) -> Result<(), String> {
        let mut guard = self
            .state
            .lock()
            .map_err(|_| "Sync runtime mutex poisoned".to_string())?;
        *guard = None;
        Ok(())
    }

    /// Bootstrap sync state for a new Remote session.
    pub fn bootstrap(&self, version: u64, timestamp_ms: u64) -> Result<(), String> {
        self.with_state(|ss| {
            ss.cursor = Some(SyncCursor {
                version,
                timestamp_ms,
            });
            ss.subscribed = true;
        })
    }

    /// Read the current sync cursor, if any.
    pub fn current_cursor(&self) -> Result<Option<SyncCursor>, String> {
        self.with_state(|ss| ss.cursor.clone())
    }

    /// Check if sync subscription is currently active.
    pub fn is_active(&self) -> Result<bool, String> {
        self.with_state(|ss| ss.subscribed)
    }

    /// Set the writer lock from an external source (e.g. Core Host push event).
    pub fn set_writer_lock(&self, info: Option<WriterLockInfo>) -> Result<(), String> {
        self.with_state(|ss| {
            ss.writer_lock = info;
        })
    }

    /// Handle reconnect: compare local cursor against host version,
    /// choose delta vs full resync, update cursor, and re-subscribe.
    pub fn trigger_reconnect(
        &self,
        host_version: u64,
        host_timestamp_ms: u64,
    ) -> Result<ReconnectStrategy, String> {
        let local_version =
            self.with_state(|ss| ss.cursor.as_ref().map(|cursor| cursor.version).unwrap_or(0))?;
        let strategy = choose_reconnect_strategy(local_version, host_version);
        self.bootstrap(host_version, host_timestamp_ms)?;
        Ok(strategy)
    }

    /// Read current sync cursor (version, timestamp_ms) if set.
    pub(crate) fn get_cursor_pair(&self) -> Result<Option<(u64, u64)>, String> {
        self.with_state(|ss| ss.cursor.as_ref().map(|c| (c.version, c.timestamp_ms)))
    }
}

impl Default for SyncRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

/// Maximum version gap that still qualifies for incremental delta sync.
/// Beyond this the reconnect path falls back to a full snapshot.
pub(super) const DELTA_GAP_THRESHOLD: u64 = 500;

/// Pure function: pick Delta vs FullResync based on local cursor and host version.
pub fn choose_reconnect_strategy(local_version: u64, host_version: u64) -> ReconnectStrategy {
    let gap = host_version.saturating_sub(local_version);
    if local_version == 0 || gap > DELTA_GAP_THRESHOLD {
        ReconnectStrategy::FullResync
    } else {
        ReconnectStrategy::Delta
    }
}
