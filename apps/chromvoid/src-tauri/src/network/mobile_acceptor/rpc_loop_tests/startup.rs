use super::support::*;
use super::*;

#[tokio::test]
async fn usb_host_rpc_loop_enters_recv_before_adapter_load() {
    let (client_noise, host_noise) = noise_pair();
    let (recv_started_tx, recv_started_rx) = tokio::sync::oneshot::channel();
    let transport = RecvSignalTransport::new(client_noise, recv_started_tx);
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let broken_storage_root = temp.path().join("not-a-directory");
    std::fs::write(&broken_storage_root, b"file").expect("broken storage marker");
    let task = tokio::spawn(run_host_rpc_loop(
        None,
        Box::new(transport),
        host_noise,
        TransportType::UsbMobile,
        broken_storage_root,
        "peer-usb-lazy-adapter-test".to_string(),
        shutdown_rx,
        None,
    ));

    tokio::time::timeout(std::time::Duration::from_secs(1), recv_started_rx)
        .await
        .expect("USB host loop should enter recv before adapter load")
        .expect("recv signal should be delivered");
    task.abort();
}
