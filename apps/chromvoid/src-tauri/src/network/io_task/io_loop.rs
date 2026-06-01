//! Core async I/O loop handling RPC request/response pairs and heartbeats.

use super::frames::{frame_from_heartbeat, frame_from_rpc_request};
use super::models::{IoEvent, IoRequest, IoTaskConfig};
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcOutputStream, RpcReply, RpcStreamMeta};
use chromvoid_protocol::{frame_continuation, AntiReplay, Frame, FrameType, FLAG_HAS_CONTINUATION};
use std::collections::{HashMap, VecDeque};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

const RPC_RESPONSE_TIMEOUT: Duration = Duration::from_secs(15);
const TIMEOUT_SCAN_INTERVAL: Duration = Duration::from_millis(100);

use crate::core_adapter::{RemoteCancelGroup, RemoteRpcPriority};

#[derive(Default)]
struct RequestQueues {
    high: VecDeque<IoRequest>,
    normal: VecDeque<IoRequest>,
    low: VecDeque<IoRequest>,
}

impl RequestQueues {
    fn push(&mut self, request: IoRequest) {
        match request.priority {
            RemoteRpcPriority::High => self.high.push_back(request),
            RemoteRpcPriority::Normal => self.normal.push_back(request),
            RemoteRpcPriority::Low => self.low.push_back(request),
        }
    }

    fn pop_next(&mut self) -> Option<IoRequest> {
        self.high
            .pop_front()
            .or_else(|| self.normal.pop_front())
            .or_else(|| self.low.pop_front())
    }

    fn push_front(&mut self, request: IoRequest) {
        match request.priority {
            RemoteRpcPriority::High => self.high.push_front(request),
            RemoteRpcPriority::Normal => self.normal.push_front(request),
            RemoteRpcPriority::Low => self.low.push_front(request),
        }
    }
}

struct PendingJson {
    reply_tx: oneshot::Sender<RpcReply>,
    deadline: tokio::time::Instant,
    command: String,
}

struct ChunkReceiverReader {
    rx: std::sync::mpsc::Receiver<Vec<u8>>,
    buf: Vec<u8>,
    pos: usize,
    closed: bool,
}

impl ChunkReceiverReader {
    fn new(rx: std::sync::mpsc::Receiver<Vec<u8>>) -> Self {
        Self {
            rx,
            buf: Vec::new(),
            pos: 0,
            closed: false,
        }
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
                return Ok(0);
            }

            match self.rx.recv() {
                Ok(chunk) => {
                    self.buf = chunk;
                    self.pos = 0;
                }
                Err(_) => {
                    self.closed = true;
                }
            }
        }
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

fn read_stream_chunk(reader: &mut dyn std::io::Read, buf: &mut [u8]) -> Result<usize, String> {
    reader.read(buf).map_err(|e| format!("stream read: {}", e))
}

pub(super) async fn io_loop(
    config: IoTaskConfig,
    req_rx: &mut mpsc::Receiver<IoRequest>,
    evt_tx: &mpsc::Sender<IoEvent>,
) -> Result<(), String> {
    let mut transport = config.transport;
    let mut noise = config.noise_transport;
    let mut anti_replay = AntiReplay::new();
    let mut next_msg_id: u64 = rand::random::<u64>() | 1;
    let mut heartbeat_interval = tokio::time::interval(Duration::from_secs(30));
    let mut queues = RequestQueues::default();
    let mut pending_json: HashMap<u64, PendingJson> = HashMap::new();
    let mut media_inspection_cancel_epoch: u64 = 0;

    const STREAM_CHUNK_SIZE: usize = 1024 * 1024;

    loop {
        while let Some(io_req) = queues.pop_next() {
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
                if !pending_json.is_empty() {
                    queues.push_front(io_req);
                    break;
                }

                let msg_id = next_msg_id;
                next_msg_id = next_msg_id.wrapping_add(1);
                tracing::info!(
                    "remote_rpc: send_stream command={} priority={:?} message_id={}",
                    io_req.request.command,
                    io_req.priority,
                    msg_id
                );

                let mut frame = frame_from_rpc_request(msg_id, &io_req.request);
                frame.flags |= FLAG_HAS_CONTINUATION;
                let encrypted = noise
                    .encrypt(&frame.encode())
                    .map_err(|e| format!("encrypt: {}", e))?;
                transport
                    .send(&encrypted)
                    .await
                    .map_err(|e| format!("send: {}", e))?;

                if let Some(stream) = io_req.stream {
                    let mut reader_stream = stream.into_reader();
                    let mut current_buf = vec![0u8; STREAM_CHUNK_SIZE];
                    let mut n = read_stream_chunk(reader_stream.as_mut(), &mut current_buf)?;

                    while n > 0 {
                        let mut next_buf = vec![0u8; STREAM_CHUNK_SIZE];
                        let next_n = read_stream_chunk(reader_stream.as_mut(), &mut next_buf)?;
                        let has_more = next_n > 0;

                        let chunk_frame = frame_continuation(
                            FrameType::RpcRequest,
                            msg_id,
                            current_buf[..n].to_vec(),
                            has_more,
                        );
                        let encrypted = noise
                            .encrypt(&chunk_frame.encode())
                            .map_err(|e| format!("encrypt: {}", e))?;
                        transport
                            .send(&encrypted)
                            .await
                            .map_err(|e| format!("send: {}", e))?;

                        current_buf = next_buf;
                        n = next_n;
                    }
                }

                loop {
                    let resp_bytes = tokio::time::timeout(RPC_RESPONSE_TIMEOUT, transport.recv())
                        .await
                        .map_err(|_| {
                            format!("recv timeout after {}s", RPC_RESPONSE_TIMEOUT.as_secs())
                        })?
                        .map_err(|e| format!("recv: {}", e))?;
                    let decrypted = noise
                        .decrypt(&resp_bytes)
                        .map_err(|e| format!("decrypt: {}", e))?;
                    let resp_frame =
                        Frame::decode(&decrypted).map_err(|e| format!("decode: {}", e))?;

                    if resp_frame.frame_type == FrameType::Heartbeat {
                        continue;
                    }
                    if resp_frame.frame_type == FrameType::RpcRequest {
                        let _ = evt_tx.send(IoEvent::Frame(resp_frame)).await;
                        continue;
                    }
                    if resp_frame.message_id != msg_id {
                        continue;
                    }

                    if resp_frame.frame_type == FrameType::RpcResponse
                        && (resp_frame.flags & FLAG_HAS_CONTINUATION) != 0
                    {
                        let meta: RpcStreamMeta = serde_json::from_slice(&resp_frame.payload)
                            .map_err(|e| format!("parse stream meta: {}", e))?;

                        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(4);
                        let out = RpcOutputStream {
                            meta,
                            reader: Box::new(ChunkReceiverReader::new(rx)),
                        };
                        let _ = io_req.reply_tx.send(RpcReply::Stream(out));

                        loop {
                            let resp_bytes =
                                tokio::time::timeout(RPC_RESPONSE_TIMEOUT, transport.recv())
                                    .await
                                    .map_err(|_| {
                                        format!(
                                            "recv timeout after {}s",
                                            RPC_RESPONSE_TIMEOUT.as_secs()
                                        )
                                    })?
                                    .map_err(|e| format!("recv: {}", e))?;
                            let decrypted = noise
                                .decrypt(&resp_bytes)
                                .map_err(|e| format!("decrypt: {}", e))?;
                            let f =
                                Frame::decode(&decrypted).map_err(|e| format!("decode: {}", e))?;

                            if f.frame_type == FrameType::Heartbeat {
                                continue;
                            }
                            if f.frame_type == FrameType::RpcRequest {
                                let _ = evt_tx.send(IoEvent::Frame(f)).await;
                                continue;
                            }
                            if f.message_id != msg_id {
                                continue;
                            }
                            if f.frame_type != FrameType::RpcResponse {
                                break;
                            }

                            let has_more = (f.flags & FLAG_HAS_CONTINUATION) != 0;
                            let _ = tx.send(f.payload);
                            if !has_more {
                                break;
                            }
                        }

                        drop(tx);
                        break;
                    }

                    let _ = anti_replay.check(resp_frame.message_id);
                    let response: RpcResponse = serde_json::from_slice(&resp_frame.payload)
                        .unwrap_or(RpcResponse::Error {
                            ok: false,
                            error: "Failed to parse response".to_string(),
                            code: Some("PARSE_ERROR".to_string()),
                        });
                    let _ = io_req.reply_tx.send(RpcReply::Json(response));
                    break;
                }
                continue;
            }

            let msg_id = next_msg_id;
            next_msg_id = next_msg_id.wrapping_add(1);
            tracing::info!(
                "remote_rpc: send_json command={} priority={:?} message_id={} pending_json={}",
                io_req.request.command,
                io_req.priority,
                msg_id,
                pending_json.len()
            );

            let frame = frame_from_rpc_request(msg_id, &io_req.request);
            let encrypted = noise
                .encrypt(&frame.encode())
                .map_err(|e| format!("encrypt: {}", e))?;
            transport
                .send(&encrypted)
                .await
                .map_err(|e| format!("send: {}", e))?;
            pending_json.insert(
                msg_id,
                PendingJson {
                    reply_tx: io_req.reply_tx,
                    deadline: tokio::time::Instant::now() + RPC_RESPONSE_TIMEOUT,
                    command: io_req.request.command,
                },
            );
        }

        tokio::select! {
            biased;
            Some(io_req) = req_rx.recv() => {
                queues.push(io_req);
            }

            _ = heartbeat_interval.tick() => {
                let msg_id = next_msg_id;
                next_msg_id = next_msg_id.wrapping_add(1);

                let hb = frame_from_heartbeat(msg_id);
                let encrypted = noise.encrypt(&hb.encode())
                    .map_err(|e| format!("heartbeat encrypt: {}", e))?;

                transport.send(&encrypted).await
                    .map_err(|e| format!("heartbeat send: {}", e))?;
            }

            resp = transport.recv() => {
                let resp_bytes = resp.map_err(|e| format!("recv: {}", e))?;
                let decrypted = noise.decrypt(&resp_bytes)
                    .map_err(|e| format!("decrypt: {}", e))?;
                let frame = Frame::decode(&decrypted)
                    .map_err(|e| format!("decode: {}", e))?;
                if frame.frame_type == FrameType::Heartbeat {
                    continue;
                }
                if frame.frame_type == FrameType::RpcRequest {
                    let _ = evt_tx.send(IoEvent::Frame(frame)).await;
                    continue;
                }
                if frame.frame_type != FrameType::RpcResponse {
                    continue;
                }
                let _ = anti_replay.check(frame.message_id);
                if let Some(pending) = pending_json.remove(&frame.message_id) {
                    let response: RpcResponse = serde_json::from_slice(&frame.payload)
                        .unwrap_or(RpcResponse::Error {
                            ok: false,
                            error: "Failed to parse response".to_string(),
                            code: Some("PARSE_ERROR".to_string()),
                        });
                    tracing::info!(
                        "remote_rpc: recv_json command={} message_id={} pending_json={}",
                        pending.command,
                        frame.message_id,
                        pending_json.len()
                    );
                    let _ = pending.reply_tx.send(RpcReply::Json(response));
                }
            }

            _ = tokio::time::sleep(TIMEOUT_SCAN_INTERVAL) => {
                let now = tokio::time::Instant::now();
                let timed_out: Vec<u64> = pending_json
                    .iter()
                    .filter_map(|(message_id, pending)| (pending.deadline <= now).then_some(*message_id))
                    .collect();
                for message_id in timed_out {
                    if let Some(pending) = pending_json.remove(&message_id) {
                        tracing::warn!(
                            "remote_rpc: json_timeout command={} message_id={} pending_json={}",
                            pending.command,
                            message_id,
                            pending_json.len()
                        );
                        let _ = pending.reply_tx.send(RpcReply::Json(RpcResponse::Error {
                            ok: false,
                            error: format!("recv timeout after {}s", RPC_RESPONSE_TIMEOUT.as_secs()),
                            code: Some("TIMEOUT".to_string()),
                        }));
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FailingReader;

    impl std::io::Read for FailingReader {
        fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "network stream failed",
            ))
        }
    }

    #[test]
    fn read_stream_chunk_maps_io_error() {
        let mut reader = FailingReader;
        let mut buf = [0_u8; 8];

        let error = read_stream_chunk(&mut reader, &mut buf).expect_err("read must fail");

        assert_eq!(error, "stream read: network stream failed");
    }

    #[test]
    fn read_stream_chunk_returns_read_size() {
        let mut reader = std::io::Cursor::new(b"abc".to_vec());
        let mut buf = [0_u8; 8];

        let n = read_stream_chunk(&mut reader, &mut buf).expect("read succeeds");

        assert_eq!(n, 3);
        assert_eq!(&buf[..n], b"abc");
    }
}
