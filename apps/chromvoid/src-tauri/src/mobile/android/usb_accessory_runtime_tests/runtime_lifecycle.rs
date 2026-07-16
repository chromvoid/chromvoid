use super::support::*;
use super::*;

#[tokio::test]
async fn stream_session_exposes_record_transport_to_host_starter() {
    let runtime = runtime_for_tests();
    let (client, host) = tokio::io::duplex(4096);
    let (payload_tx, payload_rx) = oneshot::channel();
    let payload_tx = Arc::new(Mutex::new(Some(payload_tx)));

    let starter = host_starter(move |start| {
        let payload_tx = payload_tx
            .lock()
            .expect("payload sender lock")
            .take()
            .expect("payload sender");
        async move {
            assert_eq!(start.session_id, "session-1");
            assert_eq!(start.identity.serial.as_deref(), Some("device-1"));
            assert_eq!(start.transport.transport_type(), TransportType::UsbMobile);
            let mut transport = start.transport;
            let payload = transport.recv().await.map_err(|error| error.to_string())?;
            payload_tx
                .send(payload)
                .map_err(|_| "payload send failed")?;
            Ok(())
        }
    });

    runtime
        .start_stream_session_with_starter("session-1", IDENTITY_JSON, host, starter)
        .expect("start stream session");

    let mut client_transport =
        MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    client_transport
        .send(b"hello")
        .await
        .expect("send client payload");

    assert_eq!(
        payload_rx.await.expect("payload delivered"),
        b"hello".to_vec()
    );
}

#[tokio::test]
async fn configured_starter_path_starts_session() {
    let runtime = runtime_for_tests();
    let called = Arc::new(AtomicBool::new(false));
    let called_for_starter = called.clone();

    runtime.set_host_starter(host_starter(move |_start| {
        let called_for_starter = called_for_starter.clone();
        async move {
            called_for_starter.store(true, Ordering::SeqCst);
            Ok(())
        }
    }));

    let (_client, host) = tokio::io::duplex(4096);
    runtime
        .start_stream_session("session-configured", IDENTITY_JSON, host)
        .expect("start with configured starter");
    tokio::task::yield_now().await;

    assert!(called.load(Ordering::SeqCst));
    assert_eq!(runtime.active_session_count(), 0);
}

#[tokio::test]
async fn android_host_starter_setup_registers_production_starter() {
    let runtime = runtime_for_tests();
    runtime.set_task_spawner_for_tests(rejecting_task_spawner());
    let (_client_before, host_before) = tokio::io::duplex(4096);
    let before_error = runtime
        .start_stream_session("session-before-setup", IDENTITY_JSON, host_before)
        .expect_err("starter should be required before setup");
    assert_eq!(
        before_error,
        "Android mobile USB host starter is not configured"
    );

    configure_usb_accessory_host_starter_for_runtime(
        runtime.clone(),
        Arc::new(crate::network::mobile_acceptor::MobileAcceptorRuntimeState::new()),
        None,
        tempfile::tempdir().expect("tempdir").path().to_path_buf(),
    );

    let (_client_after, host_after) = tokio::io::duplex(4096);
    let after_error = runtime
        .start_stream_session("session-after-setup", IDENTITY_JSON, host_after)
        .expect_err("configured starter should reach task spawner");
    assert_eq!(after_error, "test spawner unavailable");
    assert_eq!(runtime.active_session_count(), 0);
}

#[tokio::test]
async fn duplicate_session_is_rejected_before_second_start() {
    let runtime = runtime_for_tests();
    let starter = host_starter(|start| async move {
        let _ = start.shutdown.await;
        Ok(())
    });
    let (_client_a, host_a) = tokio::io::duplex(4096);
    runtime
        .start_stream_session_with_starter("session-dup", IDENTITY_JSON, host_a, starter.clone())
        .expect("first start");

    let (_client_b, host_b) = tokio::io::duplex(4096);
    let error = runtime
        .start_stream_session_with_starter("session-dup", IDENTITY_JSON, host_b, starter)
        .expect_err("duplicate rejected");

    assert!(error.contains("already exists"));
    assert_eq!(runtime.active_session_count(), 1);
    assert!(runtime.stop_session(
        "session-dup",
        AndroidMobileUsbHostStopReason::ExplicitDisconnect,
    ));
}

#[tokio::test]
async fn invalid_identity_json_never_calls_host_starter() {
    let runtime = runtime_for_tests();
    let called = Arc::new(AtomicBool::new(false));
    let called_for_starter = called.clone();
    let starter = host_starter(move |_start| {
        let called_for_starter = called_for_starter.clone();
        async move {
            called_for_starter.store(true, Ordering::SeqCst);
            Ok(())
        }
    });
    let (_client, host) = tokio::io::duplex(4096);

    let error = runtime
        .start_stream_session_with_starter("session-invalid", "{bad json", host, starter)
        .expect_err("invalid identity rejected");

    assert!(error.contains("Invalid Android USB accessory identity JSON"));
    assert!(!called.load(Ordering::SeqCst));
    assert_eq!(runtime.active_session_count(), 0);
}

#[tokio::test]
async fn stop_session_signals_reason_and_is_idempotent() {
    let runtime = runtime_for_tests();
    let (reason_tx, reason_rx) = oneshot::channel();
    let reason_tx = Arc::new(Mutex::new(Some(reason_tx)));
    let starter = host_starter(move |start| {
        let reason_tx = reason_tx
            .lock()
            .expect("reason sender lock")
            .take()
            .expect("reason sender");
        async move {
            let reason = start
                .shutdown
                .await
                .map_err(|_| "shutdown receive failed")?;
            reason_tx.send(reason).map_err(|_| "reason send failed")?;
            Ok(())
        }
    });
    let (_client, host) = tokio::io::duplex(4096);
    runtime
        .start_stream_session_with_starter("session-stop", IDENTITY_JSON, host, starter)
        .expect("start session");

    assert!(runtime.stop_session(
        "session-stop",
        AndroidMobileUsbHostStopReason::AccessoryDetached,
    ));
    assert!(!runtime.stop_session(
        "session-stop",
        AndroidMobileUsbHostStopReason::ExplicitDisconnect,
    ));
    assert_eq!(
        reason_rx.await.expect("shutdown observed"),
        AndroidMobileUsbHostStopReason::AccessoryDetached,
    );
    assert_eq!(runtime.active_session_count(), 0);
}

#[tokio::test]
async fn stop_all_sessions_signals_vault_lock_and_is_idempotent() {
    let runtime = runtime_for_tests();
    let first = runtime
        .reserve_active_session("session-lock-1".to_string())
        .expect("reserve first session");
    let second = runtime
        .reserve_active_session("session-lock-2".to_string())
        .expect("reserve second session");

    assert_eq!(
        runtime.stop_all_sessions(AndroidMobileUsbHostStopReason::VaultLocked),
        2,
    );
    assert_eq!(
        first.await.expect("first shutdown observed"),
        AndroidMobileUsbHostStopReason::VaultLocked,
    );
    assert_eq!(
        second.await.expect("second shutdown observed"),
        AndroidMobileUsbHostStopReason::VaultLocked,
    );
    assert_eq!(
        runtime.stop_all_sessions(AndroidMobileUsbHostStopReason::VaultLocked),
        0,
    );
    assert_eq!(runtime.active_session_count(), 0);
}
