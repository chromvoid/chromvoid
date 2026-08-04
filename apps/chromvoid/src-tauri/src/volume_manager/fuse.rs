use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::cleanup_fuse_staging_dir;
use super::models::FuseDriverStatus;

#[cfg(target_os = "macos")]
const MACFUSE_MOUNT_HELPER_PATH: &str =
    "/Library/Filesystems/macfuse.fs/Contents/Resources/mount_macfuse";

/// Detect if FUSE driver is available on the current platform.
pub fn detect_fuse_driver() -> FuseDriverStatus {
    #[cfg(target_os = "linux")]
    {
        // Check for /dev/fuse
        if std::path::Path::new("/dev/fuse").exists() {
            FuseDriverStatus::Available
        } else {
            FuseDriverStatus::Missing
        }
    }

    #[cfg(target_os = "macos")]
    {
        detect_macos_fuse_driver_at(std::path::Path::new(MACFUSE_MOUNT_HELPER_PATH))
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        FuseDriverStatus::Unsupported
    }
}

#[cfg(target_os = "macos")]
fn detect_macos_fuse_driver_at(mount_helper: &std::path::Path) -> FuseDriverStatus {
    use std::os::unix::ffi::OsStrExt as _;

    let Ok(metadata) = mount_helper.metadata() else {
        return FuseDriverStatus::Missing;
    };
    let Ok(path) = std::ffi::CString::new(mount_helper.as_os_str().as_bytes()) else {
        return FuseDriverStatus::Missing;
    };

    if metadata.is_file() && unsafe { libc::access(path.as_ptr(), libc::X_OK) } == 0 {
        FuseDriverStatus::Available
    } else {
        FuseDriverStatus::Missing
    }
}

/// Handle for a FUSE filesystem session.
///
/// Manages the lifecycle of a mounted FUSE filesystem, including graceful shutdown
/// and async completion waiting.
#[derive(Debug)]
pub struct FuseSessionHandle {
    /// Path where the FUSE filesystem is mounted.
    mountpoint: PathBuf,
    /// Per-session staging directory for writable file handles.
    staging_dir: PathBuf,
    /// Flag to signal shutdown to the FUSE session.
    shutdown_flag: Arc<AtomicBool>,
    /// Channel to send shutdown signal.
    shutdown_tx: Option<mpsc::Sender<()>>,
    /// Task handle for the FUSE session.
    task: Option<JoinHandle<()>>,
}

impl FuseSessionHandle {
    /// Create a new FUSE session handle.
    pub fn new(
        mountpoint: PathBuf,
        staging_dir: PathBuf,
        shutdown_flag: Arc<AtomicBool>,
        shutdown_tx: mpsc::Sender<()>,
        task: JoinHandle<()>,
    ) -> Self {
        Self {
            mountpoint,
            staging_dir,
            shutdown_flag,
            shutdown_tx: Some(shutdown_tx),
            task: Some(task),
        }
    }

    /// Get the mountpoint path.
    pub fn mountpoint(&self) -> &PathBuf {
        &self.mountpoint
    }

    /// Get the staging directory path used by this FUSE session.
    pub fn staging_dir(&self) -> &PathBuf {
        &self.staging_dir
    }

    /// Best-effort staging cleanup.
    pub fn cleanup_staging_best_effort(&self) {
        cleanup_fuse_staging_dir(Some(&self.staging_dir));
    }

    /// Trigger graceful shutdown of the FUSE session.
    pub fn shutdown(&mut self) {
        self.shutdown_flag
            .store(true, std::sync::atomic::Ordering::Release);
        if let Some(tx) = self.shutdown_tx.take() {
            // Non-blocking: shutdown() can be called from within a runtime.
            let _ = tx.try_send(());
        }
    }

    /// Wait for the FUSE session to complete.
    pub async fn join(mut self) {
        let staging_dir = self.staging_dir.clone();
        self.shutdown();
        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
        cleanup_fuse_staging_dir(Some(&staging_dir));
    }
}

impl Drop for FuseSessionHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use std::os::unix::fs::PermissionsExt as _;

    use tempfile::tempdir;

    use super::{detect_macos_fuse_driver_at, FuseDriverStatus};

    #[test]
    fn macfuse_detection_requires_executable_mount_helper() {
        let root = tempdir().expect("tempdir");
        let helper = root.path().join("mount_macfuse");

        assert_eq!(
            detect_macos_fuse_driver_at(&helper),
            FuseDriverStatus::Missing
        );

        std::fs::write(&helper, b"helper").expect("write helper fixture");
        std::fs::set_permissions(&helper, std::fs::Permissions::from_mode(0o644))
            .expect("set non-executable permissions");
        assert_eq!(
            detect_macos_fuse_driver_at(&helper),
            FuseDriverStatus::Missing
        );

        std::fs::set_permissions(&helper, std::fs::Permissions::from_mode(0o755))
            .expect("set executable permissions");
        assert_eq!(
            detect_macos_fuse_driver_at(&helper),
            FuseDriverStatus::Available
        );
    }
}
