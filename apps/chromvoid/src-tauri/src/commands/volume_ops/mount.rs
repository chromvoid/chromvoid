use std::sync::Arc;
use std::sync::Mutex;

use tauri::{Emitter, Manager};

use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::types::*;
#[cfg(any(target_os = "linux", target_os = "macos"))]
use crate::volume_fuse;
use crate::volume_manager::{self, VolumeState};
use crate::volume_webdav;

#[cfg(any(target_os = "linux", target_os = "macos"))]
use super::helpers::resolve_volume_backend_choice;
use super::helpers::volume_status_from_vm;
#[cfg(target_os = "macos")]
use super::macos::{macos_prepare_volumes_mountpoint, macos_volumes_mountpoint_owned_by_user};

pub(crate) async fn volume_mount_inner(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    vm: Arc<Mutex<volume_manager::VolumeManager>>,
    backend: Option<String>,
) -> Result<VolumeStatus, String> {
    // Preflight: vault must be unlocked.
    {
        let adapter = adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        if !adapter.is_unlocked() {
            return Err("Vault is locked".to_string());
        }
        if adapter.mode() != CoreMode::Local {
            return Err("Volume mount is supported only in local mode".to_string());
        }
    }

    {
        let mut vm = vm
            .lock()
            .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
        if let Err(e) = vm.preflight_check() {
            vm.set_last_error(e.to_string());
            let st = volume_status_from_vm(&vm);
            let _ = app.emit("volume:status", &st);
            return Err(e.to_string());
        }
        if let Err(e) = vm.mount() {
            vm.set_last_error(e.to_string());
            let st = volume_status_from_vm(&vm);
            let _ = app.emit("volume:status", &st);
            return Err(e.to_string());
        }
        if matches!(vm.state(), VolumeState::Mounted) {
            return Ok(volume_status_from_vm(&vm));
        }
    }

    let use_fuse = {
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            let fuse_status = volume_manager::detect_fuse_driver();
            match resolve_volume_backend_choice(backend.as_deref(), fuse_status) {
                Ok(use_fuse) => use_fuse,
                Err(msg) => {
                    let st = {
                        let mut vm = vm
                            .lock()
                            .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                        vm.mount_failed();
                        vm.set_last_error(msg.clone());
                        volume_status_from_vm(&vm)
                    };
                    let _ = app.emit("volume:status", &st);
                    return Err(msg);
                }
            }
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        {
            match backend.as_deref() {
                Some("fuse") => {
                    let msg = "FUSE is not supported on this platform".to_string();
                    let st = {
                        let mut vm = vm
                            .lock()
                            .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                        vm.mount_failed();
                        vm.set_last_error(msg.clone());
                        volume_status_from_vm(&vm)
                    };
                    let _ = app.emit("volume:status", &st);
                    return Err(msg);
                }
                Some("webdav") | None => false,
                Some(_) => false,
            }
        }
    };

    if use_fuse {
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("app_data_dir: {e}"))?;

            // Staging must be outside the mountpoint. On macOS, the preferred mountpoint is
            // under /Volumes for Finder visibility, but /Volumes itself is not user-writable.
            // Keep staging under the app data dir.
            let staging_dir = app_data_dir.join("volume-staging");

            let mut mount_candidates: Vec<std::path::PathBuf> = Vec::new();

            #[cfg(target_os = "macos")]
            {
                let volumes_mp = std::path::PathBuf::from("/Volumes/ChromVoid");
                let allow_admin_prompt = backend.as_deref() == Some("fuse");

                let volumes_ready = if allow_admin_prompt {
                    match macos_prepare_volumes_mountpoint(&volumes_mp) {
                        Ok(()) => true,
                        Err(e) => {
                            tracing::warn!(
                                "FUSE: cannot prepare /Volumes mountpoint ({e}); falling back"
                            );
                            false
                        }
                    }
                } else {
                    // Auto-detect path: don't trigger elevation. Use /Volumes only when already ready.
                    macos_volumes_mountpoint_owned_by_user(&volumes_mp)
                };

                if volumes_ready {
                    mount_candidates.push(volumes_mp);
                }
            }

            mount_candidates.push(app_data_dir.join("volume"));

            let mut last_err: Option<String> = None;

            for mountpoint in mount_candidates {
                match volume_fuse::start_fuse_server(
                    mountpoint,
                    staging_dir.clone(),
                    adapter.clone(),
                )
                .await
                {
                    Ok(h) => {
                        #[cfg(target_os = "macos")]
                        {
                            let mp = h.mountpoint().clone();
                            let _ = std::process::Command::new("open").arg(&mp).spawn();
                        }

                        let st = {
                            let mut vm = vm
                                .lock()
                                .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                            vm.set_fuse(h);
                            if let Err(e) = vm.mount_complete() {
                                vm.set_last_error(e.to_string());
                            }
                            volume_status_from_vm(&vm)
                        };
                        let _ = app.emit("volume:status", &st);
                        return Ok(st);
                    }
                    Err(e) => {
                        last_err = Some(e);
                    }
                }
            }

            let e = last_err.unwrap_or_else(|| "unknown error".to_string());

            if backend.as_deref() == Some("fuse") {
                let msg = format!("FUSE mount failed: {e}");
                let st = {
                    let mut vm = vm
                        .lock()
                        .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                    vm.mount_failed();
                    vm.set_last_error(msg.clone());
                    volume_status_from_vm(&vm)
                };
                let _ = app.emit("volume:status", &st);
                return Err(msg);
            }

            tracing::warn!("FUSE auto-mount failed ({e}), falling back to WebDAV");
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        {
            if backend.as_deref() == Some("fuse") {
                let msg = "FUSE is not supported on this platform".to_string();
                let st = {
                    let mut vm = vm
                        .lock()
                        .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                    vm.mount_failed();
                    vm.set_last_error(msg.clone());
                    volume_status_from_vm(&vm)
                };
                let _ = app.emit("volume:status", &st);
                return Err(msg);
            }
        }
    }

    // WebDAV fallback / explicit selection
    let handle = match volume_webdav::start_webdav_server(app.clone(), adapter.clone()).await {
        Ok(h) => h,
        Err(e) => {
            let msg = format!("WebDAV start failed: {e}");
            let st = {
                let mut vm = vm
                    .lock()
                    .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
                vm.mount_failed();
                vm.set_last_error(msg.clone());
                volume_status_from_vm(&vm)
            };
            let _ = app.emit("volume:status", &st);
            return Err(msg);
        }
    };

    let st = {
        let mut vm = vm
            .lock()
            .map_err(|_| "VolumeManager mutex poisoned".to_string())?;
        vm.set_webdav(handle);
        if let Err(e) = vm.mount_complete() {
            vm.set_last_error(e.to_string());
        }
        if let Err(e) = vm.health_check() {
            vm.set_last_error(e.to_string());
        }
        volume_status_from_vm(&vm)
    };

    let _ = app.emit("volume:status", &st);
    Ok(st)
}
