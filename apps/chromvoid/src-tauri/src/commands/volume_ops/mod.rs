mod commands;
mod helpers;
#[cfg(target_os = "macos")]
mod macos;
mod mount;
mod unmount;

// Tauri command handlers
pub(crate) use commands::{volume_get_backends, volume_get_status, volume_mount, volume_unmount};

// Mount/unmount inner logic
pub(crate) use mount::volume_mount_inner;
pub(crate) use unmount::volume_unmount_inner_with_budget;

// Helper functions
pub(crate) use helpers::{
    perform_volume_teardown, volume_join_timeout, volume_spawn_join_backend, volume_status_from_vm,
    volume_take_backend_on_vault_lock,
};

// macOS-specific helpers
#[cfg(target_os = "macos")]
pub(crate) use macos::{
    macos_diskutil_unmount_force, macos_find_and_unmount_webdav, macos_mountpoint_is_unhealthy,
    macos_path_looks_mounted,
};

#[cfg(all(test, any(target_os = "linux", target_os = "macos")))]
mod volume_backend_tests {
    use crate::types::*;
    use crate::volume_manager::FuseDriverStatus;

    use super::helpers::{resolve_volume_backend_choice, volume_backends_from_fuse_status};

    #[test]
    fn volume_backend_reports_install_url_when_fuse_missing() {
        let backends = volume_backends_from_fuse_status(FuseDriverStatus::Missing);
        let fuse = backends
            .iter()
            .find(|backend| backend.id == "fuse")
            .expect("fuse backend should be present on linux/macos");

        assert!(!fuse.available);
        assert!(fuse.install_url.is_some());
    }

    #[test]
    fn volume_mount_explicit_fuse_no_fallback_when_driver_missing() {
        let result = resolve_volume_backend_choice(Some("fuse"), FuseDriverStatus::Missing);
        assert!(
            result.is_err(),
            "explicit fuse must fail when driver missing"
        );
    }

    #[test]
    fn auto_prefers_fuse_when_driver_available() {
        let result = resolve_volume_backend_choice(None, FuseDriverStatus::Available)
            .expect("auto selection should succeed");
        assert!(result, "auto selection should prefer fuse when available");
    }

    #[test]
    fn auto_uses_webdav_when_driver_missing() {
        let result = resolve_volume_backend_choice(None, FuseDriverStatus::Missing)
            .expect("auto selection should succeed");
        assert!(
            !result,
            "auto selection should use webdav when fuse is missing"
        );
    }

    #[test]
    fn explicit_webdav_never_selects_fuse() {
        let with_driver =
            resolve_volume_backend_choice(Some("webdav"), FuseDriverStatus::Available)
                .expect("explicit webdav should succeed when fuse is available");
        assert!(!with_driver, "explicit webdav should not select fuse");

        let without_driver =
            resolve_volume_backend_choice(Some("webdav"), FuseDriverStatus::Missing)
                .expect("explicit webdav should succeed when fuse is missing");
        assert!(!without_driver, "explicit webdav should not select fuse");
    }
}

#[cfg(all(test, target_os = "macos"))]
mod volume_unmount_safety_tests {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use std::time::Duration;

    use tempfile::tempdir;

    use crate::volume_manager;

    use super::helpers::volume_spawn_join_backend;
    use super::macos::macos_mountpoint_is_unhealthy;

    #[tokio::test]
    async fn volume_unmount_timeout_cleans_staging() {
        let temp = tempdir().expect("tempdir");
        let mountpoint = temp.path().join("mount");
        let staging_dir = temp.path().join("staging");
        std::fs::create_dir_all(&mountpoint).expect("create mountpoint dir");
        std::fs::create_dir_all(&staging_dir).expect("create staging dir");

        let (shutdown_tx, _shutdown_rx) = tokio::sync::mpsc::channel(1);
        let fuse_task = tokio::spawn(async {
            std::future::pending::<()>().await;
        });
        let fuse_handle = volume_manager::FuseSessionHandle::new(
            mountpoint,
            staging_dir.clone(),
            Arc::new(AtomicBool::new(false)),
            shutdown_tx,
            fuse_task,
        );

        volume_spawn_join_backend(volume_manager::VolumeBackendHandle::Fuse(fuse_handle));
        tokio::time::sleep(Duration::from_secs(4)).await;

        assert!(
            !staging_dir.exists(),
            "timeout path must remove staging dir"
        );
    }

    #[test]
    fn volume_stale_mount_cleanup_skips_healthy_mountpoint() {
        let temp = tempdir().expect("tempdir");
        let mountpoint = temp.path().join("healthy-mountpoint");
        std::fs::create_dir_all(&mountpoint).expect("create healthy mountpoint");

        let mut force_unmount_called = false;
        let simulated_looks_mounted = true;

        if simulated_looks_mounted && macos_mountpoint_is_unhealthy(&mountpoint) {
            force_unmount_called = true;
        }

        assert!(!macos_mountpoint_is_unhealthy(&mountpoint));
        assert!(
            !force_unmount_called,
            "healthy mountpoints must not be force-unmounted"
        );
    }
}
