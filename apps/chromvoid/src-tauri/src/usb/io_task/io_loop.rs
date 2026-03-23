use crate::gateway::protocol::{
    frame_continuation, frame_from_heartbeat, frame_from_rpc_request, Frame, FrameType,
    FLAG_HAS_CONTINUATION,
};
use crate::usb::transport;

use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcOutputStream, RpcReply, RpcStreamMeta};
use std::io::Read as _;
use std::time::Duration;
use tokio::sync::mpsc;

use super::chunk_reader::ChunkReceiverReader;
use super::models::{IoEvent, IoRequest, IoTaskConfig};

/// Maximum binary chunk size for streaming (1 MB per frame).
const STREAM_CHUNK_SIZE: usize = 1024 * 1024;

pub(super) async fn io_loop(
    config: IoTaskConfig,
    req_rx: &mut mpsc::Receiver<IoRequest>,
    _evt_tx: &mpsc::Sender<IoEvent>,
) -> Result<(), String> {
    let stream = config.stream;

    let (mut reader, mut writer) = tokio::io::split(stream);
    let mut noise = config.noise_transport;
    let mut next_msg_id: u64 = rand::random::<u64>() | 1;
    let mut heartbeat_interval = tokio::time::interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            biased;
            // Handle outgoing RPC requests
            maybe_req = req_rx.recv() => {
                let Some(io_req) = maybe_req else {
                    return Ok(());
                };

                let msg_id = next_msg_id;
                next_msg_id = next_msg_id.wrapping_add(1);

                // 1) Send first request frame (JSON metadata).
                let mut frame = frame_from_rpc_request(msg_id, &io_req.request);
                if io_req.stream.is_some() {
                    frame.flags |= FLAG_HAS_CONTINUATION;
                }
                let encrypted = noise
                    .encrypt(&frame.encode())
                    .map_err(|e| format!("encrypt: {}", e))?;
                transport::write_frame(&mut writer, &encrypted)
                    .await
                    .map_err(|e| format!("write: {}", e))?;

                // 2) Upload stream: send binary chunks as continuation frames.
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
                        let encrypted = noise
                            .encrypt(&chunk_frame.encode())
                            .map_err(|e| format!("encrypt: {}", e))?;
                        transport::write_frame(&mut writer, &encrypted)
                            .await
                            .map_err(|e| format!("write: {}", e))?;

                        current_buf = next_buf;
                        n = next_n;
                    }
                }

                // 3) Read response frames (JSON response or download stream).
                // Drain/ignore heartbeats while waiting.
                loop {
                    let resp_bytes = transport::read_frame(&mut reader)
                        .await
                        .map_err(|e| format!("read: {}", e))?;
                    let decrypted = noise.decrypt(&resp_bytes)
                        .map_err(|e| format!("decrypt: {}", e))?;
                    let resp_frame = Frame::decode(&decrypted)
                        .map_err(|e| format!("decode: {}", e))?;

                    if resp_frame.frame_type == FrameType::Heartbeat {
                        continue;
                    }
                    if resp_frame.message_id != msg_id {
                        // Unrelated frame (e.g. a late heartbeat). Ignore.
                        continue;
                    }

                    // Download stream: meta frame has continuation flag.
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

                        // Stream chunks until continuation flag is cleared.
                        loop {
                            let resp_bytes = transport::read_frame(&mut reader)
                                .await
                                .map_err(|e| format!("read: {}", e))?;
                            let decrypted = noise.decrypt(&resp_bytes)
                                .map_err(|e| format!("decrypt: {}", e))?;
                            let f = Frame::decode(&decrypted)
                                .map_err(|e| format!("decode: {}", e))?;

                            if f.frame_type == FrameType::Heartbeat {
                                continue;
                            }
                            if f.message_id != msg_id {
                                continue;
                            }
                            if f.frame_type != FrameType::RpcResponse {
                                break;
                            }

                            // Payload is raw bytes.
                            let has_more = (f.flags & FLAG_HAS_CONTINUATION) != 0;
                            let _ = tx.send(f.payload);
                            if !has_more {
                                break;
                            }
                        }

                        // Dropping tx closes the reader.
                        drop(tx);
                        break;
                    }

                    // Normal JSON response.
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

                transport::write_frame(&mut writer, &encrypted).await
                    .map_err(|e| format!("heartbeat write: {}", e))?;
            }

            // Drain incoming frames while idle (primarily heartbeats).
            result = transport::read_frame(&mut reader) => {
                let resp_bytes = result.map_err(|e| format!("read: {}", e))?;
                let decrypted = noise.decrypt(&resp_bytes)
                    .map_err(|e| format!("decrypt: {}", e))?;
                let frame = Frame::decode(&decrypted)
                    .map_err(|e| format!("decode: {}", e))?;

                if frame.frame_type == FrameType::Heartbeat {
                    continue;
                }
                // Ignore anything else when idle (no pending requests).
            }
        }
    }
}
