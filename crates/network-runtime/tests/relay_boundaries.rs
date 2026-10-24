use chromvoid_network_runtime::{ios_control::*, wss_transport::WssTransport};
use chromvoid_protocol::{RemoteTransport, TransportType};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
    time::{timeout, Duration},
};
use tokio_tungstenite::{
    accept_async, accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        protocol::{frame::coding::CloseCode, CloseFrame},
        Message,
    },
};

/// One loopback HTTP exchange, asserting the real request boundary rather than mocking reqwest.
async fn http_response(status: u16, body: &str) -> (String, JoinHandle<(String, Value)>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    let body = body.to_owned();
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut input = Vec::new();
        let (header, body_start, length) = loop {
            let mut chunk = [0u8; 1024];
            let count = stream.read(&mut chunk).await.unwrap();
            assert!(count > 0, "request closed before headers");
            input.extend_from_slice(&chunk[..count]);
            if let Some(index) = input.windows(4).position(|part| part == b"\r\n\r\n") {
                let header = String::from_utf8(input[..index].to_vec()).unwrap();
                let length: usize = header
                    .lines()
                    .filter_map(|line| line.split_once(':'))
                    .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
                    .map(|(_, value)| value.trim().parse().unwrap())
                    .unwrap_or(0);
                break (header, index + 4, length);
            }
            assert!(input.len() < 16_384, "unexpectedly large test request");
        };
        while input.len() < body_start + length {
            let mut chunk = [0u8; 1024];
            let count = stream.read(&mut chunk).await.unwrap();
            assert!(count > 0, "request closed before body");
            input.extend_from_slice(&chunk[..count]);
        }
        let request = if length == 0 {
            Value::Null
        } else {
            serde_json::from_slice(&input[body_start..body_start + length]).unwrap()
        };
        let response = format!(
            "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(response.as_bytes()).await.unwrap();
        (header.lines().next().unwrap().to_owned(), request)
    });
    (url, server)
}

#[tokio::test]
async fn pairing_creation_preserves_wire_request_and_offer() {
    timeout(Duration::from_secs(5), async {
        let response = json!({
            "session_id": "session-test", "room_id": "room-test", "pin": "482901",
            "relay_url": "wss://relay.test", "expires_at_ms": 123456,
            "offer": {"session_id": "session-test", "relay_base_url": "wss://relay.test",
                "device_label": "Synthetic phone", "expires_at_ms": 123456}
        });
        let (url, server) = http_response(200, &response.to_string()).await;
        let request = CreatePairingSessionRequest {
            peer_id: "peer-test".into(),
            device_label: "Synthetic phone".into(),
            peer_pubkey_hex: "aabb".into(),
            relay_url: "wss://relay.test".into(),
        };
        let result = create_pairing_session(&url, &request).await.unwrap();
        assert_eq!(result.session_id, "session-test");
        assert_eq!(result.pin, "482901");
        assert_eq!(result.offer.expires_at_ms, 123456);
        let (route, received) = server.await.unwrap();
        assert_eq!(route, "POST /v1/ios/pairing-sessions HTTP/1.1");
        assert_eq!(
            received,
            json!({
                "peer_id": "peer-test", "device_label": "Synthetic phone",
                "peer_pubkey_hex": "aabb", "relay_url": "wss://relay.test"
            })
        );
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn wake_absence_is_distinct_from_server_or_decode_failure() {
    timeout(Duration::from_secs(5), async {
        let (url, server) = http_response(404, "{}").await;
        assert!(fetch_wake_request(&url, "peer-test")
            .await
            .unwrap()
            .is_none());
        assert_eq!(
            server.await.unwrap().0,
            "GET /v1/ios/hosts/peer-test/wake HTTP/1.1"
        );
        let (url, server) = http_response(503, "{}").await;
        assert!(fetch_wake_request(&url, "peer-test")
            .await
            .unwrap_err()
            .contains("503"));
        server.await.unwrap();
        let (url, server) = http_response(200, "not JSON").await;
        assert!(fetch_wake_request(&url, "peer-test")
            .await
            .unwrap_err()
            .contains("decode wake"));
        server.await.unwrap();
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn websocket_preserves_binary_payload_and_reports_remote_close() {
    timeout(Duration::from_secs(5), async {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket =
                accept_hdr_async(stream, |request: &Request, response: Response| {
                    assert_eq!(request.uri().path(), "/relay/room/room-test");
                    Ok(response)
                })
                .await
                .unwrap();
            assert_eq!(
                websocket.next().await.unwrap().unwrap(),
                Message::Binary(vec![0, 255, 4].into())
            );
            websocket
                .send(Message::Text("control message".into()))
                .await
                .unwrap();
            websocket
                .send(Message::Binary(vec![8, 0, 252].into()))
                .await
                .unwrap();
            websocket
                .send(Message::Close(Some(CloseFrame {
                    code: CloseCode::Policy,
                    reason: "synthetic-revocation".into(),
                })))
                .await
                .unwrap();
        });
        let mut client = WssTransport::connect_with_context(&url, "room-test", "integration-test")
            .await
            .unwrap();
        assert_eq!(client.transport_type(), TransportType::WssRelay);
        client.send(&[0, 255, 4]).await.unwrap();
        assert_eq!(client.recv().await.unwrap(), vec![8, 0, 252]);
        let error = client.recv().await.unwrap_err().to_string();
        assert!(error.contains("1008") && error.contains("synthetic-revocation"));
        server.await.unwrap();
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn explicit_transport_close_reaches_the_peer() {
    timeout(Duration::from_secs(5), async {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut websocket = accept_async(stream).await.unwrap();
            assert!(matches!(
                websocket.next().await.unwrap().unwrap(),
                Message::Close(None)
            ));
        });
        let mut client = WssTransport::connect(&url, "room-test").await.unwrap();
        client.close().await.unwrap();
        server.await.unwrap();
    })
    .await
    .unwrap();
}
