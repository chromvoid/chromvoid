//! Core async remote data-plane loop handling RPC request/response pairs and heartbeats.

use super::frames::{
    frame_from_heartbeat, frame_from_rpc_request, recv_decrypted_frame, send_encrypted_frame,
};
use super::models::{RemoteIoEvent, RemoteIoRequest, RemoteIoTaskConfig};
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcOutputStream, RpcReply, RpcStreamMeta};
use chromvoid_protocol::{frame_continuation, AntiReplay, FrameType, FLAG_HAS_CONTINUATION};
use std::collections::{HashMap, VecDeque};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

const RPC_RESPONSE_TIMEOUT: Duration = Duration::from_secs(15);
const TIMEOUT_SCAN_INTERVAL: Duration = Duration::from_millis(100);

use crate::core_adapter::{RemoteCancelGroup, RemoteRpcPriority};

#[derive(Default)]
struct RequestQueues {
    high: VecDeque<RemoteIoRequest>,
    normal: VecDeque<RemoteIoRequest>,
    low: VecDeque<RemoteIoRequest>,
}

impl RequestQueues {
    fn push(&mut self, request: RemoteIoRequest) {
        match request.priority {
            RemoteRpcPriority::High => self.high.push_back(request),
            RemoteRpcPriority::Normal => self.normal.push_back(request),
            RemoteRpcPriority::Low => self.low.push_back(request),
        }
    }

    fn pop_next(&mut self) -> Option<RemoteIoRequest> {
        self.high
            .pop_front()
            .or_else(|| self.normal.pop_front())
            .or_else(|| self.low.pop_front())
    }

    fn push_front(&mut self, request: RemoteIoRequest) {
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
    config: RemoteIoTaskConfig,
    req_rx: &mut mpsc::Receiver<RemoteIoRequest>,
    evt_tx: &mpsc::Sender<RemoteIoEvent>,
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
                send_encrypted_frame(transport.as_mut(), &mut noise, frame).await?;

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
                        send_encrypted_frame(transport.as_mut(), &mut noise, chunk_frame).await?;

                        current_buf = next_buf;
                        n = next_n;
                    }
                }

                loop {
                    let resp_frame = tokio::time::timeout(
                        RPC_RESPONSE_TIMEOUT,
                        recv_decrypted_frame(transport.as_mut(), &mut noise),
                    )
                    .await
                    .map_err(|_| {
                        format!("recv timeout after {}s", RPC_RESPONSE_TIMEOUT.as_secs())
                    })??;

                    if resp_frame.frame_type == FrameType::Heartbeat {
                        continue;
                    }
                    if resp_frame.frame_type == FrameType::RpcRequest {
                        let _ = evt_tx.send(RemoteIoEvent::Frame(resp_frame)).await;
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
                            let f = tokio::time::timeout(
                                RPC_RESPONSE_TIMEOUT,
                                recv_decrypted_frame(transport.as_mut(), &mut noise),
                            )
                            .await
                            .map_err(|_| {
                                format!("recv timeout after {}s", RPC_RESPONSE_TIMEOUT.as_secs())
                            })??;

                            if f.frame_type == FrameType::Heartbeat {
                                continue;
                            }
                            if f.frame_type == FrameType::RpcRequest {
                                let _ = evt_tx.send(RemoteIoEvent::Frame(f)).await;
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
            send_encrypted_frame(transport.as_mut(), &mut noise, frame).await?;
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
                send_encrypted_frame(transport.as_mut(), &mut noise, hb)
                    .await
                    .map_err(|e| format!("heartbeat {e}"))?;
            }

            resp = recv_decrypted_frame(transport.as_mut(), &mut noise) => {
                let frame = resp?;
                if frame.frame_type == FrameType::Heartbeat {
                    continue;
                }
                if frame.frame_type == FrameType::RpcRequest {
                    let _ = evt_tx.send(RemoteIoEvent::Frame(frame)).await;
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
    use async_trait::async_trait;
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcStreamMeta};
    use chromvoid_protocol::{
        Frame, NoiseTransport, RemoteTransport, TransportError, TransportType, MAX_HANDSHAKE_MSG,
        NOISE_PARAMS_XX,
    };
    use snow::Builder;
    use std::io::Read;
    use std::sync::{Arc, Mutex};

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

    #[tokio::test]
    async fn fake_transport_json_request_response_roundtrip() {
        let (client_noise, host_noise) = noise_pair();
        let transport = ScriptedTransport::new(host_noise, Script::EchoJson);
        let crate::remote_data_plane::RemoteIoTaskHandle {
            req_tx,
            evt_rx: _evt_rx,
            task_handle,
        } = crate::remote_data_plane::spawn_remote_io_task(
            crate::remote_data_plane::RemoteIoTaskConfig {
                transport: Box::new(transport),
                noise_transport: client_noise,
            },
        );

        let (reply_tx, reply_rx) = oneshot::channel();
        req_tx
            .send(crate::remote_data_plane::RemoteIoRequest {
                request: RpcRequest::new("test:echo", serde_json::json!({"value": 7})),
                stream: None,
                reply_tx,
                priority: RemoteRpcPriority::Normal,
                cancel_group: None,
            })
            .await
            .expect("request queued");

        let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
            .await
            .expect("reply timeout")
            .expect("reply channel");
        task_handle.abort();

        let RpcReply::Json(response) = reply else {
            panic!("expected json reply");
        };
        assert_eq!(response.result().unwrap()["command"], "test:echo");
    }

    #[tokio::test]
    async fn fake_transport_stream_upload_continuation_roundtrip() {
        let (client_noise, host_noise) = noise_pair();
        let transport = ScriptedTransport::new(host_noise, Script::UploadAck);
        let crate::remote_data_plane::RemoteIoTaskHandle {
            req_tx,
            evt_rx: _evt_rx,
            task_handle,
        } = crate::remote_data_plane::spawn_remote_io_task(
            crate::remote_data_plane::RemoteIoTaskConfig {
                transport: Box::new(transport),
                noise_transport: client_noise,
            },
        );

        let (reply_tx, reply_rx) = oneshot::channel();
        req_tx
            .send(crate::remote_data_plane::RemoteIoRequest {
                request: RpcRequest::new("stream:upload", serde_json::json!({})),
                stream: Some(RpcInputStream::from_bytes(vec![1, 2, 3, 4])),
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

        let RpcReply::Json(response) = reply else {
            panic!("expected json reply");
        };
        assert_eq!(response.result().unwrap()["uploaded"], 4);
    }

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
    async fn fake_transport_host_push_is_forwarded_as_event() {
        let (client_noise, host_noise) = noise_pair();
        let transport = ScriptedTransport::new(host_noise, Script::PushThenJson);
        let crate::remote_data_plane::RemoteIoTaskHandle {
            req_tx,
            mut evt_rx,
            task_handle,
        } = crate::remote_data_plane::spawn_remote_io_task(
            crate::remote_data_plane::RemoteIoTaskConfig {
                transport: Box::new(transport),
                noise_transport: client_noise,
            },
        );

        let (reply_tx, reply_rx) = oneshot::channel();
        req_tx
            .send(crate::remote_data_plane::RemoteIoRequest {
                request: RpcRequest::new("test:push", serde_json::json!({})),
                stream: None,
                reply_tx,
                priority: RemoteRpcPriority::Normal,
                cancel_group: None,
            })
            .await
            .expect("request queued");

        let event = tokio::time::timeout(Duration::from_secs(1), evt_rx.recv())
            .await
            .expect("event timeout")
            .expect("event channel");
        let crate::remote_data_plane::RemoteIoEvent::Frame(frame) = event else {
            panic!("expected push frame");
        };
        let pushed: RpcRequest = serde_json::from_slice(&frame.payload).expect("push payload");
        assert_eq!(pushed.command, "push:test");

        let _ = tokio::time::timeout(Duration::from_secs(1), reply_rx)
            .await
            .expect("reply timeout")
            .expect("reply channel");
        task_handle.abort();
    }

    #[tokio::test]
    async fn shared_frame_helper_sends_heartbeat_over_fake_transport() {
        let (mut client_noise, host_noise) = noise_pair();
        let sent_frames = Arc::new(Mutex::new(Vec::new()));
        let mut transport =
            ScriptedTransport::with_sent_frames(host_noise, Script::EchoJson, sent_frames.clone());

        send_encrypted_frame(&mut transport, &mut client_noise, frame_from_heartbeat(11))
            .await
            .expect("heartbeat sent");

        assert!(sent_frames
            .lock()
            .unwrap()
            .iter()
            .any(|frame| frame.frame_type == FrameType::Heartbeat));
    }

    #[tokio::test]
    async fn fake_transport_recv_error_emits_disconnect() {
        let (client_noise, host_noise) = noise_pair();
        let transport = ScriptedTransport::new(host_noise, Script::ClosedOnRecv);
        let crate::remote_data_plane::RemoteIoTaskHandle {
            req_tx: _req_tx,
            mut evt_rx,
            task_handle,
        } = crate::remote_data_plane::spawn_remote_io_task(
            crate::remote_data_plane::RemoteIoTaskConfig {
                transport: Box::new(transport),
                noise_transport: client_noise,
            },
        );

        let event = tokio::time::timeout(Duration::from_secs(1), evt_rx.recv())
            .await
            .expect("disconnect timeout")
            .expect("event channel");
        task_handle.abort();

        let crate::remote_data_plane::RemoteIoEvent::Disconnected { reason } = event else {
            panic!("expected disconnect event");
        };
        assert!(reason.contains("transport closed"));
    }

    enum Script {
        EchoJson,
        PushThenJson,
        UploadAck,
        StreamResponseAfterUpload,
        ClosedOnRecv,
    }

    struct ScriptedTransport {
        host_noise: NoiseTransport,
        inbound_tx: mpsc::UnboundedSender<Vec<u8>>,
        inbound_rx: mpsc::UnboundedReceiver<Vec<u8>>,
        sent_frames: Arc<Mutex<Vec<Frame>>>,
        script: Script,
        active_upload_message_id: Option<u64>,
        uploaded: Vec<u8>,
    }

    impl ScriptedTransport {
        fn new(host_noise: NoiseTransport, script: Script) -> Self {
            Self::with_sent_frames(host_noise, script, Arc::new(Mutex::new(Vec::new())))
        }

        fn with_sent_frames(
            host_noise: NoiseTransport,
            script: Script,
            sent_frames: Arc<Mutex<Vec<Frame>>>,
        ) -> Self {
            let (inbound_tx, inbound_rx) = mpsc::unbounded_channel();
            Self {
                host_noise,
                inbound_tx,
                inbound_rx,
                sent_frames,
                script,
                active_upload_message_id: None,
                uploaded: Vec::new(),
            }
        }

        fn enqueue_frame(&mut self, frame: Frame) -> Result<(), TransportError> {
            let encrypted = self
                .host_noise
                .encrypt(&frame.encode())
                .map_err(|e| TransportError::Io(format!("test encrypt: {e}")))?;
            self.inbound_tx
                .send(encrypted)
                .map_err(|_| TransportError::Closed)
        }

        fn enqueue_json_response(
            &mut self,
            message_id: u64,
            response: RpcResponse,
        ) -> Result<(), TransportError> {
            self.enqueue_frame(Frame {
                frame_type: FrameType::RpcResponse,
                message_id,
                flags: 0,
                payload: serde_json::to_vec(&response).expect("response json"),
            })
        }

        fn handle_request_frame(&mut self, frame: &Frame) -> Result<(), TransportError> {
            let request: RpcRequest = serde_json::from_slice(&frame.payload)
                .map_err(|e| TransportError::Io(format!("request parse: {e}")))?;
            match self.script {
                Script::EchoJson => self.enqueue_json_response(
                    frame.message_id,
                    RpcResponse::success(serde_json::json!({ "command": request.command })),
                ),
                Script::PushThenJson => {
                    let push = RpcRequest::new("push:test", serde_json::json!({"ok": true}));
                    self.enqueue_frame(Frame {
                        frame_type: FrameType::RpcRequest,
                        message_id: frame.message_id.wrapping_add(2),
                        flags: 0,
                        payload: serde_json::to_vec(&push).expect("push json"),
                    })?;
                    self.enqueue_json_response(
                        frame.message_id,
                        RpcResponse::success(serde_json::json!({ "ok": true })),
                    )
                }
                Script::UploadAck | Script::StreamResponseAfterUpload => {
                    if !frame.has_continuation() {
                        return self.enqueue_json_response(
                            frame.message_id,
                            RpcResponse::success(serde_json::json!({ "uploaded": 0 })),
                        );
                    }
                    self.active_upload_message_id = Some(frame.message_id);
                    Ok(())
                }
                Script::ClosedOnRecv => Ok(()),
            }
        }

        fn handle_continuation_frame(&mut self, frame: &Frame) -> Result<(), TransportError> {
            self.uploaded.extend_from_slice(&frame.payload);
            if frame.has_continuation() {
                return Ok(());
            }
            self.active_upload_message_id = None;

            match self.script {
                Script::UploadAck => self.enqueue_json_response(
                    frame.message_id,
                    RpcResponse::success(serde_json::json!({ "uploaded": self.uploaded.len() })),
                ),
                Script::StreamResponseAfterUpload => {
                    let meta = RpcStreamMeta {
                        name: "hello.txt".to_string(),
                        mime_type: "text/plain".to_string(),
                        size: 5,
                        chunk_size: 3,
                    };
                    self.enqueue_frame(Frame {
                        frame_type: FrameType::RpcResponse,
                        message_id: frame.message_id,
                        flags: FLAG_HAS_CONTINUATION,
                        payload: serde_json::to_vec(&meta).expect("stream meta json"),
                    })?;
                    self.enqueue_frame(frame_continuation(
                        FrameType::RpcResponse,
                        frame.message_id,
                        b"hel".to_vec(),
                        true,
                    ))?;
                    self.enqueue_frame(frame_continuation(
                        FrameType::RpcResponse,
                        frame.message_id,
                        b"lo".to_vec(),
                        false,
                    ))
                }
                Script::EchoJson | Script::PushThenJson | Script::ClosedOnRecv => Ok(()),
            }
        }
    }

    #[async_trait]
    impl RemoteTransport for ScriptedTransport {
        async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
            let decrypted = self
                .host_noise
                .decrypt(data)
                .map_err(|e| TransportError::Io(format!("test decrypt: {e}")))?;
            let frame = Frame::decode(&decrypted)
                .map_err(|e| TransportError::Io(format!("test frame decode: {e}")))?;
            self.sent_frames.lock().unwrap().push(frame.clone());

            match frame.frame_type {
                FrameType::RpcRequest
                    if self.active_upload_message_id == Some(frame.message_id) =>
                {
                    self.handle_continuation_frame(&frame)
                }
                FrameType::RpcRequest => self.handle_request_frame(&frame),
                FrameType::Heartbeat | FrameType::RpcResponse | FrameType::Error => Ok(()),
            }
        }

        async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
            if matches!(self.script, Script::ClosedOnRecv) {
                return Err(TransportError::Closed);
            }
            self.inbound_rx.recv().await.ok_or(TransportError::Closed)
        }

        async fn close(&mut self) -> Result<(), TransportError> {
            Ok(())
        }

        fn transport_type(&self) -> TransportType {
            TransportType::WssRelay
        }
    }

    fn noise_pair() -> (NoiseTransport, NoiseTransport) {
        let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().unwrap();
        let kp_i = Builder::new(params.clone()).generate_keypair().unwrap();
        let kp_r = Builder::new(params.clone()).generate_keypair().unwrap();

        let mut initiator = Builder::new(params.clone())
            .local_private_key(&kp_i.private)
            .unwrap()
            .build_initiator()
            .unwrap();
        let mut responder = Builder::new(params.clone())
            .local_private_key(&kp_r.private)
            .unwrap()
            .build_responder()
            .unwrap();

        let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

        let len = initiator.write_message(&[], &mut buf).unwrap();
        let msg1 = buf[..len].to_vec();

        responder.read_message(&msg1, &mut buf).unwrap();
        let len = responder.write_message(&[], &mut buf).unwrap();
        let msg2 = buf[..len].to_vec();

        initiator.read_message(&msg2, &mut buf).unwrap();
        let len = initiator.write_message(&[], &mut buf).unwrap();
        let msg3 = buf[..len].to_vec();

        responder.read_message(&msg3, &mut buf).unwrap();

        let remote_pub_i = initiator
            .get_remote_static()
            .expect("initiator remote key")
            .to_vec();
        let remote_pub_r = responder
            .get_remote_static()
            .expect("responder remote key")
            .to_vec();

        (
            NoiseTransport::new(initiator.into_transport_mode().unwrap(), remote_pub_i),
            NoiseTransport::new(responder.into_transport_mode().unwrap(), remote_pub_r),
        )
    }
}
