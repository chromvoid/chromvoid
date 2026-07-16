use super::support::*;
use super::*;

#[tokio::test]
async fn unmatched_error_frame_disconnects_data_plane() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::UnmatchedStreamError);
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        mut evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, _reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("vault:status", serde_json::json!({})),
            stream: None,
            reply_tx,
            priority: RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await
        .expect("request queued");

    let event = tokio::time::timeout(Duration::from_secs(1), evt_rx.recv())
        .await
        .expect("disconnect event timeout")
        .expect("disconnect event");
    let crate::remote_data_plane::RemoteIoEvent::Disconnected { reason, failure } = event else {
        panic!("expected disconnect event");
    };
    assert!(reason.contains("peer sent error frame message_id="));
    assert!(matches!(
        failure,
        crate::remote_data_plane::RemoteIoFailure::ProtocolError { .. }
    ));

    task_handle.abort();
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
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
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
async fn remote_lock_success_stops_data_plane_and_emits_disconnect() {
    let (client_noise, host_noise) = noise_pair();
    let transport = ScriptedTransport::new(host_noise, Script::LockSuccess);
    let crate::remote_data_plane::RemoteIoTaskHandle {
        req_tx,
        mut evt_rx,
        task_handle,
    } = crate::remote_data_plane::spawn_remote_io_task(
        crate::remote_data_plane::RemoteIoTaskConfig {
            transport: Box::new(transport),
            noise_transport: client_noise,
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let (reply_tx, reply_rx) = oneshot::channel();
    req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request: RpcRequest::new("vault:lock", serde_json::json!({})),
            stream: None,
            reply_tx,
            priority: RemoteRpcPriority::High,
            cancel_group: None,
        })
        .await
        .expect("lock request queued");

    let reply = tokio::time::timeout(Duration::from_secs(1), reply_rx)
        .await
        .expect("lock reply timeout")
        .expect("lock reply channel");
    let RpcReply::Json(response) = reply else {
        panic!("expected json reply");
    };
    assert!(response.is_ok());

    let event = tokio::time::timeout(Duration::from_secs(1), evt_rx.recv())
        .await
        .expect("disconnect timeout")
        .expect("event channel");
    task_handle.abort();

    let crate::remote_data_plane::RemoteIoEvent::Disconnected { reason, failure } = event else {
        panic!("expected disconnect event");
    };
    assert!(reason.contains("remote vault lock requested disconnect"));
    assert!(matches!(
        failure,
        crate::remote_data_plane::RemoteIoFailure::DataPlaneError { .. }
    ));
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
            peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
        },
    );

    let event = tokio::time::timeout(Duration::from_secs(1), evt_rx.recv())
        .await
        .expect("disconnect timeout")
        .expect("event channel");
    task_handle.abort();

    let crate::remote_data_plane::RemoteIoEvent::Disconnected { reason, failure } = event else {
        panic!("expected disconnect event");
    };
    assert!(reason.contains("transport closed"));
    assert_eq!(
        failure,
        crate::remote_data_plane::RemoteIoFailure::TransportClosed
    );
}
