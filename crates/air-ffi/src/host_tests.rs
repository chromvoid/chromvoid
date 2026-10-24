use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;

fn runtime(root: &std::path::Path) -> AirRuntime {
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.join("vault")).unwrap();
    AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    }
}

#[test]
fn foreign_host_is_shared_and_does_not_retain_application_authority() {
    let root = tempfile::tempdir().unwrap();
    let runtime = runtime(root.path());
    let generation = runtime.snapshot().unwrap().generation;
    let authority = Arc::downgrade(&runtime.session);
    let host = runtime.host().unwrap();
    assert!(Arc::ptr_eq(&host, &runtime.host().unwrap()));
    assert!(matches!(host.snapshot().unwrap().phase, AirHostPhase::Idle));
    assert!(matches!(
        host.start_pairing(generation, "https://example.test".into(), "Phone".into()),
        Err(BridgeError::InvalidRelayURL)
    ));
    assert!(matches!(
        host.start_listening(generation, "wss://example.test".into(), " ".into()),
        Err(BridgeError::HostDeviceLabelRequired)
    ));
    drop(runtime);
    assert!(authority.upgrade().is_none());
    assert!(matches!(
        host.start_pairing(generation, "wss://example.test".into(), "Phone".into()),
        Err(BridgeError::SessionRevoked)
    ));
}

#[tokio::test]
async fn foreign_lifecycle_synchronously_clears_host_and_revokes_old_admission() {
    let root = tempfile::tempdir().unwrap();
    let runtime = runtime(root.path());
    let generation = runtime.snapshot().unwrap().generation;
    let host = runtime.host().unwrap();
    assert!(!host.preferences().await.unwrap().enabled);
    assert!(matches!(
        host.resume_if_enabled(generation, "Phone".into())
            .await
            .unwrap()
            .phase,
        AirHostPhase::Idle
    ));
    assert!(host.trusted_peers().await.unwrap().is_empty());
    let started = host
        .start_pairing(generation, "ws://127.0.0.1:1".into(), "Phone".into())
        .unwrap();
    assert!(matches!(started.phase, AirHostPhase::Pairing));
    runtime.deactivate().unwrap();
    let stopped = host.snapshot().unwrap();
    assert!(matches!(stopped.phase, AirHostPhase::Idle));
    assert!(stopped.pairing_pin.is_none());
    assert!(stopped.pairing_offer.is_none());
    assert!(stopped.connected_peers.is_empty());
    assert!(host.events(started.sequence).await.unwrap().sequence > started.sequence);
    assert!(matches!(
        host.start_listening(generation, "ws://127.0.0.1:1".into(), "Phone".into()),
        Err(BridgeError::SessionRevoked)
    ));
    assert!(host.trusted_peers().await.unwrap().is_empty());
    assert!(matches!(
        host.resume_if_enabled(generation, "Phone".into()).await,
        Err(BridgeError::SessionRevoked)
    ));
    runtime.shutdown().unwrap();
}

/// The accessory's descriptor is taken only for a session that can start; a desktop that closes
/// the link ends the session with a reason the platform listens again after.
#[cfg(unix)]
#[tokio::test(flavor = "multi_thread")]
async fn a_usb_accessory_session_takes_its_descriptor_and_names_its_end() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;
    let root = tempfile::tempdir().unwrap();
    let runtime = runtime(root.path());
    let host = runtime.host().unwrap();
    assert!(host.snapshot().unwrap().usb.is_none());
    assert!(!host.start_usb_accessory("bad".into(), -1, "Phone".into()));
    assert!(!host.start_usb_accessory(String::new(), 3, "Phone".into()));

    let (phone, desktop) = UnixStream::pair().unwrap();
    assert!(host.start_usb_accessory("cable".into(), phone.into_raw_fd(), "Phone".into()));
    drop(desktop);
    let ended = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        host.usb_accessory_ended("cable".into()),
    )
    .await
    .expect("the session ends with its link");
    assert_eq!(ended, "transport_closed");
    assert!(!host.resolve_usb_approval(AirUsbApprovalKind::Session, "none".into(), true));

    // A closed runtime refuses the descriptor, which stays the caller's.
    runtime.shutdown().unwrap();
    let (phone, _desktop) = UnixStream::pair().unwrap();
    let fd = phone.into_raw_fd();
    assert!(!host.start_usb_accessory("late".into(), fd, "Phone".into()));
    // SAFETY: refused, so the descriptor is still this test's.
    drop(unsafe { <std::os::fd::OwnedFd as std::os::fd::FromRawFd>::from_raw_fd(fd) });
}
