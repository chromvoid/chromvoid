use super::*;

pub(super) fn set_kernel_notifier(notifier: Option<Notifier>) {
    let lock = FUSE_NOTIFIER.get_or_init(|| RwLock::new(None));
    if let Ok(mut guard) = lock.write() {
        *guard = notifier;
    }
}

pub(super) fn notify_kernel_delete(
    parent_ino: u64,
    child_ino: u64,
    name: &str,
    secondary_parent: Option<(u64, String)>,
) {
    let Some(lock) = FUSE_NOTIFIER.get() else {
        return;
    };
    let notifier = match lock.read() {
        Ok(guard) => guard.clone(),
        Err(_) => return,
    };
    let Some(notifier) = notifier else {
        return;
    };

    let name = name.to_string();

    info!(
        target: "chromvoid_lib::volume_fuse::imp",
        parent_ino,
        child_ino,
        name = name.as_str(),
        secondary_parent_ino = secondary_parent.as_ref().map(|(ino, _)| *ino),
        secondary_name = secondary_parent.as_ref().map(|(_, n)| n.as_str()),
        "FUSE notify delete queued"
    );

    // All notifier calls MUST run in a background thread on macFUSE.
    // Calling them from a FUSE handler thread (even after reply.ok())
    // deadlocks because the kernel holds vnode locks tied to the request context.
    std::thread::spawn(move || {
        let name_os = OsStr::new(&name);

        if let Err(e) = notifier.delete(parent_ino, child_ino, name_os) {
            warn!(target: "chromvoid_lib::volume_fuse::imp", parent_ino, child_ino, name = name.as_str(), err = %e, "FUSE notify delete failed");
        }

        for retry_ms in [0_u64, 60, 250] {
            if retry_ms > 0 {
                std::thread::sleep(std::time::Duration::from_millis(retry_ms));
            }
            if let Err(e) = notifier.inval_inode(parent_ino, 0, 0) {
                warn!(target: "chromvoid_lib::volume_fuse::imp", parent_ino, retry_ms, err = %e, "FUSE notify inval_inode(parent) retry failed");
            }
            if let Err(e) = notifier.inval_entry(parent_ino, name_os) {
                warn!(target: "chromvoid_lib::volume_fuse::imp", parent_ino, name = name.as_str(), retry_ms, err = %e, "FUSE notify inval_entry retry failed");
            }
            if let Err(e) = notifier.inval_inode(child_ino, 0, 0) {
                warn!(target: "chromvoid_lib::volume_fuse::imp", child_ino, retry_ms, err = %e, "FUSE notify inval_inode(child) retry failed");
            }
            if let Some((sec_parent_ino, ref sec_name)) = secondary_parent {
                let sec_name_os = OsStr::new(sec_name);
                let _ = notifier.inval_inode(sec_parent_ino, 0, 0);
                let _ = notifier.inval_entry(sec_parent_ino, sec_name_os);
            }
        }
    });
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
pub(super) fn poke_finder_dir(_parent_catalog_path: &str) {
    if FUSE_MOUNT_PATH.get().is_none() {
        return;
    }
    std::thread::spawn(move || {
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
        match std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
        {
            Ok(out) => {
                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    warn!(target: "chromvoid_lib::volume_fuse::imp", stderr = stderr.as_ref(), "poke_finder_dir: toggle failed");
                } else {
                    info!(target: "chromvoid_lib::volume_fuse::imp", "poke_finder_dir: toggled hidden files");
                }
            }
            Err(e) => {
                warn!(target: "chromvoid_lib::volume_fuse::imp", err = %e, "poke_finder_dir: spawn failed");
            }
        }
    });
}

#[cfg(not(target_os = "macos"))]
pub(super) fn poke_finder_dir(_parent_catalog_path: &str) {}

#[cfg(target_os = "macos")]
pub(super) const XATTR_NOT_FOUND: i32 = libc::ENOATTR;

#[cfg(target_os = "linux")]
pub(super) const XATTR_NOT_FOUND: i32 = libc::ENODATA;

#[cfg(target_os = "macos")]
pub(super) async fn macos_diskutil_unmount_force(mountpoint: &Path) -> Result<(), String> {
    let mp = mountpoint.to_path_buf();

    let out = tokio::time::timeout(
        Duration::from_secs(3),
        tokio::task::spawn_blocking(move || {
            std::process::Command::new("diskutil")
                .arg("unmount")
                .arg("force")
                .arg(&mp)
                .output()
        }),
    )
    .await
    .map_err(|_| "diskutil unmount timed out".to_string())
    .and_then(|r| r.map_err(|e| format!("diskutil task failed: {e}")))
    .and_then(|r| r.map_err(|e| format!("Failed to run diskutil: {e}")))?;

    if out.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let msg = stderr.trim();
    let msg = if msg.is_empty() { stdout.trim() } else { msg };
    Err(if msg.is_empty() {
        "diskutil unmount failed".to_string()
    } else {
        msg.to_string()
    })
}
