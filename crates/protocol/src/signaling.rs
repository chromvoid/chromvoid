//! Signaling message types for WebRTC negotiation (SPEC-003).
//!
//! Used by the signaling WebSocket client to exchange SDP offers/answers
//! and ICE candidates between peers via the relay server.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Timeout for the entire connection establishment (WebRTC + fallback).
pub const CONNECTION_TIMEOUT: Duration = Duration::from_secs(10);

/// Timeout for the SDP offer/answer exchange.
pub const OFFER_TIMEOUT: Duration = Duration::from_secs(30);

/// Timeout for ICE candidate gathering.
pub const ICE_GATHERING_TIMEOUT: Duration = Duration::from_secs(5);

/// Timeout for establishing P2P connectivity after ICE exchange.
pub const P2P_TIMEOUT: Duration = Duration::from_secs(15);

/// Signaling messages exchanged via the relay's signaling WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalingMessage {
    /// SDP offer from the initiator.
    Offer { sdp: String, id: String },

    /// SDP answer from the responder.
    Answer { sdp: String, in_response_to: String },

    /// ICE candidate for trickle ICE.
    Candidate {
        candidate: String,
        sdp_mid: Option<String>,
        sdp_m_line_index: Option<u16>,
    },

    /// Signaling error from relay or peer.
    Error { code: u16, message: String },
}

#[cfg(test)]
#[path = "signaling_tests.rs"]
mod tests;
