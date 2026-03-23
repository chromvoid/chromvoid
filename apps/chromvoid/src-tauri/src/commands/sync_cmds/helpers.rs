use super::models::*;
use super::state::*;

/// Read the current sync cursor, if any.
#[allow(dead_code)]
pub fn current_cursor() -> Option<SyncCursor> {
    with_sync_state(|ss| ss.cursor.clone())
}

/// Set the writer lock from an external source (e.g. Core Host push event).
#[allow(dead_code)]
pub(crate) fn set_writer_lock(info: Option<WriterLockInfo>) {
    with_sync_state(|ss| {
        ss.writer_lock = info;
    });
}

/// Bootstrap sync state for a new Remote session.
/// Called by mode_switch after adapter swap to Remote.
/// Initializes cursor at the given version and marks subscription active.
pub fn bootstrap_sync(version: u64, timestamp_ms: u64) {
    with_sync_state(|ss| {
        ss.cursor = Some(SyncCursor {
            version,
            timestamp_ms,
        });
        ss.subscribed = true;
    });
}

/// Handle reconnect: compare local cursor against host version,
/// choose delta vs full resync, update cursor, and re-subscribe.
/// Called when transport is restored while in Remote mode.
pub fn trigger_reconnect_sync(host_version: u64, host_timestamp_ms: u64) -> ReconnectStrategy {
    let local_version = with_sync_state(|ss| ss.cursor.as_ref().map(|c| c.version).unwrap_or(0));
    let strategy = choose_reconnect_strategy(local_version, host_version);
    with_sync_state(|ss| {
        ss.cursor = Some(SyncCursor {
            version: host_version,
            timestamp_ms: host_timestamp_ms,
        });
        ss.subscribed = true;
    });
    strategy
}

#[allow(dead_code)]
/// Check if sync subscription is currently active.
pub fn is_sync_active() -> bool {
    with_sync_state(|ss| ss.subscribed)
}

/// Read current sync cursor (version, timestamp_ms) if set.
pub(crate) fn get_sync_cursor() -> Option<(u64, u64)> {
    with_sync_state(|ss| ss.cursor.as_ref().map(|c| (c.version, c.timestamp_ms)))
}
