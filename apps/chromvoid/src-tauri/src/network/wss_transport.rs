//! WSS relay transport implementing `RemoteTransport`.
//!
//! Fallback transport when WebRTC cannot establish a P2P connection.
//! Connects to the relay server's binary forwarding endpoint and
//! exchanges raw Noise-encrypted frames.

use async_trait::async_trait;
use chromvoid_protocol::{RemoteTransport, TransportError, TransportType};
use futures_util::{SinkExt, StreamExt};
use std::sync::OnceLock;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{protocol::CloseFrame, Message},
};
use tracing::{info, warn};

const WSS_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
static CRYPTO_PROVIDER_INIT: OnceLock<Result<(), String>> = OnceLock::new();

fn close_frame_error(close_frame: Option<CloseFrame>) -> String {
    let (code, reason) = match close_frame {
        Some(frame) => {
            let reason = frame.reason.to_string();
            (
                u16::from(frame.code).to_string(),
                if reason.trim().is_empty() {
                    "<empty>".to_string()
                } else {
                    reason
                },
            )
        }
        None => ("none".to_string(), "<empty>".to_string()),
    };
    format!("wss closed code={} reason={}", code, reason)
}

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

/// WSS relay transport wrapping a tokio-tungstenite WebSocket in binary mode.
pub struct WssTransport {
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

impl WssTransport {
    /// Connect to the relay binary endpoint.
    ///
    /// URL format: `ws(s)://{relay}/relay/room/{room_id}`
    pub async fn connect(relay_url: &str, room_id: &str) -> Result<Self, String> {
        Self::connect_with_context(relay_url, room_id, "unspecified").await
    }

    pub async fn connect_with_context(
        relay_url: &str,
        room_id: &str,
        context: &str,
    ) -> Result<Self, String> {
        ensure_crypto_provider_installed()?;
        let url = format!("{}/relay/room/{}", relay_url.trim_end_matches('/'), room_id);
        info!(
            "WSS relay transport connecting: context={} room_id={} url={}",
            context, room_id, url
        );
        let connect_result = timeout(WSS_CONNECT_TIMEOUT, connect_async(&url)).await;
        let (ws_stream, _) = match connect_result {
            Ok(Ok(stream)) => stream,
            Ok(Err(error)) => {
                warn!(
                    "WSS relay transport failed to connect: context={} room_id={} url={} error={}",
                    context, room_id, url, error
                );
                return Err(format!("WSS connect: {}", error));
            }
            Err(_) => {
                warn!(
                    "WSS relay transport timed out: context={} room_id={} timeout_secs={} url={}",
                    context,
                    room_id,
                    WSS_CONNECT_TIMEOUT.as_secs(),
                    url
                );
                return Err(format!(
                    "WSS connect timeout after {}s: {}",
                    WSS_CONNECT_TIMEOUT.as_secs(),
                    url
                ));
            }
        };

        let (tx, rx) = ws_stream.split();
        info!(
            "WSS relay transport connected: context={} room_id={} url={}",
            context, room_id, url
        );
        Ok(Self { tx, rx })
    }
}

#[async_trait]
impl RemoteTransport for WssTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.tx
            .send(Message::Binary(data.to_vec().into()))
            .await
            .map_err(|e| TransportError::Io(format!("WSS send: {}", e)))
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        loop {
            match self.rx.next().await {
                Some(Ok(Message::Binary(data))) => return Ok(data.to_vec()),
                Some(Ok(Message::Close(close_frame))) => {
                    return Err(TransportError::Io(close_frame_error(close_frame)));
                }
                None => {
                    return Err(TransportError::Io(
                        "wss peer disconnected without close frame".to_string(),
                    ));
                }
                Some(Ok(_)) => continue, // skip text/ping/pong
                Some(Err(e)) => {
                    return Err(TransportError::Io(format!("WSS recv: {}", e)));
                }
            }
        }
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.tx
            .send(Message::Close(None))
            .await
            .map_err(|e| TransportError::Io(format!("WSS close: {}", e)))
    }

    fn transport_type(&self) -> TransportType {
        TransportType::WssRelay
    }
}
