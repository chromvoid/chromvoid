mod commands;
pub(crate) mod models;
pub(crate) mod state;

#[cfg(test)]
mod tests;

// ── Re-exports (preserve all existing public paths) ─────────────────────

pub use models::{ReconnectStrategy, SyncCursor, SyncState, WriterLockInfo};
// Note: DeltaApplyResult, DeltaEntry, DeltaOp, DeltaPayload, ReconnectResult,
// SyncInitialResult, WriteResult are used within submodules (commands.rs, tests.rs)
// and don't need re-exporting from here.

pub use state::{choose_reconnect_strategy, SyncRuntimeState};

pub(crate) use commands::{sync_delta_apply, sync_initial, sync_reconnect, sync_write};
