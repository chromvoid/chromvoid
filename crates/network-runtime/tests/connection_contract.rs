use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_network_runtime::{
    connection::{ConnectionState, NetworkConnectionError, NetworkConnectionManager},
    rpc_transport_protocol::{read_stream_chunk_supervised, RemoteStreamReadPolicy},
};
use chromvoid_protocol::{Frame, FrameType, NoiseTransport, TransportType, NOISE_PARAMS_XX};
use serde_json::json;
use snow::Builder;
use std::{io::Cursor, time::Duration};

#[test]
fn encrypted_rpc_preserves_request_and_transport_readiness_does_not_unlock_vault() {
    let mut manager = NetworkConnectionManager::new();
    let request = RpcRequest::new("vault:status", json!({"probe":"synthetic"}));
    assert!(matches!(
        manager.send_rpc(&request),
        Err(NetworkConnectionError::Disconnected)
    ));
    let (local, mut remote) = noise_pair();
    manager.set_noise_transport(local, TransportType::WssRelay);
    assert_eq!(manager.state(), ConnectionState::Syncing);
    assert!(manager.is_connected());
    assert_eq!(manager.transport_type(), Some(TransportType::WssRelay));

    let (sent, encrypted) = manager.send_rpc(&request).unwrap();
    let received = Frame::decode(&remote.decrypt(&encrypted).unwrap()).unwrap();
    assert_eq!(received.frame_type, FrameType::RpcRequest);
    assert_eq!(received.message_id, sent.message_id);
    let decoded: RpcRequest = serde_json::from_slice(&received.payload).unwrap();
    assert_eq!(decoded.command, "vault:status");
    assert_eq!(decoded.data, json!({"probe":"synthetic"}));
    assert_eq!(decoded.v, chromvoid_core::rpc::types::PROTOCOL_VERSION);
    manager.mark_locked();
    assert_eq!(manager.state(), ConnectionState::Locked);
    assert!(manager.is_connected());
    manager.disconnect();
    assert!(!manager.is_connected());
    assert!(matches!(
        manager.send_rpc(&request),
        Err(NetworkConnectionError::Disconnected)
    ));
}

#[test]
fn replay_is_rejected_even_with_fresh_noise_nonce_and_new_session_resets_replay_window() {
    let mut manager = NetworkConnectionManager::new();
    let (local, mut remote) = noise_pair();
    manager.set_noise_transport(local, TransportType::WssRelay);
    let mut frame = Frame {
        frame_type: FrameType::RpcResponse,
        message_id: 42,
        flags: 0,
        payload: b"{}".to_vec(),
    };
    let encrypted = remote.encrypt(&frame.encode()).unwrap();
    assert_eq!(manager.receive_frame(&encrypted).unwrap().message_id, 42);
    let repeated = remote.encrypt(&frame.encode()).unwrap();
    assert!(
        matches!(manager.receive_frame(&repeated), Err(NetworkConnectionError::Protocol(reason)) if reason == "replay")
    );
    frame.message_id = 43;
    let next = remote.encrypt(&frame.encode()).unwrap();
    assert_eq!(manager.receive_frame(&next).unwrap().message_id, 43);

    manager.handle_transport_drop();
    assert!(matches!(
        manager.receive_frame(&next),
        Err(NetworkConnectionError::Disconnected)
    ));
    assert!(manager.safety().kill_switch_active);
    let (local, mut remote) = noise_pair();
    manager.set_noise_transport(local, TransportType::WssRelay);
    frame.message_id = 42;
    let fresh = remote.encrypt(&frame.encode()).unwrap();
    assert_eq!(manager.receive_frame(&fresh).unwrap().message_id, 42);
    assert!(!manager.safety().kill_switch_active);
    manager.disconnect();
    assert!(matches!(
        manager.receive_frame(&fresh),
        Err(NetworkConnectionError::Disconnected)
    ));
}

#[tokio::test]
async fn supervised_reads_return_continuation_reader_and_exact_eof() {
    let policy = RemoteStreamReadPolicy {
        timeout: Duration::from_secs(2),
    };
    let first = read_stream_chunk_supervised(Box::new(Cursor::new(b"abcdefg")), 3, policy)
        .await
        .unwrap();
    assert_eq!(first.bytes, b"abc");
    let second = read_stream_chunk_supervised(first.reader, 3, policy)
        .await
        .unwrap();
    assert_eq!(second.bytes, b"def");
    let last = read_stream_chunk_supervised(second.reader, 3, policy)
        .await
        .unwrap();
    assert_eq!(last.bytes, b"g");
    let eof = read_stream_chunk_supervised(last.reader, 3, policy)
        .await
        .unwrap();
    assert!(eof.bytes.is_empty());
}

fn noise_pair() -> (NoiseTransport, NoiseTransport) {
    let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().unwrap();
    let kp_i = Builder::new(params.clone()).generate_keypair().unwrap();
    let kp_r = Builder::new(params.clone()).generate_keypair().unwrap();

    let mut initiator = Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = Builder::new(params.clone())
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; 1024];

    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len].to_vec();

    responder.read_message(&msg1, &mut buf).unwrap();
    let len = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len].to_vec();

    initiator.read_message(&msg2, &mut buf).unwrap();
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg3 = buf[..len].to_vec();

    responder.read_message(&msg3, &mut buf).unwrap();

    let remote_pub_i = initiator
        .get_remote_static()
        .expect("initiator remote key")
        .to_vec();
    let remote_pub_r = responder
        .get_remote_static()
        .expect("responder remote key")
        .to_vec();

    (
        NoiseTransport::new(initiator.into_transport_mode().unwrap(), remote_pub_i),
        NoiseTransport::new(responder.into_transport_mode().unwrap(), remote_pub_r),
    )
}
