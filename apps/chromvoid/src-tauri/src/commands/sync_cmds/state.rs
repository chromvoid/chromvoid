use std::sync::Mutex;

use super::models::*;

#[cfg(test)]
pub static SYNC_STATE: Mutex<Option<SyncState>> = Mutex::new(None);
#[cfg(not(test))]
static SYNC_STATE: Mutex<Option<SyncState>> = Mutex::new(None);

/// Get or create sync state.
pub(super) fn with_sync_state<F, R>(f: F) -> R
where
    F: FnOnce(&mut SyncState) -> R,
{
    let mut guard = SYNC_STATE.lock().unwrap();
    if guard.is_none() {
        *guard = Some(SyncState::new());
    }
    f(guard.as_mut().unwrap())
}

/// Reset sync state (e.g. on disconnect / mode switch back to Local).
pub fn reset_sync_state() {
    let mut guard = SYNC_STATE.lock().unwrap();
    *guard = None;
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
