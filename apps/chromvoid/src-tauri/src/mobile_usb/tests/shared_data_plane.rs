use super::support::*;
use super::*;

#[tokio::test]
async fn mobile_usb_remote_transport_runs_rpc_through_shared_data_plane() {
    let client_keys = noise_keypair();
    let host_keys = noise_keypair();
    let (client, host) = duplex(4096);
    spawn_xx_rpc_responder(host, host_keys.private.clone());

    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let (transport, noise_transport, peer_pubkey) =
        crate::remote_data_plane::handshake_xx_over_transport(
            Box::new(transport) as Box<dyn RemoteTransport>,
            &client_keys.private,
        )
        .await
        .expect("XX over mobile USB transport");
    assert_eq!(peer_pubkey, host_keys.public);

    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport,
            noise_transport,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:echo", serde_json::json!({"value": 7})),
            stream: None,
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("request queued");

    let reply = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("reply timeout")
        .expect("reply channel");
    task_handle.abort();

    let RpcReply::Json(response) = reply else {
        panic!("expected json reply");
    };
    assert_eq!(response.result().unwrap()["command"], "mobile-usb:echo");
}

#[tokio::test]
async fn mobile_usb_writer_locked_write_degrades_without_transport_teardown() {
    let client_keys = noise_keypair();
    let host_keys = noise_keypair();
    let (client, host) = duplex(4096);
    spawn_xx_writer_locked_responder(host, host_keys.private.clone());

    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let (transport, noise_transport, _peer_pubkey) =
        crate::remote_data_plane::handshake_xx_over_transport(
            Box::new(transport) as Box<dyn RemoteTransport>,
            &client_keys.private,
        )
        .await
        .expect("XX over mobile USB transport");

    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        mut evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport,
            noise_transport,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:sync-write", serde_json::json!({"value": 1})),
            stream: None,
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("write request queued");

    let reply = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("write reply timeout")
        .expect("write reply channel");
    let RpcReply::Json(response) = reply else {
        panic!("expected json reply for writer locked write");
    };
    assert!(!response.is_ok());
    assert_eq!(response.code(), Some("WRITER_LOCKED"));

    let idle = tokio::time::timeout(std::time::Duration::from_millis(200), evt_rx.recv()).await;
    assert!(
        idle.is_err(),
        "writer lock must not emit a data plane disconnect"
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:read", serde_json::json!({})),
            stream: None,
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("read request queued");

    let reply = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("read reply timeout")
        .expect("read reply channel");
    let RpcReply::Json(response) = reply else {
        panic!("expected json reply for read after writer lock");
    };
    assert_eq!(response.result().unwrap()["command"], "mobile-usb:read");

    let idle = tokio::time::timeout(std::time::Duration::from_millis(200), evt_rx.recv()).await;
    assert!(
        idle.is_err(),
        "transport must stay alive after writer locked write"
    );
    task_handle.abort();
}

#[tokio::test]
async fn mobile_usb_remote_transport_stream_upload_download_through_shared_data_plane() {
    let client_keys = noise_keypair();
    let (client, host) = duplex(4096);
    spawn_xx_stream_responder(host, noise_keypair().private);

    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let (transport, noise_transport, _peer_pubkey) =
        crate::remote_data_plane::handshake_xx_over_transport(
            Box::new(transport) as Box<dyn RemoteTransport>,
            &client_keys.private,
        )
        .await
        .expect("XX over mobile USB transport");

    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        evt_rx: _evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport,
            noise_transport,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:stream", serde_json::json!({})),
            stream: Some(RpcInputStream::from_bytes(vec![1, 2, 3, 4])),
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("stream request queued");

    let reply = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("stream reply timeout")
        .expect("stream reply channel");
    task_handle.abort();

    let RpcReply::Stream(mut output) = reply else {
        panic!("expected stream reply");
    };
    assert_eq!(output.meta.size, 5);
    let mut body = Vec::new();
    output.reader.read_to_end(&mut body).expect("read stream");
    assert_eq!(body, b"hello");
}

#[tokio::test]
async fn mobile_usb_remote_transport_forwards_host_push_through_shared_data_plane() {
    let client_keys = noise_keypair();
    let (client, host) = duplex(4096);
    spawn_xx_push_responder(host, noise_keypair().private);

    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let (transport, noise_transport, _peer_pubkey) =
        crate::remote_data_plane::handshake_xx_over_transport(
            Box::new(transport) as Box<dyn RemoteTransport>,
            &client_keys.private,
        )
        .await
        .expect("XX over mobile USB transport");

    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        mut evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport,
            noise_transport,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("mobile-usb:push", serde_json::json!({})),
            stream: None,
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("request queued");

    let event = tokio::time::timeout(std::time::Duration::from_secs(1), evt_rx.recv())
        .await
        .expect("push timeout")
        .expect("push event");
    let crate::remote_data_plane::RemoteIoEvent::Frame(frame) = event else {
        panic!("expected host push frame");
    };
    let pushed: RpcRequest = serde_json::from_slice(&frame.payload).expect("push payload");
    assert_eq!(pushed.command, "mobile-usb:host-push");

    let _ = tokio::time::timeout(std::time::Duration::from_secs(1), reply_rx)
        .await
        .expect("reply timeout")
        .expect("reply channel");
    task_handle.abort();
}

#[tokio::test]
async fn mobile_usb_remote_transport_carries_heartbeat_frame() {
    let (mut client_noise, mut host_noise) = noise_transport_pair();
    let (client, host) = duplex(4096);
    let mut client_transport =
        MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let mut host_transport = MobileUsbRemoteTransport::new(host, MobileUsbBridgeKind::AndroidAoa);

    crate::remote_data_plane::send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        chromvoid_protocol::frame_from_heartbeat(41, chromvoid_core::rpc::types::PROTOCOL_VERSION),
    )
    .await
    .expect("send heartbeat over USB transport");

    let frame =
        crate::remote_data_plane::recv_decrypted_frame(&mut host_transport, &mut host_noise)
            .await
            .expect("recv heartbeat over USB transport");

    assert_eq!(frame.frame_type, FrameType::Heartbeat);
    assert_eq!(frame.message_id, 41);
}

#[tokio::test]
async fn mobile_usb_closed_transport_emits_data_plane_disconnect() {
    let (client_noise, _host_noise) = noise_transport_pair();
    let (client, host) = duplex(64);
    drop(host);
    let transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx: _req_tx,
        mut evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let event = tokio::time::timeout(std::time::Duration::from_secs(1), evt_rx.recv())
        .await
        .expect("disconnect timeout")
        .expect("disconnect event");
    task_handle.abort();

    let crate::remote_data_plane::RemoteIoEvent::Disconnected { reason, .. } = event else {
        panic!("expected disconnect event");
    };
    assert!(reason.contains("transport closed"));
}
