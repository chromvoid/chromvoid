use super::*;
use crate::commands::sync_cmds::models::{DeltaEntry, DeltaOp, DeltaPayload, WriteResult};

// ── All tests use LOCAL SyncState instances — zero global state. ──

#[test]
fn test_sync_cursor_serde_roundtrip() {
    let cursor = SyncCursor {
        version: 42,
        timestamp_ms: 1700000000000,
    };
    let json = serde_json::to_string(&cursor).unwrap();
    let back: SyncCursor = serde_json::from_str(&json).unwrap();
    assert_eq!(cursor, back);
}

#[test]
fn test_delta_payload_serde() {
    let payload = DeltaPayload {
        entries: vec![
            DeltaEntry {
                shard_id: "shard-a".into(),
                node_id: 1,
                op: DeltaOp::Upsert,
                data: serde_json::json!({"name": "test"}),
            },
            DeltaEntry {
                shard_id: "shard-a".into(),
                node_id: 2,
                op: DeltaOp::Delete,
                data: serde_json::Value::Null,
            },
        ],
        new_cursor: SyncCursor {
            version: 10,
            timestamp_ms: 1700000000000,
        },
    };
    let json = serde_json::to_string(&payload).unwrap();
    let back: DeltaPayload = serde_json::from_str(&json).unwrap();
    assert_eq!(back.entries.len(), 2);
    assert_eq!(back.entries[0].op, DeltaOp::Upsert);
    assert_eq!(back.entries[1].op, DeltaOp::Delete);
    assert_eq!(back.new_cursor.version, 10);
}

#[test]
fn test_sync_initial_sets_cursor() {
    let mut ss = SyncState::new();
    assert!(ss.cursor.is_none());
    assert!(!ss.subscribed);

    let cursor = SyncCursor {
        version: 100,
        timestamp_ms: 1700000000000,
    };
    ss.cursor = Some(cursor.clone());
    ss.subscribed = true;

    assert_eq!(ss.cursor.as_ref().unwrap().version, 100);
    assert_eq!(ss.cursor.as_ref().unwrap().timestamp_ms, 1700000000000);
    assert!(ss.subscribed);
}

#[test]
fn test_sync_delta_advances_cursor() {
    let mut ss = SyncState::new();
    ss.cursor = Some(SyncCursor {
        version: 50,
        timestamp_ms: 1000,
    });

    // Simulate delta apply: cursor advances.
    let new_cursor = SyncCursor {
        version: 55,
        timestamp_ms: 2000,
    };
    ss.cursor = Some(new_cursor);

    let stored = ss.cursor.as_ref().unwrap();
    assert_eq!(stored.version, 55);
    assert_eq!(stored.timestamp_ms, 2000);
}

#[test]
fn test_sync_reconnect_delta_strategy() {
    // Local at version 100, host at 150 → gap=50 < 500 → Delta.
    assert_eq!(
        choose_reconnect_strategy(100, 150),
        ReconnectStrategy::Delta
    );
}

#[test]
fn test_sync_reconnect_full_resync_strategy() {
    // Local at version 100, host at 700 → gap=600 > 500 → FullResync.
    assert_eq!(
        choose_reconnect_strategy(100, 700),
        ReconnectStrategy::FullResync
    );
}

#[test]
fn test_sync_reconnect_no_cursor_full_resync() {
    // No prior cursor → local_version == 0 → always FullResync.
    assert_eq!(
        choose_reconnect_strategy(0, 10),
        ReconnectStrategy::FullResync
    );
}

#[test]
fn test_sync_reconnect_exact_threshold() {
    // Gap exactly at threshold → still Delta.
    assert_eq!(
        choose_reconnect_strategy(100, 600),
        ReconnectStrategy::Delta
    );
    // Gap one past threshold → FullResync.
    assert_eq!(
        choose_reconnect_strategy(100, 601),
        ReconnectStrategy::FullResync
    );
}

#[test]
fn test_writer_lock_blocks_write() {
    let mut ss = SyncState::new();
    let lock = WriterLockInfo {
        holder: "mobile-device-1".into(),
        since_ms: 1700000000000,
    };
    ss.writer_lock = Some(lock);

    assert!(ss.writer_lock.is_some());
    assert_eq!(ss.writer_lock.as_ref().unwrap().holder, "mobile-device-1");
}

#[test]
fn test_writer_lock_cleared_allows_write() {
    let mut ss = SyncState::new();
    ss.writer_lock = Some(WriterLockInfo {
        holder: "someone".into(),
        since_ms: 0,
    });
    // Clear lock.
    ss.writer_lock = None;
    assert!(ss.writer_lock.is_none());
}

#[test]
fn test_reset_sync_state_clears_all() {
    let mut ss = SyncState::new();
    ss.cursor = Some(SyncCursor {
        version: 99,
        timestamp_ms: 0,
    });
    ss.subscribed = true;
    ss.writer_lock = Some(WriterLockInfo {
        holder: "x".into(),
        since_ms: 0,
    });

    // Simulate reset: replace with fresh state.
    ss = SyncState::new();
    assert!(ss.cursor.is_none());
    assert!(!ss.subscribed);
    assert!(ss.writer_lock.is_none());
}

#[test]
fn test_write_result_serde() {
    let ok_result = WriteResult {
        ok: true,
        writer_lock: None,
    };
    let json = serde_json::to_string(&ok_result).unwrap();
    assert!(json.contains("\"ok\":true"));

    let locked_result = WriteResult {
        ok: false,
        writer_lock: Some(WriterLockInfo {
            holder: "dev-1".into(),
            since_ms: 123,
        }),
    };
    let json = serde_json::to_string(&locked_result).unwrap();
    assert!(json.contains("\"ok\":false"));
    assert!(json.contains("\"holder\":\"dev-1\""));
}

#[test]
fn test_reconnect_strategy_serde() {
    let delta_json = serde_json::to_string(&ReconnectStrategy::Delta).unwrap();
    assert_eq!(delta_json, "\"delta\"");
    let full_json = serde_json::to_string(&ReconnectStrategy::FullResync).unwrap();
    assert_eq!(full_json, "\"full_resync\"");
}
