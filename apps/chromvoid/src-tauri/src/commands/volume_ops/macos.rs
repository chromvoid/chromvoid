use std::net::SocketAddr;
use std::path::Path;
use std::time::Duration;

pub(crate) const MACOS_VOLUMES_KEEP_FILE: &str = ".chromvoid-keep";

pub(crate) fn macos_volumes_mountpoint_owned_by_user(mountpoint: &Path) -> bool {
    use std::os::unix::fs::MetadataExt as _;

    let euid = unsafe { libc::geteuid() };
    let Ok(meta) = std::fs::metadata(mountpoint) else {
        return false;
    };
    meta.is_dir() && meta.uid() == euid
}

pub(crate) fn macos_touch_volumes_keep_file(mountpoint: &Path) {
    let keep = mountpoint.join(MACOS_VOLUMES_KEEP_FILE);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(keep);
}

pub(crate) fn macos_prepare_volumes_mountpoint_without_admin(mountpoint: &Path) -> bool {
    if std::fs::create_dir_all(mountpoint).is_err() {
        return false;
    }
    if !macos_volumes_mountpoint_owned_by_user(mountpoint) {
        return false;
    }
    macos_touch_volumes_keep_file(mountpoint);
    true
}

/// Best-effort setup for mounting under `/Volumes`.
///
/// This triggers a system admin prompt via AppleScript when needed.
/// If the user cancels, the caller should fall back to a user-writable mountpoint.
pub(crate) fn macos_prepare_volumes_mountpoint(mountpoint: &Path) -> Result<(), String> {
    if macos_volumes_mountpoint_owned_by_user(mountpoint) {
        macos_touch_volumes_keep_file(mountpoint);
        return Ok(());
    }

    if macos_prepare_volumes_mountpoint_without_admin(mountpoint) {
        return Ok(());
    }

    let euid = unsafe { libc::geteuid() };
    let mp = mountpoint.to_string_lossy();

    // NOTE: keep this command constant + single-quoted to avoid injection.
    // `mp` is a static path in our code (/Volumes/ChromVoid).
    let cmd = format!("mkdir -p '{mp}' && chown {euid} '{mp}'");
    let script = format!("do shell script \"{cmd}\" with administrator privileges");

    let out = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to run osascript: {e}"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        let msg = stderr.trim();
        let msg = if msg.is_empty() { stdout.trim() } else { msg };
        return Err(if msg.is_empty() {
            "Admin prompt failed".to_string()
        } else {
            msg.to_string()
        });
    }

    if macos_volumes_mountpoint_owned_by_user(mountpoint) {
        macos_touch_volumes_keep_file(mountpoint);
        Ok(())
    } else {
        Err("Failed to prepare /Volumes mountpoint".to_string())
    }
}

pub(crate) async fn macos_diskutil_unmount_force(mountpoint: &Path) -> Result<(), String> {
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

pub(crate) fn macos_path_looks_mounted(mountpoint: &Path) -> Result<bool, String> {
    use std::os::unix::fs::MetadataExt as _;

    if !mountpoint.exists() {
        return Ok(false);
    }

    let meta =
        std::fs::metadata(mountpoint).map_err(|e| format!("Failed to stat mountpoint: {e}"))?;
    if !meta.is_dir() {
        return Ok(false);
    }

    let parent = mountpoint
        .parent()
        .ok_or_else(|| "Mountpoint has no parent".to_string())?;
    let parent_meta = std::fs::metadata(parent)
        .map_err(|e| format!("Failed to stat parent of mountpoint: {e}"))?;

    Ok(meta.dev() != parent_meta.dev())
}

pub(crate) async fn macos_find_and_unmount_webdav(addr: &SocketAddr) {
    let needle = format!("http://{}:{}/", addr.ip(), addr.port());

    let result = tokio::time::timeout(
        Duration::from_secs(2),
        tokio::task::spawn_blocking(move || {
            let out = std::process::Command::new("mount")
                .arg("-t")
                .arg("webdav")
                .output()?;
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                // Format: "<url> on <mountpoint> (<options>)"
                if !line.contains(&needle) {
                    continue;
                }
                let Some(on_pos) = line.find(" on ") else {
                    continue;
                };
                let rest = &line[on_pos + 4..];
                let mountpoint = match rest.rfind(" (") {
                    Some(p) => &rest[..p],
                    None => rest.trim(),
                };
                if mountpoint.is_empty() {
                    continue;
                }
                let _ = std::process::Command::new("umount")
                    .arg(mountpoint)
                    .output();
                return Ok::<_, std::io::Error>(());
            }
            Ok(())
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(e))) => tracing::warn!("webdav unmount command failed: {e}"),
        Ok(Err(e)) => tracing::warn!("webdav unmount task failed: {e}"),
        Err(_) => tracing::warn!("webdav unmount timed out"),
    }
}

pub(crate) fn macos_mountpoint_is_unhealthy(mountpoint: &Path) -> bool {
    match std::fs::read_dir(mountpoint) {
        Ok(_) => false,
        Err(e) => matches!(e.raw_os_error(), Some(libc::ENXIO) | Some(libc::EIO)),
    }
}
