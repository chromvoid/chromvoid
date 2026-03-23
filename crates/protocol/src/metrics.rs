//! Transport connection metrics for observability and diagnostics.
//!
//! Collected by `FallbackManager` during connection establishment and
//! exposed via the `network_transport_metrics` Tauri IPC command.

use serde::{Deserialize, Serialize};

use crate::transport::TransportType;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransportMetricEventKind {
    TransportAttempt,
    TransportSuccess,
    TransportFail,
    FallbackTriggered,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TransportMetricEvent {
    pub kind: TransportMetricEventKind,
    pub transport: TransportType,
    pub next_transport: Option<TransportType>,
    pub reason: Option<String>,
    pub elapsed_ms: u64,
}

/// Metrics collected during a remote transport connection attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportMetrics {
    /// The transport that was ultimately used.
    pub transport_type: Option<TransportType>,

    /// Total time from connection start to ready state (milliseconds).
    pub connection_time_ms: u64,

    /// If the connection failed, the reason.
    pub failure_reason: Option<String>,

    /// Number of connection attempts (including retries).
    pub attempt_count: u32,

    /// Whether QUIC MASQUE was attempted.
    pub quic_attempted: bool,

    /// Whether QUIC failed because UDP appears unavailable/blocked.
    pub quic_udp_blocked: bool,

    /// Whether WebRTC was attempted.
    pub webrtc_attempted: bool,

    /// Whether WSS relay was attempted.
    pub wss_attempted: bool,

    /// Whether TCP stealth relay was attempted.
    pub tcp_stealth_attempted: bool,

    /// Number of ICE candidates gathered (WebRTC only).
    pub ice_candidates_gathered: u32,

    pub events: Vec<TransportMetricEvent>,

    pub fallback_transition_times_ms: Vec<u64>,

    pub fallback_transition_p95_ms: Option<u64>,
}

impl TransportMetrics {
    /// Create a new empty metrics instance.
    pub fn new() -> Self {
        Self {
            transport_type: None,
            connection_time_ms: 0,
            failure_reason: None,
            attempt_count: 0,
            quic_attempted: false,
            quic_udp_blocked: false,
            webrtc_attempted: false,
            wss_attempted: false,
            tcp_stealth_attempted: false,
            ice_candidates_gathered: 0,
            events: Vec::new(),
            fallback_transition_times_ms: Vec::new(),
            fallback_transition_p95_ms: None,
        }
    }

    pub fn emit_event(
        &mut self,
        kind: TransportMetricEventKind,
        transport: TransportType,
        next_transport: Option<TransportType>,
        reason: Option<String>,
        elapsed_ms: u64,
    ) {
        self.events.push(TransportMetricEvent {
            kind,
            transport,
            next_transport,
            reason,
            elapsed_ms,
        });
    }

    pub fn record_fallback_transition(&mut self, transition_time_ms: u64) {
        self.fallback_transition_times_ms.push(transition_time_ms);
        self.fallback_transition_p95_ms = Some(Self::p95(&self.fallback_transition_times_ms));
    }

    fn p95(values: &[u64]) -> u64 {
        if values.is_empty() {
            return 0;
        }

        let mut sorted = values.to_vec();
        sorted.sort_unstable();
        let idx = ((sorted.len() - 1) * 95) / 100;
        sorted[idx]
    }
}

impl Default for TransportMetrics {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[path = "metrics_tests.rs"]
mod tests;
