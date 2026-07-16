use super::*;
use chromvoid_protocol::{TransportError, TransportType, MAX_HANDSHAKE_MSG, NOISE_PARAMS_XX};
use snow::Builder;
use std::sync::mpsc;

#[path = "rpc_loop_tests/classification.rs"]
mod classification;
#[path = "rpc_loop_tests/heartbeat.rs"]
mod heartbeat;
#[path = "rpc_loop_tests/incoming_upload.rs"]
mod incoming_upload;
#[path = "rpc_loop_tests/media_inspection.rs"]
mod media_inspection;
#[path = "rpc_loop_tests/outgoing_streams.rs"]
mod outgoing_streams;
#[path = "rpc_loop_tests/pre_approval.rs"]
mod pre_approval;
#[path = "rpc_loop_tests/remote_boundary.rs"]
mod remote_boundary;
#[path = "rpc_loop_tests/shutdown.rs"]
mod shutdown;
#[path = "rpc_loop_tests/startup.rs"]
mod startup;
#[path = "rpc_loop_tests/support.rs"]
mod support;
