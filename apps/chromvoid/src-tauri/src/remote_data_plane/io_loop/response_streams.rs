use super::{MEDIA_RANGE_COMMAND, RESPONSE_STREAM_CHANNEL_CAPACITY};
use crate::remote_data_plane::{RemoteIoFailure, RemoteIoResult};
use crate::remote_stream_lifecycle::{StreamLifecycleDirection, StreamLifecycleTracker};
use crate::rpc_transport_protocol::{parse_stream_control_frame, RemoteStreamControl};
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{
    RpcOutputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcReply, RpcStreamMeta,
};
use chromvoid_protocol::{Frame, FrameType, FLAG_HAS_CONTINUATION};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

/// How long the blocking consumer side of a response stream waits for the
/// next chunk after the meta frame arrived. A silently stalled peer must
/// surface as an io error instead of hanging desktop media threads forever.
const RESPONSE_STREAM_CHUNK_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) struct ActiveResponseStream {
    tx: std::sync::mpsc::SyncSender<ResponseStreamItem>,
    pub(super) lifecycle: StreamLifecycleTracker,
}

enum ResponseStreamItem {
    Bytes(Vec<u8>),
    /// Payload of the final (continuation-clear) frame. Marks clean EOF: a
    /// channel disconnect without this item means the transfer was truncated.
    Final(Vec<u8>),
    Error(String),
}

struct ChunkReceiverReader {
    rx: std::sync::mpsc::Receiver<ResponseStreamItem>,
    drop_tx: mpsc::UnboundedSender<u64>,
    message_id: u64,
    chunk_timeout: Duration,
    buf: Vec<u8>,
    pos: usize,
    closed: bool,
    finished: bool,
}

impl ChunkReceiverReader {
    fn new(
        rx: std::sync::mpsc::Receiver<ResponseStreamItem>,
        drop_tx: mpsc::UnboundedSender<u64>,
        message_id: u64,
        chunk_timeout: Duration,
    ) -> Self {
        Self {
            rx,
            drop_tx,
            message_id,
            chunk_timeout,
            buf: Vec::new(),
            pos: 0,
            closed: false,
            finished: false,
        }
    }
}

impl Drop for ChunkReceiverReader {
    fn drop(&mut self) {
        let _ = self.drop_tx.send(self.message_id);
    }
}

impl std::io::Read for ChunkReceiverReader {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        if out.is_empty() {
            return Ok(0);
        }

        loop {
            if self.pos < self.buf.len() {
                let n = std::cmp::min(out.len(), self.buf.len() - self.pos);
                out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
                self.pos += n;
                return Ok(n);
            }

            if self.closed {
                if self.finished {
                    return Ok(0);
                }
                // The io loop went away (transport error, loop exit) before
                // the final continuation-clear frame arrived: the transfer is
                // truncated and must not look like clean EOF.
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "remote response stream terminated before final frame",
                ));
            }

            match self.rx.recv_timeout(self.chunk_timeout) {
                Ok(ResponseStreamItem::Bytes(chunk)) => {
                    self.buf = chunk;
                    self.pos = 0;
                }
                Ok(ResponseStreamItem::Final(chunk)) => {
                    self.buf = chunk;
                    self.pos = 0;
                    self.finished = true;
                    self.closed = true;
                }
                Ok(ResponseStreamItem::Error(message)) => {
                    self.closed = true;
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, message));
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    self.closed = true;
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        format!(
                            "remote response stream chunk timeout after {}ms",
                            self.chunk_timeout.as_millis()
                        ),
                    ));
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    self.closed = true;
                }
            }
        }
    }
}

pub(super) fn open_response_stream(
    command: &str,
    stream_meta_frame: Frame,
    reply_tx: oneshot::Sender<RpcReply>,
    response_stream_drop_tx: &mpsc::UnboundedSender<u64>,
) -> RemoteIoResult<ActiveResponseStream> {
    let (tx, rx) =
        std::sync::mpsc::sync_channel::<ResponseStreamItem>(RESPONSE_STREAM_CHANNEL_CAPACITY);
    if command == MEDIA_RANGE_COMMAND {
        let meta: RpcRangeStreamMeta =
            serde_json::from_slice(&stream_meta_frame.payload).map_err(|e| {
                RemoteIoFailure::protocol_error(format!("parse range stream meta: {e}"))
            })?;
        let out = RpcRangeOutputStream {
            meta,
            reader: Box::new(ChunkReceiverReader::new(
                rx,
                response_stream_drop_tx.clone(),
                stream_meta_frame.message_id,
                RESPONSE_STREAM_CHUNK_TIMEOUT,
            )),
        };
        let _ = reply_tx.send(RpcReply::RangeStream(out));
    } else {
        let meta: RpcStreamMeta = serde_json::from_slice(&stream_meta_frame.payload)
            .map_err(|e| RemoteIoFailure::protocol_error(format!("parse stream meta: {e}")))?;
        let out = RpcOutputStream {
            meta,
            reader: Box::new(ChunkReceiverReader::new(
                rx,
                response_stream_drop_tx.clone(),
                stream_meta_frame.message_id,
                RESPONSE_STREAM_CHUNK_TIMEOUT,
            )),
        };
        let _ = reply_tx.send(RpcReply::Stream(out));
    }

    Ok(ActiveResponseStream {
        tx,
        lifecycle: StreamLifecycleTracker::start(command, StreamLifecycleDirection::Recv, None),
    })
}

pub(super) fn forward_active_stream_frame(
    message_id: u64,
    frame: Frame,
    active_streams: &mut HashMap<u64, ActiveResponseStream>,
) -> bool {
    let active_count = active_streams.len();
    let Some(active_stream) = active_streams.get_mut(&message_id) else {
        return false;
    };
    if frame.frame_type == FrameType::Error {
        let Some(control) = parse_stream_control_frame(&frame) else {
            return false;
        };
        let event = match &control {
            RemoteStreamControl::ReadFailed { .. } => "download_error",
            RemoteStreamControl::Cancelled { .. } => "download_cancel_remote",
        };
        let message = control.message().to_string();
        let snapshot = match control {
            RemoteStreamControl::ReadFailed { .. } => active_stream.lifecycle.read_failed(),
            RemoteStreamControl::Cancelled { .. } => active_stream.lifecycle.cancel(),
        };
        // Never block the io loop: if the buffer is full or the reader is
        // gone, the reader surfaces a truncation error via the missing final
        // frame instead.
        let _ = active_stream
            .tx
            .try_send(ResponseStreamItem::Error(message));
        let _ = active_stream;
        active_streams.remove(&message_id);
        tracing::info!(
            "perf:remote_stream event={} direction=recv command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={}",
            event,
            snapshot.command,
            message_id,
            snapshot.chunks,
            snapshot.bytes,
            snapshot.duration_ms,
            active_streams.len()
        );
        return true;
    }
    if frame.frame_type != FrameType::RpcResponse {
        return false;
    }

    let has_more = (frame.flags & FLAG_HAS_CONTINUATION) != 0;
    let payload_len = frame.payload.len();
    let item = if has_more {
        ResponseStreamItem::Bytes(frame.payload)
    } else {
        ResponseStreamItem::Final(frame.payload)
    };
    match active_stream.tx.try_send(item) {
        Ok(()) => {}
        Err(std::sync::mpsc::TrySendError::Disconnected(_)) => {
            let snapshot = active_stream.lifecycle.cancel();
            let _ = active_stream;
            active_streams.remove(&message_id);
            tracing::info!(
                "perf:remote_stream event=download_cancel direction=recv command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={}",
                snapshot.command,
                message_id,
                snapshot.chunks,
                snapshot.bytes,
                snapshot.duration_ms,
                active_streams.len()
            );
            return true;
        }
        Err(std::sync::mpsc::TrySendError::Full(_)) => {
            // The per-stream buffer (RESPONSE_STREAM_BUFFER_BYTES) is full:
            // the consumer stalled. Fail the stream instead of blocking the
            // io loop (heartbeats, control RPCs, cancels must keep flowing).
            // The reader drains the buffered chunks and then observes the
            // missing final frame as a truncation error.
            let snapshot = active_stream.lifecycle.read_failed();
            let _ = active_stream;
            active_streams.remove(&message_id);
            tracing::warn!(
                "perf:remote_stream event=download_overflow direction=recv command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={}",
                snapshot.command,
                message_id,
                snapshot.chunks,
                snapshot.bytes,
                snapshot.duration_ms,
                active_streams.len()
            );
            return true;
        }
    }
    let chunk_snapshot = active_stream.lifecycle.record_chunk(payload_len);
    if chunk_snapshot.chunks == 1 && payload_len > 0 {
        tracing::info!(
            "perf:remote_stream event=download_first_chunk direction=recv command={} message_id={} bytes={} active_streams={}",
            chunk_snapshot.command,
            message_id,
            payload_len,
            active_count
        );
    }
    tracing::debug!(
        "perf:remote_stream event=download_chunk direction=recv command={} message_id={} chunk_index={} bytes={} active_streams={}",
        chunk_snapshot.command,
        message_id,
        chunk_snapshot.chunks,
        payload_len,
        active_count
    );
    if !has_more {
        let snapshot = active_stream.lifecycle.finish();
        let _ = active_stream;
        active_streams.remove(&message_id);
        tracing::info!(
            "perf:remote_stream event=download_final direction=recv command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={}",
            snapshot.command,
            message_id,
            snapshot.chunks,
            snapshot.bytes,
            snapshot.duration_ms,
            active_streams.len()
        );
    }
    true
}

pub(super) fn deliver_rpc_response_frame(
    command: &str,
    frame: Frame,
    reply_tx: oneshot::Sender<RpcReply>,
    active_streams: &mut HashMap<u64, ActiveResponseStream>,
    response_stream_drop_tx: &mpsc::UnboundedSender<u64>,
) -> RemoteIoResult<bool> {
    if (frame.flags & FLAG_HAS_CONTINUATION) != 0 {
        let message_id = frame.message_id;
        let active_stream =
            open_response_stream(command, frame, reply_tx, response_stream_drop_tx)?;
        tracing::info!(
            "perf:remote_stream event=download_start direction=recv command={} message_id={} active_streams={}",
            command,
            message_id,
            active_streams.len() + 1
        );
        active_streams.insert(message_id, active_stream);
        return Ok(false);
    }

    let response: RpcResponse =
        serde_json::from_slice(&frame.payload).unwrap_or(RpcResponse::Error {
            ok: false,
            error: "Failed to parse response".to_string(),
            code: Some("PARSE_ERROR".to_string()),
        });
    let should_disconnect_after_remote_lock = command == "vault:lock" && response.is_ok();
    let _ = reply_tx.send(RpcReply::Json(response));
    Ok(should_disconnect_after_remote_lock)
}

#[cfg(test)]
mod chunk_receiver_reader_tests {
    use super::*;
    use std::io::Read;

    fn test_reader(
        capacity: usize,
        chunk_timeout: Duration,
    ) -> (
        std::sync::mpsc::SyncSender<ResponseStreamItem>,
        ChunkReceiverReader,
    ) {
        let (tx, rx) = std::sync::mpsc::sync_channel(capacity);
        let (drop_tx, _drop_rx) = mpsc::unbounded_channel();
        (tx, ChunkReceiverReader::new(rx, drop_tx, 7, chunk_timeout))
    }

    #[test]
    fn final_frame_yields_clean_eof() {
        let (tx, mut reader) = test_reader(4, Duration::from_secs(1));
        tx.try_send(ResponseStreamItem::Bytes(b"abc".to_vec()))
            .expect("send bytes");
        tx.try_send(ResponseStreamItem::Final(Vec::new()))
            .expect("send final");
        drop(tx);

        let mut body = Vec::new();
        reader.read_to_end(&mut body).expect("clean eof");
        assert_eq!(body, b"abc");
    }

    #[test]
    fn disconnect_before_final_frame_is_truncation_error_not_clean_eof() {
        let (tx, mut reader) = test_reader(4, Duration::from_secs(1));
        tx.try_send(ResponseStreamItem::Bytes(b"abc".to_vec()))
            .expect("send bytes");
        drop(tx);

        let mut body = Vec::new();
        let error = reader
            .read_to_end(&mut body)
            .expect_err("truncated stream must error");
        assert_eq!(error.kind(), std::io::ErrorKind::UnexpectedEof);
        assert_eq!(body, b"abc", "buffered chunks are still drained first");
    }

    #[test]
    fn stalled_stream_times_out_instead_of_hanging() {
        let (tx, mut reader) = test_reader(4, Duration::from_millis(50));
        tx.try_send(ResponseStreamItem::Bytes(b"abc".to_vec()))
            .expect("send bytes");

        let mut buf = [0_u8; 8];
        assert_eq!(reader.read(&mut buf).expect("buffered read"), 3);
        let error = reader
            .read(&mut buf)
            .expect_err("stalled stream must time out");
        assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
        drop(tx);
    }
}
