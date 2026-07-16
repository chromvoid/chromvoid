use super::*;
use async_trait::async_trait;

pub(super) const BURST_RESPONSE_CHUNK_COUNT: usize = 32;

pub(super) struct FailingReader;

impl std::io::Read for FailingReader {
    fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "network stream failed",
        ))
    }
}

pub(super) struct BlockingReader {
    pub(super) release_rx: std::sync::mpsc::Receiver<()>,
}

impl std::io::Read for BlockingReader {
    fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
        let _ = self.release_rx.recv();
        Ok(0)
    }
}

pub(super) fn queued_request(command: &str, priority: RemoteRpcPriority) -> RemoteIoRequest {
    let (reply_tx, _reply_rx) = oneshot::channel();
    RemoteIoRequest {
        request: RpcRequest::new(command.to_string(), serde_json::json!({})),
        stream: None,
        reply_tx,
        priority,
        cancel_group: None,
    }
}

pub(super) enum Script {
    EchoJson,
    PushThenJson,
    LockSuccess,
    UploadAck,
    StreamResponseNoUpload,
    EmptyStreamResponseNoUpload,
    RangeResponseNoUpload,
    RangeBurstThenJson,
    RangeMetaOnlyNoUpload,
    StreamResponseAfterUpload,
    UnmatchedStreamError,
    ClosedOnRecv,
    Idle,
}

pub(super) struct ScriptedTransport {
    host_noise: NoiseTransport,
    inbound_tx: mpsc::UnboundedSender<Vec<u8>>,
    inbound_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    sent_frames: Arc<Mutex<Vec<Frame>>>,
    script: Script,
    transport_type: TransportType,
    active_upload_message_id: Option<u64>,
    uploaded: Vec<u8>,
}

impl ScriptedTransport {
    pub(super) fn new(host_noise: NoiseTransport, script: Script) -> Self {
        Self::with_sent_frames(host_noise, script, Arc::new(Mutex::new(Vec::new())))
    }

    pub(super) fn with_sent_frames(
        host_noise: NoiseTransport,
        script: Script,
        sent_frames: Arc<Mutex<Vec<Frame>>>,
    ) -> Self {
        Self::with_transport_type(host_noise, script, sent_frames, TransportType::WssRelay)
    }

    pub(super) fn with_transport_type(
        host_noise: NoiseTransport,
        script: Script,
        sent_frames: Arc<Mutex<Vec<Frame>>>,
        transport_type: TransportType,
    ) -> Self {
        let (inbound_tx, inbound_rx) = mpsc::unbounded_channel();
        Self {
            host_noise,
            inbound_tx,
            inbound_rx,
            sent_frames,
            script,
            transport_type,
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
            Script::UnmatchedStreamError => {
                self.enqueue_frame(crate::rpc_transport_protocol::frame_stream_read_failed(
                    frame.message_id,
                    &request.command,
                    "unexpected stream error",
                ))
            }
            Script::LockSuccess => self.enqueue_json_response(
                frame.message_id,
                RpcResponse::success(serde_json::Value::Null),
            ),
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
            Script::StreamResponseNoUpload => {
                if request.command != "stream:download" {
                    return self.enqueue_json_response(
                        frame.message_id,
                        RpcResponse::success(serde_json::json!({ "command": request.command })),
                    );
                }

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
            Script::EmptyStreamResponseNoUpload => {
                if request.command != "stream:empty-download" {
                    return self.enqueue_json_response(
                        frame.message_id,
                        RpcResponse::success(serde_json::json!({ "command": request.command })),
                    );
                }

                let meta = RpcStreamMeta {
                    name: "empty.txt".to_string(),
                    mime_type: "text/plain".to_string(),
                    size: 0,
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
                    Vec::new(),
                    false,
                ))
            }
            Script::RangeResponseNoUpload => {
                if request.command != "catalog:downloadRange" {
                    return self.enqueue_json_response(
                        frame.message_id,
                        RpcResponse::success(serde_json::json!({ "command": request.command })),
                    );
                }

                let meta = RpcRangeStreamMeta {
                    name: "hello.txt".to_string(),
                    mime_type: "text/plain".to_string(),
                    file_size: 10,
                    chunk_size: 3,
                    range_offset: 2,
                    range_length: 5,
                    source_revision: 42,
                };
                self.enqueue_frame(Frame {
                    frame_type: FrameType::RpcResponse,
                    message_id: frame.message_id,
                    flags: FLAG_HAS_CONTINUATION,
                    payload: serde_json::to_vec(&meta).expect("range stream meta json"),
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
            Script::RangeBurstThenJson => {
                if request.command != "catalog:downloadRange" {
                    return self.enqueue_json_response(
                        frame.message_id,
                        RpcResponse::success(serde_json::json!({ "command": request.command })),
                    );
                }

                let meta = RpcRangeStreamMeta {
                    name: "burst.bin".to_string(),
                    mime_type: "application/octet-stream".to_string(),
                    file_size: (BURST_RESPONSE_CHUNK_COUNT * MAX_FRAME_PAYLOAD_SIZE) as u64,
                    chunk_size: MAX_FRAME_PAYLOAD_SIZE as u32,
                    range_offset: 0,
                    range_length: (BURST_RESPONSE_CHUNK_COUNT * MAX_FRAME_PAYLOAD_SIZE) as u64,
                    source_revision: 42,
                };
                self.enqueue_frame(Frame {
                    frame_type: FrameType::RpcResponse,
                    message_id: frame.message_id,
                    flags: FLAG_HAS_CONTINUATION,
                    payload: serde_json::to_vec(&meta).expect("range stream meta json"),
                })?;
                for _ in 0..BURST_RESPONSE_CHUNK_COUNT {
                    self.enqueue_frame(frame_continuation(
                        FrameType::RpcResponse,
                        frame.message_id,
                        vec![7_u8; MAX_FRAME_PAYLOAD_SIZE],
                        true,
                    ))?;
                }
                self.enqueue_frame(frame_continuation(
                    FrameType::RpcResponse,
                    frame.message_id,
                    Vec::new(),
                    false,
                ))?;
                Ok(())
            }
            Script::RangeMetaOnlyNoUpload => {
                if request.command != "catalog:downloadRange" {
                    return self.enqueue_json_response(
                        frame.message_id,
                        RpcResponse::success(serde_json::json!({ "command": request.command })),
                    );
                }

                let meta = RpcRangeStreamMeta {
                    name: "hello.txt".to_string(),
                    mime_type: "text/plain".to_string(),
                    file_size: 10,
                    chunk_size: 3,
                    range_offset: 2,
                    range_length: 5,
                    source_revision: 42,
                };
                self.enqueue_frame(Frame {
                    frame_type: FrameType::RpcResponse,
                    message_id: frame.message_id,
                    flags: FLAG_HAS_CONTINUATION,
                    payload: serde_json::to_vec(&meta).expect("range stream meta json"),
                })
            }
            Script::ClosedOnRecv | Script::Idle => Ok(()),
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
            Script::EchoJson
            | Script::PushThenJson
            | Script::LockSuccess
            | Script::StreamResponseNoUpload
            | Script::EmptyStreamResponseNoUpload
            | Script::RangeResponseNoUpload
            | Script::RangeBurstThenJson
            | Script::RangeMetaOnlyNoUpload
            | Script::UnmatchedStreamError
            | Script::ClosedOnRecv => Ok(()),
            Script::Idle => Ok(()),
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
            FrameType::RpcRequest if self.active_upload_message_id == Some(frame.message_id) => {
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
        self.transport_type
    }
}

pub(super) fn noise_pair() -> (NoiseTransport, NoiseTransport) {
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
