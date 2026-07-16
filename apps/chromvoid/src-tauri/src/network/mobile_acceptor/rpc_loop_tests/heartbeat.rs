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
