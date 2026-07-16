//! ChromVoid Protocol — shared transport-level primitives.
//!
//! This crate contains the protocol types used by the Desktop (Tauri) app and
//! remote daemons:
//!
//! - **Frame**: Binary frame encoding/decoding (SPEC-002)
//! - **AntiReplay**: Monotonic message ID enforcement with streaming support
//! - **Noise**: XX/IK Noise Protocol transport (ADR-006)
//! - **Transport**: Remote transport abstraction (async, feature-gated)
//! - **Signaling**: WebRTC signaling message types (SPEC-003)
//! - **Metrics**: Transport connection metrics

pub mod agent;
pub mod agent_wire;
pub mod anti_replay;
pub mod frame;
pub mod metrics;
pub mod noise;
pub mod signaling;
pub mod transport;

pub use agent::{
    AgentCommandV1, AgentConnectionStatusV1, AgentEnvStatusV1, AgentErrorV1, AgentEventDataV1,
    AgentEventV1, AgentHelloV1, AgentPresetDraftV1, AgentPresetMetadataV1, AgentProfileDraftV1,
    AgentProfileMetadataV1, AgentProposalMetadataV1, AgentProposalStatusV1, AgentRequestV1,
    AgentResponseDataV1, AgentResponseV1, AgentRunMetadataV1, AgentRunStatusV1,
    AgentSecretMetadataV1, AgentVariableMappingV1, MutationOperationV1, AGENT_MAX_REASON_BYTES,
    AGENT_MAX_REQUEST_BYTES, AGENT_MAX_RESPONSE_BYTES, AGENT_OUTPUT_CHUNK_BYTES,
    AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION,
};
pub use agent_wire::{
    agent_frame_fragments, AgentFrameFragments, AgentFrameReassembler, AgentWireError,
    AGENT_FRAGMENT_REASSEMBLY_TIMEOUT_SECS,
};
pub use anti_replay::AntiReplay;
pub use frame::{
    error_codes, frame_continuation, frame_from_error, frame_from_heartbeat, validate_timestamp,
    Frame, FrameType, FLAG_HAS_CONTINUATION, HEADER_SIZE, MAX_FRAME_PAYLOAD_SIZE, MAX_PAYLOAD_SIZE,
    NOISE_TRANSPORT_TAG_BYTES,
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
