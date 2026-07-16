use super::support::*;
use super::*;

#[tokio::test]
async fn mobile_usb_controller_scan_classifies_paired_hosts() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    secrets.insert("secret:one".to_string(), vec![7]);
    let store = Arc::new(InMemoryMobileUsbPairingStore::with_records(vec![record(
        "host-1",
        "secret:one",
        bridge.host_public_key(),
    )]));
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge, store, secrets, starter);

    let results = controller.scan().await.expect("scan");

    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].classification,
        MobileUsbScanClassification::Paired {
            host_id: "host-1".to_string()
        }
    );
}

#[tokio::test]
async fn mobile_usb_controller_pair_requires_approval_then_confirm_commits_and_starts_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let status = controller.pair(pair_request()).await.expect("pair");

    assert_eq!(status.selected_transport, None);
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::PairingApprovalRequired
    );
    let approval = status.pairing_approval.expect("approval required");
    assert_eq!(approval.attempt_id, "test-approval-attempt");
    assert_eq!(store.list().expect("records").len(), 0);
    assert_eq!(starter.start_count(), 0);

    let status = controller
        .confirm_pairing(MobileUsbPairConfirmRequest {
            attempt_id: approval.attempt_id,
            approval_pin: TEST_PAIRING_PIN.to_string(),
        })
        .await
        .expect("confirm pairing");

    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    let records = store.list().expect("records");
    assert_eq!(records.len(), 1);
    let record = &records[0];
    assert_eq!(record.label, "Pixel");
    assert_eq!(record.platform, MobileUsbPlatform::Android);
    assert_eq!(record.bridge_kind, MobileUsbBridgeKind::AndroidAoa);
    assert_eq!(record.peer_pubkey, bridge.host_public_key());
    assert!(!record.client_pubkey.is_empty());
    assert!(record.client_key_ref.starts_with("fake:mobile-usb-"));
    assert_eq!(record.usb_hint.canonical(), usb_hint().canonical());
    assert_ne!(record.paired_at, 0);
    assert!(record.last_seen.is_some());
    assert_eq!(starter.start_count(), 1);
    assert_eq!(starter.starts()[0].1, Some(TransportType::UsbMobile));
    assert_eq!(bridge.pair_open_count(), 1);
    assert_eq!(bridge.connect_open_count(), 0);

    let metrics = controller.observability_snapshot_for_test();
    assert_eq!(metrics.operation_total.get("pair|success|none"), Some(&1));
    assert_eq!(metrics.pair_duration_ms.len(), 1);
    assert_eq!(
        metrics
            .state_transition_total
            .get("idle_usb_mobile->pairing_usb_mobile"),
        Some(&1)
    );
    assert_eq!(
        metrics
            .state_transition_total
            .get("pairing_usb_mobile->pairing_approval_required"),
        Some(&1)
    );
    assert!(metrics.error_total.is_empty());
}

#[cfg(desktop)]
#[tokio::test]
#[ignore]
async fn real_android_aoa_pair_probe() {
    let bridge = super::create_android_aoa_mobile_usb_bridge();
    let scans = bridge.scan().await.expect("scan real Android AOA devices");
    eprintln!("real Android AOA scans: {scans:?}");
    let scan = scans.first().expect("at least one real Android AOA scan");
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge, store, secrets, starter.clone());

    let status = tokio::time::timeout(
        std::time::Duration::from_secs(45),
        controller.pair(MobileUsbPairRequest {
            platform: scan.platform,
            bridge_kind: scan.bridge_kind,
            usb_hint: scan.usb_hint.clone(),
            label: scan.label.clone(),
        }),
    )
    .await
    .expect("real Android AOA pair probe timed out")
    .expect("pair real Android AOA device");

    eprintln!("real Android AOA pair status: {status:?}");
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_pair_reopens_stream_after_first_write_timeout() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_pair_first_write_timeout_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let status = controller
        .pair(pair_request())
        .await
        .expect("pair should retry first write timeout");

    assert_eq!(status.selected_transport, None);
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::PairingApprovalRequired
    );
    assert_eq!(bridge.pair_open_count(), 2);
    assert_eq!(starter.start_count(), 0);
    assert_eq!(store.list().expect("records").len(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_pair_reopens_stream_after_first_android_endpoint_write_error() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_pair_first_write_android_endpoint_error_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let status = controller
        .pair(pair_request())
        .await
        .expect("pair should retry first Android AOA endpoint write error");

    assert_eq!(status.selected_transport, None);
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::PairingApprovalRequired
    );
    assert_eq!(bridge.pair_open_count(), 2);
    assert_eq!(starter.start_count(), 0);
    assert_eq!(store.list().expect("records").len(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_pair_reopens_stream_after_xx_msg2_stale_stream_error() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_pair_invalid_msg2_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let status = controller
        .pair(pair_request())
        .await
        .expect("pair should retry stale XX msg2 stream");

    assert_eq!(status.selected_transport, None);
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::PairingApprovalRequired
    );
    assert_eq!(bridge.pair_open_count(), 2);
    assert_eq!(starter.start_count(), 0);
    assert_eq!(store.list().expect("records").len(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_disconnect_during_pairing_approval_leaves_no_orphaned_record() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge, store.clone(), secrets.clone(), starter.clone());

    let status = controller.pair(pair_request()).await.expect("pair");
    let approval = status.pairing_approval.expect("approval required");

    let status = controller.disconnect().expect("disconnect during pairing");

    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(status.selected_transport, None);
    assert!(status.pairing_approval.is_none());
    assert_eq!(store.list().expect("records").len(), 0);
    assert_eq!(secrets.saved_refs().len(), 0);
    assert_eq!(starter.start_count(), 0);

    let error = controller
        .confirm_pairing(MobileUsbPairConfirmRequest {
            attempt_id: approval.attempt_id,
            approval_pin: TEST_PAIRING_PIN.to_string(),
        })
        .await
        .expect_err("confirm after explicit disconnect must be rejected");

    assert_eq!(error.code, MobileUsbErrorCode::InvalidState);
    assert_eq!(store.list().expect("records").len(), 0);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_pair_store_failure_leaves_no_active_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    store.set_fail_commit(true);
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge, store.clone(), secrets.clone(), starter.clone());

    let status = controller.pair(pair_request()).await.expect("pair");
    let approval = status.pairing_approval.expect("approval required");
    let error = controller
        .confirm_pairing(MobileUsbPairConfirmRequest {
            attempt_id: approval.attempt_id,
            approval_pin: TEST_PAIRING_PIN.to_string(),
        })
        .await
        .expect_err("pair commit failure");

    assert_eq!(error.code, MobileUsbErrorCode::PairCommitFailed);
    assert_eq!(store.list().expect("records").len(), 0);
    assert_eq!(starter.start_count(), 0);
    assert_eq!(secrets.delete_attempts().len(), 1);

    let metrics = controller.observability_snapshot_for_test();
    assert_eq!(
        metrics
            .error_total
            .get(MobileUsbErrorCode::PairCommitFailed.as_str()),
        Some(&1)
    );
    assert_eq!(
        metrics
            .operation_total
            .get("pair_confirm|error|ERR_USB_MOBILE_PAIR_COMMIT_FAILED"),
        Some(&1)
    );
}
