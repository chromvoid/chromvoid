use super::*;
use fuser::Notifier;
use std::sync::mpsc as std_mpsc;
use std::thread::{self, JoinHandle};

pub(super) struct FusePlatformRuntime {
    state: Arc<FusePlatformRuntimeState>,
    worker: Mutex<Option<FusePlatformWorker>>,
}

struct FusePlatformRuntimeState {
    notifier: Mutex<Option<Notifier>>,
    mount_path: Mutex<Option<PathBuf>>,
}

struct FusePlatformWorker {
    tx: std_mpsc::Sender<FusePlatformWork>,
    handle: JoinHandle<()>,
}

enum FusePlatformWork {
    NotifyDelete {
        parent_ino: u64,
        child_ino: u64,
        name: String,
        secondary_parent: Option<(u64, String)>,
    },
    #[cfg(target_os = "macos")]
    PokeFinder,
    Shutdown,
}

impl FusePlatformRuntime {
    pub(super) fn new() -> Arc<Self> {
        let state = Arc::new(FusePlatformRuntimeState {
            notifier: Mutex::new(None),
            mount_path: Mutex::new(None),
        });
        let (tx, rx) = std_mpsc::channel();
        let worker_state = state.clone();
        // Notifier calls must stay off FUSE request threads on macFUSE.
        let handle = thread::spawn(move || run_worker(worker_state, rx));

        Arc::new(Self {
            state,
            worker: Mutex::new(Some(FusePlatformWorker { tx, handle })),
        })
    }

    pub(super) fn set_kernel_notifier(&self, notifier: Option<Notifier>) {
        match self.state.notifier.lock() {
            Ok(mut guard) => {
                *guard = notifier;
            }
            Err(_) => {
                warn!("FUSE platform runtime notifier mutex poisoned");
            }
        }
    }

    pub(super) fn set_mount_path(&self, mount_path: Option<PathBuf>) {
        match self.state.mount_path.lock() {
            Ok(mut guard) => {
                *guard = mount_path;
            }
            Err(_) => {
                warn!("FUSE platform runtime mount path mutex poisoned");
            }
        }
    }

    pub(super) fn notify_kernel_delete(
        &self,
        parent_ino: u64,
        child_ino: u64,
        name: &str,
        secondary_parent: Option<(u64, String)>,
    ) {
        let name = name.to_string();
        let secondary_parent_ino = secondary_parent.as_ref().map(|(ino, _)| *ino);
        let secondary_name = secondary_parent.as_ref().map(|(_, name)| name.clone());

        if self.send_work(FusePlatformWork::NotifyDelete {
            parent_ino,
            child_ino,
            name: name.clone(),
            secondary_parent,
        }) {
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                parent_ino,
                child_ino,
                name = name.as_str(),
                secondary_parent_ino,
                secondary_name = secondary_name.as_deref(),
                "FUSE notify delete queued"
            );
        }
    }

    #[cfg(target_os = "macos")]
    pub(super) fn poke_finder_dir(&self, _parent_catalog_path: &str) {
        let has_mount_path = match self.state.mount_path.lock() {
            Ok(guard) => guard.is_some(),
            Err(_) => {
                warn!("FUSE platform runtime mount path mutex poisoned");
                false
            }
        };
        if !has_mount_path {
            return;
        }

        let _ = self.send_work(FusePlatformWork::PokeFinder);
    }

    #[cfg(not(target_os = "macos"))]
    pub(super) fn poke_finder_dir(&self, _parent_catalog_path: &str) {}

    pub(super) fn shutdown_and_join(&self) {
        self.set_kernel_notifier(None);
        self.set_mount_path(None);

        let worker = match self.worker.lock() {
            Ok(mut guard) => guard.take(),
            Err(_) => {
                warn!("FUSE platform runtime worker mutex poisoned");
                None
            }
        };

        let Some(worker) = worker else {
            return;
        };

        let _ = worker.tx.send(FusePlatformWork::Shutdown);
        drop(worker.tx);

        if worker.handle.join().is_err() {
            warn!("FUSE platform runtime worker panicked");
        }
    }

    fn send_work(&self, work: FusePlatformWork) -> bool {
        let tx = match self.worker.lock() {
            Ok(guard) => guard.as_ref().map(|worker| worker.tx.clone()),
            Err(_) => {
                warn!("FUSE platform runtime worker mutex poisoned");
                None
            }
        };
        let Some(tx) = tx else {
            return false;
        };
        if tx.send(work).is_err() {
            debug!("FUSE platform runtime worker unavailable");
            return false;
        }
        true
    }

    #[cfg(test)]
    fn mount_path_for_tests(&self) -> Option<PathBuf> {
        self.state.mount_path.lock().ok()?.clone()
    }

    #[cfg(test)]
    fn worker_is_running_for_tests(&self) -> bool {
        self.worker
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }
}

impl Drop for FusePlatformRuntime {
    fn drop(&mut self) {
        self.shutdown_and_join();
    }
}

fn run_worker(state: Arc<FusePlatformRuntimeState>, rx: std_mpsc::Receiver<FusePlatformWork>) {
    while let Ok(work) = rx.recv() {
        match work {
            FusePlatformWork::NotifyDelete {
                parent_ino,
                child_ino,
                name,
                secondary_parent,
            } => process_notify_delete(&state, parent_ino, child_ino, name, secondary_parent),
            #[cfg(target_os = "macos")]
            FusePlatformWork::PokeFinder => process_poke_finder(&state),
            FusePlatformWork::Shutdown => break,
        }
    }
}

fn process_notify_delete(
    state: &FusePlatformRuntimeState,
    parent_ino: u64,
    child_ino: u64,
    name: String,
    secondary_parent: Option<(u64, String)>,
) {
    let notifier = match state.notifier.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => {
            warn!("FUSE platform runtime notifier mutex poisoned");
            return;
        }
    };
    let Some(notifier) = notifier else {
        return;
    };

    let name_os = OsStr::new(&name);

    if let Err(e) = notifier.delete(fuse_ino(parent_ino), fuse_ino(child_ino), name_os) {
        warn!(target: "chromvoid_lib::volume_fuse::imp", parent_ino, child_ino, name = name.as_str(), err = %e, "FUSE notify delete failed");
    }

    for retry_ms in [0_u64, 60, 250] {
        if retry_ms > 0 {
            std::thread::sleep(std::time::Duration::from_millis(retry_ms));
        }
        if let Err(e) = notifier.inval_inode(fuse_ino(parent_ino), 0, 0) {
            warn!(target: "chromvoid_lib::volume_fuse::imp", parent_ino, retry_ms, err = %e, "FUSE notify inval_inode(parent) retry failed");
        }
        if let Err(e) = notifier.inval_entry(fuse_ino(parent_ino), name_os) {
            warn!(target: "chromvoid_lib::volume_fuse::imp", parent_ino, name = name.as_str(), retry_ms, err = %e, "FUSE notify inval_entry retry failed");
        }
        if let Err(e) = notifier.inval_inode(fuse_ino(child_ino), 0, 0) {
            warn!(target: "chromvoid_lib::volume_fuse::imp", child_ino, retry_ms, err = %e, "FUSE notify inval_inode(child) retry failed");
        }
        if let Some((sec_parent_ino, ref sec_name)) = secondary_parent {
            let sec_name_os = OsStr::new(sec_name);
            let _ = notifier.inval_inode(fuse_ino(sec_parent_ino), 0, 0);
            let _ = notifier.inval_entry(fuse_ino(sec_parent_ino), sec_name_os);
        }
    }
}

/// Tell Finder to re-read a directory after a delete/rename.
///
/// macFUSE does not fire kqueue/FSEvents for the process that initiated
/// the operation, so Finder never learns that a rename-to-trash actually
/// deleted the file.  AppleScript-based approaches fail because Finder
/// windows on macFUSE volumes are not properly enumerable (POSIX path,
/// URL, and alias conversions all fail silently).
///
/// We use System Events to send Cmd+Shift+. (toggle hidden files) twice
/// to the Finder process.  Each toggle forces a complete directory
/// re-read.  The double-toggle restores the original hidden-files state
/// so it's invisible to the user.
#[cfg(target_os = "macos")]
fn process_poke_finder(state: &FusePlatformRuntimeState) {
    let has_mount_path = match state.mount_path.lock() {
        Ok(guard) => guard.is_some(),
        Err(_) => {
            warn!("FUSE platform runtime mount path mutex poisoned");
            false
        }
    };
    if !has_mount_path {
        return;
    }

    // Wait for kernel to process our inval_entry / delete notifications.
    std::thread::sleep(std::time::Duration::from_millis(300));

    // Send Cmd+Shift+. to Finder twice via System Events.
    // This toggles hidden-files visibility ON then OFF, which forces
    // Finder to re-read all visible directories.
    let script = r#"tell application "System Events"
  tell process "Finder"
    keystroke "." using {command down, shift down}
    delay 0.3
    keystroke "." using {command down, shift down}
  end tell
end tell
return "toggled"
"#;
    match crate::macos_external::run_output(
        "osascript",
        vec![
            std::ffi::OsString::from("-e"),
            std::ffi::OsString::from(script),
        ],
    ) {
        Ok(out) => {
            if !out.status.success() {
                let message = crate::macos_external::output_message(&out, "Finder refresh failed");
                warn!(target: "chromvoid_lib::volume_fuse::imp", error = %message, "poke_finder_dir: toggle failed");
            } else {
                info!(target: "chromvoid_lib::volume_fuse::imp", "poke_finder_dir: toggled hidden files");
            }
        }
        Err(e) => {
            warn!(target: "chromvoid_lib::volume_fuse::imp", err = %e, "poke_finder_dir: spawn failed");
        }
    }
}

#[cfg(target_os = "macos")]
pub(super) const XATTR_NOT_FOUND: i32 = libc::ENOATTR;

#[cfg(target_os = "linux")]
pub(super) const XATTR_NOT_FOUND: i32 = libc::ENODATA;

#[cfg(target_os = "macos")]
pub(super) async fn macos_diskutil_unmount_force(mountpoint: &Path) -> Result<(), String> {
    let mp = mountpoint.to_path_buf();

    let out = crate::macos_external::run_output_with_timeout(
        "diskutil",
        vec![
            std::ffi::OsString::from("unmount"),
            std::ffi::OsString::from("force"),
            mp.as_os_str().to_os_string(),
        ],
        Duration::from_secs(3),
    )
    .await
    .map_err(|error| {
        if error == "diskutil timed out" {
            "diskutil unmount timed out".to_string()
        } else {
            error
        }
    })?;

    if out.status.success() {
        return Ok(());
    }

    Err(crate::macos_external::output_message(
        &out,
        "diskutil unmount failed",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_runtime_mount_paths_are_isolated() {
        let first = FusePlatformRuntime::new();
        let second = FusePlatformRuntime::new();

        first.set_mount_path(Some(PathBuf::from("/tmp/chromvoid-fuse-one")));

        assert_eq!(
            first.mount_path_for_tests(),
            Some(PathBuf::from("/tmp/chromvoid-fuse-one"))
        );
        assert_eq!(second.mount_path_for_tests(), None);

        first.shutdown_and_join();
        second.shutdown_and_join();
    }

    #[test]
    fn platform_runtime_shutdown_is_idempotent() {
        let runtime = FusePlatformRuntime::new();
        assert!(runtime.worker_is_running_for_tests());

        runtime.shutdown_and_join();
        runtime.shutdown_and_join();

        assert!(!runtime.worker_is_running_for_tests());
    }

    #[test]
    fn platform_runtime_ignores_work_after_shutdown() {
        let runtime = FusePlatformRuntime::new();
        runtime.shutdown_and_join();

        runtime.notify_kernel_delete(1, 2, "deleted.txt", None);
        runtime.poke_finder_dir("/");

        assert!(!runtime.worker_is_running_for_tests());
    }

    #[test]
    fn platform_runtime_poke_without_mount_path_is_noop() {
        let runtime = FusePlatformRuntime::new();

        runtime.poke_finder_dir("/");

        assert!(runtime.worker_is_running_for_tests());
        runtime.shutdown_and_join();
    }
}
