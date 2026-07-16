use super::support::*;
use super::*;

#[tokio::test]
async fn host_rpc_loop_processes_json_while_upload_stream_is_active() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let streamed_bodies = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(UploadInterleaveAdapter {
            commands: commands.clone(),
            streamed_bodies: streamed_bodies.clone(),
        })));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-upload-interleave-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 21,
            flags: FLAG_HAS_CONTINUATION,
            payload: serde_json::to_vec(&RpcRequest::new(
                "catalog:file:replace",
                serde_json::json!({}),
            ))
            .expect("upload request json"),
        },
    )
    .await
    .expect("send upload meta");
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_continuation(FrameType::RpcRequest, 21, b"abc".to_vec(), true),
    )
    .await
    .expect("send first upload chunk");
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 23,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:status", serde_json::json!({})))
                .expect("status request json"),
        },
    )
    .await
    .expect("send status while upload active");

    let status_response = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(status_response.message_id, 23);
    assert_eq!(status_response.frame_type, FrameType::RpcResponse);
    assert_eq!(status_response.flags & FLAG_HAS_CONTINUATION, 0);
    assert_eq!(commands.lock().unwrap().as_slice(), ["vault:status"]);
    assert!(streamed_bodies.lock().unwrap().is_empty());

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_continuation(FrameType::RpcRequest, 21, b"def".to_vec(), false),
    )
    .await
    .expect("send final upload chunk");

    let upload_response = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(upload_response.message_id, 21);
    assert_eq!(upload_response.frame_type, FrameType::RpcResponse);
    assert_eq!(
        streamed_bodies.lock().unwrap().as_slice(),
        [b"abcdef".to_vec()]
    );

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

#[tokio::test]
async fn host_rpc_loop_survives_upload_abort_via_stream_control_frame() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let streamed_bodies = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(UploadInterleaveAdapter {
            commands: commands.clone(),
            streamed_bodies: streamed_bodies.clone(),
        })));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-upload-abort-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 41,
            flags: FLAG_HAS_CONTINUATION,
            payload: serde_json::to_vec(&RpcRequest::new(
                "catalog:file:replace",
                serde_json::json!({}),
            ))
            .expect("upload request json"),
        },
    )
    .await
    .expect("send upload meta");
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_continuation(FrameType::RpcRequest, 41, b"abc".to_vec(), true),
    )
    .await
    .expect("send first upload chunk");

    // The desktop's local reader failed mid-upload: it aborts the stream via
    // a stream-control frame instead of disconnecting.
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        crate::rpc_transport_protocol::frame_stream_read_failed(
            41,
            "catalog:file:replace",
            "local reader failed",
        ),
    )
    .await
    .expect("send upload abort");

    // The session must stay alive and keep serving RPCs.
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 43,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:status", serde_json::json!({})))
                .expect("status request json"),
        },
    )
    .await
    .expect("send status after upload abort");

    let status_response = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(status_response.message_id, 43);
    assert_eq!(status_response.frame_type, FrameType::RpcResponse);
    assert!(
        streamed_bodies.lock().unwrap().is_empty(),
        "aborted upload must not reach the adapter"
    );

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}
