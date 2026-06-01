use std::ffi::OsString;
use std::net::SocketAddr;
use std::path::Path;
use std::time::Duration;

use crate::macos_external;

pub(crate) const MACOS_VOLUMES_KEEP_FILE: &str = ".chromvoid-keep";

pub(crate) fn macos_volumes_mountpoint_owned_by_user(mountpoint: &Path) -> bool {
    use std::os::unix::fs::MetadataExt as _;

    // SAFETY: geteuid is async-signal-safe and never fails per POSIX; takes no args.
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

    // SAFETY: geteuid is async-signal-safe and never fails per POSIX; takes no args.
    let euid = unsafe { libc::geteuid() };
    let mp = mountpoint.to_string_lossy();

    // NOTE: keep this command constant + single-quoted to avoid injection.
    // `mp` is a static path in our code (/Volumes/ChromVoid).
    let cmd = format!("mkdir -p '{mp}' && chown {euid} '{mp}'");
    let script = format!("do shell script \"{cmd}\" with administrator privileges");

    let out = macos_external::run_output(
        "osascript",
        vec![OsString::from("-e"), OsString::from(script)],
    )?;

    if !out.status.success() {
        return Err(macos_external::output_message(&out, "Admin prompt failed"));
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

    let out = macos_external::run_output_with_timeout(
        "diskutil",
        vec![
            OsString::from("unmount"),
            OsString::from("force"),
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

    Err(macos_external::output_message(
        &out,
        "diskutil unmount failed",
    ))
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

    let result = macos_external::run_blocking_with_timeout(
        "webdav unmount",
        Duration::from_secs(2),
        move || {
            let out = macos_external::run_output(
                "mount",
                vec![OsString::from("-t"), OsString::from("webdav")],
            )?;
            if !out.status.success() {
                return Err(macos_external::output_message(
                    &out,
                    "mount webdav lookup failed",
                ));
            }
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
                let out = macos_external::run_output("umount", vec![OsString::from(mountpoint)])?;
                if !out.status.success() {
                    return Err(macos_external::output_message(&out, "umount failed"));
                }
                return Ok(());
            }
            Ok(())
        },
    )
    .await;

    match result {
        Ok(()) => {}
        Err(error) if error == "webdav unmount timed out" => {
            tracing::warn!("webdav unmount timed out")
        }
        Err(error) if error.starts_with("webdav unmount task failed:") => {
            tracing::warn!("{error}")
        }
        Err(error) => tracing::warn!("webdav unmount command failed: {error}"),
    }
}

pub(crate) fn macos_open_path_best_effort(path: &Path) {
    if let Err(error) =
        macos_external::spawn_best_effort("open", vec![path.as_os_str().to_os_string()])
    {
        tracing::warn!("open mountpoint failed: {error}");
    }
}

pub(crate) fn macos_mountpoint_is_unhealthy(mountpoint: &Path) -> bool {
    match std::fs::read_dir(mountpoint) {
        Ok(_) => false,
        Err(e) => matches!(e.raw_os_error(), Some(libc::ENXIO) | Some(libc::EIO)),
    }
}
