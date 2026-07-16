use super::support::*;
use super::*;

#[tokio::test]
async fn remote_peer_cannot_forward_env_runtime_rpc_to_host_core() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) =
        ChannelTransport::pair(TransportType::WebRtcDataChannel);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(UploadInterleaveAdapter {
            commands: commands.clone(),
            streamed_bodies: Arc::new(Mutex::new(Vec::new())),
        })));
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::WebRtcDataChannel,
        temp.path().to_path_buf(),
        "peer-env-runtime-boundary".to_string(),
        shutdown_rx,
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 41,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new(
                "env_runtime:secret:reveal",
                serde_json::json!({
                    "id": "secret-1",
                    "master_password": "must-not-reach-core"
                }),
            ))
            .expect("request json"),
        },
    )
    .await
    .expect("send request");

    let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(frame.message_id, 41);
    let response: RpcResponse = serde_json::from_slice(&frame.payload).expect("response json");
    assert!(matches!(
        response,
        RpcResponse::Error {
            code: Some(ref code),
            ..
        } if code == "REMOTE_CORE_UNSUPPORTED"
    ));
    assert!(
        !commands
            .lock()
            .expect("commands")
            .iter()
            .any(|command| command.starts_with("env_runtime:")),
        "local Core adapter must never observe remote Env Runtime RPC"
    );

    let _ = shutdown_tx.send(());
    host_task.await.expect("host task").expect("clean shutdown");
}
