use serde::{Deserialize, Serialize};

/// Monotonic cursor tracking the last-applied delta from Core Host.
/// `version` increases with each delta batch; `timestamp_ms` is wall-clock
/// at the Core Host when the batch was produced.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncCursor {
    pub version: u64,
    pub timestamp_ms: u64,
}

/// Result returned from `sync_initial`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SyncInitialResult {
    pub items_synced: u64,
    pub cursor: SyncCursor,
}

/// A single entry change inside a delta batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct DeltaEntry {
    pub shard_id: String,
    pub node_id: u64,
    pub op: DeltaOp,
    pub data: serde_json::Value,
}

/// The kind of mutation carried by a delta entry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DeltaOp {
    Upsert,
    Delete,
}

/// Payload for `sync_delta_apply`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct DeltaPayload {
    pub entries: Vec<DeltaEntry>,
    pub new_cursor: SyncCursor,
}

/// Result of applying a delta batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct DeltaApplyResult {
    pub applied: u64,
    pub cursor: SyncCursor,
}

/// Strategy the reconnect logic chose.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReconnectStrategy {
    Delta,
    FullResync,
}

/// Result of `sync_reconnect`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ReconnectResult {
    pub strategy: ReconnectStrategy,
    pub items_synced: u64,
    pub cursor: SyncCursor,
}

/// Error surfaced when another writer holds the lock.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WriterLockInfo {
    pub holder: String,
    pub since_ms: u64,
}

/// Outcome of a thin-client write attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct WriteResult {
    pub ok: bool,
    pub writer_lock: Option<WriterLockInfo>,
}

/// Per-connection sync state held for the lifetime of a Remote session.
pub struct SyncState {
    pub cursor: Option<SyncCursor>,
    pub writer_lock: Option<WriterLockInfo>,
    pub subscribed: bool,
}

impl SyncState {
    pub fn new() -> Self {
        Self {
            cursor: None,
            writer_lock: None,
            subscribed: false,
        }
    }
}
