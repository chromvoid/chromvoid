//! Remote transport abstraction for async network communication.
//!
//! Provides the `RemoteTransport` trait used by both WebRTC DataChannel
//! and WSS relay transports. Feature-gated behind `async-transport` to
//! avoid pulling tokio/async-trait into the Orange Pi daemon.

#[cfg(feature = "async-transport")]
use async_trait::async_trait;

use serde::{Deserialize, Serialize};
use std::fmt;

/// Identifies the underlying transport mechanism.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportType {
    QuicMasque,
    WebRtcDataChannel,
    WssRelay,
    TcpStealth,
}

impl fmt::Display for TransportType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::QuicMasque => write!(f, "QUIC MASQUE"),
            Self::WebRtcDataChannel => write!(f, "WebRTC DataChannel"),
            Self::WssRelay => write!(f, "WSS Relay"),
            Self::TcpStealth => write!(f, "TCP Stealth"),
        }
    }
}

/// Errors that may occur during remote transport operations.
#[derive(Debug)]
pub enum TransportError {
    Closed,
    Timeout,
    Io(String),
}

impl fmt::Display for TransportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Closed => write!(f, "transport closed"),
            Self::Timeout => write!(f, "transport timeout"),
            Self::Io(msg) => write!(f, "transport I/O error: {}", msg),
        }
    }
}

impl std::error::Error for TransportError {}

/// Async trait for remote network transports.
///
/// Implemented by `WebRtcTransport` (DataChannel) and `WssTransport` (relay).
/// Both carry Noise-encrypted frames; the transport layer itself is
/// content-agnostic.
#[cfg(feature = "async-transport")]
#[async_trait]
pub trait RemoteTransport: Send {
    /// Send raw bytes over the transport.
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError>;

    /// Receive the next message from the transport.
    async fn recv(&mut self) -> Result<Vec<u8>, TransportError>;

    /// Gracefully close the transport.
    async fn close(&mut self) -> Result<(), TransportError>;

    /// Returns the type of this transport.
    fn transport_type(&self) -> TransportType;
}

#[cfg(test)]
#[path = "transport_tests.rs"]
mod tests;
