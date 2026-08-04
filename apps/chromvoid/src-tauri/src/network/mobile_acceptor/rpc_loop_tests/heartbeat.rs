use super::support::*;
use super::*;

#[tokio::test]
async fn host_rpc_loop_does_not_send_heartbeat_immediately_after_start() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let task = tokio::spawn(run_host_rpc_loop(
        None,
        Box::new(transport),
        host_noise,
        TransportType::WebRtcDataChannel,
        temp.path().to_path_buf(),
        "peer-heartbeat-test".to_string(),
        shutdown_rx,
        None,
    ));

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    task.abort();

    assert!(
        sent_frames.lock().unwrap().is_empty(),
        "heartbeat must not be the first post-handshake host write"
    );
}

#[tokio::test]
async fn host_rpc_loop_sends_periodic_heartbeat_for_network_transport() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        None,
        Box::new(transport),
        host_noise,
        TransportType::WebRtcDataChannel,
        temp.path().to_path_buf(),
        "peer-network-heartbeat-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_millis(10),
        None,
    ));

    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        loop {
            if sent_frames
                .lock()
                .unwrap()
                .iter()
                .any(|frame| frame.frame_type == FrameType::Heartbeat)
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("network heartbeat timeout");
    task.abort();

    assert!(
        sent_frames
            .lock()
            .unwrap()
            .iter()
            .any(|frame| frame.frame_type == FrameType::Heartbeat),
        "network host transports should keep their periodic heartbeat"
    );
}

#[tokio::test]
async fn host_rpc_loop_suppresses_periodic_heartbeat_for_usb_mobile() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        None,
        Box::new(transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-heartbeat-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_millis(10),
        None,
    ));

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    task.abort();

    assert!(
        sent_frames.lock().unwrap().is_empty(),
        "USB Mobile host side must stay in read mode instead of colliding with desktop heartbeat writes"
    );
}

#[tokio::test]
async fn derivative_ensure_job_keeps_heartbeat_and_vault_status_live() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) =
        ChannelTransport::pair(TransportType::WebRtcDataChannel);
    let (reader_blocked_tx, reader_blocked_rx) = tokio::sync::oneshot::channel();
    let (release_reader_tx, release_reader_rx) = std::sync::mpsc::channel();
    let stream_commands = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(DerivativeEnsureLivenessAdapter {
            reader: Some(GatedDerivativeReader {
                sent_bytes: false,
                reader_blocked_tx: Some(reader_blocked_tx),
                reader_finished_tx: None,
                release_reader_rx: Mutex::new(release_reader_rx),
            }),
            stream_commands: stream_commands.clone(),
        })));
    let services = Arc::new(crate::commands::catalog::HostDerivativeEnsureServices::new(
        adapter.clone(),
        Arc::new(crate::image_preview::ImagePreviewRuntimeState::new()),
        Arc::new(crate::catalog_blocking_io::CatalogBlockingIoRuntimeState::new()),
        Arc::new(std::sync::atomic::AtomicU64::new(0)),
    ));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop_inner(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::WebRtcDataChannel,
        temp.path().to_path_buf(),
        "peer-derivative-ensure-liveness".to_string(),
        shutdown_rx,
        std::time::Duration::from_millis(10),
        None,
        Some(services),
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 61,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new(
                "catalog:derivative:ensure",
                serde_json::json!({
                    "node_id": 17,
                    "source_version": 3,
                    "tier": "preview",
                    "version": crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                    "refresh_cache": false,
                }),
            ))
            .expect("derivative ensure request json"),
        },
    )
    .await
    .expect("send derivative ensure");

    tokio::time::timeout(std::time::Duration::from_secs(1), reader_blocked_rx)
        .await
        .expect("derivative cache reader did not block")
        .expect("derivative cache reader signal dropped");

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 63,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:status", serde_json::json!({})))
                .expect("vault status request json"),
        },
    )
    .await
    .expect("send status while derivative job is blocked");

    let mut saw_heartbeat = false;
    let mut saw_status = false;
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        while !saw_heartbeat || !saw_status {
            let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
            match frame.frame_type {
                FrameType::Heartbeat => saw_heartbeat = true,
                FrameType::RpcResponse if frame.message_id == 63 => {
                    let response: RpcResponse =
                        serde_json::from_slice(&frame.payload).expect("status response json");
                    assert!(response.is_ok());
                    saw_status = true;
                }
                FrameType::RpcResponse if frame.message_id == 61 => {
                    panic!("derivative ensure completed while its cache reader was blocked");
                }
                _ => {}
            }
        }
    })
    .await
    .expect("heartbeat and status must remain live during derivative ensure");

    release_reader_tx
        .send(())
        .expect("release derivative cache reader");

    let (ensure_meta, ensure_body) =
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            let meta_frame = loop {
                let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
                if frame.frame_type == FrameType::RpcResponse && frame.message_id == 61 {
                    break frame;
                }
            };
            assert_ne!(meta_frame.flags & FLAG_HAS_CONTINUATION, 0);
            let meta: RpcStreamMeta =
                serde_json::from_slice(&meta_frame.payload).expect("derivative stream metadata");

            let mut body = Vec::new();
            let mut saw_body_continuation = false;
            loop {
                let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
                if frame.frame_type != FrameType::RpcResponse || frame.message_id != 61 {
                    continue;
                }
                if frame.flags & FLAG_HAS_CONTINUATION == 0 {
                    assert!(
                        frame.payload.is_empty(),
                        "derivative stream must end with an empty final frame"
                    );
                    break;
                }
                saw_body_continuation = true;
                body.extend_from_slice(&frame.payload);
            }
            assert!(
                saw_body_continuation,
                "derivative body must use continuation frames"
            );
            (meta, body)
        })
        .await
        .expect("derivative ensure stream timeout");
    assert_eq!(ensure_meta.name, "photo.webp");
    assert_eq!(ensure_meta.mime_type, "image/webp");
    assert_eq!(ensure_meta.size, 6);
    assert_eq!(ensure_body, b"cached");
    assert_eq!(
        stream_commands.lock().expect("stream commands").as_slice(),
        ["catalog:derivative:read".to_string()],
        "cache-hit ensure must not request raw catalog bytes"
    );
    assert!(
        !host_task.is_finished(),
        "a completed derivative stream must not close the host RPC loop"
    );

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

#[tokio::test]
async fn derivative_ensure_cancel_before_meta_drops_outcome_and_keeps_loop_live() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) =
        ChannelTransport::pair(TransportType::WebRtcDataChannel);
    let (reader_blocked_tx, reader_blocked_rx) = tokio::sync::oneshot::channel();
    let (reader_finished_tx, reader_finished_rx) = tokio::sync::oneshot::channel();
    let (release_reader_tx, release_reader_rx) = std::sync::mpsc::channel();
    let stream_commands = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(DerivativeEnsureLivenessAdapter {
            reader: Some(GatedDerivativeReader {
                sent_bytes: false,
                reader_blocked_tx: Some(reader_blocked_tx),
                reader_finished_tx: Some(reader_finished_tx),
                release_reader_rx: Mutex::new(release_reader_rx),
            }),
            stream_commands: stream_commands.clone(),
        })));
    let services = Arc::new(crate::commands::catalog::HostDerivativeEnsureServices::new(
        adapter.clone(),
        Arc::new(crate::image_preview::ImagePreviewRuntimeState::new()),
        Arc::new(crate::catalog_blocking_io::CatalogBlockingIoRuntimeState::new()),
        Arc::new(std::sync::atomic::AtomicU64::new(0)),
    ));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop_inner(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::WebRtcDataChannel,
        temp.path().to_path_buf(),
        "peer-derivative-ensure-cancel".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
        Some(services),
        None,
    ));

    let mut ensure_request = RpcRequest::new(
        "catalog:derivative:ensure",
        serde_json::json!({
            "node_id": 17,
            "source_version": 3,
            "tier": "preview",
            "version": crate::image_preview::DERIVATIVE_STORAGE_VERSION,
            "refresh_cache": false,
        }),
    );
    ensure_request.transport_features = Some(vec![
        chromvoid_core::rpc::types::CORE_FEATURE_REMOTE_STREAM_CONTROL_V1.to_string(),
    ]);
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 71,
            flags: 0,
            payload: serde_json::to_vec(&ensure_request).expect("derivative ensure request json"),
        },
    )
    .await
    .expect("send derivative ensure");

    tokio::time::timeout(std::time::Duration::from_secs(1), reader_blocked_rx)
        .await
        .expect("derivative cache reader did not block")
        .expect("derivative cache reader signal dropped");

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        crate::rpc_transport_protocol::frame_stream_cancelled(71, "catalog:derivative:ensure"),
    )
    .await
    .expect("cancel derivative ensure before metadata");
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 73,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:status", serde_json::json!({})))
                .expect("vault status request json"),
        },
    )
    .await
    .expect("send status after derivative cancel");

    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        loop {
            let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
            if frame.frame_type == FrameType::RpcResponse && frame.message_id == 71 {
                panic!("cancelled derivative ensure emitted a pre-release response");
            }
            if frame.frame_type == FrameType::RpcResponse && frame.message_id == 73 {
                let response: RpcResponse =
                    serde_json::from_slice(&frame.payload).expect("status response json");
                assert!(response.is_ok());
                break;
            }
        }
    })
    .await
    .expect("RPC loop did not stay live after derivative cancel");

    release_reader_tx
        .send(())
        .expect("release cancelled derivative cache reader");
    tokio::time::timeout(std::time::Duration::from_secs(1), reader_finished_rx)
        .await
        .expect("cancelled derivative reader did not finish")
        .expect("cancelled derivative reader finish signal dropped");

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 75,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:status", serde_json::json!({})))
                .expect("vault status request json"),
        },
    )
    .await
    .expect("send status after cancelled derivative job released");

    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        loop {
            let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
            if frame.frame_type == FrameType::RpcResponse && frame.message_id == 71 {
                panic!("cancelled derivative ensure emitted a late response");
            }
            if frame.frame_type == FrameType::RpcResponse && frame.message_id == 75 {
                let response: RpcResponse =
                    serde_json::from_slice(&frame.payload).expect("status response json");
                assert!(response.is_ok());
                break;
            }
        }
    })
    .await
    .expect("RPC loop did not remain live after cancelled job release");

    tokio::time::timeout(
        std::time::Duration::from_millis(100),
        recv_test_frame(&mut client_transport, &mut client_noise),
    )
    .await
    .expect_err("cancelled derivative ensure must not emit response metadata or an error");
    assert_eq!(
        stream_commands.lock().expect("stream commands").as_slice(),
        ["catalog:derivative:read".to_string()],
        "cancelled cache-hit ensure must not request raw catalog bytes"
    );
    assert!(
        !host_task.is_finished(),
        "cancelling one derivative request must not close the host RPC loop"
    );

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

struct GatedDerivativeReader {
    sent_bytes: bool,
    reader_blocked_tx: Option<tokio::sync::oneshot::Sender<()>>,
    reader_finished_tx: Option<tokio::sync::oneshot::Sender<()>>,
    release_reader_rx: Mutex<std::sync::mpsc::Receiver<()>>,
}

impl std::io::Read for GatedDerivativeReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if !self.sent_bytes {
            self.sent_bytes = true;
            let derivative = b"cached";
            buf[..derivative.len()].copy_from_slice(derivative);
            return Ok(derivative.len());
        }
        if let Some(reader_blocked_tx) = self.reader_blocked_tx.take() {
            let _ = reader_blocked_tx.send(());
        }
        let _ = self
            .release_reader_rx
            .lock()
            .expect("derivative source release receiver")
            .recv();
        if let Some(reader_finished_tx) = self.reader_finished_tx.take() {
            let _ = reader_finished_tx.send(());
        }
        Ok(0)
    }
}

struct DerivativeEnsureLivenessAdapter {
    reader: Option<GatedDerivativeReader>,
    stream_commands: Arc<Mutex<Vec<String>>>,
}

impl CoreAdapter for DerivativeEnsureLivenessAdapter {
    fn mode(&self) -> crate::core_adapter::CoreMode {
        crate::core_adapter::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        match req.command.as_str() {
            "catalog:source:metadata" => RpcResponse::success(serde_json::json!({
                "node_id": 17,
                "node_type": 1,
                "name": "photo.png",
                "mime_type": "image/png",
                "size": 3,
                "source_revision": 3,
                "source_revision_initialized": false,
            })),
            "vault:status" => RpcResponse::success(serde_json::json!({
                "is_unlocked": true,
                "session_started_at": 1,
            })),
            _ => RpcResponse::success(serde_json::Value::Null),
        }
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        _stream: Option<RpcInputStream>,
    ) -> RpcReply {
        self.stream_commands
            .lock()
            .expect("stream commands")
            .push(req.command.clone());
        match req.command.as_str() {
            "catalog:derivative:read" => RpcReply::Stream(chromvoid_core::rpc::RpcOutputStream {
                meta: RpcStreamMeta {
                    name: "photo.webp".to_string(),
                    mime_type: "image/webp".to_string(),
                    size: 6,
                    chunk_size: 3,
                },
                reader: Box::new(self.reader.take().expect("single derivative read")),
            }),
            other => RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: format!("unexpected stream command: {other}"),
                code: Some("INTERNAL".to_string()),
            }),
        }
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn take_events(&mut self) -> Vec<serde_json::Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}
