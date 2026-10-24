#![cfg_attr(not(test), allow(dead_code))]

use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chromvoid_protocol::{RemoteTransport, TransportError, TransportType};
#[cfg(test)]
use tokio::sync::oneshot;

use crate::core_adapter::CoreAdapter;
use crate::mobile_usb::observability::{log_timeline_event, MobileUsbTimelineEvent};
use crate::mobile_usb::MobileUsbBridgeKind;
use crate::remote_data_plane::{RemoteIoFailure, RemoteIoResult};

use super::accept;
use super::MobileAcceptorRuntimeState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DirectTransportStopReason {
    Shutdown,
    VaultLocked,
    ClientDisconnected,
    PeerClosed,
    AccessoryDetached,
    TransportClosed,
    StreamTimeout,
    DataPlaneError,
    Error,
}

/// Which shutdown source ended a host RPC loop that returned `Ok(())`.
///
/// The bridged shutdown receiver collapses the peer-connection shutdown and the
/// external (native `stop_session`) shutdown into one signal, so the loop alone
/// cannot tell them apart. Recording the source lets us map a runtime-driven
/// peer removal to `PeerClosed` (the accessory should re-arm) while a genuine
/// local teardown stays `Shutdown` (do not re-arm).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HostRpcShutdownSource {
    PeerRemoved,
    ExternalStop(DirectTransportStopReason),
    RemoteRequest(DirectTransportStopReason),
}

pub(crate) fn record_shutdown_source_first(
    target: &Arc<Mutex<Option<HostRpcShutdownSource>>>,
    source: HostRpcShutdownSource,
) -> bool {
    let mut current = target.lock().expect("host rpc shutdown source lock");
    if current.is_some() {
        return false;
    }
    *current = Some(source);
    true
}

pub(crate) type DirectTransportShutdownSignal =
    Pin<Box<dyn Future<Output = DirectTransportStopReason> + Send>>;

#[cfg(test)]
pub(crate) fn shutdown_signal_from_unit_receiver(
    rx: oneshot::Receiver<()>,
) -> DirectTransportShutdownSignal {
    Box::pin(async move {
        let _ = rx.await;
        DirectTransportStopReason::Shutdown
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DirectTransportAcceptFailure {
    TransportClosed { message: String },
    TransportTimeout { message: String },
    PairingComplete { peer_pubkey_hex: String },
    PairingCancelled { message: String },
    ProtocolError { message: String },
    DataPlaneError { message: String },
    Error { message: String },
}

impl DirectTransportAcceptFailure {
    pub(crate) fn from_transport_error(label: &'static str, error: TransportError) -> Self {
        let message = format!("{label}: {error}");
        match error {
            TransportError::Closed => Self::TransportClosed { message },
            TransportError::Timeout => Self::TransportTimeout { message },
            TransportError::RecordLayerInvalidLength(_) => Self::DataPlaneError { message },
            TransportError::Io(_) => Self::Error { message },
        }
    }

    pub(crate) fn data_plane_error(message: impl Into<String>) -> Self {
        Self::DataPlaneError {
            message: message.into(),
        }
    }

    pub(crate) fn protocol_error(message: impl Into<String>) -> Self {
        Self::ProtocolError {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for DirectTransportAcceptFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TransportClosed { message }
            | Self::TransportTimeout { message }
            | Self::ProtocolError { message }
            | Self::DataPlaneError { message }
            | Self::Error { message }
            | Self::PairingCancelled { message } => write!(f, "{message}"),
            Self::PairingComplete { peer_pubkey_hex } => {
                write!(f, "unknown_peer:{peer_pubkey_hex}")
            }
        }
    }
}

impl DirectTransportStopReason {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Shutdown => "shutdown",
            Self::VaultLocked => "vault_locked",
            Self::ClientDisconnected => "client_disconnected",
            Self::PeerClosed => "peer_closed",
            Self::AccessoryDetached => "accessory_detached",
            Self::TransportClosed => "transport_closed",
            Self::StreamTimeout => "stream_timeout",
            Self::DataPlaneError => "data_plane_error",
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
    shutdown_rx: DirectTransportShutdownSignal,
    timeline_context: DirectTransportTimelineContext,
) -> Result<DirectTransportSessionOutcome, DirectTransportAcceptFailure> {
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
    result: &RemoteIoResult<()>,
    shutdown_source: Option<HostRpcShutdownSource>,
) -> DirectTransportStopReason {
    match result {
        Ok(()) => match shutdown_source {
            Some(HostRpcShutdownSource::PeerRemoved) => DirectTransportStopReason::PeerClosed,
            Some(HostRpcShutdownSource::ExternalStop(reason))
            | Some(HostRpcShutdownSource::RemoteRequest(reason)) => reason,
            None => DirectTransportStopReason::Shutdown,
        },
        Err(failure) => stop_reason_from_remote_failure(failure)
            .unwrap_or(DirectTransportStopReason::DataPlaneError),
    }
}

fn stop_reason_from_remote_failure(failure: &RemoteIoFailure) -> Option<DirectTransportStopReason> {
    match failure {
        RemoteIoFailure::TransportClosed => Some(DirectTransportStopReason::TransportClosed),
        RemoteIoFailure::TransportTimeout => Some(DirectTransportStopReason::TransportClosed),
        RemoteIoFailure::StreamTimeout { .. } => Some(DirectTransportStopReason::StreamTimeout),
        RemoteIoFailure::DataPlaneError { .. } => None,
        _ => Some(DirectTransportStopReason::DataPlaneError),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_stop_reason_mapping_does_not_call_removed_string_parser() {
        let source = include_str!("direct_transport.rs");
        let removed_string_parser = concat!("legacy_from", "_reason");

        assert!(
            !source.contains(removed_string_parser),
            "direct transport stop mapping must use typed RemoteIoFailure values"
        );
    }

    #[test]
    fn stop_reason_from_remote_failure_maps_typed_stream_timeout() {
        assert_eq!(
            stop_reason_from_remote_failure(&RemoteIoFailure::StreamTimeout {
                command: Some("catalog:downloadRange".to_string()),
                message_id: Some(7),
                timeout_ms: Some(20),
            }),
            Some(DirectTransportStopReason::StreamTimeout),
        );
    }

    #[test]
    fn stop_reason_from_remote_failure_maps_typed_transport_closed() {
        assert_eq!(
            stop_reason_from_remote_failure(&RemoteIoFailure::TransportClosed),
            Some(DirectTransportStopReason::TransportClosed),
        );
    }

    #[test]
    fn stop_reason_from_remote_failure_maps_typed_transport_timeout_to_closed() {
        assert_eq!(
            stop_reason_from_remote_failure(&RemoteIoFailure::TransportTimeout),
            Some(DirectTransportStopReason::TransportClosed),
        );
    }

    #[test]
    fn stop_reason_from_remote_failure_maps_typed_record_desync_to_data_plane_error() {
        assert_eq!(
            stop_reason_from_remote_failure(&RemoteIoFailure::RecordLayerInvalidLength {
                message: "invalid record length".to_string(),
            }),
            Some(DirectTransportStopReason::DataPlaneError),
        );
    }

    #[test]
    fn stop_reason_from_rpc_loop_result_maps_typed_stream_timeout() {
        let result: RemoteIoResult<()> = Err(RemoteIoFailure::StreamTimeout {
            command: Some("catalog:downloadRange".to_string()),
            message_id: Some(7),
            timeout_ms: Some(20),
        });

        assert_eq!(
            stop_reason_from_rpc_loop_result(&result, None),
            DirectTransportStopReason::StreamTimeout,
        );
    }

    #[test]
    fn stop_reason_from_rpc_loop_result_maps_unknown_rpc_error_to_data_plane_error() {
        let result: RemoteIoResult<()> = Err(RemoteIoFailure::data_plane_error(
            "rpc loop failed after handshake",
        ));

        assert_eq!(
            stop_reason_from_rpc_loop_result(&result, None),
            DirectTransportStopReason::DataPlaneError,
        );
    }

    #[test]
    fn stop_reason_from_rpc_loop_result_maps_peer_removed_to_peer_closed() {
        let result: RemoteIoResult<()> = Ok(());

        assert_eq!(
            stop_reason_from_rpc_loop_result(&result, Some(HostRpcShutdownSource::PeerRemoved),),
            DirectTransportStopReason::PeerClosed,
        );
    }

    #[test]
    fn stop_reason_from_rpc_loop_result_maps_external_stop_reason() {
        let result: RemoteIoResult<()> = Ok(());

        assert_eq!(
            stop_reason_from_rpc_loop_result(
                &result,
                Some(HostRpcShutdownSource::ExternalStop(
                    DirectTransportStopReason::AccessoryDetached,
                )),
            ),
            DirectTransportStopReason::AccessoryDetached,
        );
    }

    #[test]
    fn stop_reason_from_rpc_loop_result_maps_remote_request_reason() {
        let result: RemoteIoResult<()> = Ok(());

        assert_eq!(
            stop_reason_from_rpc_loop_result(
                &result,
                Some(HostRpcShutdownSource::RemoteRequest(
                    DirectTransportStopReason::ClientDisconnected,
                )),
            ),
            DirectTransportStopReason::ClientDisconnected,
        );
    }

    #[test]
    fn shutdown_source_is_first_writer_wins() {
        let source = Arc::new(Mutex::new(None));

        assert!(record_shutdown_source_first(
            &source,
            HostRpcShutdownSource::ExternalStop(DirectTransportStopReason::AccessoryDetached),
        ));
        assert!(!record_shutdown_source_first(
            &source,
            HostRpcShutdownSource::RemoteRequest(DirectTransportStopReason::VaultLocked),
        ));
        assert_eq!(
            *source.lock().expect("source"),
            Some(HostRpcShutdownSource::ExternalStop(
                DirectTransportStopReason::AccessoryDetached,
            )),
        );
    }
}
