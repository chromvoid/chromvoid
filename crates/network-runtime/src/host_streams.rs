//! Existing host stream framing, supervised reads and round-robin publication.
use crate::remote_io::{send_encrypted_frame_typed, RemoteIoFailure, RemoteIoResult};
use crate::rpc_transport_protocol::{
    frame_stream_read_failed, read_stream_chunk_supervised, StreamControlUnsupportedAction,
    SupervisedStreamReadError, TransportPolicy,
};
use crate::stream_lifecycle::{StreamLifecycleDirection, StreamLifecycleTracker};
use chromvoid_core::rpc::types::{RpcRequest, CORE_FEATURE_REMOTE_STREAM_CONTROL_V1};
use chromvoid_core::rpc::{RpcRangeStreamMeta, RpcStreamMeta};
use chromvoid_protocol::{
    frame_continuation, Frame, FrameType, NoiseTransport, RemoteTransport, FLAG_HAS_CONTINUATION,
};
use std::collections::{HashMap, VecDeque};
use tracing::{info, warn};

pub fn frame_stream_meta_response(message_id: u64, meta: &RpcStreamMeta) -> Frame {
    let payload = crate::rpc_transport_protocol::json_payload_or_empty_object(
        meta,
        "mobile_acceptor: stream meta frame",
    );
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: FLAG_HAS_CONTINUATION,
        payload,
    }
}

pub fn frame_range_stream_meta_response(message_id: u64, meta: &RpcRangeStreamMeta) -> Frame {
    let payload = crate::rpc_transport_protocol::json_payload_or_empty_object(
        meta,
        "mobile_acceptor: range stream meta frame",
    );
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: FLAG_HAS_CONTINUATION,
        payload,
    }
}

pub fn request_advertises_stream_control(req: &RpcRequest) -> bool {
    req.transport_features
        .as_deref()
        .unwrap_or_default()
        .iter()
        .any(|feature| feature.as_str() == CORE_FEATURE_REMOTE_STREAM_CONTROL_V1)
}

pub async fn start_host_outgoing_stream(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    message_id: u64,
    peer_id: &str,
    command: &str,
    peer_stream_control: bool,
    meta_frame: Frame,
    reader: Box<dyn std::io::Read + Send>,
    active_streams: &mut HashMap<u64, HostOutgoingStream>,
    active_order: &mut VecDeque<u64>,
) -> RemoteIoResult<()> {
    send_encrypted_frame_typed(transport, noise, meta_frame).await?;
    active_order.push_back(message_id);
    active_streams.insert(
        message_id,
        HostOutgoingStream {
            reader: Some(reader),
            command: command.to_string(),
            peer_id: peer_id.to_string(),
            peer_stream_control,
            lifecycle: StreamLifecycleTracker::start(
                command,
                StreamLifecycleDirection::Send,
                Some(peer_id.to_string()),
            ),
        },
    );
    info!(
        "perf:remote_stream event=download_start direction=send host=true peer_id={} command={} message_id={} active_streams={}",
        peer_id,
        command,
        message_id,
        active_streams.len()
    );
    Ok(())
}

pub async fn send_next_host_outgoing_stream_chunk(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    policy: TransportPolicy,
    active_streams: &mut HashMap<u64, HostOutgoingStream>,
    active_order: &mut VecDeque<u64>,
) -> RemoteIoResult<bool> {
    let Some(message_id) = active_order.pop_front() else {
        return Ok(false);
    };
    let active_count = active_streams.len();
    let Some(stream) = active_streams.get_mut(&message_id) else {
        return Ok(false);
    };
    let chunk_index = stream.lifecycle.chunks().saturating_add(1);
    let reader = stream.reader.take().ok_or_else(|| {
        RemoteIoFailure::data_plane_error(format!(
            "host stream reader missing for message_id={message_id}"
        ))
    })?;
    tracing::debug!(
        "perf:remote_stream event=download_read_start direction=send host=true peer_id={} command={} message_id={} chunk_index={} transport_type={:?}",
        stream.peer_id,
        stream.command,
        message_id,
        chunk_index,
        policy.transport_type
    );
    let read = match read_stream_chunk_supervised(
        reader,
        policy.stream_chunk_size,
        policy.stream_read_policy(),
    )
    .await
    {
        Ok(read) => Some(read),
        Err(SupervisedStreamReadError::Timeout { timeout }) => {
            warn!(
                "perf:remote_stream event=download_read_timeout direction=send host=true peer_id={} command={} message_id={} chunk_index={} transport_type={:?} timeout_ms={}",
                stream.peer_id,
                stream.command,
                message_id,
                chunk_index,
                policy.transport_type,
                timeout.as_millis()
            );
            if !stream.peer_stream_control {
                // Old peers cannot interpret stream-control frames; the only
                // safe recovery from a stalled chunk read is a controlled
                // disconnect.
                return Err(RemoteIoFailure::stream_timeout(
                    stream.command.clone(),
                    message_id,
                    timeout.as_millis() as u64,
                ));
            }
            // Peers with remote-stream-control-v1 get a per-stream failure
            // frame so a single stalled read does not tear down the whole
            // session.
            let error_message = format!("stream_read_timeout after {}ms", timeout.as_millis());
            let frame = frame_stream_read_failed(message_id, &stream.command, &error_message);
            send_encrypted_frame_typed(transport, noise, frame).await?;
            if let Some(mut stream) = active_streams.remove(&message_id) {
                let snapshot = stream.lifecycle.read_failed();
                warn!(
                    "perf:remote_stream event=download_read_timeout_recovered direction=send host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={}",
                    stream.peer_id,
                    snapshot.command,
                    message_id,
                    snapshot.chunks,
                    snapshot.bytes,
                    snapshot.duration_ms,
                    active_streams.len()
                );
            }
            return Ok(true);
        }
        Err(error) => {
            let error_message = error.to_string();
            warn!(
                "mobile_acceptor: download stream read failed peer_id={} command={} message_id={} chunk_index={}: {}",
                stream.peer_id,
                stream.command,
                message_id,
                chunk_index,
                error_message
            );
            if !stream.peer_stream_control {
                match policy.stream_control_unsupported_action {
                    StreamControlUnsupportedAction::ControlledDisconnect => {
                        return Err(RemoteIoFailure::stream_read_failed(
                            stream.command.clone(),
                            message_id,
                            format!("stream_read_failed_unsupported error={error_message}"),
                        ));
                    }
                    StreamControlUnsupportedAction::LocalCleanup => return Ok(true),
                }
            }
            let frame = frame_stream_read_failed(message_id, &stream.command, &error_message);
            send_encrypted_frame_typed(transport, noise, frame).await?;
            if let Some(mut stream) = active_streams.remove(&message_id) {
                let snapshot = stream.lifecycle.read_failed();
                warn!(
                    "perf:remote_stream event=download_read_error direction=send host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={}",
                    stream.peer_id,
                    snapshot.command,
                    message_id,
                    snapshot.chunks,
                    snapshot.bytes,
                    snapshot.duration_ms,
                    active_streams.len()
                );
            }
            return Ok(true);
        }
    };
    let n = read.as_ref().map(|read| read.bytes.len()).unwrap_or(0);
    if let Some(read) = read.as_ref() {
        tracing::debug!(
            "perf:remote_stream event=download_read_done direction=send host=true peer_id={} command={} message_id={} chunk_index={} bytes={} transport_type={:?} duration_ms={}",
            stream.peer_id,
            stream.command,
            message_id,
            chunk_index,
            n,
            policy.transport_type,
            read.duration.as_millis()
        );
    }
    let is_final = n == 0;
    let chunk = if is_final {
        frame_continuation(FrameType::RpcResponse, message_id, Vec::new(), false)
    } else {
        let read = read.expect("non-final stream read");
        stream.reader = Some(read.reader);
        frame_continuation(FrameType::RpcResponse, message_id, read.bytes, true)
    };
    send_encrypted_frame_typed(transport, noise, chunk).await?;

    if is_final {
        if let Some(mut stream) = active_streams.remove(&message_id) {
            let snapshot = stream.lifecycle.finish();
            info!(
                "perf:remote_stream event=download_final direction=send host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={}",
                stream.peer_id,
                snapshot.command,
                message_id,
                snapshot.chunks,
                snapshot.bytes,
                snapshot.duration_ms,
                active_streams.len()
            );
        }
    } else {
        let snapshot = stream.lifecycle.record_chunk(n);
        if snapshot.chunks == 1 {
            info!(
                "perf:remote_stream event=download_first_chunk direction=send host=true peer_id={} command={} message_id={} bytes={} active_streams={}",
                stream.peer_id,
                snapshot.command,
                message_id,
                n,
                active_count
            );
        }
        tracing::debug!(
            "perf:remote_stream event=download_chunk direction=send host=true command={} message_id={} chunk_index={} bytes={} active_streams={}",
            snapshot.command,
            message_id,
            snapshot.chunks,
            n,
            active_count
        );
        active_order.push_back(message_id);
    }

    Ok(true)
}

pub fn remove_host_outgoing_stream_order(active_order: &mut VecDeque<u64>, message_id: u64) {
    active_order.retain(|candidate| *candidate != message_id);
}

pub struct HostOutgoingStream {
    pub reader: Option<Box<dyn std::io::Read + Send>>,
    pub command: String,
    pub peer_id: String,
    pub peer_stream_control: bool,
    pub lifecycle: StreamLifecycleTracker,
}
