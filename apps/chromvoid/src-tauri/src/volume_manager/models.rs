use std::fmt;

use serde::Serialize;

/// Result of FUSE driver detection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FuseDriverStatus {
    /// FUSE driver is available and ready to use.
    Available,
    /// FUSE driver is not installed.
    Missing,
    /// Platform does not support FUSE (e.g., Windows without WinFsp).
    Unsupported,
}

/// Volume mount states aligned with ADR-023 state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum VolumeState {
    /// Vault is locked; volume cannot be mounted.
    Locked,
    /// Vault is unlocked but volume is not mounted. Ready to mount.
    Unlocked,
    /// Mount operation is in progress.
    Mounting,
    /// Volume is successfully mounted and accessible.
    Mounted,
    /// Unmount operation is in progress.
    Unmounting,
    /// An error occurred during a mount/unmount operation.
    Error(VolumeError),
    /// Required FUSE / WinFSP driver is not installed.
    #[allow(dead_code)]
    DriverMissing,
    /// Stale mount detected after crash; cleanup required before re-mount.
    NeedsCleanup,
}

/// Error categories for volume operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum VolumeError {
    MountFailed,
    UnmountFailed,
    Timeout,
    BackendUnavailable,
    VaultLocked,
}

impl fmt::Display for VolumeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MountFailed => write!(f, "mount failed"),
            Self::UnmountFailed => write!(f, "unmount failed"),
            Self::Timeout => write!(f, "operation timed out"),
            Self::BackendUnavailable => write!(f, "backend unavailable"),
            Self::VaultLocked => write!(f, "vault is locked"),
        }
    }
}

/// Convenience result type.
pub type VolumeResult<T> = Result<T, VolumeError>;
