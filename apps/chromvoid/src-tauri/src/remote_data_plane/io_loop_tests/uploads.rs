use super::support::*;
use super::*;

#[tokio::test]
async fn supervised_stream_read_maps_io_error() {
    let error = read_stream_chunk_supervised(
        Box::new(FailingReader),
        8,
        TransportPolicy::for_transport(TransportType::WssRelay).stream_read_policy(),
    )
    .await;
    let error = match error {
        Ok(_) => panic!("read must fail"),
        Err(error) => error,
    };

    assert_eq!(error.to_string(), "stream read: network stream failed");
}

#[tokio::test]
async fn supervised_stream_read_returns_read_size() {
    let read = read_stream_chunk_supervised(
        Box::new(std::io::Cursor::new(b"abc".to_vec())),
        8,
        TransportPolicy::for_transport(TransportType::WssRelay).stream_read_policy(),
    )
    .await
    .expect("read succeeds");

    assert_eq!(read.bytes, b"abc");
}

#[tokio::test]
async fn upload_stream_read_timeout_returns_typed_failure() {
    let (mut client_noise, host_noise) = noise_pair();
    let mut transport = ScriptedTransport::new(host_noise, Script::Idle);
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let (reply_tx, _reply_rx) = oneshot::channel();
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let mut pending_json = HashMap::new();
    active_order.push_back(7);
    active_streams.insert(
        7,
        ActiveOutgoingStream {
            reader: Some(Box::new(BlockingReader { release_rx })),
            reply_tx,
            command: "catalog:upload".to_string(),
            priority: RemoteRpcPriority::Normal,
            lifecycle: StreamLifecycleTracker::start(
                "catalog:upload",
                StreamLifecycleDirection::Send,
                None,
            ),
        },
    );

    let error = send_next_outgoing_stream_chunk(
        &mut transport,
        &mut client_noise,
        TransportPolicy {
            stream_read_timeout: Duration::from_millis(20),
            ..TransportPolicy::for_transport(TransportType::UsbMobile)
        },
        Duration::from_secs(1),
        false,
        &mut active_streams,
        &mut active_order,
        &mut pending_json,
    )
    .await
    .expect_err("blocking upload reader must time out");
    drop(release_tx);

    assert_eq!(
        error,
        crate::remote_data_plane::RemoteIoFailure::StreamTimeout {
            command: Some("catalog:upload".to_string()),
            message_id: Some(7),
            timeout_ms: Some(20),
        }
    );
}

#[tokio::test]
async fn upload_stream_read_error_uses_stream_control_when_peer_supports_it() {
    let (mut client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport =
        ScriptedTransport::with_sent_frames(host_noise, Script::Idle, sent_frames.clone());
    let (reply_tx, reply_rx) = oneshot::channel();
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let mut pending_json = HashMap::new();
    active_order.push_back(9);
    active_streams.insert(
        9,
        ActiveOutgoingStream {
            reader: Some(Box::new(FailingReader)),
            reply_tx,
            command: "catalog:upload".to_string(),
            priority: RemoteRpcPriority::Normal,
            lifecycle: StreamLifecycleTracker::start(
                "catalog:upload",
                StreamLifecycleDirection::Send,
                None,
            ),
        },
    );

    let handled = send_next_outgoing_stream_chunk(
        &mut transport,
        &mut client_noise,
        TransportPolicy::for_transport(TransportType::UsbMobile),
        Duration::from_secs(1),
        true,
        &mut active_streams,
        &mut active_order,
        &mut pending_json,
    )
    .await
    .expect("read error must be recovered via stream control");

    assert!(handled);
    assert!(active_streams.is_empty());
    assert!(pending_json.is_empty());
    {
        let frames = sent_frames.lock().unwrap();
        assert_eq!(frames.len(), 1);
        assert!(matches!(
            parse_stream_control_frame(&frames[0]),
            Some(RemoteStreamControl::ReadFailed { .. })
        ));
    }
    let reply = reply_rx.await.expect("reply delivered");
    let RpcReply::Json(response) = reply else {
        panic!("expected json error reply");
    };
    assert!(!response.is_ok());
}

#[tokio::test]
async fn upload_stream_read_error_disconnects_for_old_peer() {
    let (mut client_noise, host_noise) = noise_pair();
    let mut transport = ScriptedTransport::new(host_noise, Script::Idle);
    let (reply_tx, _reply_rx) = oneshot::channel();
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let mut pending_json = HashMap::new();
    active_order.push_back(11);
    active_streams.insert(
        11,
        ActiveOutgoingStream {
            reader: Some(Box::new(FailingReader)),
            reply_tx,
            command: "catalog:upload".to_string(),
            priority: RemoteRpcPriority::Normal,
            lifecycle: StreamLifecycleTracker::start(
                "catalog:upload",
                StreamLifecycleDirection::Send,
                None,
            ),
        },
    );

    let error = send_next_outgoing_stream_chunk(
        &mut transport,
        &mut client_noise,
        TransportPolicy::for_transport(TransportType::UsbMobile),
        Duration::from_secs(1),
        false,
        &mut active_streams,
        &mut active_order,
        &mut pending_json,
    )
    .await
    .expect_err("old peer read error must close the transport");

    assert!(matches!(
        error,
        crate::remote_data_plane::RemoteIoFailure::StreamReadFailed {
            command: Some(ref command),
            message_id: Some(11),
            ..
        } if command == "catalog:upload"
    ));
}

#[tokio::test]
async fn fake_transport_json_request_response_roundtrip() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::EchoJson);
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("test:echo", serde_json::json!({"value": 7})),
            stream: None,
            reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
        .await
        .expect("reply timeout")
        .expect("reply channel");
    task_handle.abort();

    let RpcReply::Json(response) = reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "test:echo");
}

#[tokio::test]
async fn fake_transport_stream_upload_continuation_roundtrip() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::UploadAck);
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("stream:upload", serde_json::json!({})),
            stream: Some(RpcInputStream::from_bytes(vec![1, 2, 3, 4])),
            reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("stream request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
        .await
        .expect("reply timeout")
        .expect("reply channel");
    task_handle.abort();

    let RpcReply::Json(response) = reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["uploaded"], 4);
}

#[tokio::test]
async fn fake_transport_usb_stream_upload_uses_small_chunks() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = ScriptedTransport::with_transport_type(
        host_noise,
        Script::UploadAck,
        sent_frames.clone(),
        TransportType::UsbMobile,
    );
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let payload = vec![5_u8; USB_MOBILE_STREAM_CHUNK_SIZE + 3];
    let (reply_tx, reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("stream:upload", serde_json::json!({})),
            stream: Some(RpcInputStream::from_bytes(payload)),
            reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("stream request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
        .await
        .expect("reply timeout")
        .expect("reply channel");
    task_handle.abort();

    let RpcReply::Json(response) = reply else {
        panic!("expected json reply");
    };
    assert_eq!(
        response.result().unwrap()["uploaded"],
        serde_json::json!(USB_MOBILE_STREAM_CHUNK_SIZE + 3)
    );

    let frames = sent_frames.lock().unwrap();
    let continuation_frames = frames
        .iter()
        .filter(|frame| frame.frame_type == FrameType::RpcRequest)
        .filter(|frame| frame.payload.len() >= USB_MOBILE_STREAM_CHUNK_SIZE)
        .collect::<Vec<_>>();
    assert!(
        continuation_frames
            .iter()
            .any(|frame| frame.payload.len() == USB_MOBILE_STREAM_CHUNK_SIZE),
        "expected USB upload continuation frame capped to USB chunk size"
    );
    assert!(
        frames
            .iter()
            .any(|frame| frame.frame_type == FrameType::RpcRequest && frame.payload.len() == 3),
        "expected final USB upload continuation frame with remainder"
    );
    assert!(
        frames.iter().any(|frame| {
            frame.frame_type == FrameType::RpcRequest
                && frame.payload.is_empty()
                && frame.flags & FLAG_HAS_CONTINUATION == 0
        }),
        "expected explicit empty final upload continuation frame"
    );
}

#[tokio::test]
async fn stream_upload_does_not_block_queued_high_priority_json() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = ScriptedTransport::with_transport_type(
        host_noise,
        Script::UploadAck,
        sent_frames.clone(),
        TransportType::UsbMobile,
    );
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (upload_reply_tx, upload_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("stream:upload", serde_json::json!({})),
            stream: Some(RpcInputStream::from_bytes(vec![
                5_u8;
                USB_MOBILE_STREAM_CHUNK_SIZE
                    * 2
                    + 3
            ])),
            reply_tx: upload_reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("stream request queued");

    let (status_reply_tx, status_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("vault:status", serde_json::json!({})),
            stream: None,
            reply_tx: status_reply_tx,
            priority: RemoteRpcPriority::High,
            cancel_group: None,
        })
        .await
        .expect("status request queued");

    let status_reply = tokio::time::timeout(Duration::from_secs(1), status_reply_rx)
        .await
        .expect("status reply timeout")
        .expect("status reply channel");
    let upload_reply = tokio::time::timeout(Duration::from_secs(1), upload_reply_rx)
        .await
        .expect("upload reply timeout")
        .expect("upload reply channel");
    task_handle.abort();

    let RpcReply::Json(status_response) = status_reply else {
        panic!("expected status json reply");
    };
    assert!(status_response.is_ok());
    let RpcReply::Json(upload_response) = upload_reply else {
        panic!("expected upload json reply");
    };
    assert_eq!(
        upload_response.result().unwrap()["uploaded"],
        serde_json::json!(USB_MOBILE_STREAM_CHUNK_SIZE * 2 + 3)
    );

    let frames = sent_frames.lock().unwrap();
    let status_index = frames
        .iter()
        .position(|frame| {
            frame.frame_type == FrameType::RpcRequest
                && serde_json::from_slice::<RpcRequest>(&frame.payload)
                    .is_ok_and(|request| request.command == "vault:status")
        })
        .expect("status frame sent");
    let final_upload_index = frames
        .iter()
        .rposition(|frame| {
            frame.frame_type == FrameType::RpcRequest
                && frame.payload.is_empty()
                && frame.flags & FLAG_HAS_CONTINUATION == 0
        })
        .expect("final upload frame sent");

    assert!(
        status_index < final_upload_index,
        "high-priority JSON should be sent before upload stream finishes"
    );
}
