//! Signaling WebSocket client for WebRTC negotiation via relay server.

use chromvoid_protocol::SignalingMessage;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, error};

/// Signaling client connected to a relay room.
pub struct SignalingClient {
    /// Send signaling messages to the relay.
    tx: mpsc::Sender<SignalingMessage>,
    /// Receive signaling messages from the relay.
    rx: mpsc::Receiver<SignalingMessage>,
}

impl SignalingClient {
    /// Connect to the relay signaling endpoint.
    ///
    /// URL format: `ws(s)://{relay}/signal/room/{room_id}`
    pub async fn connect(relay_url: &str, room_id: &str) -> Result<Self, String> {
        let url = format!(
            "{}/signal/room/{}",
            relay_url.trim_end_matches('/'),
            room_id
        );
        let (ws_stream, _) = connect_async(&url)
            .await
            .map_err(|e| format!("signaling connect: {}", e))?;

        let (mut ws_tx, mut ws_rx) = ws_stream.split();

        // Outbound: signaling messages → WebSocket
        let (out_tx, mut out_rx) = mpsc::channel::<SignalingMessage>(32);
        tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                let json = match serde_json::to_string(&msg) {
                    Ok(j) => j,
                    Err(e) => {
                        error!("signaling serialize: {}", e);
                        continue;
                    }
                };
                if ws_tx.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        });

        // Inbound: WebSocket → signaling messages
        let (in_tx, in_rx) = mpsc::channel::<SignalingMessage>(32);
        tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_rx.next().await {
                match msg {
                    Message::Text(text) => match serde_json::from_str::<SignalingMessage>(&text) {
                        Ok(signal) => {
                            if in_tx.send(signal).await.is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            debug!("signaling parse: {}", e);
                        }
                    },
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        });

        Ok(Self {
            tx: out_tx,
            rx: in_rx,
        })
    }

    /// Send a signaling message to the peer via the relay.
    pub async fn send(&self, msg: SignalingMessage) -> Result<(), String> {
        self.tx
            .send(msg)
            .await
            .map_err(|_| "signaling channel closed".to_string())
    }

    /// Receive the next signaling message from the peer.
    pub async fn recv(&mut self) -> Option<SignalingMessage> {
        self.rx.recv().await
    }

    /// Clone the sender for use in callbacks (e.g., ICE candidate trickle).
    pub fn clone_sender(&self) -> mpsc::Sender<SignalingMessage> {
        self.tx.clone()
    }
}
