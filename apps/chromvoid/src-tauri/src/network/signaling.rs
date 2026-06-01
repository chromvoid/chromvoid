//! Signaling WebSocket client for WebRTC negotiation via relay server.

use std::time::Duration;

use chromvoid_protocol::SignalingMessage;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, error};

pub(crate) const SIGNALING_CLIENT_CLOSE_GRACE: Duration = Duration::from_secs(1);

/// Signaling client connected to a relay room.
pub struct SignalingClient {
    /// Send signaling messages to the relay.
    tx: mpsc::Sender<SignalingMessage>,
    /// Receive signaling messages from the relay.
    rx: mpsc::Receiver<SignalingMessage>,
    shutdown_tx: watch::Sender<bool>,
    outbound_task: Option<JoinHandle<()>>,
    inbound_task: Option<JoinHandle<()>>,
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
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let mut outbound_shutdown_rx = shutdown_rx.clone();
        let outbound_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    changed = outbound_shutdown_rx.changed() => {
                        if changed.is_ok() && *outbound_shutdown_rx.borrow() {
                            let _ = ws_tx.close().await;
                        }
                        break;
                    }
                    maybe_msg = out_rx.recv() => {
                        let Some(msg) = maybe_msg else {
                            let _ = ws_tx.close().await;
                            break;
                        };
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
                }
            }
        });

        // Inbound: WebSocket → signaling messages
        let (in_tx, in_rx) = mpsc::channel::<SignalingMessage>(32);
        let mut inbound_shutdown_rx = shutdown_rx;
        let inbound_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    changed = inbound_shutdown_rx.changed() => {
                        if changed.is_ok() && *inbound_shutdown_rx.borrow() {
                            break;
                        }
                    }
                    maybe_msg = ws_rx.next() => {
                        match maybe_msg {
                            Some(Ok(Message::Text(text))) => {
                                match serde_json::from_str::<SignalingMessage>(&text) {
                                    Ok(signal) => {
                                        if in_tx.send(signal).await.is_err() {
                                            break;
                                        }
                                    }
                                    Err(e) => {
                                        debug!("signaling parse: {}", e);
                                    }
                                }
                            }
                            Some(Ok(Message::Close(_))) | None => break,
                            Some(Ok(_)) => {}
                            Some(Err(error)) => {
                                debug!("signaling read: {}", error);
                                break;
                            }
                        }
                    },
                }
            }
        });

        Ok(Self {
            tx: out_tx,
            rx: in_rx,
            shutdown_tx,
            outbound_task: Some(outbound_task),
            inbound_task: Some(inbound_task),
        })
    }

    pub async fn close_with_grace(&mut self, grace: Duration) -> Result<(), String> {
        let _ = self.shutdown_tx.send(true);
        let mut errors = Vec::new();

        if let Some(handle) = self.outbound_task.take() {
            join_or_abort(handle, grace, "outbound", &mut errors).await;
        }
        if let Some(handle) = self.inbound_task.take() {
            join_or_abort(handle, grace, "inbound", &mut errors).await;
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
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

    #[cfg(test)]
    fn tasks_finished_for_test(&self) -> bool {
        self.outbound_task
            .as_ref()
            .map(|task| task.is_finished())
            .unwrap_or(true)
            && self
                .inbound_task
                .as_ref()
                .map(|task| task.is_finished())
                .unwrap_or(true)
    }
}

impl Drop for SignalingClient {
    fn drop(&mut self) {
        let _ = self.shutdown_tx.send(true);
        if let Some(handle) = self.outbound_task.take() {
            handle.abort();
        }
        if let Some(handle) = self.inbound_task.take() {
            handle.abort();
        }
    }
}

async fn join_or_abort(
    mut handle: JoinHandle<()>,
    grace: Duration,
    label: &str,
    errors: &mut Vec<String>,
) {
    match tokio::time::timeout(grace, &mut handle).await {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            errors.push(format!("signaling {label} task join failed: {error}"));
        }
        Err(_) => {
            handle.abort();
            let _ = handle.await;
            errors.push(format!("signaling {label} task timed out after {grace:?}"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future::Future;

    use tokio::net::{TcpListener, TcpStream};
    use tokio::sync::oneshot;
    use tokio_tungstenite::{accept_async, WebSocketStream};

    async fn spawn_signaling_server<F, Fut>(handler: F) -> (String, JoinHandle<()>)
    where
        F: FnOnce(WebSocketStream<TcpStream>) -> Fut + Send + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind signaling test server");
        let addr = listener.local_addr().expect("local addr");
        let task = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept websocket");
            let ws = accept_async(stream)
                .await
                .expect("accept websocket handshake");
            handler(ws).await;
        });
        (format!("ws://{addr}"), task)
    }

    #[tokio::test]
    async fn send_and_recv_still_roundtrip_signaling_messages() {
        let (relay_url, server_task) = spawn_signaling_server(|mut ws| async move {
            let msg = ws
                .next()
                .await
                .expect("client message")
                .expect("client message ok");
            let text = msg.into_text().expect("text message");
            let received: SignalingMessage =
                serde_json::from_str(text.as_str()).expect("parse signaling message");
            assert_eq!(
                received,
                SignalingMessage::Offer {
                    sdp: "offer-sdp".to_string(),
                    id: "offer-1".to_string(),
                }
            );

            let answer = SignalingMessage::Answer {
                sdp: "answer-sdp".to_string(),
                in_response_to: "offer-1".to_string(),
            };
            ws.send(Message::Text(
                serde_json::to_string(&answer)
                    .expect("serialize answer")
                    .into(),
            ))
            .await
            .expect("send answer");
        })
        .await;

        let mut client = SignalingClient::connect(&relay_url, "room-a")
            .await
            .expect("connect signaling");
        client
            .send(SignalingMessage::Offer {
                sdp: "offer-sdp".to_string(),
                id: "offer-1".to_string(),
            })
            .await
            .expect("send offer");

        let received = tokio::time::timeout(Duration::from_secs(1), client.recv())
            .await
            .expect("recv timeout")
            .expect("answer");
        assert_eq!(
            received,
            SignalingMessage::Answer {
                sdp: "answer-sdp".to_string(),
                in_response_to: "offer-1".to_string(),
            }
        );

        client
            .close_with_grace(SIGNALING_CLIENT_CLOSE_GRACE)
            .await
            .expect("close signaling");
        server_task.await.expect("server task");
    }

    #[tokio::test]
    async fn close_with_grace_stops_inbound_and_outbound_tasks() {
        let (relay_url, server_task) = spawn_signaling_server(|mut ws| async move {
            loop {
                match ws.next().await {
                    Some(Ok(_)) => {}
                    Some(Err(_)) | None => break,
                }
            }
        })
        .await;

        let mut client = SignalingClient::connect(&relay_url, "room-b")
            .await
            .expect("connect signaling");
        assert!(!client.tasks_finished_for_test());

        client
            .close_with_grace(SIGNALING_CLIENT_CLOSE_GRACE)
            .await
            .expect("close signaling");

        assert!(client.tasks_finished_for_test());
        server_task.await.expect("server task");
    }

    #[tokio::test]
    async fn close_with_grace_does_not_wait_for_sender_clones() {
        let (relay_url, server_task) = spawn_signaling_server(|mut ws| async move {
            loop {
                match ws.next().await {
                    Some(Ok(_)) => {}
                    Some(Err(_)) | None => break,
                }
            }
        })
        .await;

        let mut client = SignalingClient::connect(&relay_url, "room-c")
            .await
            .expect("connect signaling");
        let sender = client.clone_sender();
        let started = std::time::Instant::now();

        client
            .close_with_grace(Duration::from_millis(200))
            .await
            .expect("close signaling");

        assert!(started.elapsed() < Duration::from_secs(1));
        assert!(sender
            .send(SignalingMessage::Candidate {
                candidate: "candidate".to_string(),
                sdp_mid: None,
                sdp_m_line_index: None,
            })
            .await
            .is_err());
        server_task.await.expect("server task");
    }

    #[tokio::test]
    async fn drop_aborts_open_signaling_tasks() {
        let (closed_tx, closed_rx) = oneshot::channel::<()>();
        let (relay_url, server_task) = spawn_signaling_server(move |mut ws| async move {
            loop {
                match ws.next().await {
                    Some(Ok(_)) => {}
                    Some(Err(_)) | None => break,
                }
            }
            let _ = closed_tx.send(());
        })
        .await;

        let client = SignalingClient::connect(&relay_url, "room-d")
            .await
            .expect("connect signaling");
        drop(client);

        tokio::time::timeout(Duration::from_secs(1), closed_rx)
            .await
            .expect("server close timeout")
            .expect("server close signal");
        server_task.await.expect("server task");
    }
}
