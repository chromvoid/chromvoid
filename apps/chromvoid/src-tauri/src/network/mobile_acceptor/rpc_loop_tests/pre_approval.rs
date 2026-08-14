use super::support::*;
use super::*;
use std::sync::atomic::{AtomicBool, Ordering};

struct LockingSessionApprovalAdapter {
    commands: Arc<Mutex<Vec<String>>>,
    unlocked: Arc<AtomicBool>,
}

impl CoreAdapter for LockingSessionApprovalAdapter {
    fn mode(&self) -> crate::core_adapter::CoreMode {
        crate::core_adapter::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        self.unlocked.load(Ordering::SeqCst)
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.commands.lock().unwrap().push(req.command.clone());
        match req.command.as_str() {
            "vault:status" => RpcResponse::success(serde_json::json!({
                "is_unlocked": self.unlocked.load(Ordering::SeqCst),
                "session_started_at": 1,
            })),
            "vault:unlock" => {
                self.unlocked.store(true, Ordering::SeqCst);
                RpcResponse::success(serde_json::json!({"is_unlocked": true}))
            }
            _ => RpcResponse::success(serde_json::Value::Null),
        }
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        _stream: Option<RpcInputStream>,
    ) -> RpcReply {
        RpcReply::Json(self.handle(req))
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn take_events(&mut self) -> Vec<serde_json::Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}

#[tokio::test]
async fn expired_usb_session_approval_notifies_client_before_transport_close() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let attempt_id = "test-expired-session-approval".to_string();
    runtime
        .register_usb_session_approval(crate::mobile_usb::MobileUsbHostSessionApprovalView {
            attempt_id: attempt_id.clone(),
            peer_id: "peer-usb-expired-approval-test".to_string(),
            peer_label: "USB expired peer".to_string(),
            transport_type: "usb_mobile".to_string(),
            decision: crate::mobile_usb::MobileUsbHostApprovalDecision::Pending,
            expires_at_ms: 0,
        })
        .expect("register expired session approval");
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop(
        None,
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-expired-approval-test".to_string(),
        shutdown_rx,
        Some(UsbHostSessionApproval {
            runtime: runtime.clone(),
            attempt_id: attempt_id.clone(),
        }),
    ));

    let push_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(push_frame.frame_type, FrameType::RpcRequest);
    let push: RpcRequest = serde_json::from_slice(&push_frame.payload).expect("expiry push json");
    assert_eq!(push.command, "mobile_usb:session_approval_expired");

    let error = tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop timeout")
        .expect("host loop join")
        .expect_err("expired approval closes host loop");
    assert!(error.to_string().contains("USB session approval expired"));
    assert!(runtime
        .pending_usb_session_approval()
        .expect("pending session approval")
        .is_none());
    runtime
        .approve_usb_session(&attempt_id)
        .expect("late approval after host cleanup is idempotent");
}

#[tokio::test]
async fn usb_pre_approval_rejects_derivative_ensure_without_closing_loop() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let streamed_bodies = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(UploadInterleaveAdapter {
            commands: commands.clone(),
            streamed_bodies,
        })));
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let attempt_id = "test-session-approval".to_string();
    runtime
        .register_usb_session_approval(crate::mobile_usb::MobileUsbHostSessionApprovalView {
            attempt_id: attempt_id.clone(),
            peer_id: "peer-usb-pre-approval-test".to_string(),
            peer_label: "USB test peer".to_string(),
            transport_type: "usb_mobile".to_string(),
            decision: crate::mobile_usb::MobileUsbHostApprovalDecision::Pending,
            expires_at_ms: u64::MAX,
        })
        .expect("register pending session approval");
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-pre-approval-test".to_string(),
        shutdown_rx,
        Some(UsbHostSessionApproval {
            runtime: runtime.clone(),
            attempt_id: attempt_id.clone(),
        }),
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 7,
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
    .expect("send forbidden request");

    let rejected_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(rejected_frame.message_id, 7);
    assert_eq!(rejected_frame.frame_type, FrameType::RpcResponse);
    let rejected: RpcResponse =
        serde_json::from_slice(&rejected_frame.payload).expect("rejected response json");
    assert!(matches!(
        rejected,
        RpcResponse::Error {
            code: Some(ref code),
            ..
        } if code == "ERR_USB_MOBILE_SESSION_APPROVAL_REQUIRED"
    ));
    assert!(commands.lock().unwrap().is_empty());

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 9,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new("vault:status", serde_json::json!({})))
                .expect("vault status request json"),
        },
    )
    .await
    .expect("send allowed request");

    let status_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(status_frame.message_id, 9);
    assert_eq!(status_frame.frame_type, FrameType::RpcResponse);
    let status: RpcResponse =
        serde_json::from_slice(&status_frame.payload).expect("status response json");
    assert!(status.is_ok());
    assert_eq!(
        commands.lock().unwrap().as_slice(),
        ["vault:status".to_string()]
    );

    let _ = shutdown_tx.send(());
    runtime
        .reject_usb_session(&attempt_id)
        .expect("reject pending session approval");
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

#[tokio::test]
async fn usb_session_approval_while_locked_waits_for_unlock_confirmation() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let unlocked = Arc::new(AtomicBool::new(false));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(LockingSessionApprovalAdapter {
            commands: commands.clone(),
            unlocked: unlocked.clone(),
        })));
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let attempt_id = "test-locked-session-approval".to_string();
    runtime
        .register_usb_session_approval(crate::mobile_usb::MobileUsbHostSessionApprovalView {
            attempt_id: attempt_id.clone(),
            peer_id: "peer-usb-locked-approval-test".to_string(),
            peer_label: "USB locked peer".to_string(),
            transport_type: "usb_mobile".to_string(),
            decision: crate::mobile_usb::MobileUsbHostApprovalDecision::Pending,
            expires_at_ms: u64::MAX,
        })
        .expect("register pending session approval");
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-locked-approval-test".to_string(),
        shutdown_rx,
        Some(UsbHostSessionApproval {
            runtime: runtime.clone(),
            attempt_id: attempt_id.clone(),
        }),
    ));

    runtime
        .approve_usb_session(&attempt_id)
        .expect("approve pending session approval");
    tokio::time::timeout(
        std::time::Duration::from_millis(100),
        client_transport.recv(),
    )
    .await
    .expect_err("locked host should not send unlock confirmation before vault unlock");
    assert_eq!(
        commands.lock().unwrap().as_slice(),
        ["vault:status".to_string()]
    );

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 11,
            flags: 0,
            payload: serde_json::to_vec(&RpcRequest::new(
                "vault:unlock",
                serde_json::json!({"password": "test"}),
            ))
            .expect("vault unlock request json"),
        },
    )
    .await
    .expect("send vault unlock");

    let unlock_response_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(unlock_response_frame.message_id, 11);
    assert_eq!(unlock_response_frame.frame_type, FrameType::RpcResponse);
    let unlock_response: RpcResponse =
        serde_json::from_slice(&unlock_response_frame.payload).expect("unlock response json");
    assert!(unlock_response.is_ok());

    let push_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(push_frame.frame_type, FrameType::RpcRequest);
    let push: RpcRequest = serde_json::from_slice(&push_frame.payload).expect("push request json");
    assert_eq!(push.command, "mobile_usb:host_unlock_confirmed");
    assert_eq!(
        commands.lock().unwrap().as_slice(),
        ["vault:status".to_string(), "vault:unlock".to_string()]
    );
    assert!(unlocked.load(Ordering::SeqCst));

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

#[tokio::test]
async fn usb_session_approval_while_locked_confirms_local_vault_unlock() {
    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let commands = Arc::new(Mutex::new(Vec::new()));
    let unlocked = Arc::new(AtomicBool::new(false));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(LockingSessionApprovalAdapter {
            commands: commands.clone(),
            unlocked: unlocked.clone(),
        })));
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let attempt_id = "test-local-unlock-session-approval".to_string();
    runtime
        .register_usb_session_approval(crate::mobile_usb::MobileUsbHostSessionApprovalView {
            attempt_id: attempt_id.clone(),
            peer_id: "peer-usb-local-unlock-test".to_string(),
            peer_label: "USB local unlock test peer".to_string(),
            transport_type: "usb_mobile".to_string(),
            decision: crate::mobile_usb::MobileUsbHostApprovalDecision::Pending,
            expires_at_ms: u64::MAX,
        })
        .expect("register pending session approval");
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let temp = tempfile::tempdir().expect("tempdir");
    let host_task = tokio::spawn(run_host_rpc_loop(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::UsbMobile,
        temp.path().to_path_buf(),
        "peer-usb-local-unlock-test".to_string(),
        shutdown_rx,
        Some(UsbHostSessionApproval {
            runtime: runtime.clone(),
            attempt_id: attempt_id.clone(),
        }),
    ));

    runtime
        .approve_usb_session(&attempt_id)
        .expect("approve pending session approval");
    tokio::time::timeout(
        std::time::Duration::from_millis(100),
        client_transport.recv(),
    )
    .await
    .expect_err("locked host should wait for the local vault unlock");

    unlocked.store(true, Ordering::SeqCst);
    runtime.notify_vault_unlocked();

    let push_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(push_frame.frame_type, FrameType::RpcRequest);
    let push: RpcRequest = serde_json::from_slice(&push_frame.payload).expect("push request json");
    assert_eq!(push.command, "mobile_usb:host_unlock_confirmed");
    assert_eq!(
        commands.lock().unwrap().as_slice(),
        ["vault:status".to_string(), "vault:status".to_string()]
    );

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(1), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}
