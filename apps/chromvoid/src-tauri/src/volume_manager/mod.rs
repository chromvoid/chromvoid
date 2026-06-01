//! Volume Manager — state machine for virtual volume mount lifecycle (ADR-023).
//!
//! Manages mount/unmount transitions with idempotency, timeout awareness,
//! and crash-recovery stubs. The actual filesystem backend (WebDAV / FUSE)
//! is not implemented here; this module provides the state skeleton only.
//!
//! # Lock ordering
//!
//! **Never** hold the adapter mutex while taking the `volume_manager` mutex.
//! Run real mount/unmount I/O outside the state mutex with bounded join/cleanup ownership.

mod backend;
mod backend_join;
mod fuse;
mod models;
mod state_machine;

#[cfg(test)]
mod tests;

use std::time::Duration;

/// Default timeout for mount/unmount operations (future use with real backends).
const DEFAULT_OPERATION_TIMEOUT: Duration = Duration::from_secs(10);

pub use backend::VolumeBackendHandle;
pub(crate) use backend_join::{
    cleanup_fuse_staging_dir, VolumeBackendJoinRuntimeState, VOLUME_BACKGROUND_JOIN_TIMEOUT,
};
pub use fuse::{detect_fuse_driver, FuseSessionHandle};
pub use models::{FuseDriverStatus, VolumeError, VolumeResult, VolumeState};
pub use state_machine::VolumeManager;
