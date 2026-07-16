use super::*;
use async_trait::async_trait;

pub(super) struct FailingReader;

impl std::io::Read for FailingReader {
    fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "mobile acceptor stream failed",
        ))
    }
}

pub(super) struct BlockingAfterFirstReader {
    pub(super) sent_first: bool,
    pub(super) release_rx: mpsc::Receiver<()>,
}

impl std::io::Read for BlockingAfterFirstReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if !self.sent_first {
            self.sent_first = true;
            let bytes = b"abc";
            buf[..bytes.len()].copy_from_slice(bytes);
            return Ok(bytes.len());
        }
        let _ = self.release_rx.recv();
        Ok(0)
    }
}

pub(super) struct UploadInterleaveAdapter {
    pub(super) commands: Arc<Mutex<Vec<String>>>,
    pub(super) streamed_bodies: Arc<Mutex<Vec<Vec<u8>>>>,
}

impl CoreAdapter for UploadInterleaveAdapter {
    fn mode(&self) -> crate::core_adapter::CoreMode {
        crate::core_adapter::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.commands.lock().unwrap().push(req.command.clone());
        match req.command.as_str() {
            "vault:status" => RpcResponse::success(serde_json::json!({
                "is_unlocked": true,
                "session_started_at": 1,
            })),
            _ => RpcResponse::success(serde_json::Value::Null),
        }
    }

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply {
        self.commands.lock().unwrap().push(req.command.clone());
        let mut body = Vec::new();
        if let Some(stream) = stream {
            let mut reader = stream.into_reader();
            reader.read_to_end(&mut body).expect("read test stream");
        }
        self.streamed_bodies.lock().unwrap().push(body);
        RpcReply::Json(RpcResponse::success(serde_json::json!({"uploaded": true})))
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn take_events(&mut self) -> Vec<serde_json::Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}

pub(super) struct ChannelTransport {
    incoming: tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>,
    outgoing: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
    transport_type: TransportType,
}

impl ChannelTransport {
    pub(super) fn pair(transport_type: TransportType) -> (Self, Self) {
        let (left_tx, left_rx) = tokio::sync::mpsc::unbounded_channel();
        let (right_tx, right_rx) = tokio::sync::mpsc::unbounded_channel();
        (
            Self {
                incoming: left_rx,
                outgoing: right_tx,
                transport_type,
            },
            Self {
                incoming: right_rx,
                outgoing: left_tx,
                transport_type,
            },
        )
    }
}

#[async_trait]
impl RemoteTransport for ChannelTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.outgoing
            .send(data.to_vec())
            .map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.incoming.recv().await.ok_or(TransportError::Closed)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        Ok(())
    }

    fn transport_type(&self) -> TransportType {
        self.transport_type
    }
}

pub(super) async fn recv_test_frame(
    transport: &mut ChannelTransport,
    noise: &mut NoiseTransport,
) -> Frame {
    let encrypted = tokio::time::timeout(std::time::Duration::from_secs(1), transport.recv())
        .await
        .expect("test frame timeout")
        .expect("test frame recv");
    let decrypted = noise.decrypt(&encrypted).expect("test decrypt frame");
    Frame::decode(&decrypted).expect("test frame decode")
}

pub(super) struct RecordingIdleTransport {
    peer_noise: NoiseTransport,
    _inbound_tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
    inbound_rx: tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>,
    sent_frames: Arc<Mutex<Vec<Frame>>>,
}

impl RecordingIdleTransport {
    pub(super) fn new(peer_noise: NoiseTransport, sent_frames: Arc<Mutex<Vec<Frame>>>) -> Self {
        let (_inbound_tx, inbound_rx) = tokio::sync::mpsc::unbounded_channel();
        Self {
            peer_noise,
            _inbound_tx,
            inbound_rx,
            sent_frames,
        }
    }
}

#[async_trait]
impl RemoteTransport for RecordingIdleTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        let decrypted = self
            .peer_noise
            .decrypt(data)
            .map_err(|e| TransportError::Io(format!("test decrypt: {e}")))?;
        let frame = Frame::decode(&decrypted)
            .map_err(|e| TransportError::Io(format!("test frame decode: {e}")))?;
        self.sent_frames.lock().unwrap().push(frame);
        Ok(())
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.inbound_rx.recv().await.ok_or(TransportError::Closed)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        Ok(())
    }

    fn transport_type(&self) -> TransportType {
        TransportType::UsbMobile
    }
}

pub(super) struct RecvSignalTransport {
    peer_noise: NoiseTransport,
    recv_started: Option<tokio::sync::oneshot::Sender<()>>,
}

impl RecvSignalTransport {
    pub(super) fn new(
        peer_noise: NoiseTransport,
        recv_started: tokio::sync::oneshot::Sender<()>,
    ) -> Self {
        Self {
            peer_noise,
            recv_started: Some(recv_started),
        }
    }
}

#[async_trait]
impl RemoteTransport for RecvSignalTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        let _ = self
            .peer_noise
            .decrypt(data)
            .map_err(|e| TransportError::Io(format!("test decrypt: {e}")))?;
        Ok(())
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        if let Some(recv_started) = self.recv_started.take() {
            let _ = recv_started.send(());
        }
        std::future::pending::<Result<Vec<u8>, TransportError>>().await
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        Ok(())
    }

    fn transport_type(&self) -> TransportType {
        TransportType::UsbMobile
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
