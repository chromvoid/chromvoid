//! Integration tests for USB + Noise transport.
//! Uses in-memory duplex streams to simulate serial I/O.

use chromvoid_core::rpc::types::{RpcRequest, PROTOCOL_VERSION};
use chromvoid_lib::gateway::protocol::{frame_from_rpc_request, Frame, FrameType};
use chromvoid_lib::usb::noise_session::{NoiseTransport, NOISE_PARAMS_XX};
use chromvoid_lib::usb::transport::{read_frame, write_frame};
use tokio::io::duplex;

/// Test: Full RPC-over-Noise roundtrip through in-memory USB serial transport.
/// 1. Perform Noise XX handshake between "client" (desktop) and "server" (orange pi)
/// 2. Encrypt an RPC request frame
/// 3. Send through length-prefixed transport
/// 4. Receive on the other side
/// 5. Decrypt and verify the frame contents match
#[tokio::test]
async fn rpc_over_noise_roundtrip() {
    // --- Step 1: Noise XX handshake in memory ---
    let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().unwrap();

    let kp_initiator = snow::Builder::new(params.clone())
        .generate_keypair()
        .unwrap();
    let kp_responder = snow::Builder::new(params.clone())
        .generate_keypair()
        .unwrap();

    let mut initiator = snow::Builder::new(params.clone())
        .local_private_key(&kp_initiator.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = snow::Builder::new(params.clone())
        .local_private_key(&kp_responder.private)
        .unwrap()
        .build_responder()
        .unwrap();

    // XX pattern: 3 message exchange
    // -> e
    let mut buf = vec![0u8; 65535];
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len].to_vec();

    // <- e, ee, s, es
    let mut buf2 = vec![0u8; 65535];
    let _len = responder.read_message(&msg1, &mut buf2).unwrap();
    let len = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len].to_vec();

    // -> s, se
    let _len = initiator.read_message(&msg2, &mut buf2).unwrap();
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg3 = buf[..len].to_vec();

    let _len = responder.read_message(&msg3, &mut buf2).unwrap();

    // Convert to transport mode
    let transport_i = initiator.into_transport_mode().unwrap();
    let transport_r = responder.into_transport_mode().unwrap();

    let remote_pubkey_i = kp_responder.public.to_vec();
    let remote_pubkey_r = kp_initiator.public.to_vec();

    let mut noise_client = NoiseTransport::new(transport_i, remote_pubkey_i);
    let mut noise_server = NoiseTransport::new(transport_r, remote_pubkey_r);

    // --- Step 2: Prepare an RPC frame ---
    let req = RpcRequest {
        v: PROTOCOL_VERSION,
        command: "ping".to_string(),
        data: serde_json::json!({}),
    };
    let frame = frame_from_rpc_request(1, &req);
    let plaintext = frame.encode();

    // --- Step 3: Encrypt ---
    let ciphertext = noise_client.encrypt(&plaintext).expect("encrypt failed");

    // --- Step 4: Send through transport layer ---
    let (stream_a, stream_b) = duplex(64 * 1024);
    let (mut read_a, mut _write_a) = tokio::io::split(stream_a);
    let (mut _read_b, mut write_b) = tokio::io::split(stream_b);

    // Send ciphertext from client side
    write_frame(&mut write_b, &ciphertext)
        .await
        .expect("write_frame failed");

    // Read on server side
    let received = read_frame(&mut read_a).await.expect("read_frame failed");

    // --- Step 5: Decrypt and verify ---
    let decrypted = noise_server.decrypt(&received).expect("decrypt failed");
    let decoded_frame = Frame::decode(&decrypted).expect("decode failed");

    assert_eq!(decoded_frame.frame_type, FrameType::RpcRequest);
    assert_eq!(decoded_frame.message_id, 1);

    let decoded_req: RpcRequest = serde_json::from_slice(&decoded_frame.payload).unwrap();
    assert_eq!(decoded_req.command, "ping");
    assert_eq!(decoded_req.v, PROTOCOL_VERSION);
}

/// Test: Transport framing roundtrip without Noise (plain data).
#[tokio::test]
async fn transport_framing_roundtrip() {
    let (stream_a, stream_b) = duplex(64 * 1024);
    let (mut read_a, mut _write_a) = tokio::io::split(stream_a);
    let (mut _read_b, mut write_b) = tokio::io::split(stream_b);

    let data = b"hello USB transport";

    // Write from one side, read from the other
    write_frame(&mut write_b, data).await.expect("write failed");
    let received = read_frame(&mut read_a).await.expect("read failed");

    assert_eq!(received, data);
}

/// Test: Noise XX handshake produces valid transport states.
#[tokio::test]
async fn noise_xx_handshake_and_encrypt_decrypt() {
    let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().unwrap();

    let kp_i = snow::Builder::new(params.clone())
        .generate_keypair()
        .unwrap();
    let kp_r = snow::Builder::new(params.clone())
        .generate_keypair()
        .unwrap();

    let mut initiator = snow::Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = snow::Builder::new(params.clone())
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; 65535];
    let mut buf2 = vec![0u8; 65535];

    // -> e
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len].to_vec();

    // <- e, ee, s, es
    responder.read_message(&msg1, &mut buf2).unwrap();
    let len = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len].to_vec();

    // -> s, se
    initiator.read_message(&msg2, &mut buf2).unwrap();
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg3 = buf[..len].to_vec();

    responder.read_message(&msg3, &mut buf2).unwrap();

    let transport_i = initiator.into_transport_mode().unwrap();
    let transport_r = responder.into_transport_mode().unwrap();

    let mut noise_i = NoiseTransport::new(transport_i, kp_r.public.to_vec());
    let mut noise_r = NoiseTransport::new(transport_r, kp_i.public.to_vec());

    // Test encrypt/decrypt in both directions
    let plaintext = b"secret message";
    let encrypted = noise_i.encrypt(plaintext).unwrap();
    let decrypted = noise_r.decrypt(&encrypted).unwrap();
    assert_eq!(&decrypted, plaintext);

    let plaintext2 = b"response message";
    let encrypted2 = noise_r.encrypt(plaintext2).unwrap();
    let decrypted2 = noise_i.decrypt(&encrypted2).unwrap();
    assert_eq!(&decrypted2, plaintext2);
}
