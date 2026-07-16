use super::support::*;
use super::*;

#[tokio::test]
async fn fake_transport_stream_response_continuation_roundtrip() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::StreamResponseAfterUpload);
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
            request: RpcRequest::new("stream:upload:download", serde_json::json!({})),
            stream: Some(RpcInputStream::from_bytes(vec![9])),
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

    let RpcReply::Stream(mut output) = reply else {
        panic!("expected stream reply");
    };
    assert_eq!(output.meta.size, 5);

    let mut body = Vec::new();
    output.reader.read_to_end(&mut body).expect("read output");
    assert_eq!(body, b"hello");
}

#[tokio::test]
async fn fake_transport_download_stream_response_without_upload_roundtrip() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::StreamResponseNoUpload);
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
            request: RpcRequest::new("stream:download", serde_json::json!({})),
            stream: None,
            reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("download request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
        .await
        .expect("download reply timeout")
        .expect("download reply channel");
    let RpcReply::Stream(mut output) = reply else {
        panic!("expected stream reply");
    };
    assert_eq!(output.meta.size, 5);

    let mut body = Vec::new();
    output.reader.read_to_end(&mut body).expect("read output");
    assert_eq!(body, b"hello");

    let (json_reply_tx, json_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("test:echo", serde_json::json!({"value": 7})),
            stream: None,
            reply_tx: json_reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("json request queued");

    let json_reply = tokio::time::timeout(Duration::from_secs(1), json_reply_rx)
        .await
        .expect("json reply timeout")
        .expect("json reply channel");
    task_handle.abort();

    let RpcReply::Json(response) = json_reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "test:echo");
}

#[tokio::test]
async fn fake_transport_empty_stream_response_without_upload_roundtrip() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::EmptyStreamResponseNoUpload);
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
            request: RpcRequest::new("stream:empty-download", serde_json::json!({})),
            stream: None,
            reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("empty download request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
        .await
        .expect("empty download reply timeout")
        .expect("empty download reply channel");

    let RpcReply::Stream(mut output) = reply else {
        panic!("expected stream reply");
    };
    assert_eq!(output.meta.size, 0);

    let mut body = Vec::new();
    output.reader.read_to_end(&mut body).expect("read output");
    task_handle.abort();
    assert!(body.is_empty());
}

#[tokio::test]
async fn fake_transport_range_stream_response_without_upload_roundtrip() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::RangeResponseNoUpload);
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
            request: RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": 1,
                    "offset": 2,
                    "length": 5,
                    "expected_source_revision": 42,
                }),
            ),
            stream: None,
            reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("range request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
        .await
        .expect("range reply timeout")
        .expect("range reply channel");

    let RpcReply::RangeStream(mut output) = reply else {
        panic!("expected range stream reply");
    };
    assert_eq!(output.meta.file_size, 10);
    assert_eq!(output.meta.range_offset, 2);
    assert_eq!(output.meta.range_length, 5);
    assert_eq!(output.meta.source_revision, 42);

    let mut body = Vec::new();
    output.reader.read_to_end(&mut body).expect("read output");
    task_handle.abort();
    assert_eq!(body, b"hello");
}

#[tokio::test]
async fn range_stream_meta_does_not_block_followup_json_request() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = ScriptedTransport::with_sent_frames(
        host_noise,
        Script::RangeMetaOnlyNoUpload,
        sent_frames.clone(),
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

    let (range_reply_tx, range_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": 1,
                    "offset": 2,
                    "length": 5,
                    "expected_source_revision": 42,
                }),
            ),
            stream: None,
            reply_tx: range_reply_tx,
            priority: RemoteRpcPriority::Media,
            cancel_group: None,
        })
        .await
        .expect("range request queued");

    let range_reply = tokio::time::timeout(Duration::from_secs(1), range_reply_rx)
        .await
        .expect("range reply timeout")
        .expect("range reply channel");
    let RpcReply::RangeStream(output) = range_reply else {
        panic!("expected range stream reply");
    };
    assert_eq!(output.meta.range_offset, 2);

    let (json_reply_tx, json_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("vault:status", serde_json::json!({})),
            stream: None,
            reply_tx: json_reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("json request queued");

    let json_reply = tokio::time::timeout(Duration::from_secs(1), json_reply_rx)
        .await
        .expect("json reply timeout")
        .expect("json reply channel");
    task_handle.abort();

    let RpcReply::Json(response) = json_reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "vault:status");
    let sent_requests = sent_frames
        .lock()
        .unwrap()
        .iter()
        .filter(|frame| frame.frame_type == FrameType::RpcRequest && !frame.payload.is_empty())
        .filter_map(|frame| serde_json::from_slice::<RpcRequest>(&frame.payload).ok())
        .collect::<Vec<_>>();
    let range_request = sent_requests
        .iter()
        .find(|request| request.command == MEDIA_RANGE_COMMAND)
        .expect("range request frame sent");
    assert_eq!(
        range_request.transport_features.as_deref(),
        Some(&[CORE_FEATURE_REMOTE_STREAM_CONTROL_V1.to_string()][..])
    );
    let status_request = sent_requests
        .iter()
        .find(|request| request.command == "vault:status")
        .expect("status request frame sent");
    assert!(status_request.transport_features.is_none());
}

#[tokio::test]
async fn buffered_range_chunks_do_not_block_followup_json_request() {
    assert!(
        RESPONSE_STREAM_CHANNEL_CAPACITY > BURST_RESPONSE_CHUNK_COUNT,
        "response stream buffer must cover the deterministic media burst"
    );

    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::RangeBurstThenJson);
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

    let (range_reply_tx, range_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": 1,
                    "offset": 0,
                    "length": BURST_RESPONSE_CHUNK_COUNT * MAX_FRAME_PAYLOAD_SIZE,
                    "expected_source_revision": 42,
                }),
            ),
            stream: None,
            reply_tx: range_reply_tx,
            priority: RemoteRpcPriority::Media,
            cancel_group: None,
        })
        .await
        .expect("range request queued");

    let range_reply = tokio::time::timeout(Duration::from_secs(1), range_reply_rx)
        .await
        .expect("range reply timeout")
        .expect("range reply channel");
    let RpcReply::RangeStream(output) = range_reply else {
        panic!("expected range stream reply");
    };
    assert_eq!(
        output.meta.range_length,
        (BURST_RESPONSE_CHUNK_COUNT * MAX_FRAME_PAYLOAD_SIZE) as u64
    );

    let (json_reply_tx, json_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("vault:status", serde_json::json!({})),
            stream: None,
            reply_tx: json_reply_tx,
            priority: RemoteRpcPriority::High,
            cancel_group: None,
        })
        .await
        .expect("json request queued");

    let json_reply = tokio::time::timeout(Duration::from_secs(1), json_reply_rx)
        .await
        .expect("json reply timeout")
        .expect("json reply channel");
    task_handle.abort();
    drop(output);

    let RpcReply::Json(response) = json_reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "vault:status");
}

#[tokio::test]
async fn two_media_range_streams_run_concurrently_and_third_defers_without_starving_json() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::RangeMetaOnlyNoUpload);
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

    let send_range_request = |reply_tx| crate::remote_data_plane::RemoteIoRequest {
        request: RpcRequest::new(
            MEDIA_RANGE_COMMAND,
            serde_json::json!({
                "node_id": 1,
                "offset": 0,
                "length": 5,
                "expected_source_revision": 42,
            }),
        ),
        stream: None,
        reply_tx,
        priority: RemoteRpcPriority::Media,
        cancel_group: None,
    };

    // SPEC-231.2: one foreground + one prefetch range stream may be in
    // flight; both must receive their stream meta while neither has
    // finished (the script never sends body chunks).
    let (first_tx, first_rx) = oneshot::channel();
    req_tx
        .send(send_range_request(first_tx))
        .await
        .expect("first range queued");
    let first_reply = tokio::time::timeout(Duration::from_secs(1), first_rx)
        .await
        .expect("first range reply timeout")
        .expect("first range reply channel");
    assert!(matches!(first_reply, RpcReply::RangeStream(_)));

    let (second_tx, second_rx) = oneshot::channel();
    req_tx
        .send(send_range_request(second_tx))
        .await
        .expect("second range queued");
    let second_reply = tokio::time::timeout(Duration::from_secs(1), second_rx)
        .await
        .expect("second concurrent range reply timeout")
        .expect("second range reply channel");
    assert!(matches!(second_reply, RpcReply::RangeStream(_)));

    // A third range request must defer behind the two active streams...
    let (third_tx, mut third_rx) = oneshot::channel();
    req_tx
        .send(send_range_request(third_tx))
        .await
        .expect("third range queued");

    // ...but deferring it must not stop lower-priority queues from draining.
    let (json_tx, json_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("vault:status", serde_json::json!({})),
            stream: None,
            reply_tx: json_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("json request queued");
    let json_reply = tokio::time::timeout(Duration::from_secs(1), json_rx)
        .await
        .expect("json reply must not be starved by deferred media request")
        .expect("json reply channel");
    let RpcReply::Json(response) = json_reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "vault:status");

    assert!(
        third_rx.try_recv().is_err(),
        "third range request must stay deferred while two streams are active"
    );

    task_handle.abort();
    drop(first_reply);
    drop(second_reply);
}

#[tokio::test]
async fn io_loop_exit_before_final_frame_surfaces_truncation_error() {
    let (reply_tx, reply_rx) = oneshot::channel();
    let meta = RpcRangeStreamMeta {
        name: "range.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        file_size: 10,
        chunk_size: 3,
        range_offset: 0,
        range_length: 6,
        source_revision: 1,
    };
    let meta_frame = Frame {
        frame_type: FrameType::RpcResponse,
        message_id: 103,
        flags: FLAG_HAS_CONTINUATION,
        payload: serde_json::to_vec(&meta).expect("range meta json"),
    };
    let mut active_streams = HashMap::new();
    let (drop_tx, _drop_rx) = mpsc::unbounded_channel();
    active_streams.insert(
        103,
        open_response_stream(MEDIA_RANGE_COMMAND, meta_frame, reply_tx, &drop_tx)
            .expect("open response stream"),
    );

    let reply = reply_rx.await.expect("range stream reply");
    let RpcReply::RangeStream(mut output) = reply else {
        panic!("expected range stream");
    };

    assert!(forward_active_stream_frame(
        103,
        frame_continuation(FrameType::RpcResponse, 103, b"abc".to_vec(), true),
        &mut active_streams,
    ));

    // Simulate the io loop exiting (transport error) before the final
    // continuation-clear frame arrived: dropping the loop-side state must
    // not turn the truncated transfer into a clean EOF.
    drop(active_streams);

    let mut body = Vec::new();
    let error = output
        .reader
        .read_to_end(&mut body)
        .expect_err("truncated stream must surface as io error");
    assert_eq!(error.kind(), std::io::ErrorKind::UnexpectedEof);
    assert_eq!(body, b"abc", "chunks received before the drop are drained");
}

#[tokio::test]
async fn dropped_response_stream_reader_clears_active_stream_state() {
    let (reply_tx, reply_rx) = oneshot::channel();
    let meta = RpcRangeStreamMeta {
        name: "range.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        file_size: 10,
        chunk_size: 3,
        range_offset: 0,
        range_length: 3,
        source_revision: 1,
    };
    let meta_frame = Frame {
        frame_type: FrameType::RpcResponse,
        message_id: 99,
        flags: FLAG_HAS_CONTINUATION,
        payload: serde_json::to_vec(&meta).expect("range meta json"),
    };
    let mut active_streams = HashMap::new();
    let (drop_tx, _drop_rx) = mpsc::unbounded_channel();
    active_streams.insert(
        99,
        open_response_stream(MEDIA_RANGE_COMMAND, meta_frame, reply_tx, &drop_tx)
            .expect("open response stream"),
    );

    let reply = reply_rx.await.expect("range stream reply");
    let RpcReply::RangeStream(output) = reply else {
        panic!("expected range stream");
    };
    drop(output);

    let handled = forward_active_stream_frame(
        99,
        frame_continuation(FrameType::RpcResponse, 99, b"abc".to_vec(), true),
        &mut active_streams,
    );

    assert!(handled);
    assert!(
        active_streams.is_empty(),
        "dropped reader must release active stream state"
    );
}

#[tokio::test]
async fn response_stream_error_frame_fails_reader_instead_of_clean_eof() {
    let (reply_tx, reply_rx) = oneshot::channel();
    let meta = RpcRangeStreamMeta {
        name: "range.bin".to_string(),
        mime_type: "application/octet-stream".to_string(),
        file_size: 10,
        chunk_size: 3,
        range_offset: 0,
        range_length: 3,
        source_revision: 1,
    };
    let meta_frame = Frame {
        frame_type: FrameType::RpcResponse,
        message_id: 101,
        flags: FLAG_HAS_CONTINUATION,
        payload: serde_json::to_vec(&meta).expect("range meta json"),
    };
    let mut active_streams = HashMap::new();
    let (drop_tx, _drop_rx) = mpsc::unbounded_channel();
    active_streams.insert(
        101,
        open_response_stream(MEDIA_RANGE_COMMAND, meta_frame, reply_tx, &drop_tx)
            .expect("open response stream"),
    );

    let reply = reply_rx.await.expect("range stream reply");
    let RpcReply::RangeStream(mut output) = reply else {
        panic!("expected range stream");
    };

    assert!(forward_active_stream_frame(
        101,
        crate::rpc_transport_protocol::frame_stream_read_failed(
            101,
            MEDIA_RANGE_COMMAND,
            "disk read failed",
        ),
        &mut active_streams,
    ));

    let mut body = Vec::new();
    let error = output
        .reader
        .read_to_end(&mut body)
        .expect_err("stream read failure must surface as io error");
    assert!(error.to_string().contains("disk read failed"));
    assert!(body.is_empty());
    assert!(active_streams.is_empty());
}

#[tokio::test]
async fn dropped_response_stream_reader_sends_protocol_cancel_frame() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let peer_features = crate::remote_data_plane::RemotePeerFeatures::new();
    peer_features.replace(vec![CORE_FEATURE_REMOTE_STREAM_CONTROL_V1.to_string()]);
    let transport = ScriptedTransport::with_sent_frames(
        host_noise,
        Script::RangeMetaOnlyNoUpload,
        sent_frames.clone(),
    );
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features,
        },
    );

    let (range_reply_tx, range_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new(
                MEDIA_RANGE_COMMAND,
                serde_json::json!({
                    "node_id": 1,
                    "offset": 2,
                    "length": 5,
                    "expected_source_revision": 42,
                }),
            ),
            stream: None,
            reply_tx: range_reply_tx,
            priority: RemoteRpcPriority::Media,
            cancel_group: None,
        })
        .await
        .expect("range request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), range_reply_rx)
        .await
        .expect("range reply timeout")
        .expect("range reply channel");
    let RpcReply::RangeStream(output) = reply else {
        panic!("expected range stream");
    };
    drop(output);

    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if sent_frames.lock().unwrap().iter().any(|frame| {
                matches!(
                    parse_stream_control_frame(frame),
                    Some(RemoteStreamControl::Cancelled { .. })
                )
            }) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("cancel frame timeout");
    task_handle.abort();
}

#[tokio::test]
async fn dropped_response_stream_reader_skips_cancel_for_old_peer() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = ScriptedTransport::with_sent_frames(
        host_noise,
        Script::RangeMetaOnlyNoUpload,
        sent_frames.clone(),
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

    let (range_reply_tx, range_reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new(
                MEDIA_RANGE_COMMAND,
                serde_json::json!({
                    "node_id": 1,
                    "offset": 2,
                    "length": 5,
                    "expected_source_revision": 42,
                }),
            ),
            stream: None,
            reply_tx: range_reply_tx,
            priority: RemoteRpcPriority::Media,
            cancel_group: None,
        })
        .await
        .expect("range request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), range_reply_rx)
        .await
        .expect("range reply timeout")
        .expect("range reply channel");
    let RpcReply::RangeStream(output) = reply else {
        panic!("expected range stream");
    };
    drop(output);
    tokio::time::sleep(Duration::from_millis(50)).await;
    task_handle.abort();

    assert!(
        !sent_frames.lock().unwrap().iter().any(|frame| {
            matches!(
                parse_stream_control_frame(frame),
                Some(RemoteStreamControl::Cancelled { .. })
            )
        }),
        "old peers must not receive stream-control cancel frames"
    );
}
