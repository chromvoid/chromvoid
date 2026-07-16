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

    assert_eq!(
        error.to_string(),
        "stream read: mobile acceptor stream failed"
    );
}

#[tokio::test]
async fn host_outgoing_stream_sends_range_meta_and_chunks_one_turn_at_a_time() {
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let meta = RpcRangeStreamMeta {
        name: "range.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        file_size: 10,
        chunk_size: 3,
        range_offset: 2,
        range_length: 5,
        source_revision: 42,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        7,
        "peer-range-test",
        "catalog:downloadRange",
        true,
        frame_range_stream_meta_response(7, &meta),
        Box::new(std::io::Cursor::new(b"hello".to_vec())),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start range stream");

    {
        let frames = sent_frames.lock().unwrap();
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].frame_type, FrameType::RpcResponse);
        assert_ne!(frames[0].flags & FLAG_HAS_CONTINUATION, 0);
        let decoded_meta: RpcRangeStreamMeta =
            serde_json::from_slice(&frames[0].payload).expect("range meta json");
        assert_eq!(decoded_meta.range_offset, 2);
        assert_eq!(decoded_meta.range_length, 5);
        assert_eq!(decoded_meta.source_revision, 42);
    }

    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy::for_transport(TransportType::WebRtcDataChannel),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("send first range chunk"));

    {
        let frames = sent_frames.lock().unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[1].payload, b"hello");
        assert_ne!(frames[1].flags & FLAG_HAS_CONTINUATION, 0);
    }

    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy::for_transport(TransportType::WebRtcDataChannel),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("send final range chunk"));

    let frames = sent_frames.lock().unwrap();
    assert_eq!(frames.len(), 3);
    assert_eq!(frames[0].frame_type, FrameType::RpcResponse);
    assert!(frames[2].payload.is_empty());
    assert_eq!(frames[2].flags & FLAG_HAS_CONTINUATION, 0);
    assert!(active_streams.is_empty());
}

#[tokio::test]
async fn host_outgoing_stream_timeout_sends_stream_control_instead_of_teardown() {
    let (release_tx, release_rx) = mpsc::channel();
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let meta = RpcStreamMeta {
        name: "stall.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        size: 6,
        chunk_size: 3,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        17,
        "peer-stall-test",
        "catalog:download",
        true,
        frame_stream_meta_response(17, &meta),
        Box::new(BlockingAfterFirstReader {
            sent_first: false,
            release_rx,
        }),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start stalled stream");

    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy {
            stream_read_timeout: std::time::Duration::from_millis(20),
            ..TransportPolicy::for_transport(TransportType::UsbMobile)
        },
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("send first chunk"));

    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy {
            stream_read_timeout: std::time::Duration::from_millis(20),
            ..TransportPolicy::for_transport(TransportType::UsbMobile)
        },
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("stalled reader must fail only its own stream for stream-control peers"));
    drop(release_tx);

    assert!(
        active_streams.is_empty(),
        "timed out stream must be released"
    );
    let frames = sent_frames.lock().unwrap();
    assert_eq!(frames.len(), 3);
    assert_eq!(frames[1].payload, b"abc");
    assert_eq!(frames[2].frame_type, FrameType::Error);
    assert!(matches!(
        parse_stream_control_frame(&frames[2]),
        Some(RemoteStreamControl::ReadFailed { .. })
    ));
}

#[tokio::test]
async fn host_outgoing_stream_timeout_closes_session_for_old_peer() {
    let (release_tx, release_rx) = mpsc::channel();
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let meta = RpcStreamMeta {
        name: "stall-old-peer.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        size: 6,
        chunk_size: 3,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        29,
        "peer-old-stall-test",
        "catalog:download",
        false,
        frame_stream_meta_response(29, &meta),
        Box::new(BlockingAfterFirstReader {
            sent_first: false,
            release_rx,
        }),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start stalled stream");

    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy {
            stream_read_timeout: std::time::Duration::from_millis(20),
            ..TransportPolicy::for_transport(TransportType::UsbMobile)
        },
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("send first chunk"));

    let error = send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy {
            stream_read_timeout: std::time::Duration::from_millis(20),
            ..TransportPolicy::for_transport(TransportType::UsbMobile)
        },
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect_err("old peers cannot recover a stalled stream");

    assert!(matches!(
        error,
        crate::remote_data_plane::RemoteIoFailure::StreamTimeout {
            command: Some(ref command),
            message_id: Some(29),
            timeout_ms: Some(20),
        } if command == "catalog:download"
    ));
    drop(release_tx);
}

#[tokio::test]
async fn host_outgoing_stream_read_error_sends_stream_error_not_clean_final() {
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let meta = RpcStreamMeta {
        name: "broken.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        size: 6,
        chunk_size: 3,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        19,
        "peer-read-error-test",
        "catalog:download",
        true,
        frame_stream_meta_response(19, &meta),
        Box::new(FailingReader),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start failed stream");

    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy::for_transport(TransportType::UsbMobile),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("read error should be delivered as stream control"));

    assert!(active_streams.is_empty());
    let frames = sent_frames.lock().unwrap();
    assert_eq!(frames.len(), 2);
    assert_eq!(frames[1].frame_type, FrameType::Error);
    assert!(matches!(
        parse_stream_control_frame(&frames[1]),
        Some(RemoteStreamControl::ReadFailed { .. })
    ));
    assert_ne!(frames[1].frame_type, FrameType::RpcResponse);
}

#[tokio::test]
async fn host_outgoing_stream_read_error_closes_for_old_peer() {
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let meta = RpcStreamMeta {
        name: "broken-old-peer.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        size: 6,
        chunk_size: 3,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        23,
        "peer-old-read-error-test",
        "catalog:download",
        false,
        frame_stream_meta_response(23, &meta),
        Box::new(FailingReader),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start failed stream");

    let error = send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy::for_transport(TransportType::UsbMobile),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect_err("old peer read error must close the transport");

    assert!(matches!(
        error,
        crate::remote_data_plane::RemoteIoFailure::StreamReadFailed {
            command: Some(ref command),
            message_id: Some(23),
            ref error,
        } if command == "catalog:download"
            && error.contains("stream_read_failed_unsupported")
    ));
    let frames = sent_frames.lock().unwrap();
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0].frame_type, FrameType::RpcResponse);
    assert_ne!(frames[0].flags & FLAG_HAS_CONTINUATION, 0);
}

#[tokio::test]
async fn host_outgoing_stream_sends_empty_final_frame_for_empty_stream() {
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let meta = RpcStreamMeta {
        name: "empty.txt".to_string(),
        mime_type: "text/plain".to_string(),
        size: 0,
        chunk_size: 3,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        9,
        "peer-empty-test",
        "catalog:download",
        true,
        frame_stream_meta_response(9, &meta),
        Box::new(std::io::Cursor::new(Vec::<u8>::new())),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start empty stream");

    assert_eq!(sent_frames.lock().unwrap().len(), 1);
    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy::for_transport(TransportType::WebRtcDataChannel),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("send empty final stream frame"));

    let frames = sent_frames.lock().unwrap();
    assert_eq!(frames.len(), 2);
    assert_eq!(frames[0].frame_type, FrameType::RpcResponse);
    assert_ne!(frames[0].flags & FLAG_HAS_CONTINUATION, 0);
    let decoded_meta: RpcStreamMeta =
        serde_json::from_slice(&frames[0].payload).expect("stream meta json");
    assert_eq!(decoded_meta.size, 0);
    assert!(frames[1].payload.is_empty());
    assert_eq!(frames[1].flags & FLAG_HAS_CONTINUATION, 0);
    assert!(active_streams.is_empty());
}

#[tokio::test]
async fn host_outgoing_stream_uses_small_chunks_for_usb_mobile() {
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let payload = vec![7_u8; USB_MOBILE_STREAM_CHUNK_SIZE + 3];
    let meta = RpcStreamMeta {
        name: "movie.mov".to_string(),
        mime_type: "video/quicktime".to_string(),
        size: payload.len() as u64,
        chunk_size: payload.len() as u32,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        11,
        "peer-usb-stream-test",
        "catalog:download",
        true,
        frame_stream_meta_response(11, &meta),
        Box::new(std::io::Cursor::new(payload)),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start usb stream");

    while !active_streams.is_empty() {
        assert!(send_next_host_outgoing_stream_chunk(
            &mut transport,
            &mut host_noise,
            TransportPolicy::for_transport(TransportType::UsbMobile),
            &mut active_streams,
            &mut active_order,
        )
        .await
        .expect("send next usb stream chunk"));
    }

    let frames = sent_frames.lock().unwrap();
    assert_eq!(frames.len(), 4);
    assert_eq!(frames[1].payload.len(), USB_MOBILE_STREAM_CHUNK_SIZE);
    assert_ne!(frames[1].flags & FLAG_HAS_CONTINUATION, 0);
    assert_eq!(frames[2].payload.len(), 3);
    assert_ne!(frames[2].flags & FLAG_HAS_CONTINUATION, 0);
    assert!(frames[3].payload.is_empty());
    assert_eq!(frames[3].flags & FLAG_HAS_CONTINUATION, 0);
}

#[tokio::test]
async fn host_rpc_loop_sends_large_range_stream_over_mobile_usb_record_transport() {
    let (mut client_noise, host_noise) = noise_pair();
    let (client_stream, host_stream) = tokio::io::duplex(256 * 1024);
    let mut client_transport = crate::mobile_usb::MobileUsbRemoteTransport::new(
        client_stream,
        crate::mobile_usb::MobileUsbBridgeKind::AndroidAoa,
    );
    let host_transport = crate::mobile_usb::MobileUsbRemoteTransport::new(
        host_stream,
        crate::mobile_usb::MobileUsbBridgeKind::AndroidAoa,
    );
    let payload = vec![0x2b; USB_MOBILE_STREAM_CHUNK_SIZE + 17];
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(RangeDownloadAdapter {
            payload: payload.clone(),
        })));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-range-record-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 31,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": 1,
                    "offset": 0,
                    "length": payload.len(),
                    "expected_source_revision": 42,
                }),
            ))
            .expect("range request json"),
        },
    )
    .await
    .expect("send range request");

    let meta_frame =
        crate::remote_data_plane::recv_decrypted_frame(&mut client_transport, &mut client_noise)
            .await
            .expect("range meta frame");
    assert_eq!(meta_frame.message_id, 31);
    assert_eq!(meta_frame.frame_type, FrameType::RpcResponse);
    assert_ne!(meta_frame.flags & FLAG_HAS_CONTINUATION, 0);

    let mut received = Vec::new();
    loop {
        let frame = crate::remote_data_plane::recv_decrypted_frame(
            &mut client_transport,
            &mut client_noise,
        )
        .await
        .expect("range body frame");
        assert_eq!(frame.message_id, 31);
        assert_eq!(frame.frame_type, FrameType::RpcResponse);
        received.extend_from_slice(&frame.payload);
        if frame.flags & FLAG_HAS_CONTINUATION == 0 {
            break;
        }
    }

    assert_eq!(received, payload);

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

#[tokio::test]
async fn host_outgoing_stream_allows_json_response_before_body_chunk() {
    let (client_noise, mut host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let mut transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let mut active_streams = HashMap::new();
    let mut active_order = VecDeque::new();
    let meta = RpcStreamMeta {
        name: "movie.mov".to_string(),
        mime_type: "video/quicktime".to_string(),
        size: 5,
        chunk_size: 5,
    };

    start_host_outgoing_stream(
        &mut transport,
        &mut host_noise,
        13,
        "peer-interleave-test",
        "catalog:download",
        true,
        frame_stream_meta_response(13, &meta),
        Box::new(std::io::Cursor::new(b"hello".to_vec())),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("start interleaved stream");

    send_encrypted_frame(
        &mut transport,
        &mut host_noise,
        frame_from_rpc_response(15, &RpcResponse::success(serde_json::json!({"ok": true}))),
    )
    .await
    .expect("send interleaved json response");

    {
        let frames = sent_frames.lock().unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].message_id, 13);
        assert_ne!(frames[0].flags & FLAG_HAS_CONTINUATION, 0);
        assert_eq!(frames[1].message_id, 15);
        assert_eq!(frames[1].flags & FLAG_HAS_CONTINUATION, 0);
    }

    assert!(send_next_host_outgoing_stream_chunk(
        &mut transport,
        &mut host_noise,
        TransportPolicy::for_transport(TransportType::WebRtcDataChannel),
        &mut active_streams,
        &mut active_order,
    )
    .await
    .expect("send stream body after json response"));

    let frames = sent_frames.lock().unwrap();
    assert_eq!(frames.len(), 3);
    assert_eq!(frames[2].message_id, 13);
    assert_eq!(frames[2].payload, b"hello");
    assert_ne!(frames[2].flags & FLAG_HAS_CONTINUATION, 0);
}

struct RangeDownloadAdapter {
    payload: Vec<u8>,
}

impl CoreAdapter for RangeDownloadAdapter {
    fn mode(&self) -> crate::core_adapter::CoreMode {
        crate::core_adapter::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
        RpcResponse::success(serde_json::Value::Null)
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        _stream: Option<RpcInputStream>,
    ) -> RpcReply {
        assert_eq!(req.command, "catalog:downloadRange");
        RpcReply::RangeStream(chromvoid_core::rpc::RpcRangeOutputStream {
            meta: RpcRangeStreamMeta {
                name: "range.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                file_size: self.payload.len() as u64,
                chunk_size: USB_MOBILE_STREAM_CHUNK_SIZE as u32,
                range_offset: 0,
                range_length: self.payload.len() as u64,
                source_revision: 42,
            },
            reader: Box::new(std::io::Cursor::new(self.payload.clone())),
        })
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn take_events(&mut self) -> Vec<serde_json::Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}
