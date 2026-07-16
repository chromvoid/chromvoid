use super::support::{noise_pair, RecordingIdleTransport};
use super::*;

#[tokio::test]
async fn vault_lock_sends_authenticated_host_locked_push_before_shutdown() {
    let (host_noise, peer_noise) = noise_pair();
    let sent_frames = Arc::new(Mutex::new(Vec::new()));
    let transport = RecordingIdleTransport::new(peer_noise, sent_frames.clone());
    let shutdown_source = Arc::new(Mutex::new(Some(
        crate::network::mobile_acceptor::direct_transport::HostRpcShutdownSource::ExternalStop(
            crate::network::mobile_acceptor::DirectTransportStopReason::VaultLocked,
        ),
    )));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");

    let host_task = tokio::spawn(run_host_rpc_loop_with_shutdown_source(
        None,
        Box::new(transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-host-lock-test".to_string(),
        shutdown_rx,
        None,
        shutdown_source,
    ));

    shutdown_tx.send(()).expect("send shutdown");
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");

    let frames = sent_frames.lock().expect("sent frames");
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0].frame_type, FrameType::RpcRequest);
    let push: RpcRequest =
        serde_json::from_slice(&frames[0].payload).expect("host lock push request");
    assert_eq!(push.command, "mobile_usb:host_locked");
}
