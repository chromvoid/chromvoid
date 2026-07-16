mod common;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcRangeStreamMeta, RpcReply};
use chromvoid_lib::remote_data_plane::{RemoteIoEvent, RemoteIoFailure};
use chromvoid_lib::{
    CoreAdapter, RemoteCancelGroup, RemoteCoreAdapter, RemoteHost, RemoteRpcPriority,
};
use chromvoid_protocol::{FrameType, TransportMetrics, TransportType, MAX_FRAME_PAYLOAD_SIZE};
use common::remote_transport_harness::{
    call_json, call_range_stream, call_range_stream_result, call_stream_reply, fast_timing,
    heartbeat_timing, probe_capabilities, range_meta, remote_adapter, send_data_plane_request,
    send_data_plane_request_with_cancel_group, start_scripted_remote_data_plane,
    start_scripted_remote_data_plane_with_timing, FailingReader, ScriptedRemoteResponse,
};
use serde_json::json;

#[tokio::test(flavor = "multi_thread")]
async fn remote_core_adapter_round_trips_metadata_range_and_control_rpc() {
    let media_bytes = common::deterministic_bytes(0x5eed, MAX_FRAME_PAYLOAD_SIZE * 3 + 911);
    let expected_media_bytes = media_bytes.clone();
    let expected_size = media_bytes.len() as u64;

    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(move |request| match request.command.as_str() {
            "catalog:source:metadata" => ScriptedRemoteResponse::json_success(json!({
                "node_id": 77,
                "node_type": 1,
                "name": "deterministic-track.mp3",
                "mime_type": "audio/mpeg",
                "size": expected_size,
                "source_revision": 42,
            })),
            "catalog:downloadRange" => {
                let offset = request.data["offset"].as_u64().expect("offset") as usize;
                let length = request.data["length"].as_u64().expect("length") as usize;
                let end = offset.checked_add(length).expect("range end");
                let range = media_bytes
                    .get(offset..end)
                    .expect("requested media range")
                    .to_vec();
                let meta = RpcRangeStreamMeta {
                    name: "deterministic-track.mp3".to_string(),
                    mime_type: "audio/mpeg".to_string(),
                    file_size: expected_size,
                    chunk_size: MAX_FRAME_PAYLOAD_SIZE as u32,
                    range_offset: offset as u64,
                    range_length: length as u64,
                    source_revision: 42,
                };
                ScriptedRemoteResponse::Range {
                    meta,
                    chunks: range
                        .chunks(MAX_FRAME_PAYLOAD_SIZE)
                        .map(|chunk| chunk.to_vec())
                        .collect(),
                }
            }
            "vault:status" => ScriptedRemoteResponse::json_success(json!({
                "is_unlocked": true,
                "mode": "remote",
            })),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );

    let adapter = Arc::new(Mutex::new(
        RemoteCoreAdapter::from_remote_sender_with_metrics(
            RemoteHost::MobileUsb {
                host_id: "scripted-android".to_string(),
                label: Some("Scripted Android".to_string()),
                platform: "android".to_string(),
            },
            harness.req_tx.clone(),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        ),
    ));

    let metadata = call_json(
        adapter.clone(),
        RpcRequest::new("catalog:source:metadata", json!({ "node_id": 77 })),
    )
    .await;
    assert_eq!(
        metadata.result().expect("metadata result")["name"],
        "deterministic-track.mp3"
    );
    assert_eq!(
        metadata.result().expect("metadata result")["size"],
        expected_size
    );

    let (range_meta, range_bytes) = call_range_stream(
        adapter.clone(),
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 77,
                "offset": MAX_FRAME_PAYLOAD_SIZE as u64,
                "length": 2048_u64,
                "expected_source_revision": 42,
            }),
        ),
    )
    .await;
    assert_eq!(range_meta.range_offset, MAX_FRAME_PAYLOAD_SIZE as u64);
    assert_eq!(range_meta.range_length, 2048);
    assert_eq!(
        range_bytes,
        expected_media_bytes[MAX_FRAME_PAYLOAD_SIZE..MAX_FRAME_PAYLOAD_SIZE + 2048]
    );

    let status = call_json(adapter.clone(), RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(status.result().expect("status result")["is_unlocked"], true);

    assert_eq!(
        harness.observed_commands(),
        vec![
            "catalog:source:metadata".to_string(),
            "catalog:downloadRange".to_string(),
            "vault:status".to_string(),
        ]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn transport_type_matrix_round_trips_audio_and_video_ranges() {
    for transport_type in [
        TransportType::UsbMobile,
        TransportType::WssRelay,
        TransportType::WebRtcDataChannel,
        TransportType::QuicMasque,
        TransportType::TcpStealth,
    ] {
        let audio_bytes = common::deterministic_bytes(0xa11d10, MAX_FRAME_PAYLOAD_SIZE + 31);
        let video_bytes = common::deterministic_bytes(0x71de0, MAX_FRAME_PAYLOAD_SIZE * 2 + 47);
        let audio_expected = audio_bytes.clone();
        let video_expected = video_bytes.clone();
        let harness = start_scripted_remote_data_plane(
            transport_type,
            Box::new(move |request| match request.command.as_str() {
                "catalog:source:metadata" => match request.data["node_id"].as_u64() {
                    Some(101) => ScriptedRemoteResponse::json_success(json!({
                        "node_id": 101,
                        "node_type": 1,
                        "name": "matrix-audio.mp3",
                        "mime_type": "audio/mpeg",
                        "size": audio_bytes.len() as u64,
                        "source_revision": 7,
                    })),
                    Some(202) => ScriptedRemoteResponse::json_success(json!({
                        "node_id": 202,
                        "node_type": 1,
                        "name": "matrix-video.mp4",
                        "mime_type": "video/mp4",
                        "media_info": {"k": "video", "a": 1, "v": 1, "m": "video/mp4"},
                        "size": video_bytes.len() as u64,
                        "source_revision": 8,
                    })),
                    _ => ScriptedRemoteResponse::json_error("unknown node", Some("NOT_FOUND")),
                },
                "catalog:downloadRange" => {
                    let node_id = request.data["node_id"].as_u64().expect("node_id");
                    let source = match node_id {
                        101 => &audio_bytes,
                        202 => &video_bytes,
                        _ => {
                            return ScriptedRemoteResponse::json_error(
                                "unknown node",
                                Some("NOT_FOUND"),
                            )
                        }
                    };
                    let offset = request.data["offset"].as_u64().expect("offset") as usize;
                    let length = request.data["length"].as_u64().expect("length") as usize;
                    let range = source[offset..offset + length].to_vec();
                    ScriptedRemoteResponse::Range {
                        meta: RpcRangeStreamMeta {
                            name: if node_id == 101 {
                                "matrix-audio.mp3".to_string()
                            } else {
                                "matrix-video.mp4".to_string()
                            },
                            mime_type: if node_id == 101 {
                                "audio/mpeg".to_string()
                            } else {
                                "video/mp4".to_string()
                            },
                            file_size: source.len() as u64,
                            chunk_size: MAX_FRAME_PAYLOAD_SIZE as u32,
                            range_offset: offset as u64,
                            range_length: length as u64,
                            source_revision: if node_id == 101 { 7 } else { 8 },
                        },
                        chunks: range
                            .chunks(MAX_FRAME_PAYLOAD_SIZE)
                            .map(|chunk| chunk.to_vec())
                            .collect(),
                    }
                }
                command => ScriptedRemoteResponse::json_error(
                    format!("unexpected command: {command}"),
                    Some("UNEXPECTED_COMMAND"),
                ),
            }),
        );
        let adapter = Arc::new(Mutex::new(remote_adapter(
            transport_type,
            harness.req_tx.clone(),
        )));
        assert_eq!(
            adapter
                .lock()
                .expect("remote adapter lock")
                .transport_metrics()
                .and_then(|metrics| metrics.transport_type),
            Some(transport_type)
        );

        let audio_metadata = call_json(
            adapter.clone(),
            RpcRequest::new("catalog:source:metadata", json!({ "node_id": 101 })),
        )
        .await;
        assert_eq!(
            audio_metadata.result().expect("audio metadata")["mime_type"],
            "audio/mpeg"
        );
        let (_, audio_range) = call_range_stream(
            adapter.clone(),
            RpcRequest::new(
                "catalog:downloadRange",
                json!({
                    "node_id": 101,
                    "offset": 0,
                    "length": 1024_u64,
                    "expected_source_revision": 7,
                }),
            ),
        )
        .await;
        assert_eq!(audio_range, audio_expected[..1024]);

        let video_metadata = call_json(
            adapter.clone(),
            RpcRequest::new("catalog:source:metadata", json!({ "node_id": 202 })),
        )
        .await;
        assert_eq!(
            video_metadata.result().expect("video metadata")["mime_type"],
            "video/mp4"
        );
        let (_, video_range) = call_range_stream(
            adapter,
            RpcRequest::new(
                "catalog:downloadRange",
                json!({
                    "node_id": 202,
                    "offset": 17_u64,
                    "length": 2048_u64,
                    "expected_source_revision": 8,
                }),
            ),
        )
        .await;
        assert_eq!(video_range, video_expected[17..17 + 2048]);
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn json_timeout_releases_request_slot_and_followup_rpc_succeeds() {
    let mut status_calls = 0_u8;
    let harness = start_scripted_remote_data_plane_with_timing(
        TransportType::UsbMobile,
        fast_timing(),
        Box::new(move |request| match request.command.as_str() {
            "vault:status" => {
                status_calls = status_calls.saturating_add(1);
                if status_calls == 1 {
                    ScriptedRemoteResponse::NoResponse
                } else {
                    ScriptedRemoteResponse::json_success(json!({
                        "is_unlocked": true,
                        "after_timeout": true,
                    }))
                }
            }
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let timeout = call_json(adapter.clone(), RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(timeout.code(), Some("TIMEOUT"));

    let followup = call_json(adapter, RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(
        followup.result().expect("followup result")["after_timeout"],
        true
    );
    assert_eq!(
        harness.observed_commands(),
        vec!["vault:status".to_string(), "vault:status".to_string()]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn pending_media_metadata_request_does_not_block_control_rpc() {
    let harness = start_scripted_remote_data_plane_with_timing(
        TransportType::UsbMobile,
        fast_timing(),
        Box::new(move |request| match request.command.as_str() {
            "catalog:source:metadata" => ScriptedRemoteResponse::NoResponse,
            "vault:status" => ScriptedRemoteResponse::json_success(json!({
                "is_unlocked": true,
                "control_replied_while_metadata_pending": true,
            })),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );

    let mut metadata_rx = send_data_plane_request(
        &harness.req_tx,
        RpcRequest::new("catalog:source:metadata", json!({ "node_id": 404 })),
        RemoteRpcPriority::Normal,
    )
    .await;
    assert!(
        tokio::time::timeout(Duration::from_millis(10), &mut metadata_rx)
            .await
            .is_err(),
        "metadata request should remain pending before timeout"
    );

    let status_rx = send_data_plane_request(
        &harness.req_tx,
        RpcRequest::new("vault:status", json!({})),
        RemoteRpcPriority::High,
    )
    .await;
    let status_reply = tokio::time::timeout(Duration::from_secs(1), status_rx)
        .await
        .expect("status reply timeout")
        .expect("status reply");
    let RpcReply::Json(status) = status_reply else {
        panic!("expected status JSON reply");
    };
    assert_eq!(
        status.result().expect("status result")["control_replied_while_metadata_pending"],
        true
    );

    let metadata_reply = tokio::time::timeout(Duration::from_secs(1), metadata_rx)
        .await
        .expect("metadata timeout reply")
        .expect("metadata reply");
    let RpcReply::Json(metadata_error) = metadata_reply else {
        panic!("expected metadata timeout JSON reply");
    };
    assert_eq!(metadata_error.code(), Some("TIMEOUT"));
    assert_eq!(
        harness.observed_commands(),
        vec![
            "catalog:source:metadata".to_string(),
            "vault:status".to_string(),
        ]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn missing_final_range_surfaces_truncation_when_transport_closes() {
    let chunks = vec![vec![1_u8; 512], vec![2_u8; 768]];
    let expected = chunks.concat();
    let expected_len = expected.len() as u64;
    let mut harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(move |request| match request.command.as_str() {
            "catalog:downloadRange" => ScriptedRemoteResponse::RangeThenClose {
                meta: range_meta(404, expected_len, 0, expected_len),
                chunks: chunks.clone(),
            },
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let (_, bytes, read_result) = call_range_stream_result(
        adapter.clone(),
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 404,
                "offset": 0,
                "length": expected.len() as u64,
                "expected_source_revision": 12,
            }),
        ),
    )
    .await;

    let error = read_result.expect_err("missing final frame must be a truncated stream");
    assert_eq!(error.kind(), std::io::ErrorKind::UnexpectedEof);
    assert_eq!(
        error.to_string(),
        "remote response stream terminated before final frame"
    );
    assert_eq!(
        bytes, expected,
        "buffered chunks must be drained before EOF"
    );

    let event = tokio::time::timeout(Duration::from_secs(1), harness.evt_rx.recv())
        .await
        .expect("disconnect event timeout")
        .expect("disconnect event");
    let RemoteIoEvent::Disconnected { reason, failure } = event else {
        panic!("expected disconnect event after range transport close");
    };
    assert!(reason.contains("transport closed"));
    assert_eq!(failure, RemoteIoFailure::TransportClosed);

    let followup = call_json(adapter, RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(followup.code(), Some("DISCONNECTED"));
}

#[tokio::test(flavor = "multi_thread")]
async fn usb_record_desync_during_media_range_disconnects_without_poisoning_followup_rpc() {
    let chunks = vec![vec![3_u8; 512]];
    let expected = chunks.concat();
    let expected_len = expected.len() as u64;
    let mut harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(move |request| match request.command.as_str() {
            "catalog:downloadRange" => ScriptedRemoteResponse::RangeThenRecordLayerInvalidLength {
                meta: range_meta(405, expected_len, 0, expected_len),
                chunks: chunks.clone(),
                message: "mobile_usb record layer rejected payload length 417856864",
            },
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let (_, bytes, read_result) = call_range_stream_result(
        adapter.clone(),
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 405,
                "offset": 0,
                "length": expected_len,
                "expected_source_revision": 12,
            }),
        ),
    )
    .await;

    let error = read_result.expect_err("USB record desync must truncate the active stream");
    assert_eq!(error.kind(), std::io::ErrorKind::UnexpectedEof);
    assert_eq!(
        bytes, expected,
        "buffered chunks must be drained before the desync is observed"
    );

    let event = tokio::time::timeout(Duration::from_secs(1), harness.evt_rx.recv())
        .await
        .expect("disconnect event timeout")
        .expect("disconnect event");
    let RemoteIoEvent::Disconnected { reason, failure } = event else {
        panic!("expected disconnect event after corrupt USB record");
    };
    assert!(reason.contains("mobile_usb record layer rejected payload length 417856864"));
    assert_eq!(
        failure,
        RemoteIoFailure::RecordLayerInvalidLength {
            message: concat!(
                "recv: record layer invalid length: ",
                "mobile_usb record layer rejected payload length 417856864"
            )
            .to_string(),
        }
    );

    let followup = call_json(adapter, RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(followup.code(), Some("DISCONNECTED"));
}

#[tokio::test(flavor = "multi_thread")]
async fn control_rpc_passes_while_media_range_stream_is_active() {
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:downloadRange" => ScriptedRemoteResponse::RangeWithoutFinal {
                meta: range_meta(505, 4096, 0, 1024),
                chunks: vec![vec![9_u8; 1024]],
            },
            "vault:status" => ScriptedRemoteResponse::json_success(json!({
                "is_unlocked": true,
            })),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let reply = call_stream_reply(
        adapter.clone(),
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 505,
                "offset": 0,
                "length": 1024_u64,
                "expected_source_revision": 12,
            }),
        ),
        None,
    )
    .await;
    let RpcReply::RangeStream(output) = reply else {
        panic!("expected active range stream");
    };

    let status = call_json(adapter, RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(status.result().expect("status result")["is_unlocked"], true);
    drop(output);
}

#[tokio::test(flavor = "multi_thread")]
async fn third_media_range_waits_while_two_range_streams_are_active() {
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:downloadRange" => ScriptedRemoteResponse::RangeWithoutFinal {
                meta: range_meta(
                    request.data["node_id"].as_u64().expect("node_id"),
                    4096,
                    request.data["offset"].as_u64().expect("offset"),
                    1024,
                ),
                chunks: vec![vec![7_u8; 1024]],
            },
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );

    let first_rx = send_data_plane_request(
        &harness.req_tx,
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 606,
                "offset": 0,
                "length": 1024_u64,
                "expected_source_revision": 12,
            }),
        ),
        RemoteRpcPriority::Media,
    )
    .await;
    let first_reply = tokio::time::timeout(Duration::from_secs(1), first_rx)
        .await
        .expect("first range reply timeout")
        .expect("first range reply");
    let RpcReply::RangeStream(first_stream) = first_reply else {
        panic!("expected first range stream");
    };

    let second_rx = send_data_plane_request(
        &harness.req_tx,
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 606,
                "offset": 1024_u64,
                "length": 1024_u64,
                "expected_source_revision": 12,
            }),
        ),
        RemoteRpcPriority::Media,
    )
    .await;
    let second_reply = tokio::time::timeout(Duration::from_secs(1), second_rx)
        .await
        .expect("second concurrent range reply timeout")
        .expect("second concurrent range reply");
    let RpcReply::RangeStream(mut second_stream) = second_reply else {
        panic!("expected second concurrent range stream");
    };
    assert_eq!(second_stream.meta.range_offset, 1024);
    assert_eq!(second_stream.meta.range_length, 1024);
    let mut second_bytes = vec![0_u8; 1024];
    second_stream
        .reader
        .read_exact(&mut second_bytes)
        .expect("read second concurrent range chunk");
    assert_eq!(second_bytes, vec![7_u8; 1024]);

    let mut third_rx = send_data_plane_request(
        &harness.req_tx,
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 606,
                "offset": 2048_u64,
                "length": 1024_u64,
                "expected_source_revision": 12,
            }),
        ),
        RemoteRpcPriority::Media,
    )
    .await;
    assert!(
        tokio::time::timeout(Duration::from_millis(75), &mut third_rx)
            .await
            .is_err(),
        "third media range must stay queued while foreground and prefetch streams are active"
    );
    assert_eq!(
        harness.observed_commands(),
        vec![
            "catalog:downloadRange".to_string(),
            "catalog:downloadRange".to_string(),
        ]
    );
    drop(first_stream);

    let third_reply = tokio::time::timeout(Duration::from_secs(1), third_rx)
        .await
        .expect("third range reply timeout after first stream drop")
        .expect("third range reply");
    let RpcReply::RangeStream(mut third_stream) = third_reply else {
        panic!("expected third range stream");
    };
    assert_eq!(third_stream.meta.range_offset, 2048);
    assert_eq!(third_stream.meta.range_length, 1024);
    let mut third_bytes = vec![0_u8; 1024];
    third_stream
        .reader
        .read_exact(&mut third_bytes)
        .expect("read third range chunk");
    assert_eq!(third_bytes, vec![7_u8; 1024]);
    drop(second_stream);
    assert_eq!(
        harness.observed_commands(),
        vec![
            "catalog:downloadRange".to_string(),
            "catalog:downloadRange".to_string(),
            "catalog:downloadRange".to_string(),
        ]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn heartbeat_runs_for_network_transports_but_not_usb() {
    let network = start_scripted_remote_data_plane_with_timing(
        TransportType::WssRelay,
        heartbeat_timing(),
        Box::new(|_| ScriptedRemoteResponse::NoResponse),
    );
    tokio::time::sleep(Duration::from_millis(90)).await;
    assert!(
        network
            .observed_frames()
            .iter()
            .any(|frame| frame.frame_type == FrameType::Heartbeat),
        "network transport should send heartbeat frames"
    );

    let usb = start_scripted_remote_data_plane_with_timing(
        TransportType::UsbMobile,
        heartbeat_timing(),
        Box::new(|_| ScriptedRemoteResponse::NoResponse),
    );
    tokio::time::sleep(Duration::from_millis(90)).await;
    assert!(
        usb.observed_frames()
            .iter()
            .all(|frame| frame.frame_type != FrameType::Heartbeat),
        "USB transport should not send heartbeat frames"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn remote_vault_lock_success_disconnects_session() {
    let mut harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "vault:lock" => ScriptedRemoteResponse::json_success(json!({})),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let lock = call_json(adapter, RpcRequest::new("vault:lock", json!({}))).await;
    assert!(lock.is_ok());
    let event = tokio::time::timeout(Duration::from_secs(1), harness.evt_rx.recv())
        .await
        .expect("disconnect event timeout")
        .expect("disconnect event");
    let RemoteIoEvent::Disconnected { reason, .. } = event else {
        panic!("expected disconnect event after remote vault lock");
    };
    assert!(reason.contains("remote vault lock requested disconnect"));
}

#[tokio::test(flavor = "multi_thread")]
async fn remote_vault_lock_disconnects_while_media_range_stream_is_active() {
    let mut harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:downloadRange" => ScriptedRemoteResponse::RangeWithoutFinal {
                meta: range_meta(515, 4096, 0, 1024),
                chunks: vec![vec![5_u8; 1024]],
            },
            "vault:lock" => ScriptedRemoteResponse::json_success(json!({})),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let reply = call_stream_reply(
        adapter.clone(),
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 515,
                "offset": 0,
                "length": 1024_u64,
                "expected_source_revision": 12,
            }),
        ),
        None,
    )
    .await;
    let RpcReply::RangeStream(output) = reply else {
        panic!("expected active range stream");
    };

    let lock = call_json(adapter, RpcRequest::new("vault:lock", json!({}))).await;
    assert!(lock.is_ok());
    let event = tokio::time::timeout(Duration::from_secs(1), harness.evt_rx.recv())
        .await
        .expect("disconnect event timeout")
        .expect("disconnect event");
    let RemoteIoEvent::Disconnected { reason, .. } = event else {
        panic!("expected disconnect event after remote vault lock");
    };
    assert!(reason.contains("remote vault lock requested disconnect"));
    drop(output);
    assert_eq!(
        harness.observed_commands(),
        vec![
            "catalog:downloadRange".to_string(),
            "vault:lock".to_string(),
        ]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn upload_reader_error_returns_controlled_disconnect() {
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:uploadStream" => ScriptedRemoteResponse::json_success(json!({})),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));
    let reply = call_stream_reply(
        adapter,
        RpcRequest::new("catalog:uploadStream", json!({ "name": "broken.bin" })),
        Some(RpcInputStream::new(Box::new(FailingReader))),
    )
    .await;

    let RpcReply::Json(error) = reply else {
        panic!("expected upload reader error to surface as JSON error");
    };
    assert_eq!(error.code(), Some("DISCONNECTED"));
}

#[tokio::test(flavor = "multi_thread")]
async fn remote_transport_failures_surface_as_controlled_rpc_errors() {
    let malformed_json = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "vault:status" => ScriptedRemoteResponse::MalformedJson,
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let malformed_json_adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        malformed_json.req_tx.clone(),
    )));
    let parse_error = call_json(
        malformed_json_adapter,
        RpcRequest::new("vault:status", json!({})),
    )
    .await;
    assert_eq!(parse_error.code(), Some("PARSE_ERROR"));

    let disconnected = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "vault:status" => ScriptedRemoteResponse::Close,
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let disconnected_adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        disconnected.req_tx.clone(),
    )));
    let disconnect_error = call_json(
        disconnected_adapter,
        RpcRequest::new("vault:status", json!({})),
    )
    .await;
    assert_eq!(disconnect_error.code(), Some("DISCONNECTED"));

    let malformed_range = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:downloadRange" => ScriptedRemoteResponse::MalformedRangeMeta,
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let malformed_range_adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        malformed_range.req_tx.clone(),
    )));
    let malformed_range_reply = call_stream_reply(
        malformed_range_adapter,
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 303,
                "offset": 0,
                "length": 1024_u64,
                "expected_source_revision": 9,
            }),
        ),
        None,
    )
    .await;
    let RpcReply::Json(malformed_range_error) = malformed_range_reply else {
        panic!("expected malformed range to surface as JSON error");
    };
    assert_eq!(malformed_range_error.code(), Some("DISCONNECTED"));
}

#[tokio::test(flavor = "multi_thread")]
async fn upload_stream_round_trips_body_before_remote_ack() {
    let upload_bytes = common::deterministic_bytes(0x1a2b3c, MAX_FRAME_PAYLOAD_SIZE * 2 + 333);
    let expected_len = upload_bytes.len();
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:uploadStream" => ScriptedRemoteResponse::json_success(json!({
                "uploaded": request.data["_scripted_upload_bytes"],
            })),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let reply = call_stream_reply(
        adapter,
        RpcRequest::new("catalog:uploadStream", json!({ "name": "upload.bin" })),
        Some(RpcInputStream::from_bytes(upload_bytes)),
    )
    .await;
    let RpcReply::Json(response) = reply else {
        panic!("expected upload ack json");
    };
    assert_eq!(
        response.result().expect("upload result")["uploaded"],
        expected_len
    );
    assert_eq!(
        harness.observed_commands(),
        vec!["catalog:uploadStream".to_string()]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn reconnect_replaces_sender_clears_features_and_reprobes_capabilities() {
    let first = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "core:capabilities" => ScriptedRemoteResponse::json_success(json!({
                "features": ["alpha_feature"],
            })),
            "catalog:downloadRange" => ScriptedRemoteResponse::Range {
                meta: range_meta(909, 16, request.data["offset"].as_u64().expect("offset"), 4),
                chunks: vec![vec![1_u8; 4]],
            },
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let second = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "core:capabilities" => ScriptedRemoteResponse::json_success(json!({
                "features": ["beta_feature"],
            })),
            "catalog:downloadRange" => ScriptedRemoteResponse::Range {
                meta: range_meta(909, 16, request.data["offset"].as_u64().expect("offset"), 4),
                chunks: vec![vec![2_u8; 4]],
            },
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        first.req_tx.clone(),
    )));

    probe_capabilities(adapter.clone()).await;
    assert_eq!(
        adapter
            .lock()
            .expect("remote adapter lock")
            .remote_core_features(),
        vec!["alpha_feature".to_string()]
    );
    let (_, first_range) = call_range_stream(
        adapter.clone(),
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 909,
                "offset": 0,
                "length": 4_u64,
                "expected_source_revision": 1,
            }),
        ),
    )
    .await;
    assert_eq!(first_range, vec![1_u8; 4]);

    tokio::task::spawn_blocking({
        let adapter = adapter.clone();
        let second_tx = second.req_tx.clone();
        move || {
            adapter
                .lock()
                .expect("remote adapter lock")
                .replace_remote_sender(second_tx);
        }
    })
    .await
    .expect("replace sender task");
    assert!(adapter
        .lock()
        .expect("remote adapter lock")
        .remote_core_features()
        .is_empty());

    probe_capabilities(adapter.clone()).await;
    assert_eq!(
        adapter
            .lock()
            .expect("remote adapter lock")
            .remote_core_features(),
        vec!["beta_feature".to_string()]
    );
    let (_, second_range) = call_range_stream(
        adapter,
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 909,
                "offset": 4_u64,
                "length": 4_u64,
                "expected_source_revision": 2,
            }),
        ),
    )
    .await;
    assert_eq!(second_range, vec![2_u8; 4]);

    assert_eq!(
        first.observed_commands(),
        vec![
            "core:capabilities".to_string(),
            "catalog:downloadRange".to_string(),
        ]
    );
    assert_eq!(
        second.observed_commands(),
        vec![
            "core:capabilities".to_string(),
            "catalog:downloadRange".to_string(),
        ]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn replayed_and_unknown_response_frames_do_not_poison_followup_rpc() {
    let mut status_calls = 0_u8;
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(move |request| match request.command.as_str() {
            "vault:status" => {
                status_calls = status_calls.saturating_add(1);
                if status_calls == 1 {
                    ScriptedRemoteResponse::DuplicateJson(RpcResponse::success(json!({
                        "call": 1,
                    })))
                } else {
                    ScriptedRemoteResponse::UnknownJsonThenJson {
                        unknown_response: RpcResponse::success(json!({ "ignored": true })),
                        response: RpcResponse::success(json!({ "call": status_calls })),
                    }
                }
            }
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let first = call_json(adapter.clone(), RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(first.result().expect("first status")["call"], 1);
    let second = call_json(adapter.clone(), RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(second.result().expect("second status")["call"], 2);
    let third = call_json(adapter, RpcRequest::new("vault:status", json!({}))).await;
    assert_eq!(third.result().expect("third status")["call"], 3);
}

#[tokio::test(flavor = "multi_thread")]
async fn stale_source_revision_error_surfaces_from_range_request() {
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:downloadRange" => ScriptedRemoteResponse::Json(RpcResponse::error(
                "stale media source",
                Some("ERR_MEDIA_STREAM_STALE"),
            )),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    let reply = call_stream_reply(
        adapter,
        RpcRequest::new(
            "catalog:downloadRange",
            json!({
                "node_id": 707,
                "offset": 0,
                "length": 1024_u64,
                "expected_source_revision": 41,
            }),
        ),
        None,
    )
    .await;
    let RpcReply::Json(error) = reply else {
        panic!("expected stale revision JSON error");
    };
    assert_eq!(error.code(), Some("ERR_MEDIA_STREAM_STALE"));
}

#[tokio::test(flavor = "multi_thread")]
async fn media_inspect_cancel_skips_stale_cancel_group_request() {
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:media:inspect:cancel" => {
                ScriptedRemoteResponse::json_success(json!({ "cancelled": true }))
            }
            "catalog:media:inspect" => ScriptedRemoteResponse::json_success(json!({
                "inspected": true,
            })),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );

    let cancel_rx = send_data_plane_request(
        &harness.req_tx,
        RpcRequest::new("catalog:media:inspect:cancel", json!({ "epoch": 2_u64 })),
        RemoteRpcPriority::High,
    )
    .await;
    let cancel_reply = tokio::time::timeout(Duration::from_secs(1), cancel_rx)
        .await
        .expect("cancel reply timeout")
        .expect("cancel reply");
    let RpcReply::Json(cancel_response) = cancel_reply else {
        panic!("expected cancel response");
    };
    assert!(cancel_response.is_ok());

    let stale_rx = send_data_plane_request_with_cancel_group(
        &harness.req_tx,
        RpcRequest::new("catalog:media:inspect", json!({ "node_id": 808 })),
        RemoteRpcPriority::Low,
        Some(RemoteCancelGroup::MediaInspection { epoch: 1 }),
    )
    .await;
    let stale_reply = tokio::time::timeout(Duration::from_secs(1), stale_rx)
        .await
        .expect("stale media inspect reply timeout")
        .expect("stale media inspect reply");
    let RpcReply::Json(stale_response) = stale_reply else {
        panic!("expected cancelled stale response");
    };
    assert_eq!(stale_response.code(), Some("CANCELLED"));
    assert_eq!(
        harness.observed_commands(),
        vec!["catalog:media:inspect:cancel".to_string()]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn upload_stream_boundaries_cover_empty_exact_and_multichunk_payloads() {
    let harness = start_scripted_remote_data_plane(
        TransportType::UsbMobile,
        Box::new(|request| match request.command.as_str() {
            "catalog:uploadStream" => ScriptedRemoteResponse::json_success(json!({
                "uploaded": request.data["_scripted_upload_bytes"],
            })),
            command => ScriptedRemoteResponse::json_error(
                format!("unexpected command: {command}"),
                Some("UNEXPECTED_COMMAND"),
            ),
        }),
    );
    let adapter = Arc::new(Mutex::new(remote_adapter(
        TransportType::UsbMobile,
        harness.req_tx.clone(),
    )));

    for size in [0, MAX_FRAME_PAYLOAD_SIZE, MAX_FRAME_PAYLOAD_SIZE + 1] {
        let reply = call_stream_reply(
            adapter.clone(),
            RpcRequest::new(
                "catalog:uploadStream",
                json!({ "name": format!("{size}.bin") }),
            ),
            Some(RpcInputStream::from_bytes(vec![3_u8; size])),
        )
        .await;
        let RpcReply::Json(response) = reply else {
            panic!("expected upload boundary ack");
        };
        assert_eq!(response.result().expect("upload result")["uploaded"], size);
    }
}
