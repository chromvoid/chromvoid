use super::PendingJson;
use crate::core_adapter::RemoteRpcPriority;
use crate::remote_data_plane::{send_encrypted_frame_typed, RemoteIoFailure, RemoteIoResult};
use crate::remote_stream_lifecycle::StreamLifecycleTracker;
use crate::rpc_transport_protocol::{
    frame_stream_read_failed, read_stream_chunk_supervised, SupervisedStreamReadError,
    TransportPolicy,
};
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::RpcReply;
use chromvoid_protocol::{frame_continuation, FrameType, NoiseTransport, RemoteTransport};
use std::collections::{HashMap, VecDeque};
use std::time::Duration;
use tokio::sync::oneshot;

pub(super) struct ActiveOutgoingStream {
    pub(super) reader: Option<Box<dyn std::io::Read + Send>>,
    pub(super) reply_tx: oneshot::Sender<RpcReply>,
    pub(super) command: String,
    pub(super) priority: RemoteRpcPriority,
    pub(super) lifecycle: StreamLifecycleTracker,
}

pub(super) async fn send_next_outgoing_stream_chunk(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    policy: TransportPolicy,
    response_timeout: Duration,
    peer_stream_control: bool,
    active_streams: &mut HashMap<u64, ActiveOutgoingStream>,
    active_order: &mut VecDeque<u64>,
    pending_json: &mut HashMap<u64, PendingJson>,
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
            "stream reader missing for message_id={message_id}"
        ))
    })?;
    tracing::debug!(
        "perf:remote_stream event=upload_read_start direction=send command={} priority={:?} message_id={} chunk_index={} transport_type={:?}",
        stream.command,
        stream.priority,
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
        Ok(read) => read,
        Err(SupervisedStreamReadError::Timeout { timeout }) => {
            tracing::warn!(
                "perf:remote_stream event=upload_read_timeout direction=send command={} priority={:?} message_id={} chunk_index={} transport_type={:?} timeout_ms={}",
                stream.command,
                stream.priority,
                message_id,
                chunk_index,
                policy.transport_type,
                timeout.as_millis()
            );
            return Err(RemoteIoFailure::stream_timeout(
                stream.command.clone(),
                message_id,
                timeout.as_millis() as u64,
            ));
        }
        Err(error) => {
            let error_message = error.to_string();
            if !peer_stream_control {
                // Old peers have no stream-control frames: a mid-upload read
                // failure can only be resolved with a controlled disconnect.
                return Err(RemoteIoFailure::stream_read_failed(
                    stream.command.clone(),
                    message_id,
                    error_message,
                ));
            }
            tracing::warn!(
                "perf:remote_stream event=upload_read_error direction=send command={} priority={:?} message_id={} chunk_index={}: {}",
                stream.command,
                stream.priority,
                message_id,
                chunk_index,
                error_message
            );
            let frame = frame_stream_read_failed(message_id, &stream.command, &error_message);
            send_encrypted_frame_typed(transport, noise, frame).await?;
            if let Some(mut stream) = active_streams.remove(&message_id) {
                let snapshot = stream.lifecycle.read_failed();
                tracing::warn!(
                    "perf:remote_stream event=upload_read_error_recovered direction=send command={} priority={:?} message_id={} chunks={} bytes={} duration_ms={} queued_active_streams={}",
                    snapshot.command,
                    stream.priority,
                    message_id,
                    snapshot.chunks,
                    snapshot.bytes,
                    snapshot.duration_ms,
                    active_streams.len()
                );
                let _ = stream.reply_tx.send(RpcReply::Json(RpcResponse::Error {
                    ok: false,
                    error: format!("upload stream read failed: {error_message}"),
                    code: Some("STREAM_READ_FAILED".to_string()),
                }));
            }
            return Ok(true);
        }
    };
    let n = read.bytes.len();
    tracing::debug!(
        "perf:remote_stream event=upload_read_done direction=send command={} priority={:?} message_id={} chunk_index={} bytes={} transport_type={:?} duration_ms={}",
        stream.command,
        stream.priority,
        message_id,
        chunk_index,
        n,
        policy.transport_type,
        read.duration.as_millis()
    );
    stream.reader = Some(read.reader);
    let frame = if n == 0 {
        frame_continuation(FrameType::RpcRequest, message_id, Vec::new(), false)
    } else {
        frame_continuation(FrameType::RpcRequest, message_id, read.bytes, true)
    };
    let is_final = n == 0;
    send_encrypted_frame_typed(transport, noise, frame).await?;

    if is_final {
        if let Some(mut stream) = active_streams.remove(&message_id) {
            let snapshot = stream.lifecycle.finish();
            tracing::info!(
                "perf:remote_stream event=upload_final direction=send command={} priority={:?} message_id={} chunks={} bytes={} duration_ms={} queued_active_streams={}",
                snapshot.command,
                stream.priority,
                message_id,
                snapshot.chunks,
                snapshot.bytes,
                snapshot.duration_ms,
                active_streams.len()
            );
            let started_at = tokio::time::Instant::now();
            pending_json.insert(
                message_id,
                PendingJson {
                    reply_tx: stream.reply_tx,
                    deadline: started_at + response_timeout,
                    started_at,
                    command: stream.command,
                },
            );
        }
    } else {
        let snapshot = stream.lifecycle.record_chunk(n);
        if snapshot.chunks == 1 {
            tracing::info!(
                "perf:remote_stream event=upload_first_chunk direction=send command={} priority={:?} message_id={} bytes={} queued_active_streams={}",
                snapshot.command,
                stream.priority,
                message_id,
                n,
                active_count
            );
        }
        tracing::debug!(
            "perf:remote_stream event=upload_chunk direction=send message_id={} chunk_index={} bytes={} queued_active_streams={}",
            message_id,
            snapshot.chunks,
            n,
            active_count
        );
        active_order.push_back(message_id);
    }

    Ok(true)
}

pub(super) fn remove_outgoing_stream_order(active_order: &mut VecDeque<u64>, message_id: u64) {
    active_order.retain(|candidate| *candidate != message_id);
}
