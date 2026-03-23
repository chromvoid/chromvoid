use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

use tauri::Emitter;

use crate::types::*;
use crate::volume_manager::{self, FuseDriverStatus, VolumeState};

pub(crate) fn fuse_backend_label_and_install_url() -> (String, String) {
    if cfg!(target_os = "macos") {
        (
            "FUSE (macFUSE)".to_string(),
            "https://osxfuse.github.io/".to_string(),
        )
    } else {
        (
            "FUSE".to_string(),
            "https://github.com/libfuse/libfuse".to_string(),
        )
    }
}

pub(crate) fn volume_backends_from_fuse_status(fuse_status: FuseDriverStatus) -> Vec<BackendInfo> {
    let mut backends = Vec::new();
    let available = fuse_status == FuseDriverStatus::Available;
    let (label, install_url) = fuse_backend_label_and_install_url();

    backends.push(BackendInfo {
        id: "fuse".to_string(),
        available,
        label,
        install_url: if available { None } else { Some(install_url) },
    });

    backends.push(BackendInfo {
        id: "webdav".to_string(),
        available: true,
        label: "WebDAV".to_string(),
        install_url: None,
    });

    backends
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub(crate) fn resolve_volume_backend_choice(
    backend: Option<&str>,
    fuse_status: FuseDriverStatus,
) -> Result<bool, String> {
    match backend {
        Some("fuse") => {
            if fuse_status == FuseDriverStatus::Available {
                Ok(true)
            } else {
                let (_, install_url) = fuse_backend_label_and_install_url();
                Err(format!(
                    "FUSE driver is unavailable ({fuse_status:?}). Install: {install_url}"
                ))
            }
        }
        Some("webdav") => Ok(false),
        _ => Ok(fuse_status == FuseDriverStatus::Available),
    }
}

pub(crate) fn volume_status_from_vm(vm: &volume_manager::VolumeManager) -> VolumeStatus {
    let (state, error) = match vm.state() {
        VolumeState::Mounted => ("mounted".to_string(), None),
        VolumeState::Mounting => ("mounting".to_string(), None),
        VolumeState::Unmounting => ("unmounting".to_string(), None),
        VolumeState::DriverMissing => ("driver_missing".to_string(), None),
        VolumeState::NeedsCleanup => ("error".to_string(), Some("needs cleanup".to_string())),
        VolumeState::Error(_) => (
            "error".to_string(),
            vm.last_error()
                .map(|s| s.to_string())
                .or(Some("volume error".to_string())),
        ),
        VolumeState::Locked | VolumeState::Unlocked => ("unmounted".to_string(), None),
    };

    VolumeStatus {
        state,
        backend: vm.backend_type().map(|s| s.to_string()),
        mountpoint: vm.mountpoint(),
        webdav_port: vm.webdav_port(),
        error,
    }
}

pub(crate) fn volume_take_backend_on_vault_lock(
    app: &tauri::AppHandle,
    vm: &Arc<Mutex<volume_manager::VolumeManager>>,
) -> Option<volume_manager::VolumeBackendHandle> {
    match vm.lock() {
        Ok(mut vm) => {
            let _ = vm.notify_locked();
            let st = volume_status_from_vm(&vm);
            let _ = app.emit("volume:status", &st);
            vm.take_backend()
        }
        Err(_) => None,
    }
}

pub(crate) fn volume_spawn_join_backend(handle: volume_manager::VolumeBackendHandle) {
    tauri::async_runtime::spawn(async move {
        let fuse_staging_dir = handle.fuse_staging_dir();
        if tokio::time::timeout(Duration::from_secs(3), handle.join())
            .await
            .is_err()
        {
            if let Some(dir) = fuse_staging_dir {
                let _ = std::fs::remove_dir_all(dir);
            }
        }
    });
}

pub(crate) fn perform_volume_teardown(
    app: &tauri::AppHandle,
    vm: &Arc<Mutex<volume_manager::VolumeManager>>,
) {
    let backend = volume_take_backend_on_vault_lock(app, vm);
    if let Some(mut h) = backend {
        h.shutdown();
        volume_spawn_join_backend(h);
    }
}

pub(crate) fn volume_join_timeout(
    operation_timeout: Duration,
    max_wait: Option<Duration>,
) -> Duration {
    let mut join_timeout = operation_timeout.clamp(Duration::from_secs(3), Duration::from_secs(15));
    if let Some(max_wait) = max_wait {
        join_timeout = join_timeout.min(max_wait);
    }
    join_timeout
}
