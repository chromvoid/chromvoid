//! Core async remote data-plane loop handling RPC request/response pairs and heartbeats.

#[cfg(test)]
use super::frames::send_encrypted_frame;
use super::frames::{
    frame_from_heartbeat, frame_from_rpc_request_with_transport_features,
    recv_decrypted_frame_typed, send_encrypted_frame_typed,
};
use super::{
    RemoteIoEvent, RemoteIoFailure, RemoteIoRequest, RemoteIoResult, RemoteIoTaskConfig,
    RemoteIoTaskTiming,
};
use chromvoid_core::rpc::types::{RpcResponse, CORE_FEATURE_REMOTE_STREAM_CONTROL_V1};
#[cfg(test)]
use chromvoid_core::rpc::RpcRangeStreamMeta;
use chromvoid_core::rpc::RpcReply;
#[cfg(test)]
use chromvoid_protocol::frame_continuation;
use chromvoid_protocol::{AntiReplay, FrameType, FLAG_HAS_CONTINUATION, MAX_FRAME_PAYLOAD_SIZE};
use std::collections::{HashMap, VecDeque};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

const MEDIA_RANGE_COMMAND: &str = "catalog:downloadRange";
const DERIVATIVE_ENSURE_COMMAND: &str = "catalog:derivative:ensure";
const WALLET_BALANCE_COMMAND: &str = "wallet:balance:get";
const WALLET_HISTORY_COMMAND: &str = "wallet:transactions:sync";
const DERIVATIVE_ENSURE_RESPONSE_META_TIMEOUT: Duration = Duration::from_secs(60);
const WALLET_PROVIDER_RESPONSE_TIMEOUT: Duration = Duration::from_secs(60);
/// SPEC-231.2 allows one foreground and one prefetch media range stream in
/// flight at the same time.
const MAX_MEDIA_RANGE_REQUESTS_IN_FLIGHT: usize = 2;
const RESPONSE_STREAM_BUFFER_BYTES: usize = 16 * 1024 * 1024;
const RESPONSE_STREAM_CHANNEL_CAPACITY: usize =
    (RESPONSE_STREAM_BUFFER_BYTES + MAX_FRAME_PAYLOAD_SIZE - 1) / MAX_FRAME_PAYLOAD_SIZE;

use crate::core_adapter::{RemoteCancelGroup, RemoteRpcPriority};
use crate::remote_stream_lifecycle::{StreamLifecycleDirection, StreamLifecycleTracker};
#[cfg(test)]
use crate::rpc_transport_protocol::USB_MOBILE_STREAM_CHUNK_SIZE;
use crate::rpc_transport_protocol::{
    frame_stream_cancelled, StreamControlUnsupportedAction, TransportPolicy,
};
#[cfg(test)]
use crate::rpc_transport_protocol::{
    parse_stream_control_frame, read_stream_chunk_supervised, RemoteStreamControl,
};

mod outgoing_upload;
mod queues;
mod response_streams;

use outgoing_upload::{
    remove_outgoing_stream_order, send_next_outgoing_stream_chunk, ActiveOutgoingStream,
};
use queues::RequestQueues;
#[cfg(test)]
use response_streams::open_response_stream;
use response_streams::{
    deliver_rpc_response_frame, forward_active_stream_frame, ActiveResponseStream,
};

struct PendingJson {
    reply_tx: oneshot::Sender<RpcReply>,
    deadline: tokio::time::Instant,
    started_at: tokio::time::Instant,
    command: String,
}

fn json_response_timeout(command: &str, default_timeout: Duration) -> Duration {
    match command {
        WALLET_BALANCE_COMMAND | WALLET_HISTORY_COMMAND => {
            default_timeout.max(WALLET_PROVIDER_RESPONSE_TIMEOUT)
        }
        DERIVATIVE_ENSURE_COMMAND => default_timeout.max(DERIVATIVE_ENSURE_RESPONSE_META_TIMEOUT),
        _ => default_timeout,
    }
}

fn cancellation_epoch(cancel_group: Option<RemoteCancelGroup>) -> Option<u64> {
    match cancel_group {
        Some(RemoteCancelGroup::MediaInspection { epoch }) => Some(epoch),
        None => None,
    }
}

fn cancelled_reply(command: &str) -> RpcReply {
    RpcReply::Json(RpcResponse::Error {
        ok: false,
        error: format!("Remote request cancelled before send: {command}"),
        code: Some("CANCELLED".to_string()),
    })
}

fn media_range_requests_in_flight(
    pending_json: &HashMap<u64, PendingJson>,
    active_streams: &HashMap<u64, ActiveResponseStream>,
) -> usize {
    pending_json
        .values()
        .filter(|pending| pending.command == MEDIA_RANGE_COMMAND)
        .count()
        + active_streams
            .values()
            .filter(|stream| stream.lifecycle.command() == MEDIA_RANGE_COMMAND)
            .count()
}

fn request_needs_stream_control_hint(command: &str, has_upload_stream: bool) -> bool {
    has_upload_stream
        || matches!(
            command,
            "catalog:download"
                | "catalog:downloadRange"
                | "catalog:secret:read"
                | DERIVATIVE_ENSURE_COMMAND
                | "catalog:derivative:read"
                | "vault:export:download"
        )
}

fn timed_out_request_needs_stream_cancel(
    command: &str,
    peer_features: &super::RemotePeerFeatures,
) -> bool {
    command == DERIVATIVE_ENSURE_COMMAND
        && peer_features.contains(CORE_FEATURE_REMOTE_STREAM_CONTROL_V1)
}

#[cfg(test)]
async fn io_loop_with_heartbeat_interval(
    config: RemoteIoTaskConfig,
    req_rx: &mut mpsc::Receiver<RemoteIoRequest>,
    evt_tx: &mpsc::Sender<RemoteIoEvent>,
    heartbeat_interval_duration: Duration,
) -> RemoteIoResult<()> {
    io_loop_with_timing(
        config,
        req_rx,
        evt_tx,
        RemoteIoTaskTiming {
            heartbeat_interval: heartbeat_interval_duration,
            ..RemoteIoTaskTiming::default()
        },
    )
    .await
}

pub(super) async fn io_loop_with_timing(
    config: RemoteIoTaskConfig,
    req_rx: &mut mpsc::Receiver<RemoteIoRequest>,
    evt_tx: &mpsc::Sender<RemoteIoEvent>,
    timing: RemoteIoTaskTiming,
) -> RemoteIoResult<()> {
    let mut transport = config.transport;
    let mut noise = config.noise_transport;
    let peer_features = config.peer_features;
    let transport_type = transport.transport_type();
    let policy = TransportPolicy::for_transport(transport_type);
    let heartbeat_enabled = policy.heartbeat_enabled;
    if !heartbeat_enabled {
        tracing::info!(
            "remote_rpc: heartbeat disabled transport_type={:?}",
            transport_type
        );
    }
    // SPEC-005 §8.5: any valid inbound frame proves peer liveness. A writable
    // relay socket alone does not: relay keeps it open when the other peer leaves.
    let liveness_timeout = timing.heartbeat_interval + timing.response_timeout;
    let mut last_inbound = tokio::time::Instant::now();
    let mut anti_replay = AntiReplay::new();
    let mut next_msg_id: u64 = rand::random::<u64>() | 1;
    let mut heartbeat_interval = tokio::time::interval(timing.heartbeat_interval);
    // Tokio intervals tick immediately once; avoid both USB peers writing a heartbeat
    // before either side has returned to its read branch after the handshake.
    heartbeat_interval.tick().await;
    let mut queues = RequestQueues::default();
    let mut pending_json: HashMap<u64, PendingJson> = HashMap::new();
    let mut active_response_streams: HashMap<u64, ActiveResponseStream> = HashMap::new();
    let mut active_outgoing_streams: HashMap<u64, ActiveOutgoingStream> = HashMap::new();
    let mut active_outgoing_order: VecDeque<u64> = VecDeque::new();
    let (response_stream_drop_tx, mut response_stream_drop_rx) = mpsc::unbounded_channel::<u64>();
    let mut media_inspection_cancel_epoch: u64 = 0;

    loop {
        let mut media_deferred = false;
        while let Some(io_req) = queues.pop_next(media_deferred) {
            if io_req.request.command == "catalog:media:inspect:cancel" {
                if let Some(epoch) = io_req.request.data.get("epoch").and_then(|v| v.as_u64()) {
                    media_inspection_cancel_epoch = media_inspection_cancel_epoch.max(epoch);
                }
            }

            if cancellation_epoch(io_req.cancel_group)
                .is_some_and(|epoch| epoch < media_inspection_cancel_epoch)
            {
                tracing::info!(
                    "remote_rpc: queue_skip command={} priority={:?} reason=cancel_epoch request_epoch={:?} cancel_epoch={}",
                    io_req.request.command,
                    io_req.priority,
                    cancellation_epoch(io_req.cancel_group),
                    media_inspection_cancel_epoch
                );
                let _ = io_req
                    .reply_tx
                    .send(cancelled_reply(&io_req.request.command));
                continue;
            }

            if io_req.stream.is_some() {
                let msg_id = next_msg_id;
                next_msg_id = next_msg_id.wrapping_add(1);
                tracing::info!(
                    "perf:remote_stream event=upload_start direction=send command={} priority={:?} message_id={} active_streams={}",
                    io_req.request.command,
                    io_req.priority,
                    msg_id,
                    active_outgoing_streams.len() + 1
                );

                let mut frame = frame_from_rpc_request_with_transport_features(
                    msg_id,
                    &io_req.request,
                    request_needs_stream_control_hint(&io_req.request.command, true),
                );
                frame.flags |= FLAG_HAS_CONTINUATION;
                send_encrypted_frame_typed(transport.as_mut(), &mut noise, frame).await?;

                if let Some(stream) = io_req.stream {
                    active_outgoing_order.push_back(msg_id);
                    active_outgoing_streams.insert(
                        msg_id,
                        ActiveOutgoingStream {
                            reader: Some(stream.into_reader()),
                            reply_tx: io_req.reply_tx,
                            command: io_req.request.command.clone(),
                            priority: io_req.priority,
                            lifecycle: StreamLifecycleTracker::start(
                                io_req.request.command,
                                StreamLifecycleDirection::Send,
                                None,
                            ),
                        },
                    );
                }
                continue;
            }

            if io_req.request.command == MEDIA_RANGE_COMMAND
                && media_range_requests_in_flight(&pending_json, &active_response_streams)
                    >= MAX_MEDIA_RANGE_REQUESTS_IN_FLIGHT
            {
                // Defer only the media queue: keep draining High/Normal/Low
                // so control RPCs (listings, thumbnails) are not starved for
                // the whole duration of an active media stream. A range
                // request with a non-Media priority (not expected in
                // production) cannot be skipped queue-wise, so stop draining
                // entirely to avoid re-popping it forever.
                let deferred_to_media_queue = io_req.priority == RemoteRpcPriority::Media;
                queues.push_front(io_req);
                if !deferred_to_media_queue {
                    break;
                }
                media_deferred = true;
                continue;
            }

            let msg_id = next_msg_id;
            next_msg_id = next_msg_id.wrapping_add(1);
            if io_req.request.command == MEDIA_RANGE_COMMAND {
                tracing::debug!(
                    "remote_rpc: send_json command={} priority={:?} message_id={} pending_json={}",
                    io_req.request.command,
                    io_req.priority,
                    msg_id,
                    pending_json.len()
                );
            } else {
                tracing::info!(
                    "remote_rpc: send_json command={} priority={:?} message_id={} pending_json={}",
                    io_req.request.command,
                    io_req.priority,
                    msg_id,
                    pending_json.len()
                );
            }

            let frame = frame_from_rpc_request_with_transport_features(
                msg_id,
                &io_req.request,
                request_needs_stream_control_hint(&io_req.request.command, false),
            );
            send_encrypted_frame_typed(transport.as_mut(), &mut noise, frame).await?;
            let started_at = tokio::time::Instant::now();
            let response_timeout =
                json_response_timeout(&io_req.request.command, timing.response_timeout);
            pending_json.insert(
                msg_id,
                PendingJson {
                    reply_tx: io_req.reply_tx,
                    deadline: started_at + response_timeout,
                    started_at,
                    command: io_req.request.command,
                },
            );
        }

        tokio::select! {
            biased;
            Some(io_req) = req_rx.recv() => {
                queues.push(io_req);
            }

            Some(message_id) = response_stream_drop_rx.recv() => {
                if let Some(mut active_stream) = active_response_streams.remove(&message_id) {
                    let sent_cancel = if peer_features.contains(CORE_FEATURE_REMOTE_STREAM_CONTROL_V1) {
                        let cancel_frame = frame_stream_cancelled(message_id, active_stream.lifecycle.command());
                        send_encrypted_frame_typed(transport.as_mut(), &mut noise, cancel_frame).await?;
                        true
                    } else {
                        let _unsupported_action = StreamControlUnsupportedAction::LocalCleanup;
                        false
                    };
                    let snapshot = active_stream.lifecycle.cancel();
                    tracing::info!(
                        "perf:remote_stream event=download_reader_dropped direction=recv command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={} sent_cancel={}",
                        snapshot.command,
                        message_id,
                        snapshot.chunks,
                        snapshot.bytes,
                        snapshot.duration_ms,
                        active_response_streams.len(),
                        sent_cancel
                    );
                }
            }

            _ = tokio::time::sleep_until(last_inbound + liveness_timeout), if heartbeat_enabled => {
                return Err(RemoteIoFailure::transport_timeout());
            }

            _ = heartbeat_interval.tick(), if heartbeat_enabled => {
                let msg_id = next_msg_id;
                next_msg_id = next_msg_id.wrapping_add(1);

                let hb = frame_from_heartbeat(msg_id);
                send_encrypted_frame_typed(transport.as_mut(), &mut noise, hb).await?;
            }

            resp = recv_decrypted_frame_typed(transport.as_mut(), &mut noise) => {
                let frame = resp?;
                last_inbound = tokio::time::Instant::now();
                if frame.frame_type == FrameType::Heartbeat {
                    continue;
                }
                if frame.frame_type == FrameType::RpcRequest {
                    // Push requests carry the peer's monotonically increasing
                    // message ids; frames failing the anti-replay window are
                    // dropped instead of being forwarded.
                    if let Err(error) = anti_replay.check(frame.message_id) {
                        tracing::warn!(
                            "remote_rpc: dropped push frame failing anti-replay message_id={} error={}",
                            frame.message_id,
                            error
                        );
                        continue;
                    }
                    // Never let a slow event consumer stall the io loop; a
                    // dropped push frame is preferable to freezing the data
                    // plane (heartbeats, streams, cancels).
                    if let Err(error) = evt_tx.try_send(RemoteIoEvent::Frame(frame)) {
                        tracing::warn!(
                            "remote_rpc: dropped inbound push frame, event channel unavailable: {error}"
                        );
                    }
                    continue;
                }
                if frame.frame_type == FrameType::Error {
                    if forward_active_stream_frame(frame.message_id, frame.clone(), &mut active_response_streams) {
                        continue;
                    }
                    return Err(RemoteIoFailure::protocol_error(format!(
                        "peer sent error frame message_id={}",
                        frame.message_id
                    )));
                }
                if frame.frame_type != FrameType::RpcResponse {
                    continue;
                }
                // Stream continuation frames handled above intentionally
                // bypass anti-replay: a stream reuses one message_id across
                // all of its chunks, and in-order delivery is already
                // enforced by the Noise record layer.
                if forward_active_stream_frame(frame.message_id, frame.clone(), &mut active_response_streams) {
                    continue;
                }
                // Response frames echo *our* request ids and legitimately
                // complete out of order (async media-inspection replies,
                // upload acks landing after later JSON replies), so the
                // monotonic AntiReplay window cannot be enforced in this
                // direction. Replay protection comes from the matching below:
                // each message_id maps to at most one outstanding oneshot
                // reply sender, consumed exactly once; frames matching no
                // outstanding request are dropped.
                if let Some(active) = active_outgoing_streams.remove(&frame.message_id) {
                    remove_outgoing_stream_order(&mut active_outgoing_order, frame.message_id);
                    let should_disconnect_after_remote_lock = deliver_rpc_response_frame(
                        &active.command,
                        frame,
                        active.reply_tx,
                        &mut active_response_streams,
                        &response_stream_drop_tx,
                    )?;
                    if should_disconnect_after_remote_lock {
                        return Err(RemoteIoFailure::data_plane_error(
                            "remote vault lock requested disconnect",
                        ));
                    }
                    continue;
                }
                if let Some(pending) = pending_json.remove(&frame.message_id) {
                    let latency_ms = pending.started_at.elapsed().as_millis();
                    if (frame.flags & FLAG_HAS_CONTINUATION) != 0 {
                        tracing::info!(
                            "perf:remote_stream event=download_meta direction=recv command={} message_id={} latency_ms={} active_response_streams={} active_outgoing_streams={} pending_json={}",
                            pending.command,
                            frame.message_id,
                            latency_ms,
                            active_response_streams.len(),
                            active_outgoing_streams.len(),
                            pending_json.len()
                        );
                    } else if !active_response_streams.is_empty() || !active_outgoing_streams.is_empty() {
                        tracing::info!(
                            "perf:remote_stream event=json_latency direction=recv command={} message_id={} latency_ms={} active_response_streams={} active_outgoing_streams={} pending_json={}",
                            pending.command,
                            frame.message_id,
                            latency_ms,
                            active_response_streams.len(),
                            active_outgoing_streams.len(),
                            pending_json.len()
                        );
                    }
                    if pending.command == MEDIA_RANGE_COMMAND {
                        tracing::debug!(
                            "remote_rpc: recv_json command={} message_id={} pending_json={}",
                            pending.command,
                            frame.message_id,
                            pending_json.len()
                        );
                    } else {
                        tracing::info!(
                            "remote_rpc: recv_json command={} message_id={} pending_json={}",
                            pending.command,
                            frame.message_id,
                            pending_json.len()
                        );
                    }
                    let should_disconnect_after_remote_lock = deliver_rpc_response_frame(
                        &pending.command,
                        frame,
                        pending.reply_tx,
                        &mut active_response_streams,
                        &response_stream_drop_tx,
                    )?;
                    if should_disconnect_after_remote_lock {
                        return Err(RemoteIoFailure::data_plane_error(
                            "remote vault lock requested disconnect",
                        ));
                    }
                } else {
                    // Debug level: trailing chunks of a locally cancelled
                    // stream land here until the peer processes the cancel.
                    tracing::debug!(
                        "remote_rpc: dropped response frame matching no outstanding request (replay or cancelled stream) message_id={} payload_len={}",
                        frame.message_id,
                        frame.payload.len()
                    );
                }
            }

            _ = tokio::task::yield_now(), if !active_outgoing_streams.is_empty() => {
                send_next_outgoing_stream_chunk(
                    transport.as_mut(),
                    &mut noise,
                    policy,
                    timing.response_timeout,
                    peer_features.contains(CORE_FEATURE_REMOTE_STREAM_CONTROL_V1),
                    &mut active_outgoing_streams,
                    &mut active_outgoing_order,
                    &mut pending_json,
                ).await?;
            }

            _ = tokio::time::sleep(timing.timeout_scan_interval) => {
                let now = tokio::time::Instant::now();
                let timed_out: Vec<u64> = pending_json
                    .iter()
                    .filter_map(|(message_id, pending)| (pending.deadline <= now).then_some(*message_id))
                    .collect();
                for message_id in timed_out {
                    if let Some(pending) = pending_json.remove(&message_id) {
                        if timed_out_request_needs_stream_cancel(
                            &pending.command,
                            &peer_features,
                        ) {
                            send_encrypted_frame_typed(
                                transport.as_mut(),
                                &mut noise,
                                frame_stream_cancelled(
                                    message_id,
                                    "derivative ensure response metadata timeout",
                                ),
                            )
                            .await?;
                        }
                        tracing::warn!(
                            "remote_rpc: json_timeout command={} message_id={} pending_json={}",
                            pending.command,
                            message_id,
                            pending_json.len()
                        );
                        let _ = pending.reply_tx.send(RpcReply::Json(RpcResponse::Error {
                            ok: false,
                            error: format!(
                                "recv timeout after {}ms",
                                pending
                                    .deadline
                                    .duration_since(pending.started_at)
                                    .as_millis()
                            ),
                            code: Some("TIMEOUT".to_string()),
                        }));
                    }
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "io_loop_tests.rs"]
mod io_loop_tests;
