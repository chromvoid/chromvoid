use async_trait::async_trait;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcRangeStreamMeta, RpcReply};
use chromvoid_lib::remote_data_plane::{spawn_remote_io_task, RemoteIoRequest, RemoteIoTaskConfig};
use chromvoid_lib::RemoteRpcPriority;
use chromvoid_protocol::{
    frame_continuation, Frame, FrameType, NoiseTransport, RemoteTransport, TransportError,
    TransportType, FLAG_HAS_CONTINUATION, MAX_FRAME_PAYLOAD_SIZE, MAX_HANDSHAKE_MSG,
    NOISE_PARAMS_XX,
};
use snow::Builder;
use tokio::sync::{mpsc, oneshot};

const BURST_RESPONSE_CHUNK_COUNT: usize = 32;

struct BurstRangeTransport {
    host_noise: NoiseTransport,
    inbound_tx: mpsc::UnboundedSender<Vec<u8>>,
    inbound_rx: mpsc::UnboundedReceiver<Vec<u8>>,
}

impl BurstRangeTransport {
    fn new(host_noise: NoiseTransport) -> Self {
        let (inbound_tx, inbound_rx) = mpsc::unbounded_channel();
        Self {
            host_noise,
            inbound_tx,
            inbound_rx,
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

    fn enqueue_range_burst(&mut self, message_id: u64) -> Result<(), TransportError> {
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
            message_id,
            flags: FLAG_HAS_CONTINUATION,
            payload: serde_json::to_vec(&meta).expect("range stream meta json"),
        })?;
        for _ in 0..BURST_RESPONSE_CHUNK_COUNT {
            self.enqueue_frame(frame_continuation(
                FrameType::RpcResponse,
                message_id,
                vec![7_u8; MAX_FRAME_PAYLOAD_SIZE],
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
}

#[async_trait]
impl RemoteTransport for BurstRangeTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        let decrypted = self
            .host_noise
            .decrypt(data)
            .map_err(|e| TransportError::Io(format!("test decrypt: {e}")))?;
        let frame = Frame::decode(&decrypted)
            .map_err(|e| TransportError::Io(format!("test frame decode: {e}")))?;
        if frame.frame_type != FrameType::RpcRequest {
            return Ok(());
        }

        let request: RpcRequest = serde_json::from_slice(&frame.payload)
            .map_err(|e| TransportError::Io(format!("request parse: {e}")))?;
        if request.command == "catalog:downloadRange" {
            return self.enqueue_range_burst(frame.message_id);
        }

        self.enqueue_json_response(
            frame.message_id,
            RpcResponse::success(serde_json::json!({ "command": request.command })),
        )
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

#[tokio::test]
async fn remote_media_range_burst_does_not_block_followup_control_rpc() {
    let (client_noise, host_noise) = noise_pair();
    let transport = BurstRangeTransport::new(host_noise);
    let chromvoid_lib::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = spawn_remote_io_task(RemoteIoTaskConfig {
        transport: Box::new(transport),
        noise_transport: client_noise,
        peer_features: chromvoid_lib::remote_data_plane::RemotePeerFeatures::new(),
    });

    let (range_reply_tx, range_reply_rx) = oneshot::channel();
    req_tx
        .send(RemoteIoRequest {
            request: RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": 1,
                    "offset": 0,
                    "length": BURST_RESPONSE_CHUNK_COUNT * MAX_FRAME_PAYLOAD_SIZE,
                    "expected_source_revision": 42,
                }),
            ),
            stream: None,
            reply_tx: range_reply_tx,
            priority: RemoteRpcPriority::Media,
            cancel_group: None,
        })
        .await
        .expect("range request queued");

    let range_reply = tokio::time::timeout(std::time::Duration::from_secs(1), range_reply_rx)
        .await
        .expect("range reply timeout")
        .expect("range reply channel");
    let RpcReply::RangeStream(output) = range_reply else {
        panic!("expected range stream reply");
    };
    assert_eq!(
        output.meta.range_length,
        (BURST_RESPONSE_CHUNK_COUNT * MAX_FRAME_PAYLOAD_SIZE) as u64
    );

    let (status_reply_tx, status_reply_rx) = oneshot::channel();
    req_tx
        .send(RemoteIoRequest {
            request: RpcRequest::new("vault:status", serde_json::json!({})),
            stream: None,
            reply_tx: status_reply_tx,
            priority: RemoteRpcPriority::High,
            cancel_group: None,
        })
        .await
        .expect("status request queued");

    let status_reply = tokio::time::timeout(std::time::Duration::from_secs(1), status_reply_rx)
        .await
        .expect("status reply timeout")
        .expect("status reply channel");
    drop(output);
    task_handle.abort();
    let _ = task_handle.await;

    let RpcReply::Json(response) = status_reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "vault:status");
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
