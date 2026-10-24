use super::support::*;
use super::*;

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
async fn remote_io_task_does_not_send_heartbeat_immediately_after_start() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport =
        ScriptedTransport::with_sent_frames(host_noise, Script::Idle, sent_frames.clone());
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx: _req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    tokio::time::sleep(Duration::from_millis(50)).await;
    task_handle.abort();

    assert!(
        sent_frames.lock().unwrap().is_empty(),
        "heartbeat must not be the first post-handshake write"
    );
}

#[tokio::test]
async fn remote_io_task_sends_periodic_heartbeat_for_network_transport() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport =
        ScriptedTransport::with_sent_frames(host_noise, Script::Idle, sent_frames.clone());
    let (req_tx, mut req_rx) = mpsc::channel::<RemoteIoRequest>(1);
    let (evt_tx, _evt_rx) = mpsc::channel::<RemoteIoEvent>(1);
    drop(req_tx);
    let task = tokio::spawn(async move {
        io_loop_with_heartbeat_interval(
            RemoteIoTaskConfig {
                transport: Box::new(transport),
                noise_transport: client_noise,
                peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
            },
            &mut req_rx,
            &evt_tx,
            Duration::from_millis(10),
        )
        .await
    });

    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if sent_frames
                .lock()
                .unwrap()
                .iter()
                .any(|frame| frame.frame_type == FrameType::Heartbeat)
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("network heartbeat timeout");
    task.abort();
}

#[tokio::test]
async fn remote_io_task_suppresses_periodic_heartbeat_for_usb_mobile() {
    let (client_noise, host_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = ScriptedTransport::with_transport_type(
        host_noise,
        Script::Idle,
        sent_frames.clone(),
        TransportType::UsbMobile,
    );
    let (req_tx, mut req_rx) = mpsc::channel::<RemoteIoRequest>(1);
    let (evt_tx, _evt_rx) = mpsc::channel::<RemoteIoEvent>(1);
    drop(req_tx);
    let task = tokio::spawn(async move {
        io_loop_with_heartbeat_interval(
            RemoteIoTaskConfig {
                transport: Box::new(transport),
                noise_transport: client_noise,
                peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
            },
            &mut req_rx,
            &evt_tx,
            Duration::from_millis(10),
        )
        .await
    });

    tokio::time::sleep(Duration::from_millis(50)).await;
    task.abort();

    assert!(
        sent_frames.lock().unwrap().is_empty(),
        "USB Mobile desktop side must not send idle heartbeats over AOA"
    );
}

#[tokio::test]
async fn silent_network_peer_times_out_even_when_relay_accepts_heartbeats() {
    let (client_noise, host_noise) = noise_pair();
    let sent = Arc::new(Mutex::new(Vec::new()));
    let transport = ScriptedTransport::with_sent_frames(host_noise, Script::Idle, sent.clone());
    let (req_tx, mut req_rx) = mpsc::channel(1);
    let (evt_tx, _evt_rx) = mpsc::channel(1);
    let result = tokio::time::timeout(
        Duration::from_secs(2),
        io_loop_with_timing(
            RemoteIoTaskConfig::new(Box::new(transport), client_noise),
            &mut req_rx,
            &evt_tx,
            RemoteIoTaskTiming {
                heartbeat_interval: Duration::from_millis(20),
                response_timeout: Duration::from_millis(100),
                timeout_scan_interval: Duration::from_millis(5),
            },
        ),
    )
    .await
    .expect("silent peer must be disconnected");
    assert!(matches!(result, Err(RemoteIoFailure::TransportTimeout)));
    assert!(sent
        .lock()
        .unwrap()
        .iter()
        .any(|frame| frame.frame_type == FrameType::Heartbeat));
    drop(req_tx);
}

#[tokio::test]
async fn inbound_rpc_responses_keep_network_peer_alive_without_heartbeat_replies() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::EchoJson);
    let mut io = crate::remote_data_plane::spawn_remote_io_task_with_timing(
        RemoteIoTaskConfig::new(Box::new(transport), client_noise),
        RemoteIoTaskTiming {
            heartbeat_interval: Duration::from_millis(20),
            response_timeout: Duration::from_millis(200),
            timeout_scan_interval: Duration::from_millis(5),
        },
    );
    for _ in 0..4 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        let (reply_tx, reply_rx) = oneshot::channel();
        io.req_tx
            .send(RemoteIoRequest {
                request: RpcRequest::new("vault:status", serde_json::json!({})),
                stream: None,
                reply_tx,
                priority: RemoteRpcPriority::Normal,
                cancel_group: None,
            })
            .await
            .unwrap();
        let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(reply, RpcReply::Json(RpcResponse::Success { .. })));
        assert!(!io.task_handle.is_finished());
    }
    let event = tokio::time::timeout(Duration::from_secs(2), io.evt_rx.recv())
        .await
        .unwrap();
    assert!(matches!(
        event,
        Some(RemoteIoEvent::Disconnected {
            failure: RemoteIoFailure::TransportTimeout,
            ..
        })
    ));
    io.task_handle.await.unwrap();
}

#[tokio::test]
async fn idle_usb_peer_is_not_subject_to_network_liveness_deadline() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::with_transport_type(
        host_noise,
        Script::Idle,
        Arc::new(Mutex::new(Vec::new())),
        TransportType::UsbMobile,
    );
    let (req_tx, mut req_rx) = mpsc::channel(1);
    let (evt_tx, _evt_rx) = mpsc::channel(1);
    let result = tokio::time::timeout(
        Duration::from_millis(200),
        io_loop_with_timing(
            RemoteIoTaskConfig::new(Box::new(transport), client_noise),
            &mut req_rx,
            &evt_tx,
            RemoteIoTaskTiming {
                heartbeat_interval: Duration::from_millis(10),
                response_timeout: Duration::from_millis(20),
                timeout_scan_interval: Duration::from_millis(5),
            },
        ),
    )
    .await;
    assert!(
        result.is_err(),
        "USB keeps its existing event-driven disconnect policy"
    );
    drop(req_tx);
}
