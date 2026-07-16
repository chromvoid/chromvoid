use super::*;

pub(in crate::mobile_usb::tests) struct NoiseTestKeypair {
    pub(in crate::mobile_usb::tests) private: Vec<u8>,
    pub(in crate::mobile_usb::tests) public: Vec<u8>,
}

pub(in crate::mobile_usb::tests) const TEST_PAIRING_PIN: &str = "123456";

pub(in crate::mobile_usb::tests) fn noise_keypair() -> NoiseTestKeypair {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .expect("Noise params");
    let keypair = snow::Builder::new(params)
        .generate_keypair()
        .expect("keypair");
    NoiseTestKeypair {
        private: keypair.private,
        public: keypair.public,
    }
}

pub(in crate::mobile_usb::tests) fn spawn_xx_pair_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
    host_public_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;
        let hello = super::recv_mobile_usb_pairing_hello(&mut transport, &mut noise)
            .await
            .expect("pairing hello");
        assert_eq!(
            hello.peer_pubkey_hex,
            super::mobile_usb_hex_encode(noise.remote_pubkey())
        );
        super::send_mobile_usb_pairing_hello(
            &mut transport,
            &mut noise,
            &super::MobileUsbPairingHello {
                peer_id: "android-host-1".to_string(),
                peer_label: "Android Host".to_string(),
                peer_pubkey_hex: super::mobile_usb_hex_encode(&host_public_key),
                platform: "android".to_string(),
            },
        )
        .await
        .expect("pairing hello ack");
        let attempt_id = "test-approval-attempt".to_string();
        let salt_hex = "0102030405060708090a0b0c0d0e0f10".to_string();
        let peer_fingerprint =
            crate::mobile_usb::pairing_protocol::pairing_fingerprint(noise.remote_pubkey());
        crate::mobile_usb::pairing_protocol::send_pairing_approval_challenge(
            &mut transport,
            &mut noise,
            &crate::mobile_usb::pairing_protocol::MobileUsbPairingApprovalChallenge {
                attempt_id: attempt_id.clone(),
                salt_hex: salt_hex.clone(),
                host_pubkey_hex: super::mobile_usb_hex_encode(&host_public_key),
                peer_fingerprint,
                attempts_left: 5,
                expires_at_ms: 4_102_444_800_000,
            },
        )
        .await
        .expect("approval challenge");
        let Ok(proof) = crate::mobile_usb::pairing_protocol::recv_pairing_approval_proof(
            &mut transport,
            &mut noise,
        )
        .await
        else {
            return;
        };
        let proof_ok = crate::mobile_usb::pairing_protocol::verify_pairing_approval_proof(
            TEST_PAIRING_PIN,
            &attempt_id,
            &salt_hex,
            &super::mobile_usb_hex_encode(noise.remote_pubkey()),
            &super::mobile_usb_hex_encode(&host_public_key),
            &proof.proof_hex,
        )
        .expect("verify proof");
        crate::mobile_usb::pairing_protocol::send_pairing_approval_ack(
            &mut transport,
            &mut noise,
            &crate::mobile_usb::pairing_protocol::MobileUsbPairingApprovalAck {
                attempt_id,
                accepted: proof_ok,
                error: (!proof_ok).then(|| "bad proof".to_string()),
                attempts_left: if proof_ok { 5 } else { 4 },
            },
        )
        .await
        .expect("approval ack");
    });
}

pub(in crate::mobile_usb::tests) fn spawn_invalid_msg2_responder(host: tokio::io::DuplexStream) {
    tokio::spawn(async move {
        let mut transport = MobileUsbRemoteTransport::new(host, MobileUsbBridgeKind::AndroidAoa);
        let _ = transport.recv().await.expect("msg1");
        transport
            .send(b"stale-msg2")
            .await
            .expect("invalid msg2 send");
    });
}

pub(in crate::mobile_usb::tests) fn spawn_xx_rpc_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv frame");
        assert_eq!(frame.frame_type, FrameType::RpcRequest);
        let request: RpcRequest = serde_json::from_slice(&frame.payload).expect("request payload");
        let response = RpcResponse::success(serde_json::json!({
            "command": request.command,
        }));
        send_json_response(&mut transport, &mut noise, frame.message_id, response)
            .await
            .expect("host send response");
    });
}

pub(in crate::mobile_usb::tests) fn spawn_xx_writer_locked_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv write frame");
        assert_eq!(frame.frame_type, FrameType::RpcRequest);
        let response = RpcResponse::error(
            "vault write is locked by another device",
            Some("WRITER_LOCKED"),
        );
        send_json_response(&mut transport, &mut noise, frame.message_id, response)
            .await
            .expect("host send writer locked response");

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv read frame");
        assert_eq!(frame.frame_type, FrameType::RpcRequest);
        let request: RpcRequest = serde_json::from_slice(&frame.payload).expect("request payload");
        let response = RpcResponse::success(serde_json::json!({
            "command": request.command,
        }));
        send_json_response(&mut transport, &mut noise, frame.message_id, response)
            .await
            .expect("host send read response");

        // Keep the host side of the duplex open so the client never observes a
        // transport close while the writer lock is held elsewhere.
        let _ = recv_next_non_heartbeat(&mut transport, &mut noise).await;
    });
}

pub(in crate::mobile_usb::tests) fn spawn_xx_push_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv request");
        let push = RpcRequest::new("mobile-usb:host-push", serde_json::json!({"ok": true}));
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            Frame {
                frame_type: FrameType::RpcRequest,
                message_id: frame.message_id.wrapping_add(2),
                flags: 0,
                payload: serde_json::to_vec(&push).expect("push json"),
            },
        )
        .await
        .expect("host send push");
        let response = RpcResponse::success(serde_json::json!({"ok": true}));
        send_json_response(&mut transport, &mut noise, frame.message_id, response)
            .await
            .expect("host send response");
    });
}

pub(in crate::mobile_usb::tests) fn spawn_xx_stream_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (mut transport, mut noise) = accept_xx_transport(host, host_private_key).await;

        let frame = recv_next_non_heartbeat(&mut transport, &mut noise)
            .await
            .expect("host recv stream request");
        assert_eq!(frame.frame_type, FrameType::RpcRequest);
        assert_ne!(frame.flags & FLAG_HAS_CONTINUATION, 0);

        let mut uploaded = Vec::new();
        loop {
            let chunk = recv_next_non_heartbeat(&mut transport, &mut noise)
                .await
                .expect("host recv stream continuation");
            assert_eq!(chunk.frame_type, FrameType::RpcRequest);
            uploaded.extend_from_slice(&chunk.payload);
            if chunk.flags & FLAG_HAS_CONTINUATION == 0 {
                break;
            }
        }
        assert_eq!(uploaded, vec![1, 2, 3, 4]);

        let meta = RpcStreamMeta {
            name: "hello.txt".to_string(),
            mime_type: "text/plain".to_string(),
            size: 5,
            chunk_size: 3,
        };
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            Frame {
                frame_type: FrameType::RpcResponse,
                message_id: frame.message_id,
                flags: FLAG_HAS_CONTINUATION,
                payload: serde_json::to_vec(&meta).expect("stream meta json"),
            },
        )
        .await
        .expect("host send stream meta");
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            frame_continuation(
                FrameType::RpcResponse,
                frame.message_id,
                b"hel".to_vec(),
                true,
            ),
        )
        .await
        .expect("host send stream chunk 1");
        crate::remote_data_plane::send_encrypted_frame(
            &mut transport,
            &mut noise,
            frame_continuation(
                FrameType::RpcResponse,
                frame.message_id,
                b"lo".to_vec(),
                false,
            ),
        )
        .await
        .expect("host send stream chunk 2");
    });
}

async fn recv_next_non_heartbeat(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<Frame, String> {
    loop {
        let frame = crate::remote_data_plane::recv_decrypted_frame(transport, noise).await?;
        if frame.frame_type != FrameType::Heartbeat {
            return Ok(frame);
        }
    }
}

async fn send_json_response(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    message_id: u64,
    response: RpcResponse,
) -> Result<(), String> {
    crate::remote_data_plane::send_encrypted_frame(
        transport,
        noise,
        Frame {
            frame_type: FrameType::RpcResponse,
            message_id,
            flags: 0,
            payload: serde_json::to_vec(&response).expect("response json"),
        },
    )
    .await
}

async fn accept_xx_transport(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) -> (
    MobileUsbRemoteTransport<tokio::io::DuplexStream>,
    NoiseTransport,
) {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .expect("XX params");
    let mut responder = snow::Builder::new(params)
        .local_private_key(&host_private_key)
        .expect("host key")
        .build_responder()
        .expect("XX responder");
    let mut transport = MobileUsbRemoteTransport::new(host, MobileUsbBridgeKind::AndroidAoa);
    let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let msg1 = transport.recv().await.expect("XX msg1");
    responder.read_message(&msg1, &mut buf).expect("XX read 1");
    let len = responder.write_message(&[], &mut buf).expect("XX write 2");
    transport.send(&buf[..len]).await.expect("XX send 2");
    let msg3 = transport.recv().await.expect("XX msg3");
    responder.read_message(&msg3, &mut buf).expect("XX read 3");
    let remote_pubkey = responder
        .get_remote_static()
        .expect("XX remote static")
        .to_vec();
    let noise = NoiseTransport::new(
        responder
            .into_transport_mode()
            .expect("XX responder transport mode"),
        remote_pubkey,
    );

    (transport, noise)
}

pub(in crate::mobile_usb::tests) fn noise_transport_pair() -> (NoiseTransport, NoiseTransport) {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .expect("XX params");
    let kp_i = snow::Builder::new(params.clone())
        .generate_keypair()
        .expect("initiator keypair");
    let kp_r = snow::Builder::new(params.clone())
        .generate_keypair()
        .expect("responder keypair");

    let mut initiator = snow::Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .expect("initiator key")
        .build_initiator()
        .expect("initiator");
    let mut responder = snow::Builder::new(params)
        .local_private_key(&kp_r.private)
        .expect("responder key")
        .build_responder()
        .expect("responder");
    let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let len = initiator.write_message(&[], &mut buf).expect("XX msg1");
    let msg1 = buf[..len].to_vec();
    responder.read_message(&msg1, &mut buf).expect("XX read 1");
    let len = responder.write_message(&[], &mut buf).expect("XX msg2");
    let msg2 = buf[..len].to_vec();
    initiator.read_message(&msg2, &mut buf).expect("XX read 2");
    let len = initiator.write_message(&[], &mut buf).expect("XX msg3");
    let msg3 = buf[..len].to_vec();
    responder.read_message(&msg3, &mut buf).expect("XX read 3");

    let initiator_remote = initiator
        .get_remote_static()
        .expect("initiator remote static")
        .to_vec();
    let responder_remote = responder
        .get_remote_static()
        .expect("responder remote static")
        .to_vec();

    (
        NoiseTransport::new(
            initiator
                .into_transport_mode()
                .expect("initiator transport mode"),
            initiator_remote,
        ),
        NoiseTransport::new(
            responder
                .into_transport_mode()
                .expect("responder transport mode"),
            responder_remote,
        ),
    )
}

pub(in crate::mobile_usb::tests) fn spawn_ik_responder(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) {
    tokio::spawn(async move {
        let (_transport, _noise) = accept_ik_transport(host, host_private_key).await;
    });
}

async fn accept_ik_transport(
    host: tokio::io::DuplexStream,
    host_private_key: Vec<u8>,
) -> (
    MobileUsbRemoteTransport<tokio::io::DuplexStream>,
    NoiseTransport,
) {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_IK
        .parse()
        .expect("IK params");
    let mut responder = snow::Builder::new(params)
        .local_private_key(&host_private_key)
        .expect("host key")
        .build_responder()
        .expect("IK responder");
    let mut transport = MobileUsbRemoteTransport::new(host, MobileUsbBridgeKind::AndroidAoa);
    let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let msg1 = transport.recv().await.expect("IK msg1");
    responder.read_message(&msg1, &mut buf).expect("IK read 1");
    let len = responder.write_message(&[], &mut buf).expect("IK write 2");
    transport.send(&buf[..len]).await.expect("IK send 2");
    let remote_pubkey = responder
        .get_remote_static()
        .expect("IK remote static")
        .to_vec();
    let noise = NoiseTransport::new(
        responder
            .into_transport_mode()
            .expect("IK responder transport mode"),
        remote_pubkey,
    );
    (transport, noise)
}
