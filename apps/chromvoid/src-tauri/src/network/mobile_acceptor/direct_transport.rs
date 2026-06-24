#![cfg_attr(not(any(target_os = "android", test)), allow(dead_code))]

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chromvoid_protocol::{RemoteTransport, TransportType};

use crate::core_adapter::CoreAdapter;
use crate::mobile_usb::observability::{log_timeline_event, MobileUsbTimelineEvent};
use crate::mobile_usb::MobileUsbBridgeKind;

use super::accept;
use super::MobileAcceptorRuntimeState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DirectTransportStopReason {
    Shutdown,
    TransportClosed,
    Error,
}

impl DirectTransportStopReason {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Shutdown => "shutdown",
            Self::TransportClosed => "transport_closed",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DirectTransportSessionOutcome {
    pub(crate) peer_id: String,
    pub(crate) transport_type: TransportType,
    pub(crate) stop_reason: DirectTransportStopReason,
    pub(crate) duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DirectTransportTimelineContext {
    pub(crate) trace_id: String,
    pub(crate) usb_session_id: Option<String>,
    pub(crate) bridge_kind: Option<MobileUsbBridgeKind>,
}

impl DirectTransportTimelineContext {
    pub(crate) fn android_usb(session_id: impl Into<String>) -> Self {
        let session_id = session_id.into();
        Self {
            trace_id: session_id.clone(),
            usb_session_id: Some(session_id),
            bridge_kind: Some(MobileUsbBridgeKind::AndroidAoa),
        }
    }
}

pub(crate) async fn accept_direct_transport_until_closed(
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    peer_label: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    timeline_context: DirectTransportTimelineContext,
) -> Result<DirectTransportSessionOutcome, String> {
    let started_at = Instant::now();
    let result = accept::accept_transport_connection_until_closed_internal(
        runtime,
        adapter,
        storage_root,
        transport,
        transport_type,
        peer_label,
        shutdown_rx,
        Some(timeline_context.clone()),
    )
    .await;
    match result {
        Ok(result) => {
            let stop_reason = result
                .stop_reason
                .unwrap_or(DirectTransportStopReason::Error);
            let duration_ms = started_at.elapsed().as_millis() as u64;
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(&timeline_context.trace_id),
                usb_session_id: timeline_context.usb_session_id.as_deref(),
                owner: "android_host",
                phase: "session_ended",
                operation: "accept_direct_transport",
                duration_ms: Some(duration_ms),
                peer_id: Some(&result.peer_id),
                bridge_kind: timeline_context.bridge_kind,
                stop_reason: Some(stop_reason.as_str()),
                ..MobileUsbTimelineEvent::default()
            });
            Ok(DirectTransportSessionOutcome {
                peer_id: result.peer_id,
                transport_type,
                stop_reason,
                duration_ms,
            })
        }
        Err(error) => {
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(&timeline_context.trace_id),
                usb_session_id: timeline_context.usb_session_id.as_deref(),
                owner: "android_host",
                phase: "session_ended",
                operation: "accept_direct_transport",
                duration_ms: Some(started_at.elapsed().as_millis() as u64),
                bridge_kind: timeline_context.bridge_kind,
                stop_reason: Some(DirectTransportStopReason::Error.as_str()),
                ..MobileUsbTimelineEvent::default()
            });
            Err(error)
        }
    }
}

pub(super) fn stop_reason_from_rpc_loop_result(
    result: &Result<(), String>,
) -> DirectTransportStopReason {
    match result {
        Ok(()) => DirectTransportStopReason::Shutdown,
        Err(error) if is_transport_closed_error(error) => {
            DirectTransportStopReason::TransportClosed
        }
        Err(_) => DirectTransportStopReason::Error,
    }
}

fn is_transport_closed_error(error: &str) -> bool {
    error.contains("transport closed")
        || error.contains("Transport closed")
        || error.contains("Broken pipe")
        || error.contains("broken pipe")
        || error.contains("UnexpectedEof")
        || error.contains("unexpected EOF")
        || error.contains("connection timed out")
        || error.contains("deadline has elapsed")
        || error.contains("TimedOut")
        || error.contains("Timeout")
        || error.contains("timeout")
        || error.contains("closed")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_reason_from_rpc_loop_result_maps_timeout_to_transport_closed() {
        let result: Result<(), String> = Err("connection timed out".to_string());

        assert_eq!(
            stop_reason_from_rpc_loop_result(&result),
            DirectTransportStopReason::TransportClosed,
        );
    }

    #[test]
    fn stop_reason_from_rpc_loop_result_maps_tokio_elapsed_to_transport_closed() {
        let result: Result<(), String> = Err("deadline has elapsed".to_string());

        assert_eq!(
            stop_reason_from_rpc_loop_result(&result),
            DirectTransportStopReason::TransportClosed,
        );
    }
}
