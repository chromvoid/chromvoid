use super::support::{noise_pair, recv_test_frame, ChannelTransport, RecordingIdleTransport};
use super::*;

#[tokio::test]
async fn vault_lock_sends_authenticated_host_locked_push_before_shutdown() {
    let (host_noise, peer_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = RecordingIdleTransport::new(peer_noise, sent_frames.clone());
    let shutdown_source = Arc::new(Mutex::new(Some(
        crate::network::mobile_acceptor::direct_transport::HostRpcShutdownSource::ExternalStop(
            crate::network::mobile_acceptor::DirectTransportStopReason::VaultLocked,
        ),
    )));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");

    let host_task = tokio::spawn(run_host_rpc_loop_with_shutdown_source(
        None,
        Box::new(transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-host-lock-test".to_string(),
        shutdown_rx,
        None,
        None,
        shutdown_source,
    ));

    shutdown_tx.send(()).expect("send shutdown");
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");

    let frames = sent_frames.lock().expect("sent frames");
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0].frame_type, FrameType::RpcRequest);
    let push: RpcRequest =
        serde_json::from_slice(&frames[0].payload).expect("host lock push request");
    assert_eq!(push.command, "mobile_usb:host_locked");
}

#[tokio::test]
async fn remote_vault_lock_records_recoverable_stop_reason() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let shutdown_source = Arc::new(Mutex::new(None));
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");

    let host_task = tokio::spawn(run_host_rpc_loop_with_shutdown_source(
        None,
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-vault-lock-test".to_string(),
        shutdown_rx,
        None,
        None,
        shutdown_source.clone(),
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 41,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:lock", serde_json::Value::Null))
                .expect("vault lock request"),
        },
    )
    .await
    .expect("send vault lock");
    let response = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(response.message_id, 41);

    host_task
        .await
        .expect("host loop join")
        .expect("host loop result");
    assert_eq!(
        *shutdown_source.lock().expect("shutdown source"),
        Some(
            crate::network::mobile_acceptor::direct_transport::HostRpcShutdownSource::RemoteRequest(
                crate::network::mobile_acceptor::DirectTransportStopReason::VaultLocked,
            )
        ),
    );
}

#[tokio::test]
async fn mobile_usb_session_disconnect_is_allowed_before_approval_and_clears_it() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let attempt_id = "session-disconnect-before-allow".to_string();
    runtime
        .register_usb_session_approval(crate::mobile_usb::MobileUsbHostSessionApprovalView {
            attempt_id: attempt_id.clone(),
            peer_id: "peer-usb-disconnect-test".to_string(),
            peer_label: "USB disconnect test".to_string(),
            transport_type: "usb_mobile".to_string(),
            decision: crate::mobile_usb::MobileUsbHostApprovalDecision::Pending,
            expires_at_ms: u64::MAX,
        })
        .expect("register session approval");
    let shutdown_source = Arc::new(Mutex::new(None));
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");

    let host_task = tokio::spawn(run_host_rpc_loop_with_shutdown_source(
        None,
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-disconnect-test".to_string(),
        shutdown_rx,
        Some(UsbHostSessionApproval {
            runtime: runtime.clone(),
            attempt_id: attempt_id.clone(),
        }),
        None,
        shutdown_source.clone(),
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 43,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new(
                "mobile_usb:session_disconnect",
                serde_json::json!({}),
            ))
            .expect("disconnect request"),
        },
    )
    .await
    .expect("send disconnect");
    let response_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    let response: RpcResponse =
        serde_json::from_slice(&response_frame.payload).expect("disconnect response");
    assert!(response.is_ok());

    host_task
        .await
        .expect("host loop join")
        .expect("host loop result");
    assert!(runtime
        .pending_usb_session_approval()
        .expect("pending approval")
        .is_none());
    assert_eq!(
        *shutdown_source.lock().expect("shutdown source"),
        Some(
            crate::network::mobile_acceptor::direct_transport::HostRpcShutdownSource::RemoteRequest(
                crate::network::mobile_acceptor::DirectTransportStopReason::ClientDisconnected,
            )
        ),
    );
}
