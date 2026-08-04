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

#[tokio::test]
async fn private_derivative_ensure_validation_errors_keep_rpc_loop_live() {
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
        "peer-derivative-ensure-boundary".to_string(),
        shutdown_rx,
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 51,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new(
                "catalog:derivative:ensure",
                serde_json::json!({
                    "source_version": 3,
                    "tier": "preview",
                    "version": crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                }),
            ))
            .expect("malformed derivative ensure request json"),
        },
    )
    .await
    .expect("send malformed derivative ensure");

    let malformed_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(malformed_frame.message_id, 51);
    assert_eq!(malformed_frame.frame_type, FrameType::RpcResponse);
    let malformed_response: RpcResponse =
        serde_json::from_slice(&malformed_frame.payload).expect("malformed ensure response json");
    assert!(matches!(
        malformed_response,
        RpcResponse::Error {
            code: Some(ref code),
            ref error,
            ..
        } if code == "EMPTY_PAYLOAD" && error.contains("node_id")
    ));
    assert!(
        commands.lock().expect("commands").is_empty(),
        "private ensure validation must not dispatch to the generic adapter"
    );

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 53,
            flags: FLAG_HAS_CONTINUATION,
            payload: serde_json::to_vec(&RpcRequest::new(
                "catalog:derivative:ensure",
                serde_json::json!({
                    "node_id": 17,
                    "source_version": 3,
                    "tier": "thumbnail",
                    "version": crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                }),
            ))
            .expect("streamed derivative ensure request json"),
        },
    )
    .await
    .expect("send streamed derivative ensure");

    let streamed_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(streamed_frame.message_id, 53);
    assert_eq!(streamed_frame.frame_type, FrameType::RpcResponse);
    let streamed_response: RpcResponse =
        serde_json::from_slice(&streamed_frame.payload).expect("streamed ensure response json");
    assert!(matches!(
        streamed_response,
        RpcResponse::Error {
            code: Some(ref code),
            ..
        } if code == "STREAM_UNEXPECTED"
    ));
    assert!(
        commands.lock().expect("commands").is_empty(),
        "streamed private ensure must not fall through to the generic download dispatcher"
    );

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 55,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new(
                "catalog:derivative:ensure",
                serde_json::json!({
                    "node_id": 17,
                    "source_version": 3,
                    "tier": "thumbnail",
                    "version": crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                    "refresh_cache": true,
                }),
            ))
            .expect("valid derivative ensure request json"),
        },
    )
    .await
    .expect("send derivative ensure without host services");

    let unavailable_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(unavailable_frame.message_id, 55);
    assert_eq!(unavailable_frame.frame_type, FrameType::RpcResponse);
    let unavailable_response: RpcResponse =
        serde_json::from_slice(&unavailable_frame.payload).expect("unavailable response json");
    assert!(matches!(
        unavailable_response,
        RpcResponse::Error {
            code: Some(ref code),
            ..
        } if code == "REMOTE_CORE_UNSUPPORTED"
    ));
    assert!(
        commands.lock().expect("commands").is_empty(),
        "private ensure execution must not fall through to the generic adapter"
    );

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 57,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:status", serde_json::json!({})))
                .expect("vault status request json"),
        },
    )
    .await
    .expect("send status after ensure errors");

    let status_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(status_frame.message_id, 57);
    assert_eq!(status_frame.frame_type, FrameType::RpcResponse);
    let status_response: RpcResponse =
        serde_json::from_slice(&status_frame.payload).expect("status response json");
    assert!(status_response.is_ok());
    assert_eq!(
        commands.lock().expect("commands").as_slice(),
        ["vault:status".to_string()]
    );

    let _ = shutdown_tx.send(());
    host_task.await.expect("host task").expect("clean shutdown");
}
