use std::time::Duration;

use tracing::{error, info, warn};

use crate::volume_webdav::WebDavServerHandle;

use super::backend::VolumeBackendHandle;
use super::fuse::FuseSessionHandle;
use super::models::{VolumeError, VolumeResult, VolumeState};
use super::DEFAULT_OPERATION_TIMEOUT;

/// Manages the lifecycle of a virtual volume mount.
///
/// All public transition methods are **idempotent**: calling `mount()` when
/// already `Mounted` or `unmount()` when already `Unlocked`/`Locked` is a
/// no-op that returns `Ok(())`.
pub struct VolumeManager {
    state: VolumeState,
    /// Timeout budget for a single mount/unmount operation (future use).
    operation_timeout: Duration,

    backend: Option<VolumeBackendHandle>,
    last_error: Option<String>,
}

impl VolumeManager {
    pub fn new() -> Self {
        Self {
            state: VolumeState::Locked,
            operation_timeout: DEFAULT_OPERATION_TIMEOUT,
            backend: None,
            last_error: None,
        }
    }

    pub fn backend_type(&self) -> Option<&'static str> {
        self.backend.as_ref().map(|b| b.backend())
    }

    pub fn mountpoint(&self) -> Option<String> {
        self.backend.as_ref().map(|b| b.mountpoint())
    }

    pub fn webdav_port(&self) -> Option<u16> {
        self.backend.as_ref().and_then(|b| b.webdav_port())
    }

    pub fn set_backend(&mut self, backend: VolumeBackendHandle) {
        self.backend = Some(backend);
    }

    pub fn take_backend(&mut self) -> Option<VolumeBackendHandle> {
        self.backend.take()
    }

    pub fn set_webdav(&mut self, handle: WebDavServerHandle) {
        self.set_backend(VolumeBackendHandle::WebDav(handle));
    }

    pub fn set_fuse(&mut self, handle: FuseSessionHandle) {
        self.set_backend(VolumeBackendHandle::Fuse(handle));
    }

    // NOTE: Intentionally no `take_webdav()` or `take_fuse()` wrapper; callers should use `take_backend()`.

    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    pub fn set_last_error(&mut self, msg: String) {
        self.last_error = Some(msg);
    }

    pub fn clear_last_error(&mut self) {
        self.last_error = None;
    }

    /// Current state of the volume.
    pub fn state(&self) -> VolumeState {
        self.state
    }

    /// Notify that the vault has been unlocked.
    ///
    /// Transitions `Locked → Unlocked`. Does **not** trigger mount
    /// (ADR-023: mount is explicit via button or auto-mount setting).
    pub fn notify_unlocked(&mut self) {
        match self.state {
            VolumeState::Locked => {
                info!("VolumeManager: vault unlocked, state → Unlocked");
                self.state = VolumeState::Unlocked;
            }
            _ => {
                info!(
                    "VolumeManager: notify_unlocked in state {:?}, no-op",
                    self.state
                );
            }
        }
    }

    /// Notify that the vault has been locked.
    ///
    /// Forces state to `Locked`. Returns `true` when the volume was in a
    /// mounted / mounting / unmounting state and therefore real unmount work
    /// would be needed (caller should perform best-effort cleanup).
    pub fn notify_locked(&mut self) -> bool {
        let needs_unmount = matches!(
            self.state,
            VolumeState::Mounted | VolumeState::Mounting | VolumeState::Unmounting
        );
        if needs_unmount {
            info!(
                "VolumeManager: vault locked while {:?}, forcing → Locked",
                self.state
            );
        } else {
            info!(
                "VolumeManager: vault locked, state {:?} → Locked",
                self.state
            );
        }
        self.state = VolumeState::Locked;
        needs_unmount
    }

    /// Begin mount. Idempotent.
    ///
    /// * `Mounted` / `Mounting` → `Ok(())` (no-op)
    /// * `Unlocked` → `Mounting` then `Ok(())`
    /// * `Locked` → `Err(VaultLocked)`
    /// * `DriverMissing` → `Err(BackendUnavailable)`
    /// * Other → `Err(MountFailed)`
    pub fn mount(&mut self) -> VolumeResult<()> {
        match self.state {
            VolumeState::Mounted => {
                info!("VolumeManager: mount() already Mounted, idempotent ok");
                Ok(())
            }
            VolumeState::Mounting => {
                info!("VolumeManager: mount() already Mounting, idempotent ok");
                Ok(())
            }
            VolumeState::Unlocked => {
                info!("VolumeManager: mount() → Mounting");
                self.state = VolumeState::Mounting;
                self.clear_last_error();
                Ok(())
            }
            VolumeState::Locked => {
                warn!("VolumeManager: mount() called while Locked");
                Err(VolumeError::VaultLocked)
            }
            VolumeState::DriverMissing => {
                warn!("VolumeManager: mount() called while DriverMissing");
                Err(VolumeError::BackendUnavailable)
            }
            _ => {
                warn!("VolumeManager: mount() in state {:?}", self.state);
                Err(VolumeError::MountFailed)
            }
        }
    }

    /// Mark mount as successfully completed (`Mounting → Mounted`).
    pub fn mount_complete(&mut self) -> VolumeResult<()> {
        match self.state {
            VolumeState::Mounting => {
                info!("VolumeManager: mount complete → Mounted");
                self.state = VolumeState::Mounted;
                self.clear_last_error();
                Ok(())
            }
            VolumeState::Locked => {
                warn!("VolumeManager: mount_complete but vault already Locked");
                Err(VolumeError::VaultLocked)
            }
            _ => {
                warn!(
                    "VolumeManager: mount_complete in unexpected state {:?}",
                    self.state
                );
                Err(VolumeError::MountFailed)
            }
        }
    }

    /// Report that mount failed. Moves to `Error(MountFailed)`.
    pub fn mount_failed(&mut self) {
        match self.state {
            VolumeState::Mounting => {
                error!("VolumeManager: mount failed → Error");
                self.state = VolumeState::Error(VolumeError::MountFailed);
            }
            VolumeState::Locked => { /* already locked, stay locked */ }
            _ => {
                warn!("VolumeManager: mount_failed in state {:?}", self.state);
                self.state = VolumeState::Error(VolumeError::MountFailed);
            }
        }
    }

    /// Begin unmount. Idempotent.
    ///
    /// * `Unlocked` / `Locked` → `Ok(())` (nothing to unmount)
    /// * `Mounted` → `Unmounting` then `Ok(())`
    /// * `Unmounting` → `Ok(())` (already in progress)
    /// * `Mounting` → cancel in-progress mount → `Unlocked`
    /// * `Error` / `NeedsCleanup` / `DriverMissing` → `Unlocked`
    pub fn unmount(&mut self) -> VolumeResult<()> {
        match self.state {
            VolumeState::Unlocked | VolumeState::Locked => {
                info!(
                    "VolumeManager: unmount() in {:?}, nothing to do",
                    self.state
                );
                Ok(())
            }
            VolumeState::Mounted => {
                info!("VolumeManager: unmount() → Unmounting");
                self.state = VolumeState::Unmounting;
                self.clear_last_error();
                Ok(())
            }
            VolumeState::Unmounting => {
                info!("VolumeManager: unmount() already Unmounting, idempotent ok");
                Ok(())
            }
            VolumeState::Mounting => {
                info!("VolumeManager: unmount() cancelling in-progress mount → Unlocked");
                self.state = VolumeState::Unlocked;
                self.clear_last_error();
                Ok(())
            }
            VolumeState::Error(_) | VolumeState::NeedsCleanup | VolumeState::DriverMissing => {
                info!("VolumeManager: unmount() in {:?} → Unlocked", self.state);
                self.state = VolumeState::Unlocked;
                self.clear_last_error();
                Ok(())
            }
        }
    }

    /// Mark unmount as successfully completed.
    ///
    /// If `vault_locked` is `true`, transitions to `Locked` instead of `Unlocked`.
    pub fn unmount_complete(&mut self, vault_locked: bool) -> VolumeResult<()> {
        match self.state {
            VolumeState::Unmounting => {
                if vault_locked {
                    info!("VolumeManager: unmount complete (vault locked) → Locked");
                    self.state = VolumeState::Locked;
                } else {
                    info!("VolumeManager: unmount complete → Unlocked");
                    self.state = VolumeState::Unlocked;
                }
                Ok(())
            }
            VolumeState::Locked => Ok(()), // already forced locked
            _ => {
                warn!(
                    "VolumeManager: unmount_complete in unexpected state {:?}",
                    self.state
                );
                Err(VolumeError::UnmountFailed)
            }
        }
    }

    /// Report that unmount failed. Moves to `NeedsCleanup`.
    pub fn unmount_failed(&mut self) {
        error!(
            "VolumeManager: unmount failed in state {:?} → NeedsCleanup",
            self.state
        );
        self.state = VolumeState::NeedsCleanup;
    }

    /// Mark driver as missing.
    #[allow(dead_code)]
    pub fn set_driver_missing(&mut self) {
        info!("VolumeManager: driver missing detected");
        self.state = VolumeState::DriverMissing;
    }

    /// Preflight check stub.
    ///
    /// Future: verify mountpoint available, driver installed, vault unlocked.
    pub fn preflight_check(&self) -> VolumeResult<()> {
        match self.state {
            VolumeState::Locked => Err(VolumeError::VaultLocked),
            VolumeState::DriverMissing => Err(VolumeError::BackendUnavailable),
            _ => Ok(()),
        }
    }

    /// Health check stub.
    ///
    /// Future: stat/read on mountpoint to confirm volume is responsive.
    pub fn health_check(&self) -> VolumeResult<()> {
        match self.state {
            VolumeState::Mounted => Ok(()),
            _ => Err(VolumeError::MountFailed),
        }
    }

    /// Operation timeout budget (for future backend use).
    pub fn operation_timeout(&self) -> Duration {
        self.operation_timeout
    }
}

impl Default for VolumeManager {
    fn default() -> Self {
        Self::new()
    }
}
