use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use chromvoid_protocol::{RemoteTransport, TransportError, TransportType};
use futures_util::{SinkExt, StreamExt};
use rustls::ClientConfig;
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, OnceLock},
    time::Duration,
};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{
    connect_async, connect_async_tls_with_config,
    tungstenite::http::header::{HeaderName, HeaderValue},
    tungstenite::Message,
    Connector,
};
use tracing::{info, warn};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
static CRYPTO_PROVIDER_INIT: OnceLock<Result<(), String>> = OnceLock::new();

fn ensure_crypto_provider_installed() -> Result<(), String> {
    CRYPTO_PROVIDER_INIT
        .get_or_init(|| {
            if rustls::crypto::CryptoProvider::get_default().is_some() {
                return Ok(());
            }
            rustls::crypto::ring::default_provider()
                .install_default()
                .map_err(|_| "install rustls crypto provider failed".to_string())
        })
        .clone()
}

pub struct TcpStealthTransport {
    tx: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    rx: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
}

impl TcpStealthTransport {
    pub async fn connect(relay_url: &str, room_id: &str) -> Result<Self, String> {
        Self::connect_with_options(relay_url, room_id, None, None, None).await
    }

    pub async fn connect_with_auth_token(
        relay_url: &str,
        room_id: &str,
        bearer_token: Option<&str>,
    ) -> Result<Self, String> {
        Self::connect_with_options(relay_url, room_id, None, None, bearer_token).await
    }

    pub async fn connect_with_tls_pin(
        relay_url: &str,
        room_id: &str,
        pinned_cert_pem: Option<&str>,
        pinned_cert_sha256: Option<&str>,
    ) -> Result<Self, String> {
        Self::connect_with_options(
            relay_url,
            room_id,
            pinned_cert_pem,
            pinned_cert_sha256,
            None,
        )
        .await
    }

    pub async fn connect_target_with_tls_pin(
        target_url: &str,
        pinned_cert_pem: Option<&str>,
        pinned_cert_sha256: Option<&str>,
        bearer_token: Option<&str>,
    ) -> Result<Self, String> {
        Self::connect_target_url(
            target_url,
            pinned_cert_pem,
            pinned_cert_sha256,
            bearer_token,
            None,
        )
        .await
    }

    async fn connect_with_options(
        relay_url: &str,
        room_id: &str,
        pinned_cert_pem: Option<&str>,
        pinned_cert_sha256: Option<&str>,
        bearer_token: Option<&str>,
    ) -> Result<Self, String> {
        let url = format!("{}/relay/room/{}", relay_url.trim_end_matches('/'), room_id);
        Self::connect_target_url(
            url.as_str(),
            pinned_cert_pem,
            pinned_cert_sha256,
            bearer_token,
            Some((relay_url, room_id)),
        )
        .await
    }

    async fn connect_target_url(
        target_url: &str,
        pinned_cert_pem: Option<&str>,
        pinned_cert_sha256: Option<&str>,
        bearer_token: Option<&str>,
        relay_context: Option<(&str, &str)>,
    ) -> Result<Self, String> {
        ensure_crypto_provider_installed()?;

        let room_id_len = relay_context.map_or(0, |(_, room_id)| room_id.len());
        info!(
            relay_url = relay_context.map_or("-", |(relay_url, _)| relay_url),
            target_url = %target_url,
            room_id_len = room_id_len,
            is_tls = target_url.starts_with("wss://"),
            has_pinned_cert = pinned_cert_pem.is_some(),
            has_pinned_sha256 = pinned_cert_sha256.is_some(),
            has_bearer_token = bearer_token.map(str::trim).is_some_and(|v| !v.is_empty()),
            timeout_secs = CONNECT_TIMEOUT.as_secs(),
            "TCP stealth transport connect started"
        );

        let mut request = target_url
            .to_string()
            .into_client_request()
            .map_err(|e| format!("tcp stealth request: {e}"))?;
        request.headers_mut().insert(
            HeaderName::from_static("capsule-protocol"),
            HeaderValue::from_static("?1"),
        );
        if let Some(token) = bearer_token.map(str::trim).filter(|v| !v.is_empty()) {
            let value = HeaderValue::from_str(format!("Bearer {token}").as_str())
                .map_err(|e| format!("tcp stealth authorization header: {e}"))?;
            request
                .headers_mut()
                .insert(HeaderName::from_static("authorization"), value);
        }

        let (ws_stream, response) = if target_url.starts_with("wss://") && pinned_cert_pem.is_some()
        {
            info!(
                target_url = %target_url,
                "TCP stealth connecting with pinned TLS connector"
            );
            let connector = build_pinned_tls_connector(
                pinned_cert_pem.expect("guarded by is_some check"),
                pinned_cert_sha256,
            )?;
            match tokio::time::timeout(
                CONNECT_TIMEOUT,
                connect_async_tls_with_config(request, None, false, Some(connector)),
            )
            .await
            {
                Ok(Ok(result)) => result,
                Ok(Err(e)) => return Err(format!("tcp stealth tls connect: {e}")),
                Err(_) => {
                    warn!(
                        target_url = %target_url,
                        timeout_secs = CONNECT_TIMEOUT.as_secs(),
                        "TCP stealth pinned TLS connect timed out"
                    );
                    return Err(format!(
                        "tcp stealth tls connect timeout after {}s",
                        CONNECT_TIMEOUT.as_secs()
                    ));
                }
            }
        } else {
            info!(
                target_url = %target_url,
                "TCP stealth connecting without pinned TLS connector"
            );
            match tokio::time::timeout(CONNECT_TIMEOUT, connect_async(request)).await {
                Ok(Ok(result)) => result,
                Ok(Err(e)) => return Err(format!("tcp stealth connect: {e}")),
                Err(_) => {
                    warn!(
                        target_url = %target_url,
                        timeout_secs = CONNECT_TIMEOUT.as_secs(),
                        "TCP stealth connect timed out"
                    );
                    return Err(format!(
                        "tcp stealth connect timeout after {}s",
                        CONNECT_TIMEOUT.as_secs()
                    ));
                }
            }
        };
        info!(
            target_url = %target_url,
            status = %response.status(),
            "TCP stealth websocket handshake accepted"
        );

        let (tx, rx) = ws_stream.split();
        info!("TCP stealth transport connected to {}", target_url);
        Ok(Self { tx, rx })
    }
}

fn build_pinned_tls_connector(
    pinned_cert_pem: &str,
    pinned_cert_sha256: Option<&str>,
) -> Result<Connector, String> {
    let certs = parse_and_validate_pinned_certs(pinned_cert_pem, pinned_cert_sha256)?;

    let mut root_store = rustls::RootCertStore::empty();
    for item in certs {
        root_store
            .add(item)
            .map_err(|e| format!("add pinned cert to trust store: {e}"))?;
    }

    let tls_config = ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    Ok(Connector::Rustls(Arc::new(tls_config)))
}

fn parse_and_validate_pinned_certs(
    pinned_cert_pem: &str,
    pinned_cert_sha256: Option<&str>,
) -> Result<Vec<rustls::pki_types::CertificateDer<'static>>, String> {
    let certs = {
        let mut reader = std::io::Cursor::new(pinned_cert_pem.as_bytes());
        rustls_pemfile::certs(&mut reader)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("parse pinned cert pem: {e}"))?
    };
    let cert = certs
        .first()
        .ok_or_else(|| "pinned_cert_pem has no certificate".to_string())?;
    if let Some(expected_sha256) = pinned_cert_sha256 {
        let digest = Sha256::digest(cert.as_ref());
        let actual_sha256 = format!("sha256/{}", general_purpose::STANDARD.encode(digest));
        if expected_sha256.trim() != actual_sha256 {
            return Err(format!(
                "tls cert fingerprint mismatch: expected {}, got {}",
                expected_sha256.trim(),
                actual_sha256
            ));
        }
    }
    Ok(certs)
}

#[async_trait]
impl RemoteTransport for TcpStealthTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.tx
            .send(Message::Binary(data.to_vec().into()))
            .await
            .map_err(|e| TransportError::Io(format!("tcp stealth send: {}", e)))
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        loop {
            match self.rx.next().await {
                Some(Ok(Message::Binary(data))) => return Ok(data.to_vec()),
                Some(Ok(Message::Close(_))) | None => return Err(TransportError::Closed),
                Some(Ok(_)) => continue,
                Some(Err(e)) => {
                    return Err(TransportError::Io(format!("tcp stealth recv: {}", e)));
                }
            }
        }
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.tx
            .send(Message::Close(None))
            .await
            .map_err(|e| TransportError::Io(format!("tcp stealth close: {}", e)))
    }

    fn transport_type(&self) -> TransportType {
        TransportType::TcpStealth
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use chromvoid_core::rpc::RpcStreamMeta;
    use chromvoid_protocol::{frame_continuation, Frame, FrameType, FLAG_HAS_CONTINUATION};
    use serde_json::json;
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;
    use tokio_tungstenite::accept_hdr_async;
    use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

    const SAMPLE_CERT_PEM: &str = "-----BEGIN CERTIFICATE-----\nMIIDCTCCAfGgAwIBAgIUbyiJBsfeBUOXg/gZRfjay96LKsUwDQYJKoZIhvcNAQEL\nBQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDIxNTE5MDIwNFoXDTI3MDIx\nNTE5MDIwNFowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF\nAAOCAQ8AMIIBCgKCAQEAp6FvGma4uLpYwcVrYk35qG92qTY20FafGVpYY0hCj3Jz\nI5DvevBGqdttcHDiLeq1g0SYaq9dRU+L7eELcrw5DKGlDHlx41l3xfL6ioHG8SR/\nbY68VKbCneWxand0G038+z5UXE8U54u2w02zqweU16Pn95VWcFJHtVwno+9R7B3w\nwo5w+mPhByfeBOwbY86g7NQF0z+7Lo2Ydwux/9qx1sngCso838mAxizTJl5nI9DE\nutZSmtngkbuTVYBe4PKQbmC/renVh/xAHWAJNMiJm3i0hMfs4WjvDgkbH+VcONUe\nPK5pf95WlXO7IahHRXuGINua307OnUuBH//nB92p1wIDAQABo1MwUTAdBgNVHQ4E\nFgQUaKv5xeSnKWxKoUpT1+tLbJVQ1l8wHwYDVR0jBBgwFoAUaKv5xeSnKWxKoUpT\n1+tLbJVQ1l8wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEASidM\n4y/M/4QbU1CdgsbSQ+n0cbZLX7eOnA3bZ4UtynE5oB4Z9Fg+LAI9f4Kb1B37ua00\nAvc+gpzbuzAIg/1bkWBNuNqOOrB+tVxNTH/HBCZDn8WCFShVF9shfI0DhTWTZRjk\n0ST/HtyOBSAflcVfMOjMU8sk2OuNQQmEoRlb3InMBxuaGS+uYSIbumn0yx4uKLTJ\nSWduO5xtaVFaLAJSjEQfBejYlwq/u//PJ/v5H16ttV9A9VcnMd7jmfsW1Ta7Y/QG\njEFOhdHdGbsWJQ5FWCRbspsJNcNzD3eXUph9M5033PkCj+btX9G049S/Of0amVRv\nXdopKSkZ8NPA9GPUVw==\n-----END CERTIFICATE-----\n";

    fn cert_sha256(pem: &str) -> String {
        let certs = {
            let mut reader = std::io::Cursor::new(pem.as_bytes());
            rustls_pemfile::certs(&mut reader)
                .collect::<Result<Vec<_>, _>>()
                .expect("parse cert")
        };
        let digest = Sha256::digest(certs[0].as_ref());
        format!("sha256/{}", general_purpose::STANDARD.encode(digest))
    }

    #[test]
    fn pinned_tls_cert_matching_fingerprint_passes() {
        let expected = cert_sha256(SAMPLE_CERT_PEM);
        let result = parse_and_validate_pinned_certs(SAMPLE_CERT_PEM, Some(expected.as_str()));
        assert!(result.is_ok());
    }

    #[test]
    fn pinned_tls_cert_mismatch_fails() {
        let result = parse_and_validate_pinned_certs(SAMPLE_CERT_PEM, Some("sha256/not-the-same"));
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn connect_sets_capsule_protocol_header() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (header_tx, header_rx) = oneshot::channel::<String>();

        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut header_tx = Some(header_tx);
            let _ws = accept_hdr_async(stream, move |req: &Request, resp: Response| {
                if let Some(tx) = header_tx.take() {
                    let header_val = req
                        .headers()
                        .get("capsule-protocol")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    let _ = tx.send(header_val);
                }
                Ok(resp)
            })
            .await
            .unwrap();
        });

        let relay = format!("ws://{}", addr);
        let mut transport = TcpStealthTransport::connect(&relay, "room-a")
            .await
            .unwrap();
        let header = header_rx.await.unwrap();
        assert_eq!(header, "?1");
        transport.close().await.unwrap();
    }

    #[tokio::test]
    async fn rpc_and_continuation_frames_roundtrip() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = accept_hdr_async(stream, |_req: &Request, resp: Response| Ok(resp))
                .await
                .unwrap();

            let first = ws.next().await.unwrap().unwrap();
            let req_frame = match first {
                Message::Binary(data) => Frame::decode(&data).unwrap(),
                _ => panic!("expected binary request frame"),
            };
            assert_eq!(req_frame.frame_type, FrameType::RpcRequest);
            assert_eq!(req_frame.message_id, 777);
            assert_ne!(req_frame.flags & FLAG_HAS_CONTINUATION, 0);

            let cont1 = ws.next().await.unwrap().unwrap();
            let cont1_frame = match cont1 {
                Message::Binary(data) => Frame::decode(&data).unwrap(),
                _ => panic!("expected first continuation frame"),
            };
            assert_eq!(cont1_frame.frame_type, FrameType::RpcRequest);
            assert_eq!(cont1_frame.message_id, 777);
            assert_eq!(cont1_frame.payload, b"chunk-1");
            assert_ne!(cont1_frame.flags & FLAG_HAS_CONTINUATION, 0);

            let cont2 = ws.next().await.unwrap().unwrap();
            let cont2_frame = match cont2 {
                Message::Binary(data) => Frame::decode(&data).unwrap(),
                _ => panic!("expected second continuation frame"),
            };
            assert_eq!(cont2_frame.frame_type, FrameType::RpcRequest);
            assert_eq!(cont2_frame.message_id, 777);
            assert_eq!(cont2_frame.payload, b"chunk-2");
            assert_eq!(cont2_frame.flags & FLAG_HAS_CONTINUATION, 0);

            let response = Frame {
                frame_type: FrameType::RpcResponse,
                message_id: 777,
                flags: 0,
                payload: serde_json::to_vec(&json!({"ok": true, "result": {"pong": true}}))
                    .unwrap(),
            };
            ws.send(Message::Binary(response.encode().into()))
                .await
                .unwrap();

            let meta = RpcStreamMeta {
                name: "payload.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                size: 12,
                chunk_size: 6,
            };
            let stream_meta = Frame {
                frame_type: FrameType::RpcResponse,
                message_id: 777,
                flags: FLAG_HAS_CONTINUATION,
                payload: serde_json::to_vec(&meta).unwrap(),
            };
            ws.send(Message::Binary(stream_meta.encode().into()))
                .await
                .unwrap();

            let chunk_a = frame_continuation(FrameType::RpcResponse, 777, b"part-a".to_vec(), true);
            ws.send(Message::Binary(chunk_a.encode().into()))
                .await
                .unwrap();

            let chunk_b =
                frame_continuation(FrameType::RpcResponse, 777, b"part-b".to_vec(), false);
            ws.send(Message::Binary(chunk_b.encode().into()))
                .await
                .unwrap();
        });

        let relay = format!("ws://{}", addr);
        let mut transport = TcpStealthTransport::connect(&relay, "room-b")
            .await
            .unwrap();

        let req = Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 777,
            flags: FLAG_HAS_CONTINUATION,
            payload: serde_json::to_vec(&json!({"v": 1, "command": "ping", "data": {}})).unwrap(),
        };
        transport.send(&req.encode()).await.unwrap();

        let req_chunk1 = frame_continuation(FrameType::RpcRequest, 777, b"chunk-1".to_vec(), true);
        transport.send(&req_chunk1.encode()).await.unwrap();
        let req_chunk2 = frame_continuation(FrameType::RpcRequest, 777, b"chunk-2".to_vec(), false);
        transport.send(&req_chunk2.encode()).await.unwrap();

        let response = Frame::decode(&transport.recv().await.unwrap()).unwrap();
        assert_eq!(response.frame_type, FrameType::RpcResponse);
        assert_eq!(response.message_id, 777);

        let stream_meta = Frame::decode(&transport.recv().await.unwrap()).unwrap();
        assert_eq!(stream_meta.frame_type, FrameType::RpcResponse);
        assert_ne!(stream_meta.flags & FLAG_HAS_CONTINUATION, 0);

        let stream_chunk1 = Frame::decode(&transport.recv().await.unwrap()).unwrap();
        assert_eq!(stream_chunk1.payload, b"part-a");
        assert_ne!(stream_chunk1.flags & FLAG_HAS_CONTINUATION, 0);

        let stream_chunk2 = Frame::decode(&transport.recv().await.unwrap()).unwrap();
        assert_eq!(stream_chunk2.payload, b"part-b");
        assert_eq!(stream_chunk2.flags & FLAG_HAS_CONTINUATION, 0);

        transport.close().await.unwrap();
    }

    #[tokio::test]
    async fn rpc_request_response_roundtrip() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = accept_hdr_async(stream, |_req: &Request, resp: Response| Ok(resp))
                .await
                .unwrap();

            let first = ws.next().await.unwrap().unwrap();
            let req_frame = match first {
                Message::Binary(data) => Frame::decode(&data).unwrap(),
                _ => panic!("expected binary request frame"),
            };
            assert_eq!(req_frame.frame_type, FrameType::RpcRequest);
            assert_eq!(req_frame.message_id, 42);

            let response = Frame {
                frame_type: FrameType::RpcResponse,
                message_id: 42,
                flags: 0,
                payload: serde_json::to_vec(&json!({"ok": true, "result": {"pong": true}}))
                    .unwrap(),
            };
            ws.send(Message::Binary(response.encode().into()))
                .await
                .unwrap();
        });

        let relay = format!("ws://{}", addr);
        let mut transport = TcpStealthTransport::connect(&relay, "room-c")
            .await
            .unwrap();

        let req = Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 42,
            flags: 0,
            payload: serde_json::to_vec(&json!({"v": 1, "command": "ping", "data": {}})).unwrap(),
        };
        transport.send(&req.encode()).await.unwrap();

        let response = Frame::decode(&transport.recv().await.unwrap()).unwrap();
        assert_eq!(response.frame_type, FrameType::RpcResponse);
        assert_eq!(response.message_id, 42);
        transport.close().await.unwrap();
    }
}
