use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::models::FuseDriverStatus;

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
        // Check for macFUSE installation
        // macFUSE installs to /Library/Filesystems/macfuse.fs
        if std::path::Path::new("/Library/Filesystems/macfuse.fs").exists() {
            FuseDriverStatus::Available
        } else {
            FuseDriverStatus::Missing
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        FuseDriverStatus::Unsupported
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
        let _ = std::fs::remove_dir_all(&self.staging_dir);
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
        let _ = std::fs::remove_dir_all(staging_dir);
    }
}

impl Drop for FuseSessionHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}
