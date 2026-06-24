use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRequest, RpcResponse, RpcStreamMeta};
use chromvoid_protocol::{
    frame_continuation, Frame, FrameType, NoiseTransport, RemoteTransport, TransportError,
    TransportType, FLAG_HAS_CONTINUATION,
};
use std::io::{self, Read};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use tokio::io::{duplex, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};

use super::bridge::{BoxMobileUsbStream, MobileUsbBridge};
use super::controller::{
    MobileUsbController, MobileUsbSessionHandle, MobileUsbSessionStarter,
    MobileUsbStartSessionRequest,
};
#[cfg(desktop)]
use super::controller::{MobileUsbSessionEventTarget, TauriMobileUsbSessionEventSink};
use super::observability::redacted_identifier;
use super::pairing_store::{
    classify_scan_result, commit_pairing_with_secret, InMemoryMobileUsbPairingStore,
    JsonMobileUsbPairingStore, MobileUsbPairingStore,
};
use super::record_transport::{MobileUsbRemoteTransport, MAX_USB_REMOTE_RECORD_BYTES};
use super::secret_store::{InMemoryMobileUsbSecretStore, MobileUsbSecretStore};
use super::types::{
    MobileUsbBridgeKind, MobileUsbErrorCode, MobileUsbHostView, MobileUsbOperationKind,
    MobileUsbPairRequest, MobileUsbPairedHostRecord, MobileUsbPairingState, MobileUsbPlatform,
    MobileUsbRecoveryAction, MobileUsbScanClassification, MobileUsbScanResult,
    MobileUsbSessionEvent, MobileUsbSessionState, MobileUsbStateMachine, RemoteIoStopReason,
    UsbHint,
};

#[test]
fn mobile_usb_state_machine_rejects_concurrent_operations() {
    let mut state = MobileUsbStateMachine::new();

    state
        .begin_operation(MobileUsbOperationKind::Scan)
        .expect("start scan");

    let error = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect_err("busy operation should fail");

    assert_eq!(error.code, MobileUsbErrorCode::Busy);
    assert_eq!(
        state.status(Vec::new()).in_flight,
        Some(MobileUsbOperationKind::Scan)
    );
}

#[test]
fn mobile_usb_state_machine_disconnect_is_idempotent() {
    let mut state = MobileUsbStateMachine::new();

    state.disconnect();
    let first = state.status(Vec::new());
    state.disconnect();
    let second = state.status(Vec::new());

    assert_eq!(first, second);
    assert!(!second.fallback_allowed);
}

#[test]
fn mobile_usb_selected_transport_exists_only_after_session_established() {
    let mut state = MobileUsbStateMachine::new();

    assert_eq!(
        state.status(Vec::new()).available_transports,
        vec![TransportType::UsbMobile]
    );
    assert_eq!(state.status(Vec::new()).selected_transport, None);

    state
        .establish_session(
            "session-1".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect("establish session");

    assert_eq!(
        state.status(Vec::new()).selected_transport,
        Some(TransportType::UsbMobile)
    );
}

#[test]
fn mobile_usb_state_machine_reuses_only_stable_active_host() {
    let mut state = MobileUsbStateMachine::new();

    assert!(!state.can_reuse_active_host(&"host-1".to_string()));

    state
        .establish_session(
            "session-1".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect("establish session");

    assert!(state.can_reuse_active_host(&"host-1".to_string()));
    assert!(!state.can_reuse_active_host(&"host-2".to_string()));

    state
        .begin_operation(MobileUsbOperationKind::Scan)
        .expect("scan starts");

    assert!(!state.can_reuse_active_host(&"host-1".to_string()));
}

#[test]
fn mobile_usb_state_machine_rejects_session_stopped_before_establish() {
    let mut state = MobileUsbStateMachine::new();
    state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("start connect");

    assert!(!state.remote_io_stopped(
        &"session-race".to_string(),
        RemoteIoStopReason::Error("decrypt: decrypt error".to_string()),
    ));

    let error = state
        .establish_session(
            "session-race".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect_err("stopped session must not become active");
    let status = state.status(Vec::new());

    assert_eq!(error.code, MobileUsbErrorCode::RecordLayerFailed);
    assert_eq!(status.session_state, MobileUsbSessionState::Error);
    assert_eq!(status.selected_transport, None);
    assert!(status.active_host.is_none());
    assert!(!state.can_reuse_active_host(&"host-1".to_string()));
}

#[test]
fn mobile_usb_status_never_allows_network_fallback() {
    let mut state = MobileUsbStateMachine::new();

    assert!(!state.status(Vec::new()).fallback_allowed);
    state.fail(MobileUsbErrorCode::CableDisconnected);
    assert!(!state.status(Vec::new()).fallback_allowed);
}

#[test]
fn mobile_usb_error_transition_matrix_is_deterministic() {
    let cases = [
        (
            MobileUsbErrorCode::UnsupportedPlatform,
            MobileUsbRecoveryAction::HideUsbEntry,
        ),
        (
            MobileUsbErrorCode::BridgeUnavailable,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::NoAccessory,
            MobileUsbRecoveryAction::RetryScan,
        ),
        (
            MobileUsbErrorCode::PermissionDenied,
            MobileUsbRecoveryAction::RetryPermission,
        ),
        (
            MobileUsbErrorCode::AmbiguousDiscovery,
            MobileUsbRecoveryAction::ListPaired,
        ),
        (
            MobileUsbErrorCode::NotPaired,
            MobileUsbRecoveryAction::PairHost,
        ),
        (
            MobileUsbErrorCode::PairingDuplicate,
            MobileUsbRecoveryAction::ConnectExisting,
        ),
        (
            MobileUsbErrorCode::StalePairing,
            MobileUsbRecoveryAction::RemoveAndRepair,
        ),
        (
            MobileUsbErrorCode::SecretStoreUnavailable,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::SecretRefInvalid,
            MobileUsbRecoveryAction::RemoveAndRepair,
        ),
        (
            MobileUsbErrorCode::PairCommitFailed,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::RecordLayerFailed,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::CableDisconnected,
            MobileUsbRecoveryAction::DisconnectBeforeRetry,
        ),
    ];

    for (code, recovery_action) in cases {
        let mut state = MobileUsbStateMachine::new();
        state.fail(code);
        let status = state.status(Vec::new());

        assert_eq!(status.session_state, MobileUsbSessionState::Error, "{code}");
        assert_eq!(status.selected_transport, None, "{code}");
        assert!(!status.fallback_allowed, "{code}");
        assert_eq!(status.error_code, Some(code), "{code}");
        assert_eq!(code.recovery_action(), recovery_action, "{code}");
    }

    let mut state = MobileUsbStateMachine::new();
    state
        .establish_session(
            "session-current".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect("establish session");
    let locked = state.status(Vec::new());
    assert_eq!(
        locked.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    assert_eq!(locked.selected_transport, Some(TransportType::UsbMobile));
    assert!(!locked.fallback_allowed);
    assert_eq!(
        MobileUsbErrorCode::HostLocked.recovery_action(),
        MobileUsbRecoveryAction::WaitForHostUnlock
    );

    let error = state
        .confirm_host_unlock(&"stale-session".to_string())
        .expect_err("stale unlock must be rejected");
    let after_stale_unlock = state.status(Vec::new());
    assert_eq!(error.code, MobileUsbErrorCode::UnlockNotAuthenticated);
    assert_eq!(
        MobileUsbErrorCode::UnlockNotAuthenticated.recovery_action(),
        MobileUsbRecoveryAction::IgnoreStaleUnlock
    );
    assert_eq!(
        after_stale_unlock.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    assert_eq!(
        after_stale_unlock.selected_transport,
        Some(TransportType::UsbMobile)
    );
    assert!(!after_stale_unlock.fallback_allowed);
}

#[test]
fn mobile_usb_observability_redacts_identifiers() {
    let raw = "mobile-usb-session-secretish-123";
    let redacted = redacted_identifier(Some(raw));

    assert!(redacted.starts_with("redacted:"));
    assert!(!redacted.contains(raw));
    assert_eq!(redacted_identifier(None), "none");
    assert_eq!(redacted_identifier(Some("   ")), "none");
}

#[cfg(desktop)]
#[test]
fn mobile_usb_runtime_event_sink_uses_current_session_id() {
    let target = Arc::new(RecordingMobileUsbSessionEventTarget::default());
    let sink = TauriMobileUsbSessionEventSink::new(target.clone(), "session-current".to_string());

    crate::remote_io_runtime::RemoteIoRuntimeEventSink::on_remote_io_event(
        &sink,
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "transport closed".to_string(),
        },
    );
    crate::remote_io_runtime::RemoteIoRuntimeEventSink::on_remote_io_event(
        &sink,
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "host stopped".to_string(),
        },
    );

    let events = target.events.lock().expect("events").clone();
    assert_eq!(
        events,
        vec![
            MobileUsbSessionEvent::CableDisconnected {
                session_id: "session-current".to_string(),
            },
            MobileUsbSessionEvent::RemoteIoStopped {
                session_id: "session-current".to_string(),
                reason: RemoteIoStopReason::Error("host stopped".to_string()),
            },
        ]
    );
}

#[test]
fn mobile_usb_classification_handles_unpaired_broken_and_ambiguous() {
    let secrets = InMemoryMobileUsbSecretStore::default();
    let scan = scan_result();

    assert_eq!(
        classify_scan_result(&scan, &[], &secrets),
        MobileUsbScanClassification::Unpaired
    );

    let broken = record("broken", "secret:missing", vec![1]);
    assert_eq!(
        classify_scan_result(&scan, &[broken.clone()], &secrets),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "broken".to_string()
        }
    );

    let malformed = record("malformed", "", vec![]);
    assert_eq!(
        classify_scan_result(&scan, &[malformed], &secrets),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "malformed".to_string()
        }
    );

    secrets.insert("secret:one".to_string(), vec![7]);
    secrets.insert("secret:two".to_string(), vec![8]);
    let first = record("host-1", "secret:one", vec![1]);
    let second = record("host-2", "secret:two", vec![2]);
    assert_eq!(
        classify_scan_result(&scan, &[first, second], &secrets),
        MobileUsbScanClassification::Ambiguous
    );

    secrets.set_fail_load(true);
    let failed_load = record("failed-load", "secret:one", vec![3]);
    assert_eq!(
        classify_scan_result(&scan, &[failed_load], &secrets),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "failed-load".to_string()
        }
    );
}

#[test]
fn mobile_usb_pairing_store_rejects_duplicate_peer_pubkey_and_removes_idempotently() {
    let store =
        InMemoryMobileUsbPairingStore::with_records(vec![record("host-1", "secret:one", vec![9])]);

    let error = store
        .commit_pairing(record("host-2", "secret:two", vec![9]))
        .expect_err("duplicate peer key should fail closed");

    assert_eq!(error.code, MobileUsbErrorCode::PairingDuplicate);
    store
        .remove(&"missing-host".to_string())
        .expect("missing remove is idempotent");
}

#[test]
fn mobile_usb_json_pairing_commit_writes_record_after_secret_save() {
    let temp = tempfile::tempdir().expect("temp dir");
    let store = JsonMobileUsbPairingStore::new(temp.path());
    let secrets = InMemoryMobileUsbSecretStore::default();

    let saved =
        commit_pairing_with_secret(&store, &secrets, record("host-1", "", vec![3]), &[1, 2, 3])
            .expect("commit pairing");

    let records = store.list().expect("list records");
    assert_eq!(records, vec![saved]);
    assert!(temp.path().join("paired_mobile_usb_hosts.json").exists());
}

#[test]
fn mobile_usb_json_pairing_store_touches_last_seen_atomically() {
    let temp = tempfile::tempdir().expect("temp dir");
    let store = JsonMobileUsbPairingStore::new(temp.path());
    store
        .commit_pairing(record("host-1", "secret:one", vec![3]))
        .expect("commit pairing");

    let updated = store
        .touch_last_seen(&"host-1".to_string(), 42)
        .expect("touch last seen");

    assert_eq!(updated.last_seen, Some(42));
    assert_eq!(
        store
            .get(&"host-1".to_string())
            .expect("record lookup")
            .expect("record")
            .last_seen,
        Some(42)
    );
}

#[test]
fn mobile_usb_pairing_commit_secret_failure_writes_no_record() {
    let temp = tempfile::tempdir().expect("temp dir");
    let store = JsonMobileUsbPairingStore::new(temp.path());
    let secrets = InMemoryMobileUsbSecretStore::default();
    secrets.set_fail_save(true);

    let error =
        commit_pairing_with_secret(&store, &secrets, record("host-1", "", vec![3]), &[1, 2, 3])
            .expect_err("secret save failure should abort pairing");

    assert_eq!(error.code, MobileUsbErrorCode::SecretStoreUnavailable);
    assert!(store.list().expect("list records").is_empty());
    assert!(!temp.path().join("paired_mobile_usb_hosts.json").exists());
}

#[test]
fn mobile_usb_secret_commit_failure_cleanup_can_delete_saved_secret() {
    let secrets = InMemoryMobileUsbSecretStore::default();
    let store = InMemoryMobileUsbPairingStore::default();
    store.set_fail_commit(true);

    let error =
        commit_pairing_with_secret(&store, &secrets, record("host-1", "", vec![3]), &[1, 2, 3])
            .expect_err("commit failure should fail pairing");

    assert_eq!(error.code, MobileUsbErrorCode::PairCommitFailed);
    assert_eq!(secrets.delete_attempts(), vec!["fake:host-1".to_string()]);
}

#[tokio::test]
async fn mobile_usb_recovery_list_keeps_broken_records_visible_for_remove() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let malformed = record("broken", "", vec![]);
    let store = Arc::new(InMemoryMobileUsbPairingStore::with_records(vec![malformed]));
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets.clone(), starter);

    let paired = controller.list_paired().expect("list paired");

    assert_eq!(paired.len(), 1);
    assert_eq!(paired[0].host_id, "broken");
    assert_eq!(
        paired[0].pairing_state,
        MobileUsbPairingState::BrokenLocalState
    );
    assert_eq!(
        classify_scan_result(
            &scan_result(),
            &store.list().expect("records"),
            secrets.as_ref()
        ),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "broken".to_string()
        }
    );

    let remaining = controller
        .remove_paired("broken".to_string())
        .expect("remove broken record");

    assert!(remaining.is_empty());
    assert_eq!(bridge.scan_count(), 0);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(bridge.connect_open_count(), 0);
}

#[tokio::test]
async fn mobile_usb_record_transport_writes_one_length_prefixed_record() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    transport.send(b"abc").await.expect("send record");

    let mut wire = [0_u8; 7];
    host.read_exact(&mut wire).await.expect("read wire record");
    assert_eq!(&wire[0..4], &(3_u32.to_be_bytes()));
    assert_eq!(&wire[4..7], b"abc");
    assert_eq!(transport.transport_type(), TransportType::UsbMobile);
}

#[tokio::test]
async fn mobile_usb_record_transport_reassembles_partial_reads() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    let writer = tokio::spawn(async move {
        host.write_all(&5_u32.to_be_bytes()).await.expect("len");
        host.write_all(b"he").await.expect("part 1");
        tokio::task::yield_now().await;
        host.write_all(b"llo").await.expect("part 2");
    });

    let payload = transport.recv().await.expect("recv full record");
    writer.await.expect("writer");

    assert_eq!(payload, b"hello");
}

#[tokio::test]
async fn mobile_usb_record_transport_rejects_zero_and_oversized_lengths() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    host.write_all(&0_u32.to_be_bytes())
        .await
        .expect("zero len");
    let error = transport.recv().await.expect_err("zero len fails");
    assert!(matches!(error, TransportError::Io(_)));

    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    host.write_all(&((MAX_USB_REMOTE_RECORD_BYTES as u32) + 1).to_be_bytes())
        .await
        .expect("oversized len");
    let error = transport.recv().await.expect_err("oversized len fails");
    assert!(matches!(error, TransportError::Io(_)));
}

#[tokio::test]
async fn mobile_usb_record_transport_maps_mid_record_eof_to_closed() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    host.write_all(&4_u32.to_be_bytes()).await.expect("len");
    host.write_all(b"ab").await.expect("partial payload");
    drop(host);

    let error = transport.recv().await.expect_err("mid-record EOF fails");

    assert!(matches!(error, TransportError::Closed));
}

#[tokio::test]
async fn mobile_usb_remote_transport_runs_rpc_through_shared_data_plane() {
    let client_keys = noise_keypair();
    let host_keys = noise_keypair();
    let (client, host) = duplex(4096);
    spawn_xx_rpc_responder(host, host_keys.private.clone());

    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let (transport, noise_transport, peer_pubkey) =
        crate::remote_data_plane::handshake_xx_over_transport(
            Box::new(transport) as Box<dyn RemoteTransport>,
            &client_keys.private,
        )
        .await
        .expect("XX over mobile USB transport");
    assert_eq!(peer_pubkey, host_keys.public);

    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport,
            noise_transport,
        },
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:echo", serde_json::json!({"value": 7})),
            stream: None,
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("request queued");

    let reply = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("reply timeout")
        .expect("reply channel");
    task_handle.abort();

    let RpcReply::Json(response) = reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "mobile-usb:echo");
}

#[tokio::test]
async fn mobile_usb_remote_transport_stream_upload_download_through_shared_data_plane() {
    let client_keys = noise_keypair();
    let (client, host) = duplex(4096);
    spawn_xx_stream_responder(host, noise_keypair().private);

    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let (transport, noise_transport, _peer_pubkey) =
        crate::remote_data_plane::handshake_xx_over_transport(
            Box::new(transport) as Box<dyn RemoteTransport>,
            &client_keys.private,
        )
        .await
        .expect("XX over mobile USB transport");

    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport,
            noise_transport,
        },
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:stream", serde_json::json!({})),
            stream: Some(RpcInputStream::from_bytes(vec![1, 2, 3, 4])),
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("stream request queued");

    let reply = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("stream reply timeout")
        .expect("stream reply channel");
    task_handle.abort();

    let RpcReply::Stream(mut output) = reply else {
        panic!("expected stream reply");
    };
    assert_eq!(output.meta.size, 5);
    let mut body = Vec::new();
    output.reader.read_to_end(&mut body).expect("read stream");
    assert_eq!(body, b"hello");
}

#[tokio::test]
async fn mobile_usb_remote_transport_forwards_host_push_through_shared_data_plane() {
    let client_keys = noise_keypair();
    let (client, host) = duplex(4096);
    spawn_xx_push_responder(host, noise_keypair().private);

    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let (transport, noise_transport, _peer_pubkey) =
        crate::remote_data_plane::handshake_xx_over_transport(
            Box::new(transport) as Box<dyn RemoteTransport>,
            &client_keys.private,
        )
        .await
        .expect("XX over mobile USB transport");

    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        mut evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport,
            noise_transport,
        },
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:push", serde_json::json!({})),
            stream: None,
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("request queued");

    let event = tokio::time::timeout(std::time::Duration::from_secs(1), evt_rx.recv())
        .await
        .expect("push timeout")
        .expect("push event");
    let crate::remote_data_plane::RemoteIoEvent::Frame(frame) = event else {
        panic!("expected host push frame");
    };
    let pushed: RpcRequest = serde_json::from_slice(&frame.payload).expect("push payload");
    assert_eq!(pushed.command, "mobile-usb:host-push");

    let _ = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("reply timeout")
        .expect("reply channel");
    task_handle.abort();
}

#[tokio::test]
async fn mobile_usb_remote_transport_carries_heartbeat_frame() {
    let (mut client_noise, mut host_noise) = noise_transport_pair();
    let (client, host) = duplex(4096);
    let mut client_transport =
        MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let mut host_transport = MobileUsbRemoteTransport::new(host, MobileUsbBridgeKind::AndroidAoa);

    crate::remote_data_plane::send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        chromvoid_protocol::frame_from_heartbeat(41, chromvoid_core::rpc::types::PROTOCOL_VERSION),
    )
    .await
    .expect("send heartbeat over USB transport");

    let frame =
        crate::remote_data_plane::recv_decrypted_frame(&mut host_transport, &mut host_noise)
            .await
            .expect("recv heartbeat over USB transport");

    assert_eq!(frame.frame_type, FrameType::Heartbeat);
    assert_eq!(frame.message_id, 41);
}

#[tokio::test]
async fn mobile_usb_closed_transport_emits_data_plane_disconnect() {
    let (client_noise, _host_noise) = noise_transport_pair();
    let (client, host) = duplex(64);
    drop(host);
    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx: _req_tx,
        mut evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
        },
    );

    let event = tokio::time::timeout(std::time::Duration::from_secs(1), evt_rx.recv())
        .await
        .expect("disconnect timeout")
        .expect("disconnect event");
    task_handle.abort();

    let crate::remote_data_plane::RemoteIoEvent::Disconnected { reason } = event else {
        panic!("expected disconnect event");
    };
    assert!(reason.contains("transport closed"));
}

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
async fn mobile_usb_controller_pair_commits_record_and_starts_session() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let status = controller.pair(pair_request()).await.expect("pair");

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
            .get("pairing_usb_mobile->transport_ready_host_locked"),
        Some(&1)
    );
    assert!(metrics.error_total.is_empty());
}

#[cfg(desktop)]
#[tokio::test]
#[ignore]
async fn real_android_aoa_pair_probe() {
    let bridge = Arc::new(super::AndroidAoaMobileUsbBridge::new());
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

    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    assert_eq!(bridge.pair_open_count(), 2);
    assert_eq!(starter.start_count(), 1);
    assert_eq!(store.list().expect("records").len(), 1);
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

    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    assert_eq!(
        status.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    assert_eq!(bridge.pair_open_count(), 2);
    assert_eq!(starter.start_count(), 1);
    assert_eq!(store.list().expect("records").len(), 1);
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

    let error = controller
        .pair(pair_request())
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
            .get("pair|error|ERR_USB_MOBILE_PAIR_COMMIT_FAILED"),
        Some(&1)
    );
}

#[tokio::test]
async fn mobile_usb_controller_rejects_removing_active_host() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge, store.clone(), secrets.clone(), starter.clone());
    let status = controller.pair(pair_request()).await.expect("pair");
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
async fn mobile_usb_controller_connect_confirms_legacy_pairing_before_startup_rpc() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let client_keys = noise_keypair();
    let key_ref = secrets
        .save_client_key(&"host-legacy".to_string(), &client_keys.private)
        .expect("save client key");
    let mut legacy = record("host-legacy", &key_ref, bridge.host_public_key());
    legacy.client_pubkey = client_keys.public;
    legacy.pairing_confirmed_at = None;
    store.commit_pairing(legacy).expect("legacy record");
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets, starter.clone());

    let status = controller
        .connect("host-legacy".to_string())
        .await
        .expect("connect legacy");

    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    assert_eq!(starter.start_count(), 1);
    assert_eq!(bridge.connect_open_count(), 1);
    let updated = store
        .get(&"host-legacy".to_string())
        .expect("record lookup")
        .expect("paired record");
    assert!(updated.pairing_confirmed_at.is_some());
    assert_eq!(updated.last_seen, updated.pairing_confirmed_at);
}

#[tokio::test]
async fn mobile_usb_controller_connect_opens_dashboard_when_host_is_already_unlocked() {
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
        MobileUsbSessionState::RemoteDashboardOpen
    );
    assert_eq!(starter.start_count(), 1);
    assert_eq!(bridge.connect_open_count(), 1);
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
    assert_eq!(bridge.connect_open_count(), 2);
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
    controller.pair(pair_request()).await.expect("pair");

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
    controller.pair(pair_request()).await.expect("pair");

    let status = controller
        .handle_session_event(MobileUsbSessionEvent::CableDisconnected {
            session_id: "session-1".to_string(),
        })
        .expect("cable disconnect event");

    assert_eq!(status.session_state, MobileUsbSessionState::Disconnected);
    assert_eq!(status.selected_transport, None);
    assert!(!status.fallback_allowed);
}

fn scan_result() -> MobileUsbScanResult {
    MobileUsbScanResult {
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        usb_hint: usb_hint(),
        label: Some("Pixel".to_string()),
    }
}

fn pair_request() -> MobileUsbPairRequest {
    MobileUsbPairRequest {
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        usb_hint: usb_hint(),
        label: Some("Pixel".to_string()),
    }
}

fn record(host_id: &str, client_key_ref: &str, peer_pubkey: Vec<u8>) -> MobileUsbPairedHostRecord {
    MobileUsbPairedHostRecord {
        host_id: host_id.to_string(),
        label: format!("Host {host_id}"),
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        peer_pubkey,
        client_pubkey: vec![4],
        client_key_ref: client_key_ref.to_string(),
        usb_hint: usb_hint(),
        paired_at: 1,
        last_seen: None,
        pairing_confirmed_at: Some(1),
    }
}

fn host_view(host_id: &str, pairing_state: MobileUsbPairingState) -> MobileUsbHostView {
    MobileUsbHostView::from_record(&record(host_id, "secret:one", vec![1]), pairing_state)
}

fn usb_hint() -> UsbHint {
    UsbHint {
        manufacturer: Some("Google".to_string()),
        model: Some("Pixel".to_string()),
        serial_number: Some("123".to_string()),
        protocol_id: Some("chromvoid.usb_remote.v1".to_string()),
    }
}

#[cfg(desktop)]
#[derive(Default)]
struct RecordingMobileUsbSessionEventTarget {
    events: Mutex<Vec<MobileUsbSessionEvent>>,
}

#[cfg(desktop)]
impl MobileUsbSessionEventTarget for Arc<RecordingMobileUsbSessionEventTarget> {
    fn handle_mobile_usb_session_event(&self, event: MobileUsbSessionEvent) {
        self.events.lock().expect("events").push(event);
    }
}

#[derive(Default)]
struct FakeSessionStarter {
    starts: Mutex<Vec<(String, Option<TransportType>)>>,
    host_unlocked: AtomicBool,
}

impl FakeSessionStarter {
    fn start_count(&self) -> usize {
        self.starts.lock().expect("starts").len()
    }

    fn starts(&self) -> Vec<(String, Option<TransportType>)> {
        self.starts.lock().expect("starts").clone()
    }

    fn set_host_unlocked(&self, host_unlocked: bool) {
        self.host_unlocked.store(host_unlocked, Ordering::SeqCst);
    }
}

#[async_trait::async_trait]
impl MobileUsbSessionStarter for FakeSessionStarter {
    async fn start_session(
        &self,
        request: MobileUsbStartSessionRequest,
    ) -> Result<MobileUsbSessionHandle, super::types::MobileUsbError> {
        let mut starts = self.starts.lock().expect("starts");
        starts.push((request.host.host_id, request.metrics.transport_type));
        Ok(MobileUsbSessionHandle {
            session_id: format!("session-{}", starts.len()),
            host_unlocked: self.host_unlocked.load(Ordering::SeqCst),
        })
    }
}

struct FakeMobileUsbBridge {
    scans: Mutex<Vec<MobileUsbScanResult>>,
    host_private_key: Vec<u8>,
    host_public_key: Vec<u8>,
    scan_count: AtomicUsize,
    pair_open_count: AtomicUsize,
    connect_open_count: AtomicUsize,
    stale_connect: AtomicBool,
    pair_disconnect_after_open: AtomicBool,
    pair_first_write_timeout_once: AtomicBool,
    pair_first_write_android_endpoint_error_once: AtomicBool,
    connect_first_write_timeout_once: AtomicBool,
    connect_first_write_android_endpoint_error_once: AtomicBool,
    connect_no_response: AtomicBool,
    connect_no_response_once: AtomicBool,
    connect_cable_disconnected: AtomicBool,
    connect_disconnect_after_open: AtomicBool,
}

impl FakeMobileUsbBridge {
    fn new(scans: Vec<MobileUsbScanResult>) -> Self {
        let host_keys = noise_keypair();
        Self {
            scans: Mutex::new(scans),
            host_private_key: host_keys.private,
            host_public_key: host_keys.public,
            scan_count: AtomicUsize::new(0),
            pair_open_count: AtomicUsize::new(0),
            connect_open_count: AtomicUsize::new(0),
            stale_connect: AtomicBool::new(false),
            pair_disconnect_after_open: AtomicBool::new(false),
            pair_first_write_timeout_once: AtomicBool::new(false),
            pair_first_write_android_endpoint_error_once: AtomicBool::new(false),
            connect_first_write_timeout_once: AtomicBool::new(false),
            connect_first_write_android_endpoint_error_once: AtomicBool::new(false),
            connect_no_response: AtomicBool::new(false),
            connect_no_response_once: AtomicBool::new(false),
            connect_cable_disconnected: AtomicBool::new(false),
            connect_disconnect_after_open: AtomicBool::new(false),
        }
    }

    fn host_public_key(&self) -> Vec<u8> {
        self.host_public_key.clone()
    }

    fn scan_count(&self) -> usize {
        self.scan_count.load(Ordering::SeqCst)
    }

    fn pair_open_count(&self) -> usize {
        self.pair_open_count.load(Ordering::SeqCst)
    }

    fn connect_open_count(&self) -> usize {
        self.connect_open_count.load(Ordering::SeqCst)
    }

    fn set_stale_connect(&self, stale: bool) {
        self.stale_connect.store(stale, Ordering::SeqCst);
    }

    fn set_pair_disconnect_after_open(&self, disconnected: bool) {
        self.pair_disconnect_after_open
            .store(disconnected, Ordering::SeqCst);
    }

    fn set_pair_first_write_timeout_once(&self, timeout: bool) {
        self.pair_first_write_timeout_once
            .store(timeout, Ordering::SeqCst);
    }

    fn set_pair_first_write_android_endpoint_error_once(&self, fail: bool) {
        self.pair_first_write_android_endpoint_error_once
            .store(fail, Ordering::SeqCst);
    }

    fn set_connect_first_write_timeout_once(&self, timeout: bool) {
        self.connect_first_write_timeout_once
            .store(timeout, Ordering::SeqCst);
    }

    fn set_connect_first_write_android_endpoint_error_once(&self, fail: bool) {
        self.connect_first_write_android_endpoint_error_once
            .store(fail, Ordering::SeqCst);
    }

    fn set_connect_no_response(&self, no_response: bool) {
        self.connect_no_response
            .store(no_response, Ordering::SeqCst);
    }

    fn set_connect_no_response_once(&self, no_response: bool) {
        self.connect_no_response_once
            .store(no_response, Ordering::SeqCst);
    }

    fn set_connect_cable_disconnected(&self, disconnected: bool) {
        self.connect_cable_disconnected
            .store(disconnected, Ordering::SeqCst);
    }

    fn set_connect_disconnect_after_open(&self, disconnected: bool) {
        self.connect_disconnect_after_open
            .store(disconnected, Ordering::SeqCst);
    }
}

#[async_trait::async_trait]
impl MobileUsbBridge for FakeMobileUsbBridge {
    async fn scan(&self) -> Result<Vec<MobileUsbScanResult>, super::types::MobileUsbError> {
        self.scan_count.fetch_add(1, Ordering::SeqCst);
        Ok(self.scans.lock().expect("scans").clone())
    }

    async fn open_pair_stream(
        &self,
        request: &MobileUsbPairRequest,
    ) -> Result<BoxMobileUsbStream, super::types::MobileUsbError> {
        self.pair_open_count.fetch_add(1, Ordering::SeqCst);
        assert_eq!(request.platform, MobileUsbPlatform::Android);
        assert_eq!(request.bridge_kind, MobileUsbBridgeKind::AndroidAoa);
        assert_eq!(request.usb_hint.canonical(), usb_hint().canonical());
        let (client, host) = duplex(4096);
        if self.pair_disconnect_after_open.load(Ordering::SeqCst) {
            drop(host);
            return Ok(Box::new(client));
        }
        if self
            .pair_first_write_timeout_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::TimedOut,
                "fake Android AOA first write timeout",
            )));
        }
        if self
            .pair_first_write_android_endpoint_error_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::Other,
                "Android AOA endpoint failed: Io(\"Pipe\")",
            )));
        }
        spawn_xx_pair_responder(
            host,
            self.host_private_key.clone(),
            self.host_public_key.clone(),
        );
        Ok(Box::new(client))
    }

    async fn open_connect_stream(
        &self,
        record: &MobileUsbPairedHostRecord,
    ) -> Result<BoxMobileUsbStream, super::types::MobileUsbError> {
        self.connect_open_count.fetch_add(1, Ordering::SeqCst);
        assert_eq!(record.platform, MobileUsbPlatform::Android);
        assert_eq!(record.bridge_kind, MobileUsbBridgeKind::AndroidAoa);
        assert_eq!(record.usb_hint.canonical(), usb_hint().canonical());
        if self.connect_cable_disconnected.load(Ordering::SeqCst) {
            return Err(super::types::MobileUsbError::new(
                MobileUsbErrorCode::CableDisconnected,
                "fake cable disconnected",
            ));
        }
        let host_private_key = if self.stale_connect.load(Ordering::SeqCst) {
            noise_keypair().private
        } else {
            self.host_private_key.clone()
        };
        let (client, host) = duplex(4096);
        if self.connect_disconnect_after_open.load(Ordering::SeqCst) {
            drop(host);
            return Ok(Box::new(client));
        }
        if self
            .connect_first_write_timeout_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::TimedOut,
                "fake Android AOA connect first write timeout",
            )));
        }
        if self
            .connect_first_write_android_endpoint_error_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::Other,
                "Android AOA endpoint failed: Timeout",
            )));
        }
        if self.connect_no_response_once.swap(false, Ordering::SeqCst)
            || self.connect_no_response.load(Ordering::SeqCst)
        {
            tokio::spawn(async move {
                let _keep_stream_open = host;
                std::future::pending::<()>().await;
            });
            return Ok(Box::new(client));
        }
        if record.pairing_confirmed_at.is_none() {
            spawn_ik_pairing_ack_responder(host, host_private_key, self.host_public_key.clone());
        } else {
            spawn_ik_responder(host, host_private_key);
        }
        Ok(Box::new(client))
    }
}

struct FirstWriteErrorStream {
    inner: tokio::io::DuplexStream,
    error: Option<io::Error>,
}

impl FirstWriteErrorStream {
    fn new(inner: tokio::io::DuplexStream, kind: io::ErrorKind, message: &'static str) -> Self {
        Self {
            inner,
            error: Some(io::Error::new(kind, message)),
        }
    }
}

impl AsyncRead for FirstWriteErrorStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl AsyncWrite for FirstWriteErrorStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        if let Some(error) = self.error.take() {
            return Poll::Ready(Err(error));
        }
        Pin::new(&mut self.inner).poll_write(cx, data)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

struct NoiseTestKeypair {
    private: Vec<u8>,
    public: Vec<u8>,
}

fn noise_keypair() -> NoiseTestKeypair {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .expect("Noise params");
    let keypair = snow::Builder::new(params)
        .generate_keypair()
        .expect("keypair");
    NoiseTestKeypair {
        private: keypair.private,
        public: keypair.public,
    }
}

fn spawn_xx_pair_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
    host_public_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;
        let hello = super::recv_mobile_usb_pairing_hello(&mut transport, &mut noise)
            .await
            .expect("pairing hello");
        assert_eq!(
            hello.peer_pubkey_hex,
            super::mobile_usb_hex_encode(noise.remote_pubkey())
        );
        super::send_mobile_usb_pairing_hello(
            &mut transport,
            &mut noise,
            &super::MobileUsbPairingHello {
                peer_id: "android-host-1".to_string(),
                peer_label: "Android Host".to_string(),
                peer_pubkey_hex: super::mobile_usb_hex_encode(&host_public_key),
                platform: "android".to_string(),
            },
        )
        .await
        .expect("pairing hello ack");
    });
}

fn spawn_xx_rpc_responder(host: tokio::io::DuplexStream, host_private_key: Vec<u8>) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv frame");
        assert_eq!(frame.frame_type, FrameType::RpcRequest);
        let request: RpcRequest = serde_json::from_slice(&frame.payload).expect("request payload");
        let response = RpcResponse::success(serde_json::json!({
            "command": request.command,
        }));
        send_json_response(&mut transport, &mut noise, frame.message_id, response)
            .await
            .expect("host send response");
    });
}

fn spawn_xx_push_responder(host: tokio::io::DuplexStream, host_private_key: Vec<u8>) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv request");
        let push = RpcRequest::new("mobile-usb:host-push", serde_json::json!({"ok": true}));
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            Frame {
                frame_type: FrameType::RpcRequest,
                message_id: frame.message_id.wrapping_add(2),
                flags: 0,
                payload: serde_json::to_vec(&push).expect("push json"),
            },
        )
        .await
        .expect("host send push");
        let response = RpcResponse::success(serde_json::json!({"ok": true}));
        send_json_response(&mut transport, &mut noise, frame.message_id, response)
            .await
            .expect("host send response");
    });
}

fn spawn_xx_stream_responder(host: tokio::io::DuplexStream, host_private_key: Vec<u8>) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv stream request");
        assert_eq!(frame.frame_type, FrameType::RpcRequest);
        assert_ne!(frame.flags & FLAG_HAS_CONTINUATION, 0);

        let mut uploaded = Vec::new();
        loop {
            let chunk = recv_next_non_heartbeat(&mut transport, &mut noise)
                .await
                .expect("host recv stream continuation");
            assert_eq!(chunk.frame_type, FrameType::RpcRequest);
            uploaded.extend_from_slice(&chunk.payload);
            if chunk.flags & FLAG_HAS_CONTINUATION == 0 {
                break;
            }
        }
        assert_eq!(uploaded, vec![1, 2, 3, 4]);

        let meta = RpcStreamMeta {
            name: "hello.txt".to_string(),
            mime_type: "text/plain".to_string(),
            size: 5,
            chunk_size: 3,
        };
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            Frame {
                frame_type: FrameType::RpcResponse,
                message_id: frame.message_id,
                flags: FLAG_HAS_CONTINUATION,
                payload: serde_json::to_vec(&meta).expect("stream meta json"),
            },
        )
        .await
        .expect("host send stream meta");
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            frame_continuation(
                FrameType::RpcResponse,
                frame.message_id,
                b"hel".to_vec(),
                true,
            ),
        )
        .await
        .expect("host send stream chunk 1");
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            frame_continuation(
                FrameType::RpcResponse,
                frame.message_id,
                b"lo".to_vec(),
                false,
            ),
        )
        .await
        .expect("host send stream chunk 2");
    });
}

async fn recv_next_non_heartbeat(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<Frame, String> {
    loop {
        let frame = crate::remote_data_plane::recv_decrypted_frame(transport, noise).await?;
        if frame.frame_type != FrameType::Heartbeat {
            return Ok(frame);
        }
    }
}

async fn send_json_response(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    message_id: u64,
    response: RpcResponse,
) -> Result<(), String> {
    crate::remote_data_plane::send_encrypted_frame(
        transport,
        noise,
        Frame {
            frame_type: FrameType::RpcResponse,
            message_id,
            flags: 0,
            payload: serde_json::to_vec(&response).expect("response json"),
        },
    )
    .await
}

async fn accept_xx_transport(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) -> (
    MobileUsbRemoteTransport<tokio::io::DuplexStream>,
    NoiseTransport,
) {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .expect("XX params");
    let mut responder = snow::Builder::new(params)
        .local_private_key(&host_private_key)
        .expect("host key")
        .build_responder()
        .expect("XX responder");
    let mut transport = MobileUsbRemoteTransport::new(host, MobileUsbBridgeKind::AndroidAoa);
    let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let msg1 = transport.recv().await.expect("XX msg1");
    responder.read_message(&msg1, &mut buf).expect("XX read 1");
    let len = responder.write_message(&[], &mut buf).expect("XX write 2");
    transport.send(&buf[..len]).await.expect("XX send 2");
    let msg3 = transport.recv().await.expect("XX msg3");
    responder.read_message(&msg3, &mut buf).expect("XX read 3");
    let remote_pubkey = responder
        .get_remote_static()
        .expect("XX remote static")
        .to_vec();
    let noise = NoiseTransport::new(
        responder
            .into_transport_mode()
            .expect("XX responder transport mode"),
        remote_pubkey,
    );

    (transport, noise)
}

fn noise_transport_pair() -> (NoiseTransport, NoiseTransport) {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .expect("XX params");
    let kp_i = snow::Builder::new(params.clone())
        .generate_keypair()
        .expect("initiator keypair");
    let kp_r = snow::Builder::new(params.clone())
        .generate_keypair()
        .expect("responder keypair");

    let mut initiator = snow::Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .expect("initiator key")
        .build_initiator()
        .expect("initiator");
    let mut responder = snow::Builder::new(params)
        .local_private_key(&kp_r.private)
        .expect("responder key")
        .build_responder()
        .expect("responder");
    let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let len = initiator.write_message(&[], &mut buf).expect("XX msg1");
    let msg1 = buf[..len].to_vec();
    responder.read_message(&msg1, &mut buf).expect("XX read 1");
    let len = responder.write_message(&[], &mut buf).expect("XX msg2");
    let msg2 = buf[..len].to_vec();
    initiator.read_message(&msg2, &mut buf).expect("XX read 2");
    let len = initiator.write_message(&[], &mut buf).expect("XX msg3");
    let msg3 = buf[..len].to_vec();
    responder.read_message(&msg3, &mut buf).expect("XX read 3");

    let initiator_remote = initiator
        .get_remote_static()
        .expect("initiator remote static")
        .to_vec();
    let responder_remote = responder
        .get_remote_static()
        .expect("responder remote static")
        .to_vec();

    (
        NoiseTransport::new(
            initiator
                .into_transport_mode()
                .expect("initiator transport mode"),
            initiator_remote,
        ),
        NoiseTransport::new(
            responder
                .into_transport_mode()
                .expect("responder transport mode"),
            responder_remote,
        ),
    )
}

fn spawn_ik_responder(host: tokio::io::DuplexStream, host_private_key: Vec<u8>) {
    tokio::spawn(async move {
        let (_transport, _noise) = accept_ik_transport(host, host_private_key).await;
    });
}

fn spawn_ik_pairing_ack_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
    host_public_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_ik_transport(host, host_private_key).await;
        let hello = super::recv_mobile_usb_pairing_hello(&mut transport, &mut noise)
            .await
            .expect("connect pairing hello");
        assert_eq!(
            hello.peer_pubkey_hex,
            super::mobile_usb_hex_encode(noise.remote_pubkey())
        );
        super::send_mobile_usb_pairing_hello(
            &mut transport,
            &mut noise,
            &super::MobileUsbPairingHello {
                peer_id: "android-host-1".to_string(),
                peer_label: "Android Host".to_string(),
                peer_pubkey_hex: super::mobile_usb_hex_encode(&host_public_key),
                platform: "android".to_string(),
            },
        )
        .await
        .expect("connect pairing hello ack");
    });
}

async fn accept_ik_transport(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) -> (
    MobileUsbRemoteTransport<tokio::io::DuplexStream>,
    NoiseTransport,
) {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_IK
        .parse()
        .expect("IK params");
    let mut responder = snow::Builder::new(params)
        .local_private_key(&host_private_key)
        .expect("host key")
        .build_responder()
        .expect("IK responder");
    let mut transport = MobileUsbRemoteTransport::new(host, MobileUsbBridgeKind::AndroidAoa);
    let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let msg1 = transport.recv().await.expect("IK msg1");
    responder.read_message(&msg1, &mut buf).expect("IK read 1");
    let len = responder.write_message(&[], &mut buf).expect("IK write 2");
    transport.send(&buf[..len]).await.expect("IK send 2");
    let remote_pubkey = responder
        .get_remote_static()
        .expect("IK remote static")
        .to_vec();
    let noise = NoiseTransport::new(
        responder
            .into_transport_mode()
            .expect("IK responder transport mode"),
        remote_pubkey,
    );
    (transport, noise)
}
