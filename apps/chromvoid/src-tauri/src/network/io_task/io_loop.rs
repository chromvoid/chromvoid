//! Core async I/O loop handling RPC request/response pairs and heartbeats.

use super::frames::{frame_from_heartbeat, frame_from_rpc_request};
use super::models::{IoEvent, IoRequest, IoTaskConfig};
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcOutputStream, RpcReply, RpcStreamMeta};
use chromvoid_protocol::{frame_continuation, AntiReplay, Frame, FrameType, FLAG_HAS_CONTINUATION};
use std::io::Read as _;
use std::time::Duration;
use tokio::sync::mpsc;

const RPC_RESPONSE_TIMEOUT: Duration = Duration::from_secs(15);

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

    const STREAM_CHUNK_SIZE: usize = 1024 * 1024;

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

    loop {
        tokio::select! {
            biased;
            // Handle outgoing RPC requests
            Some(io_req) = req_rx.recv() => {
                let msg_id = next_msg_id;
                next_msg_id = next_msg_id.wrapping_add(1);

                let mut frame = frame_from_rpc_request(msg_id, &io_req.request);
                if io_req.stream.is_some() {
                    frame.flags |= FLAG_HAS_CONTINUATION;
                }
                let encrypted = noise.encrypt(&frame.encode())
                    .map_err(|e| format!("encrypt: {}", e))?;

                transport.send(&encrypted).await
                    .map_err(|e| format!("send: {}", e))?;

                // Upload stream: send binary chunks.
                if let Some(stream) = io_req.stream {
                    let mut reader_stream = stream.into_reader();

                    let mut current_buf = vec![0u8; STREAM_CHUNK_SIZE];
                    let mut n = reader_stream.read(&mut current_buf)
                        .map_err(|e| format!("stream read: {}", e))?;

                    while n > 0 {
                        let mut next_buf = vec![0u8; STREAM_CHUNK_SIZE];
                        let next_n = reader_stream.read(&mut next_buf).unwrap_or(0);
                        let has_more = next_n > 0;

                        let chunk_frame = frame_continuation(
                            FrameType::RpcRequest,
                            msg_id,
                            current_buf[..n].to_vec(),
                            has_more,
                        );
                        let encrypted = noise.encrypt(&chunk_frame.encode())
                            .map_err(|e| format!("encrypt: {}", e))?;
                        transport.send(&encrypted).await
                            .map_err(|e| format!("send: {}", e))?;

                        current_buf = next_buf;
                        n = next_n;
                    }
                }

                // Read response frames (JSON response or download stream).
                loop {
                    let resp_bytes = tokio::time::timeout(RPC_RESPONSE_TIMEOUT, transport.recv())
                        .await
                        .map_err(|_| format!("recv timeout after {}s", RPC_RESPONSE_TIMEOUT.as_secs()))?
                        .map_err(|e| format!("recv: {}", e))?;
                    let decrypted = noise.decrypt(&resp_bytes)
                        .map_err(|e| format!("decrypt: {}", e))?;
                    let resp_frame = Frame::decode(&decrypted)
                        .map_err(|e| format!("decode: {}", e))?;

                    // Network transports may interleave heartbeats.
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
                            let resp_bytes = tokio::time::timeout(RPC_RESPONSE_TIMEOUT, transport.recv())
                                .await
                                .map_err(|_| format!("recv timeout after {}s", RPC_RESPONSE_TIMEOUT.as_secs()))?
                                .map_err(|e| format!("recv: {}", e))?;
                            let decrypted = noise.decrypt(&resp_bytes)
                                .map_err(|e| format!("decrypt: {}", e))?;
                            let f = Frame::decode(&decrypted)
                                .map_err(|e| format!("decode: {}", e))?;

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

                    // Validate anti-replay (best-effort).
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

            }

            // Periodic heartbeat
            _ = heartbeat_interval.tick() => {
                let msg_id = next_msg_id;
                next_msg_id = next_msg_id.wrapping_add(1);

                let hb = frame_from_heartbeat(msg_id);
                let encrypted = noise.encrypt(&hb.encode())
                    .map_err(|e| format!("heartbeat encrypt: {}", e))?;

                transport.send(&encrypted).await
                    .map_err(|e| format!("heartbeat send: {}", e))?;
            }

            // Drain incoming frames while idle (primarily heartbeats).
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
                }
            }
        }
    }
}
