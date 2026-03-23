#[cfg(test)]
mod tests {
    use crate::volume_manager::{
        detect_fuse_driver, FuseDriverStatus, FuseSessionHandle, VolumeError, VolumeManager,
        VolumeState,
    };
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tokio::sync::mpsc;

    #[test]
    fn initial_state_is_locked() {
        let vm = VolumeManager::new();
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn locked_to_unlocked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        assert_eq!(vm.state(), VolumeState::Unlocked);
    }

    #[test]
    fn unlocked_does_not_auto_mount() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        assert_eq!(vm.state(), VolumeState::Unlocked);
        assert_ne!(vm.state(), VolumeState::Mounted);
    }

    #[test]
    fn notify_locked_when_unlocked_no_unmount_needed() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        let needs = vm.notify_locked();
        assert!(!needs);
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn notify_locked_when_mounted_needs_unmount() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        let needs = vm.notify_locked();
        assert!(needs);
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn notify_locked_when_mounting_needs_unmount() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        let needs = vm.notify_locked();
        assert!(needs);
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn mount_when_unlocked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        assert!(vm.mount().is_ok());
        assert_eq!(vm.state(), VolumeState::Mounting);
    }

    #[test]
    fn mount_complete_flow() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        assert_eq!(vm.state(), VolumeState::Mounted);
    }

    #[test]
    fn mount_when_locked_fails() {
        let mut vm = VolumeManager::new();
        assert_eq!(vm.mount(), Err(VolumeError::VaultLocked));
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn mount_idempotent_when_mounted() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        assert!(vm.mount().is_ok());
        assert_eq!(vm.state(), VolumeState::Mounted);
    }

    #[test]
    fn mount_idempotent_when_mounting() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        assert!(vm.mount().is_ok());
        assert_eq!(vm.state(), VolumeState::Mounting);
    }

    #[test]
    fn mount_failed_transition() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_failed();
        assert_eq!(vm.state(), VolumeState::Error(VolumeError::MountFailed));
    }

    #[test]
    fn mount_when_driver_missing() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.set_driver_missing();
        assert_eq!(vm.mount(), Err(VolumeError::BackendUnavailable));
    }

    #[test]
    fn unmount_when_mounted() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        assert!(vm.unmount().is_ok());
        assert_eq!(vm.state(), VolumeState::Unmounting);
    }

    #[test]
    fn unmount_complete_to_unlocked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        vm.unmount().unwrap();
        vm.unmount_complete(false).unwrap();
        assert_eq!(vm.state(), VolumeState::Unlocked);
    }

    #[test]
    fn unmount_complete_to_locked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        vm.unmount().unwrap();
        vm.unmount_complete(true).unwrap();
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn unmount_idempotent_when_unlocked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        assert!(vm.unmount().is_ok());
        assert_eq!(vm.state(), VolumeState::Unlocked);
    }

    #[test]
    fn unmount_idempotent_when_locked() {
        let mut vm = VolumeManager::new();
        assert!(vm.unmount().is_ok());
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn unmount_idempotent_when_unmounting() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        vm.unmount().unwrap();
        assert!(vm.unmount().is_ok());
        assert_eq!(vm.state(), VolumeState::Unmounting);
    }

    #[test]
    fn unmount_cancels_mounting() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        assert_eq!(vm.state(), VolumeState::Mounting);
        vm.unmount().unwrap();
        assert_eq!(vm.state(), VolumeState::Unlocked);
    }

    #[test]
    fn unmount_failed_goes_to_needs_cleanup() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        vm.unmount().unwrap();
        vm.unmount_failed();
        assert_eq!(vm.state(), VolumeState::NeedsCleanup);
    }

    #[test]
    fn error_state_unmount_recovers_to_unlocked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_failed();
        assert_eq!(vm.state(), VolumeState::Error(VolumeError::MountFailed));
        vm.unmount().unwrap();
        assert_eq!(vm.state(), VolumeState::Unlocked);
    }

    #[test]
    fn needs_cleanup_unmount_recovers_to_unlocked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        vm.unmount().unwrap();
        vm.unmount_failed();
        assert_eq!(vm.state(), VolumeState::NeedsCleanup);
        vm.unmount().unwrap();
        assert_eq!(vm.state(), VolumeState::Unlocked);
    }

    #[test]
    fn preflight_when_locked() {
        let vm = VolumeManager::new();
        assert_eq!(vm.preflight_check(), Err(VolumeError::VaultLocked));
    }

    #[test]
    fn preflight_when_unlocked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        assert!(vm.preflight_check().is_ok());
    }

    #[test]
    fn preflight_when_driver_missing() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.set_driver_missing();
        assert_eq!(vm.preflight_check(), Err(VolumeError::BackendUnavailable));
    }

    #[test]
    fn health_check_when_mounted() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        assert!(vm.health_check().is_ok());
    }

    #[test]
    fn health_check_when_not_mounted() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        assert!(vm.health_check().is_err());
    }

    #[test]
    fn full_lifecycle_mount_unmount_lock() {
        let mut vm = VolumeManager::new();
        assert_eq!(vm.state(), VolumeState::Locked);

        vm.notify_unlocked();
        assert_eq!(vm.state(), VolumeState::Unlocked);

        vm.mount().unwrap();
        assert_eq!(vm.state(), VolumeState::Mounting);

        vm.mount_complete().unwrap();
        assert_eq!(vm.state(), VolumeState::Mounted);

        vm.unmount().unwrap();
        assert_eq!(vm.state(), VolumeState::Unmounting);

        vm.unmount_complete(false).unwrap();
        assert_eq!(vm.state(), VolumeState::Unlocked);

        let needs = vm.notify_locked();
        assert!(!needs);
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn lock_while_mounted_forces_locked() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.mount().unwrap();
        vm.mount_complete().unwrap();
        assert_eq!(vm.state(), VolumeState::Mounted);

        let needs = vm.notify_locked();
        assert!(needs);
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn double_lock_is_idempotent() {
        let mut vm = VolumeManager::new();
        let n1 = vm.notify_locked();
        assert!(!n1);
        let n2 = vm.notify_locked();
        assert!(!n2);
        assert_eq!(vm.state(), VolumeState::Locked);
    }

    #[test]
    fn double_unlock_is_idempotent() {
        let mut vm = VolumeManager::new();
        vm.notify_unlocked();
        vm.notify_unlocked();
        assert_eq!(vm.state(), VolumeState::Unlocked);
    }

    #[tokio::test]
    async fn fuse_handle_drop_sets_shutdown_flag_and_notifies_channel() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mountpoint = temp.path().join("mnt");
        let staging_dir = temp.path().join("staging");

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel(1);
        let task = tokio::spawn(async {});

        let handle = FuseSessionHandle::new(
            mountpoint,
            staging_dir,
            shutdown_flag.clone(),
            shutdown_tx,
            task,
        );
        drop(handle);

        assert!(shutdown_flag.load(Ordering::Acquire));
        assert!(shutdown_rx.try_recv().is_ok());
    }

    #[test]
    fn detect_fuse_driver_returns_valid_status() {
        let status = detect_fuse_driver();
        // Should not panic, and should return a valid variant
        match status {
            FuseDriverStatus::Available
            | FuseDriverStatus::Missing
            | FuseDriverStatus::Unsupported => {}
        }
    }
}
