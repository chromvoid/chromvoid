use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

use tauri::Emitter;

use crate::core_adapter::CoreAdapter;
use crate::types::*;
use crate::volume_manager;

use super::helpers::{volume_join_timeout, volume_status_from_vm};
#[cfg(target_os = "macos")]
use super::macos::{macos_diskutil_unmount_force, macos_path_looks_mounted};

pub(crate) async fn volume_unmount_inner_with_budget(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    vm: Arc<Mutex<volume_manager::VolumeManager>>,
    max_wait: Option<Duration>,
) -> Result<VolumeStatus, String> {
    let vault_locked = {
        let adapter = adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        !adapter.is_unlocked()
    };

    let (mut backend, join_timeout) = {
        let mut vm = vm
            .lock()
            .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
        let _ = vm.unmount();
        let join_timeout = volume_join_timeout(vm.operation_timeout(), max_wait);
        (vm.take_backend(), join_timeout)
    };

    #[cfg(target_os = "macos")]
    let fuse_mountpoint_for_cleanup: Option<std::path::PathBuf> = backend
        .as_ref()
        .and_then(|h| (h.backend() == "fuse").then(|| std::path::PathBuf::from(h.mountpoint())));

    if let Some(h) = backend.as_mut() {
        h.shutdown();
    }

    if let Some(h) = backend.take() {
        let fuse_staging_dir = h.fuse_staging_dir();
        let join_res = tokio::time::timeout(join_timeout, h.join()).await;
        if join_res.is_err() {
            if let Some(dir) = fuse_staging_dir {
                let _ = std::fs::remove_dir_all(dir);
            }

            #[cfg(target_os = "macos")]
            {
                if let Some(mp) = fuse_mountpoint_for_cleanup.as_ref() {
                    let _ = macos_diskutil_unmount_force(mp).await;
                    if !macos_path_looks_mounted(mp).unwrap_or(true) {
                        let st = {
                            let mut vm = vm
                                .lock()
                                .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                            let _ = vm.unmount_complete(vault_locked);
                            volume_status_from_vm(&vm)
                        };
                        let _ = app.emit("volume:status", &st);
                        return Ok(st);
                    }
                }
            }

            let st = {
                let mut vm = vm
                    .lock()
                    .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                vm.unmount_failed();
                vm.set_last_error(volume_manager::VolumeError::Timeout.to_string());
                volume_status_from_vm(&vm)
            };
            let _ = app.emit("volume:status", &st);
            return Ok(st);
        }
    }

    let st = {
        let mut vm = vm
            .lock()
            .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
        let _ = vm.unmount_complete(vault_locked);
        volume_status_from_vm(&vm)
    };

    let _ = app.emit("volume:status", &st);
    Ok(st)
}

pub(crate) async fn volume_unmount_inner(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    vm: Arc<Mutex<volume_manager::VolumeManager>>,
) -> Result<VolumeStatus, String> {
    volume_unmount_inner_with_budget(app, adapter, vm, None).await
}
