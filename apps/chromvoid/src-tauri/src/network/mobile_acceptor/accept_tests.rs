use super::*;
use crate::mobile_usb::pairing_protocol::{
    pairing_approval_proof_hex, recv_pairing_approval_ack, recv_pairing_approval_challenge,
    send_pairing_approval_proof, MobileUsbPairingApprovalProof,
};
use crate::network::{LocalDeviceIdentity, PairedPeer};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
use chromvoid_protocol::{
    Frame, FrameType, NoiseTransport, TransportError, NOISE_PARAMS_IK, NOISE_PARAMS_XX,
};
use snow::params::NoiseParams;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;

struct PendingTransport;

struct RecordingAdapter {
    commands: Arc<Mutex<Vec<String>>>,
    unlocked: Arc<AtomicBool>,
}

impl CoreAdapter for RecordingAdapter {
    fn mode(&self) -> crate::core_adapter::CoreMode {
        crate::core_adapter::CoreMode::Local
    }

    fn connection_state(&self) -> crate::core_adapter::ConnectionState {
        crate::core_adapter::ConnectionState::Ready
    }

    fn is_unlocked(&self) -> bool {
        self.unlocked.load(Ordering::SeqCst)
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.commands
            .lock()
            .expect("commands")
            .push(req.command.clone());
        match req.command.as_str() {
            "core:capabilities" => RpcResponse::success(serde_json::json!({
                "features": [],
                "protocol_version": 1,
            })),
            "vault:status" => RpcResponse::success(serde_json::json!({
                "is_unlocked": self.is_unlocked(),
                "session_started_at": 1,
            })),
            "vault:lock" => {
                self.unlocked.store(false, Ordering::SeqCst);
                RpcResponse::success(serde_json::Value::Null)
            }
            _ => RpcResponse::success(serde_json::Value::Null),
        }
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        _stream: Option<chromvoid_core::rpc::RpcInputStream>,
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

#[async_trait::async_trait]
impl RemoteTransport for PendingTransport {
    async fn send(&mut self, _data: &[u8]) -> Result<(), chromvoid_protocol::TransportError> {
        Ok(())
    }

    async fn recv(&mut self) -> Result<Vec<u8>, chromvoid_protocol::TransportError> {
        std::future::pending().await
    }

    async fn close(&mut self) -> Result<(), chromvoid_protocol::TransportError> {
        Ok(())
    }

    fn transport_type(&self) -> TransportType {
        TransportType::WssRelay
    }
}

struct ChannelTransport {
    incoming: mpsc::UnboundedReceiver<Vec<u8>>,
    outgoing: mpsc::UnboundedSender<Vec<u8>>,
    transport_type: TransportType,
}

impl ChannelTransport {
    fn pair(transport_type: TransportType) -> (Self, Self) {
        let (left_tx, left_rx) = mpsc::unbounded_channel();
        let (right_tx, right_rx) = mpsc::unbounded_channel();
        (
            Self {
                incoming: left_rx,
                outgoing: right_tx,
                transport_type,
            },
            Self {
                incoming: right_rx,
                outgoing: left_tx,
                transport_type,
            },
        )
    }
}

#[async_trait::async_trait]
impl RemoteTransport for ChannelTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.outgoing
            .send(data.to_vec())
            .map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.incoming.recv().await.ok_or(TransportError::Closed)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.incoming.close();
        Ok(())
    }

    fn transport_type(&self) -> TransportType {
        self.transport_type
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn paired_ik_store(storage_root: &Path) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), String> {
    let store_path = storage_root.join("paired_network_peers.json");
    let params: NoiseParams = NOISE_PARAMS_IK
        .parse()
        .map_err(|error: snow::Error| error.to_string())?;
    let builder = snow::Builder::new(params);
    let host_keypair = builder
        .generate_keypair()
        .map_err(|error| error.to_string())?;
    let client_keypair = builder
        .generate_keypair()
        .map_err(|error| error.to_string())?;
    crate::helpers::storage::write_json_pretty_atomic(
        &storage_root.join("network_local_identity.json"),
        &LocalDeviceIdentity {
            device_id: "android-host-1".to_string(),
            device_label: "Android Host".to_string(),
            static_pubkey_hex: hex_encode(&host_keypair.public),
            static_privkey_hex: hex_encode(&host_keypair.private),
            created_at: 1,
        },
    )?;
    let mut store = PairedPeerStore::load(&store_path);
    store
        .upsert(PairedPeer {
            peer_id: "desktop-usb-1".to_string(),
            label: "Desktop USB".to_string(),
            relay_url: "usb://android".to_string(),
            peer_pubkey: client_keypair.public.clone(),
            client_pubkey: host_keypair.public.clone(),
            client_privkey_hex: "00".to_string(),
            last_seen: 1,
            paired_at: 1,
            platform: "desktop".to_string(),
        })
        .expect("upsert peer");
    store.save()?;
    Ok((
        client_keypair.private,
        host_keypair.public,
        client_keypair.public,
    ))
}

async fn complete_ik_initiator_handshake(
    transport: &mut dyn RemoteTransport,
    client_private: &[u8],
    host_public: &[u8],
) -> Result<(), String> {
    let _ = complete_ik_initiator_handshake_with_transport(transport, client_private, host_public)
        .await?;
    Ok(())
}

async fn complete_ik_initiator_handshake_with_transport(
    transport: &mut dyn RemoteTransport,
    client_private: &[u8],
    host_public: &[u8],
) -> Result<NoiseTransport, String> {
    let params: NoiseParams = NOISE_PARAMS_IK
        .parse()
        .map_err(|error: snow::Error| error.to_string())?;
    let mut initiator = snow::Builder::new(params)
        .local_private_key(client_private)
        .map_err(|error| error.to_string())?
        .remote_public_key(host_public)
        .map_err(|error| error.to_string())?
        .build_initiator()
        .map_err(|error| error.to_string())?;
    let mut buf = vec![0_u8; MAX_HANDSHAKE_MSG];
    let msg1_len = initiator
        .write_message(&[], &mut buf)
        .map_err(|error| error.to_string())?;
    transport
        .send(&buf[..msg1_len])
        .await
        .map_err(|error| error.to_string())?;
    let msg2 = transport.recv().await.map_err(|error| error.to_string())?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|error| error.to_string())?;
    let transport_state = initiator
        .into_transport_mode()
        .map_err(|error| error.to_string())?;
    Ok(NoiseTransport::new(transport_state, host_public.to_vec()))
}

async fn complete_xx_initiator_handshake_with_transport(
    transport: &mut dyn RemoteTransport,
    client_private: &[u8],
) -> Result<NoiseTransport, String> {
    let params: NoiseParams = NOISE_PARAMS_XX
        .parse()
        .map_err(|error: snow::Error| error.to_string())?;
    let mut initiator = snow::Builder::new(params)
        .local_private_key(client_private)
        .map_err(|error| error.to_string())?
        .build_initiator()
        .map_err(|error| error.to_string())?;
    let mut buf = vec![0_u8; MAX_HANDSHAKE_MSG];
    let msg1_len = initiator
        .write_message(&[], &mut buf)
        .map_err(|error| error.to_string())?;
    transport
        .send(&buf[..msg1_len])
        .await
        .map_err(|error| error.to_string())?;
    let msg2 = transport.recv().await.map_err(|error| error.to_string())?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|error| error.to_string())?;
    let msg3_len = initiator
        .write_message(&[], &mut buf)
        .map_err(|error| error.to_string())?;
    transport
        .send(&buf[..msg3_len])
        .await
        .map_err(|error| error.to_string())?;
    let host_public = initiator
        .get_remote_static()
        .ok_or("XX initiator: no remote static key")?
        .to_vec();
    let transport_state = initiator
        .into_transport_mode()
        .map_err(|error| error.to_string())?;
    Ok(NoiseTransport::new(transport_state, host_public))
}

async fn approve_pending_usb_session(runtime: &MobileAcceptorRuntimeState) -> String {
    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if let Some(approval) = runtime
                .pending_usb_session_approval()
                .expect("pending session approval")
            {
                runtime
                    .approve_usb_session(&approval.attempt_id)
                    .expect("approve session");
                return approval.attempt_id;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("pending USB session approval")
}

#[test]
fn hex_decode_rejects_multibyte_input_without_panic() {
    assert!(hex_decode("éé").is_err());
    assert!(hex_decode("0é").is_err());
}

#[tokio::test]
async fn recv_handshake_message_times_out() {
    let mut transport = PendingTransport;

    let error = recv_handshake_message_with_timeout_for(
        &mut transport,
        "noise msg1 recv",
        Duration::from_millis(5),
    )
    .await
    .expect_err("pending transport should time out");

    assert!(error.contains("noise msg1 recv: timeout"));
}

#[tokio::test]
async fn touch_paired_peer_store_blocking_updates_last_seen() {
    let dir = tempfile::tempdir().expect("tempdir");
    let store_path = dir.path().join("paired_network_peers.json");
    let peer_id = "desktop-1".to_string();
    let mut seed_store = PairedPeerStore::load(&store_path);
    seed_store
        .upsert(PairedPeer {
            peer_id: peer_id.clone(),
            label: "Desktop".to_string(),
            relay_url: "wss://relay.test".to_string(),
            peer_pubkey: vec![1, 2, 3],
            client_pubkey: vec![4, 5, 6],
            client_privkey_hex: "00".to_string(),
            last_seen: 1,
            paired_at: 1,
            platform: "desktop".to_string(),
        })
        .expect("upsert peer");
    seed_store.save().expect("save seed peer");

    touch_paired_peer_store_blocking(store_path.clone(), peer_id.clone())
        .await
        .expect("touch peer");

    let loaded = PairedPeerStore::load(&store_path);
    let touched = loaded.get(&peer_id).expect("peer should exist");
    assert!(touched.last_seen > 1);
}

#[tokio::test]
async fn accept_transport_connection_registers_usb_mobile_peer() {
    let dir = tempfile::tempdir().expect("tempdir");
    let (client_private, host_public, _client_public) =
        paired_ik_store(dir.path()).expect("paired store");
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();

    let accept_task = tokio::spawn(async move {
        accept_transport_connection(
            accept_runtime,
            None,
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            shutdown_rx,
        )
        .await
    });

    complete_ik_initiator_handshake(&mut client_transport, &client_private, &host_public)
        .await
        .expect("client IK handshake");
    let peer_id = accept_task.await.expect("accept task").expect("accept");

    assert_eq!(peer_id, "desktop-usb-1");
    let status = runtime
        .with_acceptor(|acceptor| acceptor.status())
        .expect("status");
    assert_eq!(status.state, AcceptorState::Connected);
    assert_eq!(status.connected_peers.len(), 1);
    assert_eq!(status.connected_peers[0].transport_type, "usb_mobile");
    assert!(status.relay_url.is_none());
}

#[tokio::test]
async fn accept_transport_connection_usb_mobile_persists_unknown_xx_pairing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let params: NoiseParams = NOISE_PARAMS_XX.parse().expect("XX params");
    let host_keypair = snow::Builder::new(params.clone())
        .generate_keypair()
        .expect("host keypair");
    let client_keypair = snow::Builder::new(params)
        .generate_keypair()
        .expect("client keypair");
    crate::helpers::storage::write_json_pretty_atomic(
        &dir.path().join("network_local_identity.json"),
        &LocalDeviceIdentity {
            device_id: "android-host-1".to_string(),
            device_label: "Android Host".to_string(),
            static_pubkey_hex: hex_encode(&host_keypair.public),
            static_privkey_hex: hex_encode(&host_keypair.private),
            created_at: 1,
        },
    )
    .expect("write identity");

    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();
    let accept_task = tokio::spawn(async move {
        accept_transport_connection(
            accept_runtime,
            None,
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            shutdown_rx,
        )
        .await
    });

    let mut client_noise = complete_xx_initiator_handshake_with_transport(
        &mut client_transport,
        &client_keypair.private,
    )
    .await
    .expect("client XX handshake");
    crate::mobile_usb::send_mobile_usb_pairing_hello(
        &mut client_transport,
        &mut client_noise,
        &crate::mobile_usb::MobileUsbPairingHello {
            peer_id: "desktop-usb-new".to_string(),
            peer_label: "Desktop USB".to_string(),
            peer_pubkey_hex: hex_encode(&client_keypair.public),
            platform: "desktop".to_string(),
        },
    )
    .await
    .expect("send pairing hello");
    let ack =
        crate::mobile_usb::recv_mobile_usb_pairing_hello(&mut client_transport, &mut client_noise)
            .await
            .expect("recv host pairing hello");
    let challenge = recv_pairing_approval_challenge(&mut client_transport, &mut client_noise)
        .await
        .expect("recv pairing approval challenge");
    let pending_approval = runtime
        .pending_usb_pairing_approval()
        .expect("pending pairing approval")
        .expect("pairing approval should be pending");
    assert_eq!(pending_approval.attempt_id, challenge.attempt_id);
    runtime
        .approve_usb_pairing(&challenge.attempt_id)
        .expect("approve pairing");
    let proof_hex = pairing_approval_proof_hex(
        &pending_approval.approval_pin,
        &challenge.attempt_id,
        &challenge.salt_hex,
        &hex_encode(&client_keypair.public),
        &challenge.host_pubkey_hex,
    )
    .expect("pairing approval proof");
    send_pairing_approval_proof(
        &mut client_transport,
        &mut client_noise,
        &MobileUsbPairingApprovalProof {
            attempt_id: challenge.attempt_id.clone(),
            proof_hex,
        },
    )
    .await
    .expect("send pairing approval proof");
    let approval_ack = recv_pairing_approval_ack(&mut client_transport, &mut client_noise)
        .await
        .expect("recv pairing approval ack");
    assert!(approval_ack.accepted);
    let peer_id = accept_task.await.expect("accept task").expect("accept");

    assert_eq!(peer_id, "desktop-usb-new");
    assert_eq!(ack.peer_id, "android-host-1");
    assert_eq!(ack.peer_label, "Android Host");
    assert_eq!(ack.peer_pubkey_hex, hex_encode(&host_keypair.public));
    assert_eq!(ack.platform, "android");

    let loaded = PairedPeerStore::load(&dir.path().join("paired_network_peers.json"));
    let persisted = loaded.get("desktop-usb-new").expect("persisted peer");
    assert_eq!(persisted.label, "Desktop USB");
    assert_eq!(persisted.relay_url, "usb://android-aoa");
    assert_eq!(persisted.peer_pubkey, client_keypair.public);
    assert_eq!(persisted.client_pubkey, host_keypair.public);
    assert_eq!(
        persisted.client_privkey_hex,
        hex_encode(&host_keypair.private)
    );
    assert_eq!(persisted.platform, "desktop");
}

#[tokio::test]
async fn accept_transport_connection_until_closed_keeps_usb_rpc_loop_alive() {
    let dir = tempfile::tempdir().expect("tempdir");
    let (client_private, host_public, _client_public) =
        paired_ik_store(dir.path()).expect("paired store");
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();

    let mut accept_task = tokio::spawn(async move {
        accept_transport_connection_until_closed(
            accept_runtime,
            None,
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            shutdown_rx,
        )
        .await
    });

    let mut client_noise = complete_ik_initiator_handshake_with_transport(
        &mut client_transport,
        &client_private,
        &host_public,
    )
    .await
    .expect("client IK handshake");
    assert!(
        tokio::time::timeout(Duration::from_millis(50), &mut accept_task)
            .await
            .is_err(),
        "USB direct accept task must stay alive after IK while host rpc loop is active"
    );

    let request = RpcRequest::new("core:capabilities", serde_json::json!({}));
    let request_frame = Frame {
        frame_type: FrameType::RpcRequest,
        message_id: 7,
        flags: 0,
        payload: serde_json::to_vec(&request).expect("request json"),
    };
    let encrypted_request = client_noise
        .encrypt(&request_frame.encode())
        .expect("encrypt request");
    client_transport
        .send(&encrypted_request)
        .await
        .expect("send startup RPC");
    let encrypted_response = tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
        .await
        .expect("startup RPC response timeout")
        .expect("startup RPC response");
    let decrypted_response = client_noise
        .decrypt(&encrypted_response)
        .expect("decrypt response");
    let response_frame = Frame::decode(&decrypted_response).expect("response frame");
    assert_eq!(response_frame.frame_type, FrameType::RpcResponse);
    assert_eq!(response_frame.message_id, 7);
    let response: RpcResponse =
        serde_json::from_slice(&response_frame.payload).expect("response json");
    assert!(response.is_ok());

    shutdown_tx.send(()).expect("shutdown send");
    let peer_id = tokio::time::timeout(Duration::from_secs(1), accept_task)
        .await
        .expect("accept task should stop after shutdown")
        .expect("accept task")
        .expect("accept result");
    assert_eq!(peer_id, "desktop-usb-1");
    let status = runtime
        .with_acceptor(|acceptor| acceptor.status())
        .expect("status");
    assert_eq!(status.state, AcceptorState::Idle);
    assert!(status.connected_peers.is_empty());
}

#[tokio::test]
async fn direct_session_scope_blocks_listener_restart_even_after_stop() {
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let scope = runtime.direct_transport_session_scope();
    assert!(runtime.has_active_direct_transport_session());

    // Model the foreground-reconnect sequence: a stop wipes acceptor state to
    // Idle, but the listener restart must still be refused while a direct USB
    // session is alive.
    runtime.cancel_all_tasks().expect("stop listening");
    let (listener_tx, _listener_rx) = tokio::sync::oneshot::channel();
    let error = runtime
        .begin_listener_session(
            "wss://relay.example".to_string(),
            "room-1".to_string(),
            listener_tx,
        )
        .expect_err("listener restart must not preempt active direct session");
    assert!(error.contains("direct transport session active"), "{error}");

    drop(scope);
    assert!(!runtime.has_active_direct_transport_session());
    let (listener_tx, _listener_rx) = tokio::sync::oneshot::channel();
    runtime
        .begin_listener_session(
            "wss://relay.example".to_string(),
            "room-1".to_string(),
            listener_tx,
        )
        .expect("listener may start after direct session ends");
}

#[tokio::test]
async fn usb_direct_session_survives_listener_start_attempt() {
    let dir = tempfile::tempdir().expect("tempdir");
    let (client_private, host_public, _client_public) =
        paired_ik_store(dir.path()).expect("paired store");
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();

    let accept_task = tokio::spawn(async move {
        accept_transport_connection_until_closed(
            accept_runtime,
            None,
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            shutdown_rx,
        )
        .await
    });

    let mut client_noise = complete_ik_initiator_handshake_with_transport(
        &mut client_transport,
        &client_private,
        &host_public,
    )
    .await
    .expect("client IK handshake");

    // A network listener restart attempt while the USB session is live must be
    // refused and must not invalidate the session.
    assert!(runtime.has_active_direct_transport_session());
    let (listener_tx, _listener_rx) = tokio::sync::oneshot::channel();
    let error = runtime
        .begin_listener_session(
            "wss://relay.example".to_string(),
            "room-1".to_string(),
            listener_tx,
        )
        .expect_err("listener restart must not preempt active USB session");
    assert!(error.contains("direct transport session active"), "{error}");

    // The session still serves startup RPC after the refused restart.
    let request = RpcRequest::new("core:capabilities", serde_json::json!({}));
    let request_frame = Frame {
        frame_type: FrameType::RpcRequest,
        message_id: 9,
        flags: 0,
        payload: serde_json::to_vec(&request).expect("request json"),
    };
    let encrypted_request = client_noise
        .encrypt(&request_frame.encode())
        .expect("encrypt request");
    client_transport
        .send(&encrypted_request)
        .await
        .expect("send startup RPC");
    let encrypted_response = tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
        .await
        .expect("startup RPC response timeout")
        .expect("startup RPC response");
    let decrypted_response = client_noise
        .decrypt(&encrypted_response)
        .expect("decrypt response");
    let response_frame = Frame::decode(&decrypted_response).expect("response frame");
    assert_eq!(response_frame.frame_type, FrameType::RpcResponse);
    let response: RpcResponse =
        serde_json::from_slice(&response_frame.payload).expect("response json");
    assert!(response.is_ok());

    shutdown_tx.send(()).expect("shutdown send");
    tokio::time::timeout(Duration::from_secs(1), accept_task)
        .await
        .expect("accept task should stop after shutdown")
        .expect("accept task join")
        .expect("accept result");
    assert!(!runtime.has_active_direct_transport_session());
}

#[tokio::test]
async fn remote_vault_lock_disconnects_without_locking_mobile_vault() {
    let dir = tempfile::tempdir().expect("tempdir");
    let (client_private, host_public, _client_public) =
        paired_ik_store(dir.path()).expect("paired store");
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();
    let commands = Arc::new(Mutex::new(Vec::<String>::new()));
    let unlocked = Arc::new(AtomicBool::new(true));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(RecordingAdapter {
            commands: commands.clone(),
            unlocked: unlocked.clone(),
        })));

    let accept_task = tokio::spawn(async move {
        accept_transport_connection_until_closed(
            accept_runtime,
            Some(adapter),
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            shutdown_rx,
        )
        .await
    });

    let mut client_noise = complete_ik_initiator_handshake_with_transport(
        &mut client_transport,
        &client_private,
        &host_public,
    )
    .await
    .expect("client IK handshake");
    approve_pending_usb_session(&runtime).await;
    let encrypted_push = tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
        .await
        .expect("unlock push timeout")
        .expect("unlock push");
    let decrypted_push = client_noise.decrypt(&encrypted_push).expect("decrypt push");
    let push_frame = Frame::decode(&decrypted_push).expect("push frame");
    assert_eq!(push_frame.frame_type, FrameType::RpcRequest);
    let push: RpcRequest = serde_json::from_slice(&push_frame.payload).expect("push json");
    assert_eq!(push.command, "mobile_usb:host_unlock_confirmed");

    let request = RpcRequest::new("vault:lock", serde_json::json!({}));
    let request_frame = Frame {
        frame_type: FrameType::RpcRequest,
        message_id: 17,
        flags: 0,
        payload: serde_json::to_vec(&request).expect("request json"),
    };
    let encrypted_request = client_noise
        .encrypt(&request_frame.encode())
        .expect("encrypt request");
    client_transport
        .send(&encrypted_request)
        .await
        .expect("send remote vault lock");

    let encrypted_response = tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
        .await
        .expect("remote lock response timeout")
        .expect("remote lock response");
    let decrypted_response = client_noise
        .decrypt(&encrypted_response)
        .expect("decrypt response");
    let response_frame = Frame::decode(&decrypted_response).expect("response frame");
    assert_eq!(response_frame.frame_type, FrameType::RpcResponse);
    assert_eq!(response_frame.message_id, 17);
    let response: RpcResponse =
        serde_json::from_slice(&response_frame.payload).expect("response json");
    assert!(response.is_ok());

    let peer_id = tokio::time::timeout(Duration::from_secs(1), accept_task)
        .await
        .expect("accept task should stop after remote lock")
        .expect("accept task")
        .expect("accept result");
    assert_eq!(peer_id, "desktop-usb-1");
    assert!(unlocked.load(Ordering::SeqCst));
    assert!(!commands
        .lock()
        .expect("commands")
        .iter()
        .any(|command| command == "vault:lock"));

    let status = runtime
        .with_acceptor(|acceptor| acceptor.status())
        .expect("status");
    assert_eq!(status.state, AcceptorState::Idle);
    assert!(status.connected_peers.is_empty());
}

#[tokio::test]
async fn known_usb_mobile_peer_rejects_pairing_preflight_after_rpc_loop_starts() {
    let dir = tempfile::tempdir().expect("tempdir");
    let (client_private, host_public, client_public) =
        paired_ik_store(dir.path()).expect("paired store");
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();

    let accept_task = tokio::spawn(async move {
        accept_transport_connection_until_closed(
            accept_runtime,
            None,
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            shutdown_rx,
        )
        .await
    });

    let mut client_noise = complete_ik_initiator_handshake_with_transport(
        &mut client_transport,
        &client_private,
        &host_public,
    )
    .await
    .expect("client IK handshake");
    crate::mobile_usb::send_mobile_usb_pairing_hello(
        &mut client_transport,
        &mut client_noise,
        &crate::mobile_usb::MobileUsbPairingHello {
            peer_id: "desktop-usb-1".to_string(),
            peer_label: "Desktop USB".to_string(),
            peer_pubkey_hex: hex_encode(&client_public),
            platform: "desktop".to_string(),
        },
    )
    .await
    .expect("send pairing preflight");
    let closed = tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
        .await
        .expect("preflight should close the USB session");
    assert!(closed.is_err());

    let _ = shutdown_tx.send(());
    let peer_id = tokio::time::timeout(Duration::from_secs(1), accept_task)
        .await
        .expect("accept task should stop after shutdown")
        .expect("accept task")
        .expect("accept result");
    assert_eq!(peer_id, "desktop-usb-1");
}

#[tokio::test]
async fn direct_transport_until_closed_returns_terminal_outcome() {
    let dir = tempfile::tempdir().expect("tempdir");
    let (client_private, host_public, _client_public) =
        paired_ik_store(dir.path()).expect("paired store");
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();

    let mut accept_task = tokio::spawn(async move {
        crate::network::mobile_acceptor::accept_direct_transport_until_closed(
            accept_runtime,
            None,
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            crate::network::mobile_acceptor::shutdown_signal_from_unit_receiver(shutdown_rx),
            crate::network::mobile_acceptor::DirectTransportTimelineContext::android_usb(
                "android-session-1",
            ),
        )
        .await
    });

    complete_ik_initiator_handshake(&mut client_transport, &client_private, &host_public)
        .await
        .expect("client IK handshake");
    assert!(
        tokio::time::timeout(Duration::from_millis(50), &mut accept_task)
            .await
            .is_err(),
        "direct transport accept task must stay alive after IK"
    );

    shutdown_tx.send(()).expect("shutdown send");
    let outcome = tokio::time::timeout(Duration::from_secs(1), accept_task)
        .await
        .expect("accept task should stop after shutdown")
        .expect("accept task")
        .expect("accept outcome");

    assert_eq!(outcome.peer_id, "desktop-usb-1");
    assert_eq!(outcome.transport_type, TransportType::UsbMobile);
    assert_eq!(
        outcome.stop_reason,
        crate::network::mobile_acceptor::DirectTransportStopReason::Shutdown
    );
}

#[tokio::test]
async fn accept_transport_connection_usb_mobile_waits_for_late_first_msg1() {
    let dir = tempfile::tempdir().expect("tempdir");
    let (client_private, host_public, _client_public) =
        paired_ik_store(dir.path()).expect("paired store");
    let runtime = Arc::new(MobileAcceptorRuntimeState::new());
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::UsbMobile);
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let storage_root = dir.path().to_path_buf();
    let accept_runtime = runtime.clone();

    let accept_task = tokio::spawn(async move {
        accept_transport_connection(
            accept_runtime,
            None,
            &storage_root,
            Box::new(host_transport),
            TransportType::UsbMobile,
            "android-device-1".to_string(),
            shutdown_rx,
        )
        .await
    });

    tokio::time::sleep(NOISE_HANDSHAKE_MESSAGE_TIMEOUT + Duration::from_millis(250)).await;

    complete_ik_initiator_handshake(&mut client_transport, &client_private, &host_public)
        .await
        .expect("client IK handshake after delayed connect");
    let peer_id = accept_task.await.expect("accept task").expect("accept");

    assert_eq!(peer_id, "desktop-usb-1");
    let status = runtime
        .with_acceptor(|acceptor| acceptor.status())
        .expect("status");
    assert_eq!(status.state, AcceptorState::Connected);
    assert_eq!(status.connected_peers.len(), 1);
    assert_eq!(status.connected_peers[0].transport_type, "usb_mobile");
}
