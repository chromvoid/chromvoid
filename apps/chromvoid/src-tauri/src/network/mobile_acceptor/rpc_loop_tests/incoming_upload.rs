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

#[tokio::test]
async fn host_uploads_multiple_requests_and_frames_into_real_core() {
    let temp = tempfile::tempdir().unwrap();
    let mut local =
        crate::core_adapter::LocalCoreAdapter::new_with_test_keystore(temp.path().join("storage"))
            .unwrap();
    assert!(local
        .handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password":"synthetic upload"})
        ))
        .is_ok());
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> = Arc::new(Mutex::new(Box::new(local)));
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::WssRelay);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        Some(adapter.clone()),
        Box::new(host_transport),
        host_noise,
        TransportType::WssRelay,
        temp.path().to_path_buf(),
        "synthetic-upload-peer".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
    ));
    let expected = b"abcdefghij";
    let mut node_id = None;
    let mut offset = 0;
    for (index, size) in [3, 3, 4].into_iter().enumerate() {
        let end = offset + size;
        let message_id = 701 + index as u64;
        let request = RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "node_id":node_id,"parent_path":"/","name":"received.bin","size":size,
                "offset":offset,"total_size":expected.len(),"finish":end == expected.len()
            }),
        );
        send_encrypted_frame(
            &mut client_transport,
            &mut client_noise,
            Frame {
                frame_type: FrameType::RpcRequest,
                message_id,
                flags: FLAG_HAS_CONTINUATION,
                payload: serde_json::to_vec(&request).unwrap(),
            },
        )
        .await
        .unwrap();
        for chunk in [
            &expected[offset..offset + 1],
            &expected[offset + 1..end],
            &[],
        ] {
            send_encrypted_frame(
                &mut client_transport,
                &mut client_noise,
                frame_continuation(
                    FrameType::RpcRequest,
                    message_id,
                    chunk.to_vec(),
                    !chunk.is_empty(),
                ),
            )
            .await
            .unwrap();
        }
        let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
        assert_eq!(frame.frame_type, FrameType::RpcResponse);
        assert_eq!(frame.message_id, message_id);
        let response: RpcResponse = serde_json::from_slice(&frame.payload).unwrap();
        assert!(response.is_ok(), "{response:?}");
        let result = response.result().unwrap();
        node_id = result["node_id"].as_u64();
        assert!(node_id.is_some());
        assert_eq!(result["uploaded_bytes"], end);
        assert_eq!(result["uploaded"], end);
        assert_eq!(result["completed"], end == expected.len());
        offset = end;
    }
    let reply = adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new("catalog:download", serde_json::json!({"node_id":node_id})),
        None,
    );
    let RpcReply::Stream(mut stream) = reply else {
        panic!("expected committed file")
    };
    let mut actual = Vec::new();
    stream.reader.read_to_end(&mut actual).unwrap();
    assert_eq!(actual, expected);
    shutdown_tx.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), host)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}
