//! Network connection manager — mirrors `usb/connection.rs`.
//!
//! Manages a single network connection to a remote peer,
//! implementing the same state machine (ADR-004 section 2.3).

use crate::core_adapter::ConnectionState;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_protocol::{
    AntiReplay, Frame, FrameType, NoiseError, NoiseTransport, TransportMetricEventKind,
    TransportMetrics, TransportType,
};
use serde_json::Value;
use std::time::{Duration, Instant};
use tracing::info;

/// Construct an RPC request frame from a core RpcRequest.
fn frame_from_rpc_request(message_id: u64, req: &RpcRequest) -> Frame {
    let payload = serde_json::to_vec(req).unwrap_or_else(|_| b"{}".to_vec());
    Frame {
        frame_type: FrameType::RpcRequest,
        message_id,
        flags: 0,
        payload,
    }
}
use crate::network::safety::SafetyStatus;

/// Heartbeat interval (ADR-004: 30s for remote connections).
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
/// Connection timeout before declaring disconnected.
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(30);
/// Maximum reconnect attempts before giving up.
pub(crate) const MAX_RECONNECT_ATTEMPTS: u32 = 3;
/// Backoff base for reconnection (doubles each attempt).
const RECONNECT_BACKOFF_BASE: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportLifecycleState {
    Disconnected,
    Connecting,
    Fallback,
    Connected,
}

#[derive(Debug)]
pub enum NetworkConnectionError {
    Transport(chromvoid_protocol::TransportError),
    Noise(NoiseError),
    Protocol(String),
    Timeout,
    Disconnected,
    NotPaired,
}

impl std::fmt::Display for NetworkConnectionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Transport(e) => write!(f, "transport error: {}", e),
            Self::Noise(e) => write!(f, "noise error: {}", e),
            Self::Protocol(msg) => write!(f, "protocol error: {}", msg),
            Self::Timeout => write!(f, "connection timed out"),
            Self::Disconnected => write!(f, "disconnected"),
            Self::NotPaired => write!(f, "peer not paired"),
        }
    }
}

impl std::error::Error for NetworkConnectionError {}

/// Manages a single network connection to a remote peer.
///
/// The actual transport (`Box<dyn RemoteTransport>`) is owned by the I/O task
/// after `set_transport()` + `take_transport()`. This struct only tracks
/// connection state, Noise session (for `send_rpc`/`receive_frame`), and metrics.
pub struct NetworkConnectionManager {
    state: ConnectionState,
    noise: Option<NoiseTransport>,
    anti_replay: AntiReplay,
    next_message_id: u64,
    last_heartbeat: Option<Instant>,
    reconnect_attempts: u32,
    pending_events: Vec<Value>,
    transport_type: Option<TransportType>,
    metrics: TransportMetrics,
    safety: SafetyStatus,
    transport_lifecycle_state: TransportLifecycleState,
}

impl NetworkConnectionManager {
    /// Create a new connection manager in the Disconnected state.
    pub fn new() -> Self {
        Self {
            state: ConnectionState::Disconnected,
            noise: None,
            anti_replay: AntiReplay::new(),
            next_message_id: rand::random::<u64>(),
            last_heartbeat: None,
            reconnect_attempts: 0,
            pending_events: Vec::new(),
            transport_type: None,
            metrics: TransportMetrics::new(),
            safety: SafetyStatus::new(true),
            transport_lifecycle_state: TransportLifecycleState::Disconnected,
        }
    }

    pub fn state(&self) -> ConnectionState {
        self.state
    }

    pub fn is_connected(&self) -> bool {
        matches!(
            self.state,
            ConnectionState::Ready | ConnectionState::Locked | ConnectionState::Syncing
        )
    }

    pub fn transport_type(&self) -> Option<TransportType> {
        self.transport_type
    }

    pub fn metrics(&self) -> &TransportMetrics {
        &self.metrics
    }

    pub fn transport_lifecycle_state(&self) -> TransportLifecycleState {
        self.transport_lifecycle_state
    }

    pub fn safety(&self) -> &SafetyStatus {
        &self.safety
    }

    pub fn set_safety_fail_closed(&mut self, fail_closed: bool) {
        self.safety = SafetyStatus::new(fail_closed);
    }

    pub(crate) fn next_msg_id(&mut self) -> u64 {
        let id = self.next_message_id;
        self.next_message_id = self.next_message_id.wrapping_add(1);
        id
    }

    pub fn transition(&mut self, new_state: ConnectionState) {
        let old = self.state;
        self.state = new_state;
        info!("Network connection state: {:?} -> {:?}", old, new_state);
        let event = serde_json::json!({
            "type": "network:state",
            "old_state": format!("{:?}", old).to_lowercase(),
            "new_state": format!("{:?}", new_state).to_lowercase(),
        });
        self.pending_events.push(event);
    }

    pub fn take_events(&mut self) -> Vec<Value> {
        std::mem::take(&mut self.pending_events)
    }

    fn transition_transport_lifecycle(&mut self, new_state: TransportLifecycleState) {
        let old = self.transport_lifecycle_state;
        if old == new_state {
            return;
        }

        self.transport_lifecycle_state = new_state;
        let event = serde_json::json!({
            "type": "network:transport_state",
            "old_state": format!("{:?}", old).to_lowercase(),
            "new_state": format!("{:?}", new_state).to_lowercase(),
        });
        self.pending_events.push(event);
    }

    /// Build an encrypted RPC request frame.
    pub fn send_rpc(
        &mut self,
        req: &RpcRequest,
    ) -> Result<(Frame, Vec<u8>), NetworkConnectionError> {
        let msg_id = self.next_msg_id();
        let noise = self
            .noise
            .as_mut()
            .ok_or(NetworkConnectionError::Disconnected)?;
        let frame = frame_from_rpc_request(msg_id, req);
        let plaintext = frame.encode();
        let encrypted = noise
            .encrypt(&plaintext)
            .map_err(NetworkConnectionError::Noise)?;
        Ok((frame, encrypted))
    }

    /// Decrypt an incoming frame and validate anti-replay.
    pub fn receive_frame(&mut self, encrypted: &[u8]) -> Result<Frame, NetworkConnectionError> {
        let noise = self
            .noise
            .as_mut()
            .ok_or(NetworkConnectionError::Disconnected)?;
        let plaintext = noise
            .decrypt(encrypted)
            .map_err(NetworkConnectionError::Noise)?;
        let frame = Frame::decode(&plaintext)
            .map_err(|e| NetworkConnectionError::Protocol(e.to_string()))?;
        self.anti_replay
            .check(frame.message_id)
            .map_err(|e| NetworkConnectionError::Protocol(e.to_string()))?;
        self.last_heartbeat = Some(Instant::now());
        Ok(frame)
    }

    /// Install Noise session and record transport type, transition to Syncing.
    ///
    /// The actual transport is passed directly to the io_task; this method
    /// only records the type and installs the Noise session for frame helpers.
    pub fn set_noise_transport(&mut self, noise: NoiseTransport, transport_type: TransportType) {
        self.transport_type = Some(transport_type);
        self.noise = Some(noise);
        self.last_heartbeat = Some(Instant::now());
        self.reconnect_attempts = 0;
        self.safety.on_safe_transport_restored();
        self.transition(ConnectionState::Syncing);
        self.transition_transport_lifecycle(TransportLifecycleState::Connected);
    }

    /// Set metrics from fallback manager.
    pub fn set_metrics(&mut self, metrics: TransportMetrics) {
        for metric_event in &metrics.events {
            match metric_event.kind {
                TransportMetricEventKind::TransportAttempt => {
                    self.transition_transport_lifecycle(TransportLifecycleState::Connecting)
                }
                TransportMetricEventKind::FallbackTriggered => {
                    self.transition_transport_lifecycle(TransportLifecycleState::Fallback)
                }
                TransportMetricEventKind::TransportSuccess => {
                    self.transition_transport_lifecycle(TransportLifecycleState::Connected)
                }
                TransportMetricEventKind::TransportFail => {}
            }

            self.pending_events.push(serde_json::json!({
                "type": "network:transport_metric",
                "kind": format!("{:?}", metric_event.kind).to_lowercase(),
                "transport": metric_event.transport,
                "next_transport": metric_event.next_transport,
                "reason": metric_event.reason,
                "elapsed_ms": metric_event.elapsed_ms,
            }));
        }

        self.metrics = metrics;
    }

    pub fn disconnect(&mut self) {
        self.transition(ConnectionState::Disconnected);
        self.noise = None;
        self.anti_replay = AntiReplay::new();
        self.last_heartbeat = None;
        self.reconnect_attempts = 0;
        self.transport_type = None;
        self.safety.terminate_session();
        self.transition_transport_lifecycle(TransportLifecycleState::Disconnected);
    }

    pub fn begin_fallback_transition(&mut self) {
        self.safety.begin_fallback_transition();
        self.transition_transport_lifecycle(TransportLifecycleState::Fallback);
    }

    pub fn handle_transport_drop(&mut self) {
        self.transition(ConnectionState::Disconnected);
        self.noise = None;
        self.anti_replay = AntiReplay::new();
        self.last_heartbeat = None;
        self.transport_type = None;
        self.safety.on_transport_drop();
        self.transition_transport_lifecycle(TransportLifecycleState::Disconnected);
    }

    pub fn mark_transport_restored(&mut self) {
        self.safety.on_safe_transport_restored();
        self.transition_transport_lifecycle(TransportLifecycleState::Connected);
    }

    pub fn is_heartbeat_expired(&self) -> bool {
        match self.last_heartbeat {
            Some(ts) => ts.elapsed() > CONNECTION_TIMEOUT,
            None => false,
        }
    }

    pub fn mark_ready(&mut self) {
        self.transition(ConnectionState::Ready);
    }

    pub fn mark_locked(&mut self) {
        self.transition(ConnectionState::Locked);
    }

    pub fn should_reconnect(&self) -> bool {
        self.state == ConnectionState::Disconnected
            && self.reconnect_attempts < MAX_RECONNECT_ATTEMPTS
    }

    pub fn reconnect_backoff(&self) -> Duration {
        RECONNECT_BACKOFF_BASE * 2u32.pow(self.reconnect_attempts)
    }

    pub fn record_reconnect_attempt(&mut self) {
        self.reconnect_attempts += 1;
    }

    pub fn heartbeat_interval(&self) -> Duration {
        HEARTBEAT_INTERVAL
    }
}

#[cfg(test)]
#[path = "connection_tests.rs"]
mod tests;
