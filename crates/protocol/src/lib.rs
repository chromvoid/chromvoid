//! ChromVoid Protocol — shared transport-level primitives.
//!
//! This crate contains the protocol types used by both the Desktop (Tauri) app
//! and the Orange Pi daemon:
//!
//! - **Frame**: Binary frame encoding/decoding (SPEC-002)
//! - **AntiReplay**: Monotonic message ID enforcement with streaming support
//! - **Noise**: XX/IK Noise Protocol transport (ADR-006)
//! - **Transport**: Remote transport abstraction (async, feature-gated)
//! - **Signaling**: WebRTC signaling message types (SPEC-003)
//! - **Metrics**: Transport connection metrics

pub mod anti_replay;
pub mod frame;
pub mod metrics;
pub mod noise;
pub mod signaling;
pub mod transport;

pub use anti_replay::AntiReplay;
pub use frame::{
    error_codes, frame_continuation, frame_from_error, frame_from_heartbeat, validate_timestamp,
    Frame, FrameType, FLAG_HAS_CONTINUATION, HEADER_SIZE, MAX_PAYLOAD_SIZE,
};
pub use metrics::{TransportMetricEvent, TransportMetricEventKind, TransportMetrics};
pub use noise::{
    NoiseError, NoiseTransport, MAX_HANDSHAKE_MSG, NOISE_PARAMS_IK, NOISE_PARAMS_XX,
    NOISE_PARAMS_XXPSK0,
};
pub use signaling::SignalingMessage;
pub use transport::{TransportError, TransportType};

#[cfg(feature = "async-transport")]
pub use transport::RemoteTransport;
