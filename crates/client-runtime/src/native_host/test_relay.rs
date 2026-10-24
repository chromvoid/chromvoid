//! Local HTTP control plane and binary-forwarding relay; every vault/key is synthetic.
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio::task::{JoinHandle, JoinSet};
use tokio_tungstenite::{WebSocketStream, accept_async};

pub struct Relay {
    pub url: String,
    pub control: Arc<Mutex<Control>>,
    task: JoinHandle<()>,
}
#[derive(Default)]
pub struct Control {
    pub requests: usize,
    pub expired: bool,
    pub pairing_lifetime_ms: Option<u64>,
    pub pairing: Option<Value>,
    pub presence: Option<Value>,
    delayed_presence: Option<DelayedPresence>,
}
struct DelayedPresence {
    status: String,
    received: oneshot::Sender<()>,
    release: oneshot::Receiver<()>,
    applied: oneshot::Sender<()>,
}
pub struct HeldPresence {
    pub received: oneshot::Receiver<()>,
    pub release: oneshot::Sender<()>,
    pub applied: oneshot::Receiver<()>,
}
type Rooms = Arc<Mutex<HashMap<String, oneshot::Sender<WebSocketStream<TcpStream>>>>>;
impl Relay {
    /// Hold one HTTP mutation after reading its body, even if the client cancels it.
    pub fn hold_presence(&self, status: &str) -> HeldPresence {
        let (received_tx, received) = oneshot::channel();
        let (release, release_rx) = oneshot::channel();
        let (applied_tx, applied) = oneshot::channel();
        self.control.lock().unwrap().delayed_presence = Some(DelayedPresence {
            status: status.into(),
            received: received_tx,
            release: release_rx,
            applied: applied_tx,
        });
        HeldPresence {
            received,
            release,
            applied,
        }
    }

    pub async fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}", listener.local_addr().unwrap());
        let control = Arc::new(Mutex::new(Control::default()));
        let shared = control.clone();
        let relay_url = url.clone();
        let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));
        let task = tokio::spawn(async move {
            let mut children = JoinSet::new();
            loop {
                tokio::select! {
                    accepted=listener.accept()=> {
                        let (socket,_)=accepted.unwrap();
                        let (state,rooms,url)=(shared.clone(),rooms.clone(),relay_url.clone());
                        children.spawn(async move {handle(socket,state,rooms,url).await});
                    }
                    _=children.join_next(),if !children.is_empty()=>{}
                }
            }
        });
        Self { url, control, task }
    }
}
impl Drop for Relay {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn handle(mut socket: TcpStream, control: Arc<Mutex<Control>>, rooms: Rooms, url: String) {
    let mut peek = [0u8; 8_192];
    let path = loop {
        let count = socket.peek(&mut peek).await.unwrap();
        if count == 0 {
            return;
        }
        if let Some(end) = peek[..count].windows(2).position(|v| v == b"\r\n") {
            let line = std::str::from_utf8(&peek[..end]).unwrap();
            break line.split_whitespace().nth(1).unwrap().to_owned();
        }
        tokio::task::yield_now().await;
    };
    if let Some(room) = path.strip_prefix("/relay/room/") {
        let ws = accept_async(socket).await.unwrap();
        let (tx, rx) = oneshot::channel();
        let waiting = {
            let mut rooms = rooms.lock().unwrap();
            if let Some(waiting) = rooms.remove(room) {
                Some(waiting)
            } else {
                rooms.insert(room.to_owned(), tx);
                None
            }
        };
        if let Some(waiting) = waiting {
            let _ = waiting.send(ws);
            return;
        }
        let Ok(other) = rx.await else {
            return;
        };
        let (mut left_sink, mut left) = ws.split();
        let (mut right_sink, mut right) = other.split();
        loop {
            tokio::select! {
                next=left.next()=>match next {Some(Ok(message))=>{if right_sink.send(message).await.is_err(){break;}},_=>break},
                next=right.next()=>match next {Some(Ok(message))=>{if left_sink.send(message).await.is_err(){break;}},_=>break},
            }
        }
        return;
    }
    let mut bytes = Vec::new();
    let (header_end, length) = loop {
        let mut chunk = [0u8; 4_096];
        let count = socket.read(&mut chunk).await.unwrap();
        if count == 0 {
            return;
        }
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
            let header = std::str::from_utf8(&bytes[..end])
                .unwrap()
                .to_ascii_lowercase();
            let length = header
                .lines()
                .find_map(|line| line.strip_prefix("content-length:"))
                .map_or(0, |s| s.trim().parse::<usize>().unwrap());
            break (end + 4, length);
        }
    };
    while bytes.len() < header_end + length {
        let mut chunk = [0u8; 4_096];
        let count = socket.read(&mut chunk).await.unwrap();
        if count == 0 {
            return;
        }
        bytes.extend_from_slice(&chunk[..count]);
    }
    let body: Value = if length == 0 {
        json!({})
    } else {
        serde_json::from_slice(&bytes[header_end..header_end + length]).unwrap()
    };
    let delayed = {
        let mut state = control.lock().unwrap();
        if path.ends_with("/presence")
            && state
                .delayed_presence
                .as_ref()
                .is_some_and(|held| body["status"] == held.status)
        {
            state.delayed_presence.take()
        } else {
            None
        }
    };
    let applied = if let Some(held) = delayed {
        let _ = held.received.send(());
        let _ = held.release.await;
        Some(held.applied)
    } else {
        None
    };
    let response = {
        let mut state = control.lock().unwrap();
        state.requests += 1;
        if path == "/v1/ios/pairing-sessions" {
            let expires = if state.expired {
                1
            } else {
                now_ms() + state.pairing_lifetime_ms.unwrap_or(60_000)
            };
            state.pairing = Some(
                json!({"session_id":"synthetic-session","room_id":"synthetic-pairing","pin":"654321","relay_url":url,"expires_at_ms":expires,
                "offer":{"session_id":"synthetic-session","relay_base_url":url,"device_label":body["device_label"],"expires_at_ms":expires},
                "peer_id":body["peer_id"],"peer_pubkey_hex":body["peer_pubkey_hex"],"device_label":body["device_label"],"status":"waiting"}),
            );
            state.pairing.clone().unwrap()
        } else if path.starts_with("/v1/ios/pairing-sessions/") {
            state.pairing.clone().unwrap()
        } else if path.ends_with("/presence") {
            if length > 0 {
                state.presence = Some(
                    json!({"peer_id":path.split('/').nth(4).unwrap(),"relay_url":body["relay_url"],"room_id":body["room_id"],"status":body["status"],"expires_at_ms":now_ms()+body["ttl_ms"].as_u64().unwrap()}),
                );
            }
            state.presence.clone().unwrap()
        } else {
            panic!("unexpected control path {path}")
        }
    };
    let encoded = serde_json::to_vec(&response).unwrap();
    let headers = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        encoded.len()
    );
    let _ = socket.write_all(headers.as_bytes()).await;
    let _ = socket.write_all(&encoded).await;
    if let Some(applied) = applied {
        let _ = applied.send(());
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
