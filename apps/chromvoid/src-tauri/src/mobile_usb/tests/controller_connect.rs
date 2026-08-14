use super::support::*;
use super::*;

async fn pair_and_confirm(controller: &MobileUsbController) -> MobileUsbStatus {
    let pending = controller.pair(pair_request()).await.expect("pair");
    let approval = pending.pairing_approval.expect("approval required");
    controller
        .confirm_pairing(MobileUsbPairConfirmRequest {
            attempt_id: approval.attempt_id,
            approval_pin: TEST_PAIRING_PIN.to_string(),
        })
        .await
        .expect("confirm pairing")
}

#[tokio::test]
async fn mobile_usb_controller_rejects_removing_active_host() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge, store.clone(), secrets.clone(), starter.clone());
    let status = pair_and_confirm(&controller).await;
    let host_id = status.active_host.expect("active host").host_id;

    let error = controller
        .remove_paired(host_id.clone())
        .expect_err("active host removal should fail");

    assert_eq!(error.code, MobileUsbErrorCode::InvalidState);
    assert!(store.get(&host_id).expect("record lookup").is_some());
    assert!(secrets.delete_attempts().is_empty());
}

#[tokio::test]
async fn mobile_usb_controller_list_and_remove_inactive_do_not_open_bridge() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    secrets.insert("secret:one".to_string(), vec![7]);
    store
        .commit_pairing(record("host-1", "secret:one", bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets.clone(), starter);

    let paired = controller.list_paired().expect("list paired");
    assert_eq!(paired.len(), 1);
    assert_eq!(paired[0].pairing_state, MobileUsbPairingState::Paired);

    let remaining = controller
        .remove_paired("host-1".to_string())
        .expect("remove inactive host");

    assert!(remaining.is_empty());
    assert_eq!(secrets.delete_attempts(), vec!["secret:one".to_string()]);
    assert_eq!(bridge.scan_count(), 0);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(bridge.connect_open_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_connect_uses_ik_and_starts_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect");

    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    assert_eq!(starter.start_count(), 1);
    assert_eq!(bridge.connect_open_count(), 1);
    let updated = store
        .get(&"host-1".to_string())
        .expect("record lookup")
        .expect("paired record");
    assert!(updated.last_seen.is_some());
    assert_eq!(
        status.active_host.expect("active host").last_seen,
        updated.last_seen
    );
}

#[tokio::test]
async fn mobile_usb_controller_connect_rejects_unconfirmed_pairing_without_opening_usb() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-unconfirmed".to_string(), &client_keys.private)
        .expect("save client key");
    let mut unconfirmed = record("host-unconfirmed", &key_ref, bridge.host_public_key());
    unconfirmed.client_pubkey = client_keys.public;
    unconfirmed.pairing_confirmed_at = None;
    store
        .commit_pairing(unconfirmed)
        .expect("unconfirmed record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let paired = controller.list_paired().expect("list paired");
    assert_eq!(paired.len(), 1);
    assert_eq!(
        paired[0].pairing_state,
        MobileUsbPairingState::BrokenLocalState
    );

    let error = controller
        .connect("host-unconfirmed".to_string())
        .await
        .expect_err("unconfirmed pairing should not connect");

    assert_eq!(error.code, MobileUsbErrorCode::InvalidState);
    assert_eq!(starter.start_count(), 0);
    assert_eq!(bridge.connect_open_count(), 0);
    let unchanged = store
        .get(&"host-unconfirmed".to_string())
        .expect("record lookup")
        .expect("paired record");
    assert_eq!(unchanged.pairing_confirmed_at, None);

    let remaining = controller
        .remove_paired("host-unconfirmed".to_string())
        .expect("remove quarantined pairing");
    assert!(remaining.is_empty());
}

#[tokio::test]
async fn mobile_usb_controller_connect_waits_for_current_session_approval_when_startup_unlocked() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    starter.set_host_unlocked(true);
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect");

    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::SessionApprovalRequired
    );
    assert_eq!(starter.start_count(), 1);
    assert_eq!(bridge.connect_open_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_session_approval_expiry_stops_only_the_pending_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    starter.set_host_unlocked(true);
    let controller = MobileUsbController::new(bridge, store, secrets, starter.clone());
    controller
        .connect("host-1".to_string())
        .await
        .expect("connect");

    let status = controller
        .handle_session_event(MobileUsbSessionEvent::SessionApprovalExpired {
            session_id: "session-1".to_string(),
        })
        .expect("expire current pending approval");
    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(
        status.error_code,
        Some(MobileUsbErrorCode::SessionApprovalExpired)
    );
    assert_eq!(starter.stop_count(), 1);

    let error = controller
        .handle_session_event(MobileUsbSessionEvent::SessionApprovalExpired {
            session_id: "session-1".to_string(),
        })
        .expect_err("duplicate expiry is stale");
    assert_eq!(error.code, MobileUsbErrorCode::UnlockNotAuthenticated);
    assert_eq!(starter.stop_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_reuses_active_session_without_reopening_usb() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let first = controller
        .connect("host-1".to_string())
        .await
        .expect("first connect");
    let second = controller
        .connect("host-1".to_string())
        .await
        .expect("second connect reuses active session");

    assert_eq!(
        first.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    assert_eq!(second.session_state, first.session_state);
    assert_eq!(second.selected_transport, Some(TransportType::UsbMobile));
    assert_eq!(
        second
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 1);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_disconnect_stops_active_data_plane() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge, store, secrets, starter.clone());

    controller
        .connect("host-1".to_string())
        .await
        .expect("connect");
    let status = controller.disconnect_user().await.expect("disconnect");

    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(starter.stop_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_repeats_ten_connect_disconnect_cycles_without_forgetting_pairing() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    for cycle in 1..=10 {
        let connected = controller
            .connect("host-1".to_string())
            .await
            .unwrap_or_else(|error| panic!("connect cycle {cycle}: {error}"));
        assert_eq!(
            connected.session_state,
            MobileUsbSessionState::TransportReadyHostLocked
        );
        let disconnected = controller
            .disconnect_user()
            .await
            .unwrap_or_else(|error| panic!("disconnect cycle {cycle}: {error}"));
        assert_eq!(
            disconnected.session_state,
            MobileUsbSessionState::Disconnected
        );
    }

    assert_eq!(bridge.connect_open_count(), 10);
    assert_eq!(starter.start_count(), 10);
    assert_eq!(starter.stop_count(), 10);
    assert!(store
        .get(&"host-1".to_string())
        .expect("record lookup")
        .is_some());
}

#[tokio::test]
async fn mobile_usb_controller_disconnect_during_connect_cancels_stale_session_start() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    starter.block_next_start_session();
    let controller = Arc::new(MobileUsbController::new(
        bridge.clone(),
        store,
        secrets,
        starter.clone(),
    ));

    let connect_task = {
        let controller = controller.clone();
        tokio::spawn(async move { controller.connect("host-1".to_string()).await })
    };
    starter.wait_start_session_entered().await;

    let disconnected = controller.disconnect_user().await.expect("disconnect wins");
    assert_eq!(
        disconnected.session_state,
        MobileUsbSessionState::Disconnected
    );
    let busy = controller
        .connect("host-1".to_string())
        .await
        .expect_err("old connect still owns the physical slot");
    assert_eq!(busy.code, MobileUsbErrorCode::Busy);

    starter.release_start_session();
    let stale_error = connect_task
        .await
        .expect("connect task")
        .expect_err("stale connect must not establish a session");
    let status = controller.status().expect("status");

    assert_eq!(stale_error.code, MobileUsbErrorCode::InvalidState);
    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(status.selected_transport, None);
    assert!(status.active_host.is_none());
    assert_eq!(bridge.connect_open_count(), 1);
    assert_eq!(starter.start_count(), 1);
    assert_eq!(starter.stop_count(), 1);

    let reconnected = controller
        .connect("host-1".to_string())
        .await
        .expect("connect can run after stale connect unwinds");
    assert_eq!(
        reconnected
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(starter.start_count(), 2);
}

#[tokio::test]
async fn mobile_usb_controller_stale_ik_never_downgrades_to_xx_pairing() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_stale_connect(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let error = controller
        .connect("host-1".to_string())
        .await
        .expect_err("stale IK");
    let status = controller.status().expect("status");

    assert_eq!(error.code, MobileUsbErrorCode::StalePairing);
    assert!(!status.fallback_allowed);
    assert_eq!(status.selected_transport, None);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_connect_retries_after_ik_first_write_timeout() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_first_write_timeout_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect retry succeeds");

    assert!(!status.fallback_allowed);
    assert_eq!(
        status
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 2);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_retries_after_transient_no_accessory_on_open() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_no_accessory_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("transient no accessory retry succeeds");

    assert_eq!(
        status
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 2);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_retries_after_android_endpoint_timeout() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_first_write_android_endpoint_error_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect retry succeeds");

    assert!(!status.fallback_allowed);
    assert_eq!(
        status
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 2);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_retries_after_ik_msg2_record_desync() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_bad_record_len_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect retry succeeds");

    assert!(!status.fallback_allowed);
    assert_eq!(
        status
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 2);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_retries_after_ik_msg2_stale_stream_error() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_invalid_msg2_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect retry succeeds");

    assert!(!status.fallback_allowed);
    assert_eq!(
        status
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 2);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_persistent_ik_msg2_stale_stream_keeps_stale_pairing() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_invalid_msg2(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let error = controller
        .connect("host-1".to_string())
        .await
        .expect_err("persistent stale IK msg2");
    let status = controller.status().expect("status");

    assert_eq!(error.code, MobileUsbErrorCode::StalePairing);
    assert!(!status.fallback_allowed);
    assert_eq!(status.selected_transport, None);
    assert_eq!(bridge.connect_open_count(), 3);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_connect_ik_msg2_timeout_is_not_tauri_invoke_timeout() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_no_response(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let error = controller
        .connect("host-1".to_string())
        .await
        .expect_err("IK msg2 timeout");
    let status = controller.status().expect("status");

    assert_eq!(error.code, MobileUsbErrorCode::HandshakeFailed);
    assert!(error.message.contains("IK handshake timed out"));
    assert!(!status.fallback_allowed);
    assert_eq!(bridge.connect_open_count(), 3);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_connect_retries_once_after_ik_msg2_timeout() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_no_response_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect retry succeeds");

    assert!(!status.fallback_allowed);
    assert_eq!(
        status
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 2);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_recovers_after_ik_msg2_timeout_then_reopen_write_hang() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_msg2_timeout_then_first_write_hang_once(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let status = controller
        .connect("host-1".to_string())
        .await
        .expect("connect retry succeeds");

    assert!(!status.fallback_allowed);
    assert_eq!(
        status
            .active_host
            .as_ref()
            .map(|host| host.host_id.as_str()),
        Some("host-1")
    );
    assert_eq!(bridge.connect_open_count(), 3);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 1);
}

#[tokio::test]
async fn mobile_usb_controller_connect_missing_secret_does_not_open_stream() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    store
        .commit_pairing(record("host-1", "fake:missing", bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let error = controller
        .connect("host-1".to_string())
        .await
        .expect_err("missing secret");

    assert_eq!(error.code, MobileUsbErrorCode::SecretRefInvalid);
    assert_eq!(bridge.connect_open_count(), 0);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_pair_closed_stream_reports_cable_disconnected() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_pair_disconnect_after_open(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let error = controller
        .pair(pair_request())
        .await
        .expect_err("pair should fail on cable disconnect");

    assert_eq!(error.code, MobileUsbErrorCode::CableDisconnected);
    assert_eq!(bridge.pair_open_count(), 1);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_connect_open_disconnect_is_not_network_fallback() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_cable_disconnected(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let error = controller
        .connect("host-1".to_string())
        .await
        .expect_err("connect should fail on cable disconnect");
    let status = controller.status().expect("status");

    assert_eq!(error.code, MobileUsbErrorCode::CableDisconnected);
    assert!(!status.fallback_allowed);
    assert_eq!(status.selected_transport, None);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_connect_closed_stream_reports_cable_disconnected() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    bridge.set_connect_disconnect_after_open(true);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-1".to_string(), &client_keys.private)
        .expect("save client key");
    store
        .commit_pairing(record("host-1", &key_ref, bridge.host_public_key()))
        .expect("paired record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge.clone(), store, secrets, starter.clone());

    let error = controller
        .connect("host-1".to_string())
        .await
        .expect_err("connect should fail on closed stream");
    let status = controller.status().expect("status");

    assert_eq!(error.code, MobileUsbErrorCode::CableDisconnected);
    assert!(!status.fallback_allowed);
    assert_eq!(status.selected_transport, None);
    assert_eq!(bridge.connect_open_count(), 1);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(starter.start_count(), 0);
}

#[tokio::test]
async fn mobile_usb_controller_session_events_require_current_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge, store, secrets, starter);
    pair_and_confirm(&controller).await;

    let error = controller
        .handle_session_event(MobileUsbSessionEvent::HostUnlockConfirmed {
            session_id: "old-session".to_string(),
        })
        .expect_err("old session ignored");
    assert_eq!(error.code, MobileUsbErrorCode::UnlockNotAuthenticated);

    let status = controller
        .handle_session_event(MobileUsbSessionEvent::HostUnlockConfirmed {
            session_id: "session-1".to_string(),
        })
        .expect("unlock current session");
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::RemoteDashboardOpen
    );

    let status = controller
        .handle_session_event(MobileUsbSessionEvent::RemoteIoStopped {
            session_id: "session-1".to_string(),
            reason: RemoteIoStopReason::Disconnected,
        })
        .expect("remote stopped");
    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(status.selected_transport, None);
}

#[tokio::test]
async fn mobile_usb_controller_cable_disconnected_event_tears_down_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge, store, secrets, starter);
    pair_and_confirm(&controller).await;

    let status = controller
        .handle_session_event(MobileUsbSessionEvent::CableDisconnected {
            session_id: "session-1".to_string(),
        })
        .expect("cable disconnect event");

    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(status.selected_transport, None);
    assert!(!status.fallback_allowed);
}

#[tokio::test]
async fn mobile_usb_controller_host_locked_event_stops_remote_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller = MobileUsbController::new(bridge, store, secrets, starter.clone());
    pair_and_confirm(&controller).await;

    let status = controller
        .handle_session_event(MobileUsbSessionEvent::HostLocked {
            session_id: "session-1".to_string(),
        })
        .expect("host lock event");

    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(status.selected_transport, None);
    assert_eq!(status.error_code, None);
    assert_eq!(starter.stop_count(), 1);
}
