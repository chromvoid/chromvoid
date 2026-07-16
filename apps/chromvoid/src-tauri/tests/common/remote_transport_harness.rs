use std::collections::HashMap;
use std::io::Read as _;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcRangeStreamMeta, RpcReply};
use chromvoid_lib::remote_data_plane::{
    spawn_remote_io_task_with_timing, RemoteIoEvent, RemoteIoRequest, RemoteIoTaskConfig,
    RemoteIoTaskTiming, RemotePeerFeatures,
};
use chromvoid_lib::{
    CoreAdapter, RemoteCancelGroup, RemoteCoreAdapter, RemoteHost, RemoteRpcPriority,
};
use chromvoid_protocol::{
    frame_continuation, Frame, FrameType, NoiseTransport, RemoteTransport, TransportError,
    TransportMetrics, TransportType, FLAG_HAS_CONTINUATION, MAX_FRAME_PAYLOAD_SIZE,
    MAX_HANDSHAKE_MSG, NOISE_PARAMS_XX,
};
use snow::Builder;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

pub enum ScriptedRemoteResponse {
    Json(RpcResponse),
    DuplicateJson(RpcResponse),
    UnknownJsonThenJson {
        unknown_response: RpcResponse,
        response: RpcResponse,
    },
    Range {
        meta: RpcRangeStreamMeta,
        chunks: Vec<Vec<u8>>,
    },
    RangeWithoutFinal {
        meta: RpcRangeStreamMeta,
        chunks: Vec<Vec<u8>>,
    },
    RangeThenClose {
        meta: RpcRangeStreamMeta,
        chunks: Vec<Vec<u8>>,
    },
    RangeThenRecordLayerInvalidLength {
        meta: RpcRangeStreamMeta,
        chunks: Vec<Vec<u8>>,
        message: &'static str,
    },
    MalformedJson,
    MalformedRangeMeta,
    NoResponse,
    Close,
}

impl ScriptedRemoteResponse {
    pub fn json_success(result: serde_json::Value) -> Self {
        Self::Json(RpcResponse::success(result))
    }

    pub fn json_error(error: impl Into<String>, code: Option<&str>) -> Self {
        Self::Json(RpcResponse::error(
            error.into(),
            code.map(ToString::to_string),
        ))
    }
}

pub type ScriptedResponder = Box<dyn FnMut(&RpcRequest) -> ScriptedRemoteResponse + Send>;

pub struct RemoteDataPlaneHarness {
    pub req_tx: mpsc::Sender<RemoteIoRequest>,
    pub evt_rx: mpsc::Receiver<RemoteIoEvent>,
    peer_features: RemotePeerFeatures,
    observed_requests: Arc<Mutex<Vec<RpcRequest>>>,
    observed_frames: Arc<Mutex<Vec<Frame>>>,
    task_handle: JoinHandle<()>,
}

impl RemoteDataPlaneHarness {
    pub fn observed_requests(&self) -> Vec<RpcRequest> {
        self.observed_requests
            .lock()
            .expect("observed requests lock")
            .clone()
    }

    pub fn observed_commands(&self) -> Vec<String> {
        self.observed_requests()
            .into_iter()
            .map(|request| request.command)
            .collect()
    }

    pub fn observed_frames(&self) -> Vec<Frame> {
        self.observed_frames
            .lock()
            .expect("observed frames lock")
            .clone()
    }

    pub fn peer_features_snapshot(&self) -> Vec<String> {
        self.peer_features.snapshot()
    }
}

impl Drop for RemoteDataPlaneHarness {
    fn drop(&mut self) {
        self.task_handle.abort();
    }
}

pub fn start_scripted_remote_data_plane(
    transport_type: TransportType,
    responder: ScriptedResponder,
) -> RemoteDataPlaneHarness {
    RemoteDataPlaneHarnessBuilder::new()
        .with_transport_type(transport_type)
        .with_responder(responder)
        .start()
}

pub fn start_scripted_remote_data_plane_with_timing(
    transport_type: TransportType,
    timing: RemoteIoTaskTiming,
    responder: ScriptedResponder,
) -> RemoteDataPlaneHarness {
    RemoteDataPlaneHarnessBuilder::new()
        .with_transport_type(transport_type)
        .with_timing(timing)
        .with_responder(responder)
        .start()
}

pub struct RemoteDataPlaneHarnessBuilder {
    transport_type: TransportType,
    timing: RemoteIoTaskTiming,
    peer_features: RemotePeerFeatures,
    responder: ScriptedResponder,
}

impl RemoteDataPlaneHarnessBuilder {
    pub fn new() -> Self {
        Self {
            transport_type: TransportType::WssRelay,
            timing: RemoteIoTaskTiming::default(),
            peer_features: RemotePeerFeatures::new(),
            responder: Box::new(|request| {
                ScriptedRemoteResponse::json_error(
                    format!("unexpected command {}", request.command),
                    Some("UNEXPECTED_COMMAND"),
                )
            }),
        }
    }

    pub fn with_transport_type(mut self, transport_type: TransportType) -> Self {
        self.transport_type = transport_type;
        self
    }

    pub fn with_timing(mut self, timing: RemoteIoTaskTiming) -> Self {
        self.timing = timing;
        self
    }

    pub fn with_peer_features<I, S>(self, features: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.peer_features
            .replace(features.into_iter().map(Into::into).collect());
        self
    }

    pub fn with_responder(mut self, responder: ScriptedResponder) -> Self {
        self.responder = responder;
        self
    }

    pub fn start(self) -> RemoteDataPlaneHarness {
        start_scripted_remote_data_plane_from_builder(self)
    }
}

fn start_scripted_remote_data_plane_from_builder(
    builder: RemoteDataPlaneHarnessBuilder,
) -> RemoteDataPlaneHarness {
    let (client_noise, host_noise) = noise_pair();
    let observed_requests = Arc::new(Mutex::new(Vec::new()));
    let observed_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = ScriptedRemoteTransport::new(
        host_noise,
        builder.transport_type,
        observed_requests.clone(),
        observed_frames.clone(),
        builder.responder,
    );
    let chromvoid_lib::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx,
        task_handle,
    } = spawn_remote_io_task_with_timing(
        RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: builder.peer_features.clone(),
        },
        builder.timing,
    );

    RemoteDataPlaneHarness {
        req_tx,
        evt_rx,
        peer_features: builder.peer_features,
        observed_requests,
        observed_frames,
        task_handle,
    }
}

struct ScriptedRemoteTransport {
    host_noise: NoiseTransport,
    inbound_tx: mpsc::UnboundedSender<Vec<u8>>,
    inbound_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    transport_type: TransportType,
    observed_requests: Arc<Mutex<Vec<RpcRequest>>>,
    observed_frames: Arc<Mutex<Vec<Frame>>>,
    responder: ScriptedResponder,
    active_uploads: HashMap<u64, ActiveUpload>,
    failure_after_drain: Option<TransportError>,
}

struct ActiveUpload {
    request: RpcRequest,
    body: Vec<u8>,
}

impl ScriptedRemoteTransport {
    fn new(
        host_noise: NoiseTransport,
        transport_type: TransportType,
        observed_requests: Arc<Mutex<Vec<RpcRequest>>>,
        observed_frames: Arc<Mutex<Vec<Frame>>>,
        responder: ScriptedResponder,
    ) -> Self {
        let (inbound_tx, inbound_rx) = mpsc::unbounded_channel();
        Self {
            host_noise,
            inbound_tx,
            inbound_rx,
            transport_type,
            observed_requests,
            observed_frames,
            responder,
            active_uploads: HashMap::new(),
            failure_after_drain: None,
        }
    }

    fn enqueue_frame(&mut self, frame: Frame) -> Result<(), TransportError> {
        let encrypted = self
            .host_noise
            .encrypt(&frame.encode())
            .map_err(|error| TransportError::Io(format!("test encrypt: {error}")))?;
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

    fn enqueue_range_response(
        &mut self,
        message_id: u64,
        meta: RpcRangeStreamMeta,
        chunks: Vec<Vec<u8>>,
    ) -> Result<(), TransportError> {
        self.enqueue_frame(Frame {
            frame_type: FrameType::RpcResponse,
            message_id,
            flags: FLAG_HAS_CONTINUATION,
            payload: serde_json::to_vec(&meta).expect("range stream meta json"),
        })?;
        for chunk in chunks {
            self.enqueue_frame(frame_continuation(
                FrameType::RpcResponse,
                message_id,
                chunk,
                true,
            ))?;
        }
        self.enqueue_frame(frame_continuation(
            FrameType::RpcResponse,
            message_id,
            Vec::new(),
            false,
        ))
    }

    fn record_observed_request(&self, request: &RpcRequest) {
        self.observed_requests
            .lock()
            .expect("observed requests lock")
            .push(request.clone());
    }

    fn apply_response(
        &mut self,
        message_id: u64,
        response: ScriptedRemoteResponse,
    ) -> Result<(), TransportError> {
        match response {
            ScriptedRemoteResponse::Json(response) => {
                self.enqueue_json_response(message_id, response)
            }
            ScriptedRemoteResponse::DuplicateJson(response) => {
                self.enqueue_json_response(message_id, response.clone())?;
                self.enqueue_json_response(message_id, response)
            }
            ScriptedRemoteResponse::UnknownJsonThenJson {
                unknown_response,
                response,
            } => {
                self.enqueue_json_response(message_id.wrapping_add(2), unknown_response)?;
                self.enqueue_json_response(message_id, response)
            }
            ScriptedRemoteResponse::Range { meta, chunks } => {
                self.enqueue_range_response(message_id, meta, chunks)
            }
            ScriptedRemoteResponse::RangeWithoutFinal { meta, chunks } => {
                self.enqueue_range_response_without_final(message_id, meta, chunks)
            }
            ScriptedRemoteResponse::RangeThenClose { meta, chunks } => {
                self.enqueue_range_response_without_final(message_id, meta, chunks)?;
                self.failure_after_drain = Some(TransportError::Closed);
                Ok(())
            }
            ScriptedRemoteResponse::RangeThenRecordLayerInvalidLength {
                meta,
                chunks,
                message,
            } => {
                self.enqueue_range_response_without_final(message_id, meta, chunks)?;
                self.failure_after_drain = Some(TransportError::RecordLayerInvalidLength(
                    message.to_string(),
                ));
                Ok(())
            }
            ScriptedRemoteResponse::MalformedJson => self.enqueue_frame(Frame {
                frame_type: FrameType::RpcResponse,
                message_id,
                flags: 0,
                payload: b"{not valid json".to_vec(),
            }),
            ScriptedRemoteResponse::MalformedRangeMeta => self.enqueue_frame(Frame {
                frame_type: FrameType::RpcResponse,
                message_id,
                flags: FLAG_HAS_CONTINUATION,
                payload: b"{not valid range meta".to_vec(),
            }),
            ScriptedRemoteResponse::NoResponse => Ok(()),
            ScriptedRemoteResponse::Close => Err(TransportError::Closed),
        }
    }

    fn enqueue_range_response_without_final(
        &mut self,
        message_id: u64,
        meta: RpcRangeStreamMeta,
        chunks: Vec<Vec<u8>>,
    ) -> Result<(), TransportError> {
        self.enqueue_frame(Frame {
            frame_type: FrameType::RpcResponse,
            message_id,
            flags: FLAG_HAS_CONTINUATION,
            payload: serde_json::to_vec(&meta).expect("range stream meta json"),
        })?;
        for chunk in chunks {
            self.enqueue_frame(frame_continuation(
                FrameType::RpcResponse,
                message_id,
                chunk,
                true,
            ))?;
        }
        Ok(())
    }

    fn handle_upload_frame(&mut self, frame: Frame) -> Result<bool, TransportError> {
        let Some(upload) = self.active_uploads.get_mut(&frame.message_id) else {
            return Ok(false);
        };

        upload.body.extend_from_slice(&frame.payload);
        if (frame.flags & FLAG_HAS_CONTINUATION) != 0 {
            return Ok(true);
        }

        let mut upload = self
            .active_uploads
            .remove(&frame.message_id)
            .expect("active upload exists");
        if let Some(data) = upload.request.data.as_object_mut() {
            data.insert(
                "_scripted_upload_bytes".to_string(),
                serde_json::json!(upload.body.len()),
            );
        }
        let response = (self.responder)(&upload.request);
        self.apply_response(frame.message_id, response)?;
        Ok(true)
    }
}

#[async_trait]
impl RemoteTransport for ScriptedRemoteTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        let decrypted = self
            .host_noise
            .decrypt(data)
            .map_err(|error| TransportError::Io(format!("test decrypt: {error}")))?;
        let frame = Frame::decode(&decrypted)
            .map_err(|error| TransportError::Io(format!("test frame decode: {error}")))?;
        self.observed_frames
            .lock()
            .expect("observed frames lock")
            .push(frame.clone());
        if frame.frame_type != FrameType::RpcRequest {
            return Ok(());
        }

        if self.handle_upload_frame(frame.clone())? {
            return Ok(());
        }

        let request: RpcRequest = serde_json::from_slice(&frame.payload)
            .map_err(|error| TransportError::Io(format!("request parse: {error}")))?;
        self.record_observed_request(&request);

        if (frame.flags & FLAG_HAS_CONTINUATION) != 0 {
            self.active_uploads.insert(
                frame.message_id,
                ActiveUpload {
                    request,
                    body: Vec::new(),
                },
            );
            return Ok(());
        }

        let response = (self.responder)(&request);
        self.apply_response(frame.message_id, response)
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        if self.failure_after_drain.is_some() {
            return match self.inbound_rx.try_recv() {
                Ok(bytes) => Ok(bytes),
                Err(mpsc::error::TryRecvError::Empty | mpsc::error::TryRecvError::Disconnected) => {
                    Err(self
                        .failure_after_drain
                        .take()
                        .expect("scripted transport failure after drain"))
                }
            };
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

fn noise_pair() -> (NoiseTransport, NoiseTransport) {
    let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().expect("noise params");
    let kp_i = Builder::new(params.clone())
        .generate_keypair()
        .expect("initiator keypair");
    let kp_r = Builder::new(params.clone())
        .generate_keypair()
        .expect("responder keypair");

    let mut initiator = Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .expect("initiator local key")
        .build_initiator()
        .expect("initiator");
    let mut responder = Builder::new(params)
        .local_private_key(&kp_r.private)
        .expect("responder local key")
        .build_responder()
        .expect("responder");

    let mut buf = vec![0_u8; MAX_HANDSHAKE_MSG];

    let len = initiator.write_message(&[], &mut buf).expect("xx msg1");
    let msg1 = buf[..len].to_vec();

    responder
        .read_message(&msg1, &mut buf)
        .expect("xx msg1 read");
    let len = responder.write_message(&[], &mut buf).expect("xx msg2");
    let msg2 = buf[..len].to_vec();

    initiator
        .read_message(&msg2, &mut buf)
        .expect("xx msg2 read");
    let len = initiator.write_message(&[], &mut buf).expect("xx msg3");
    let msg3 = buf[..len].to_vec();

    responder
        .read_message(&msg3, &mut buf)
        .expect("xx msg3 read");

    let remote_pub_i = initiator
        .get_remote_static()
        .expect("initiator remote key")
        .to_vec();
    let remote_pub_r = responder
        .get_remote_static()
        .expect("responder remote key")
        .to_vec();

    (
        NoiseTransport::new(
            initiator
                .into_transport_mode()
                .expect("initiator transport"),
            remote_pub_i,
        ),
        NoiseTransport::new(
            responder
                .into_transport_mode()
                .expect("responder transport"),
            remote_pub_r,
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::Duration;

    #[tokio::test]
    async fn harness_builder_applies_responder_and_peer_features() {
        let harness = RemoteDataPlaneHarnessBuilder::new()
            .with_transport_type(TransportType::UsbMobile)
            .with_peer_features(["remote_stream_control_v1"])
            .with_responder(Box::new(|request| {
                assert_eq!(request.command, "vault:status");
                ScriptedRemoteResponse::json_success(json!({ "ok": true }))
            }))
            .start();

        let (reply_tx, reply_rx) = oneshot::channel();
        harness
            .req_tx
            .send(RemoteIoRequest {
                request: RpcRequest::new("vault:status", json!({})),
                stream: None,
                reply_tx,
                priority: chromvoid_lib::RemoteRpcPriority::Normal,
                cancel_group: None,
            })
            .await
            .expect("send harness request");

        let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
            .await
            .expect("harness reply timeout")
            .expect("harness reply");
        let RpcReply::Json(response) = reply else {
            panic!("expected json reply");
        };
        assert!(response.is_ok());
        assert_eq!(
            harness.peer_features_snapshot(),
            vec!["remote_stream_control_v1".to_string()]
        );
        assert_eq!(
            harness.observed_commands(),
            vec!["vault:status".to_string()]
        );
    }
}

// Shared integration helpers for remote transport flow scenarios.
pub async fn call_json(adapter: Arc<Mutex<RemoteCoreAdapter>>, request: RpcRequest) -> RpcResponse {
    tokio::task::spawn_blocking(move || {
        adapter
            .lock()
            .expect("remote adapter lock")
            .handle(&request)
    })
    .await
    .expect("json adapter call task")
}

pub async fn call_range_stream(
    adapter: Arc<Mutex<RemoteCoreAdapter>>,
    request: RpcRequest,
) -> (RpcRangeStreamMeta, Vec<u8>) {
    let (meta, bytes, result) = call_range_stream_result(adapter, request).await;
    result.expect("read range stream");
    (meta, bytes)
}

pub async fn call_range_stream_result(
    adapter: Arc<Mutex<RemoteCoreAdapter>>,
    request: RpcRequest,
) -> (RpcRangeStreamMeta, Vec<u8>, std::io::Result<()>) {
    tokio::task::spawn_blocking(move || {
        let reply = adapter
            .lock()
            .expect("remote adapter lock")
            .handle_with_stream(&request, None);
        let RpcReply::RangeStream(mut output) = reply else {
            panic!("expected range stream reply");
        };
        let mut bytes = Vec::new();
        let result = output.reader.read_to_end(&mut bytes).map(|_| ());
        (output.meta, bytes, result)
    })
    .await
    .expect("range adapter call task")
}

pub async fn call_stream_reply(
    adapter: Arc<Mutex<RemoteCoreAdapter>>,
    request: RpcRequest,
    stream: Option<RpcInputStream>,
) -> RpcReply {
    tokio::task::spawn_blocking(move || {
        adapter
            .lock()
            .expect("remote adapter lock")
            .handle_with_stream(&request, stream)
    })
    .await
    .expect("stream adapter call task")
}

pub async fn send_data_plane_request(
    req_tx: &tokio::sync::mpsc::Sender<RemoteIoRequest>,
    request: RpcRequest,
    priority: RemoteRpcPriority,
) -> oneshot::Receiver<RpcReply> {
    send_data_plane_request_with_cancel_group(req_tx, request, priority, None).await
}

pub async fn send_data_plane_request_with_cancel_group(
    req_tx: &tokio::sync::mpsc::Sender<RemoteIoRequest>,
    request: RpcRequest,
    priority: RemoteRpcPriority,
    cancel_group: Option<RemoteCancelGroup>,
) -> oneshot::Receiver<RpcReply> {
    let (reply_tx, reply_rx) = oneshot::channel();
    req_tx
        .send(RemoteIoRequest {
            request,
            stream: None,
            reply_tx,
            priority,
            cancel_group,
        })
        .await
        .expect("remote data-plane request queued");
    reply_rx
}

pub async fn probe_capabilities(adapter: Arc<Mutex<RemoteCoreAdapter>>) {
    tokio::task::spawn_blocking(move || {
        adapter
            .lock()
            .expect("remote adapter lock")
            .probe_capabilities();
    })
    .await
    .expect("probe capabilities task")
}

pub fn range_meta(
    node_id: u64,
    file_size: u64,
    range_offset: u64,
    range_length: u64,
) -> RpcRangeStreamMeta {
    RpcRangeStreamMeta {
        name: format!("node-{node_id}.bin"),
        mime_type: "application/octet-stream".to_string(),
        file_size,
        chunk_size: MAX_FRAME_PAYLOAD_SIZE as u32,
        range_offset,
        range_length,
        source_revision: 12,
    }
}

pub fn fast_timing() -> RemoteIoTaskTiming {
    RemoteIoTaskTiming {
        heartbeat_interval: Duration::from_secs(30),
        response_timeout: Duration::from_millis(50),
        timeout_scan_interval: Duration::from_millis(5),
    }
}

pub fn heartbeat_timing() -> RemoteIoTaskTiming {
    RemoteIoTaskTiming {
        heartbeat_interval: Duration::from_millis(20),
        response_timeout: Duration::from_secs(1),
        timeout_scan_interval: Duration::from_millis(10),
    }
}

pub struct FailingReader;

impl std::io::Read for FailingReader {
    fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "scripted upload reader failure",
        ))
    }
}

pub fn remote_adapter(
    transport_type: TransportType,
    req_tx: tokio::sync::mpsc::Sender<chromvoid_lib::remote_data_plane::RemoteIoRequest>,
) -> RemoteCoreAdapter {
    let host = match transport_type {
        TransportType::UsbMobile => RemoteHost::MobileUsb {
            host_id: "scripted-android".to_string(),
            label: Some("Scripted Android".to_string()),
            platform: "android".to_string(),
        },
        _ => RemoteHost::TauriRemoteWss {
            peer_id: format!("scripted-{transport_type:?}"),
        },
    };
    RemoteCoreAdapter::from_remote_sender_with_metrics(
        host,
        req_tx,
        Some(TransportMetrics {
            transport_type: Some(transport_type),
            ..TransportMetrics::default()
        }),
    )
}
