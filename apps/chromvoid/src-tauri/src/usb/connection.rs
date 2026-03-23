use crate::core_adapter::ConnectionState;
use crate::gateway::protocol::{frame_from_rpc_request, AntiReplay, Frame};
use chromvoid_core::rpc::types::RpcRequest;
use serde_json::Value;
use std::time::{Duration, Instant};
use tracing::info;

use super::noise_session::{NoiseError, NoiseTransport};

/// Heartbeat interval (ADR-004: 30s for remote connections).
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
/// Connection timeout before declaring disconnected.
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(30);
/// Maximum reconnect attempts before giving up.
pub(crate) const MAX_RECONNECT_ATTEMPTS: u32 = 3;
/// Backoff base for reconnection (doubles each attempt).
const RECONNECT_BACKOFF_BASE: Duration = Duration::from_secs(2);

#[derive(Debug)]
pub enum ConnectionError {
    Transport(super::transport::TransportError),
    Noise(NoiseError),
    Protocol(String),
    Timeout,
    Disconnected,
    NotPaired,
}

impl std::fmt::Display for ConnectionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Transport(e) => write!(f, "transport error: {}", e),
            Self::Noise(e) => write!(f, "noise error: {}", e),
            Self::Protocol(msg) => write!(f, "protocol error: {}", msg),
            Self::Timeout => write!(f, "connection timed out"),
            Self::Disconnected => write!(f, "disconnected"),
            Self::NotPaired => write!(f, "device not paired"),
        }
    }
}

impl std::error::Error for ConnectionError {}

/// Manages a single USB connection to an Orange Pi device.
///
/// Owns the connection state machine (ADR-004 section 2.3), Noise transport,
/// anti-replay window, heartbeat tracking, and reconnection logic.
pub struct UsbConnectionManager {
    state: ConnectionState,
    port_path: Option<String>,
    noise: Option<NoiseTransport>,
    anti_replay: AntiReplay,
    next_message_id: u64,
    last_heartbeat: Option<Instant>,
    reconnect_attempts: u32,
    pending_events: Vec<Value>,
}

impl UsbConnectionManager {
    /// Create a new connection manager in the Disconnected state.
    /// The starting message ID is randomised to avoid predictable sequences.
    pub fn new() -> Self {
        Self {
            state: ConnectionState::Disconnected,
            port_path: None,
            noise: None,
            anti_replay: AntiReplay::new(),
            next_message_id: rand::random::<u64>(),
            last_heartbeat: None,
            reconnect_attempts: 0,
            pending_events: Vec::new(),
        }
    }

    /// Returns the current connection state.
    pub fn state(&self) -> ConnectionState {
        self.state
    }

    /// Returns `true` when the connection is in an active state
    /// (Ready, Locked, or Syncing).
    pub fn is_connected(&self) -> bool {
        matches!(
            self.state,
            ConnectionState::Ready | ConnectionState::Locked | ConnectionState::Syncing
        )
    }

    /// Returns the next monotonically-increasing message ID.
    pub(crate) fn next_msg_id(&mut self) -> u64 {
        let id = self.next_message_id;
        self.next_message_id = self.next_message_id.wrapping_add(1);
        id
    }

    /// Transition to a new connection state.
    /// Logs the transition and pushes a `connection:state` event into
    /// `pending_events` for the UI layer to consume.
    pub fn transition(&mut self, new_state: ConnectionState) {
        let old = self.state;
        self.state = new_state;
        info!("USB connection state: {:?} -> {:?}", old, new_state);
        let event = serde_json::json!({
            "type": "connection:state",
            "old_state": format!("{:?}", old).to_lowercase(),
            "new_state": format!("{:?}", new_state).to_lowercase(),
        });
        self.pending_events.push(event);
    }

    /// Drain and return all pending events, leaving the internal buffer empty.
    pub fn take_events(&mut self) -> Vec<Value> {
        std::mem::take(&mut self.pending_events)
    }

    /// Build an encrypted RPC request frame.
    ///
    /// Returns the plaintext `Frame` (for bookkeeping) and the encrypted
    /// bytes ready to be sent over the wire.
    pub fn send_rpc(&mut self, req: &RpcRequest) -> Result<(Frame, Vec<u8>), ConnectionError> {
        let msg_id = self.next_msg_id();
        let noise = self.noise.as_mut().ok_or(ConnectionError::Disconnected)?;
        let frame = frame_from_rpc_request(msg_id, req);
        let plaintext = frame.encode();
        let encrypted = noise.encrypt(&plaintext).map_err(ConnectionError::Noise)?;
        Ok((frame, encrypted))
    }

    /// Decrypt an incoming frame and validate it against the anti-replay window.
    pub fn receive_frame(&mut self, encrypted: &[u8]) -> Result<Frame, ConnectionError> {
        let noise = self.noise.as_mut().ok_or(ConnectionError::Disconnected)?;
        let plaintext = noise.decrypt(encrypted).map_err(ConnectionError::Noise)?;
        let frame =
            Frame::decode(&plaintext).map_err(|e| ConnectionError::Protocol(e.to_string()))?;
        self.anti_replay
            .check(frame.message_id)
            .map_err(|e| ConnectionError::Protocol(e.to_string()))?;
        self.last_heartbeat = Some(Instant::now());
        Ok(frame)
    }

    /// Reset all connection state back to Disconnected.
    pub fn disconnect(&mut self) {
        self.transition(ConnectionState::Disconnected);
        self.port_path = None;
        self.noise = None;
        self.anti_replay = AntiReplay::new();
        self.last_heartbeat = None;
        self.reconnect_attempts = 0;
    }

    /// Returns `true` if the time since the last heartbeat exceeds
    /// `CONNECTION_TIMEOUT`, indicating the remote device may be unreachable.
    pub fn is_heartbeat_expired(&self) -> bool {
        match self.last_heartbeat {
            Some(ts) => ts.elapsed() > CONNECTION_TIMEOUT,
            None => false,
        }
    }

    /// Install a completed Noise transport and transition to Syncing.
    pub fn set_noise_transport(&mut self, transport: NoiseTransport, port_path: String) {
        self.noise = Some(transport);
        self.port_path = Some(port_path);
        self.last_heartbeat = Some(Instant::now());
        self.reconnect_attempts = 0;
        self.transition(ConnectionState::Syncing);
    }

    /// Transition to the Ready state (vault unlocked on the remote device).
    pub fn mark_ready(&mut self) {
        self.transition(ConnectionState::Ready);
    }

    /// Transition to the Locked state (vault locked on the remote device).
    pub fn mark_locked(&mut self) {
        self.transition(ConnectionState::Locked);
    }

    /// Returns `true` if a reconnection attempt should be made: the
    /// connection must be Disconnected and the attempt counter must be
    /// below `MAX_RECONNECT_ATTEMPTS`.
    pub fn should_reconnect(&self) -> bool {
        self.state == ConnectionState::Disconnected
            && self.reconnect_attempts < MAX_RECONNECT_ATTEMPTS
    }

    /// Compute the backoff duration for the current reconnect attempt.
    /// Uses exponential backoff: `RECONNECT_BACKOFF_BASE * 2^attempts`.
    pub fn reconnect_backoff(&self) -> Duration {
        RECONNECT_BACKOFF_BASE * 2u32.pow(self.reconnect_attempts)
    }

    /// Record that a reconnection attempt was made (increments the counter).
    pub fn record_reconnect_attempt(&mut self) {
        self.reconnect_attempts += 1;
    }

    /// Returns the heartbeat interval constant.
    pub fn heartbeat_interval(&self) -> Duration {
        HEARTBEAT_INTERVAL
    }
}

#[cfg(test)]
#[path = "connection_tests.rs"]
mod tests;
