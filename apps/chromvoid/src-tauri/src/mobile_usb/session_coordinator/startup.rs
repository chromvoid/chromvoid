use std::time::Instant;

use super::*;
use crate::mobile_usb::types::{HostId, MobileUsbBridgeKind};

pub(super) async fn mobile_usb_startup_capabilities(
    req_tx: &tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    timeline_trace_id: &str,
    session_id: &SessionId,
    host_id: &HostId,
    bridge_kind: MobileUsbBridgeKind,
) -> Result<Vec<String>, MobileUsbError> {
    let started_at = Instant::now();
    let response = mobile_usb_startup_json_rpc(
        req_tx,
        chromvoid_core::rpc::types::RpcRequest::new("core:capabilities", serde_json::json!({})),
        "core:capabilities",
    )
    .await;
    if let Some(error) = mobile_usb_startup_transport_error("core:capabilities", &response) {
        log_timeline_event(MobileUsbTimelineEvent {
            trace_id: Some(timeline_trace_id),
            usb_session_id: Some(session_id),
            owner: "desktop_client",
            phase: "startup_rpc_core_capabilities",
            operation: "core:capabilities",
            duration_ms: Some(started_at.elapsed().as_millis() as u64),
            host_id: Some(host_id),
            bridge_kind: Some(bridge_kind),
            error_code: Some(error.code),
            ..MobileUsbTimelineEvent::default()
        });
        return Err(error);
    }
    log_timeline_event(MobileUsbTimelineEvent {
        trace_id: Some(timeline_trace_id),
        usb_session_id: Some(session_id),
        owner: "desktop_client",
        phase: "startup_rpc_core_capabilities",
        operation: "core:capabilities",
        duration_ms: Some(started_at.elapsed().as_millis() as u64),
        host_id: Some(host_id),
        bridge_kind: Some(bridge_kind),
        ..MobileUsbTimelineEvent::default()
    });
    Ok(crate::core_adapter::parse_capability_features(&response))
}

pub(super) async fn mobile_usb_startup_vault_is_unlocked(
    req_tx: &tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    timeline_trace_id: &str,
    session_id: &SessionId,
    host_id: &HostId,
    bridge_kind: MobileUsbBridgeKind,
) -> Result<bool, MobileUsbError> {
    let started_at = Instant::now();
    let response = mobile_usb_startup_json_rpc(
        req_tx,
        chromvoid_core::rpc::types::RpcRequest::new("vault:status", serde_json::json!({})),
        "vault:status",
    )
    .await;
    if let Some(error) = mobile_usb_startup_transport_error("vault:status", &response) {
        log_timeline_event(MobileUsbTimelineEvent {
            trace_id: Some(timeline_trace_id),
            usb_session_id: Some(session_id),
            owner: "desktop_client",
            phase: "startup_rpc_vault_status",
            operation: "vault:status",
            duration_ms: Some(started_at.elapsed().as_millis() as u64),
            host_id: Some(host_id),
            bridge_kind: Some(bridge_kind),
            error_code: Some(error.code),
            ..MobileUsbTimelineEvent::default()
        });
        return Err(error);
    }
    match response
        .result()
        .and_then(|result| result.get("is_unlocked"))
    {
        Some(value) => {
            let is_unlocked = value.as_bool().unwrap_or(false);
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                usb_session_id: Some(session_id),
                owner: "desktop_client",
                phase: "startup_rpc_vault_status",
                operation: "vault:status",
                duration_ms: Some(started_at.elapsed().as_millis() as u64),
                host_id: Some(host_id),
                bridge_kind: Some(bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            Ok(is_unlocked)
        }
        None => {
            tracing::info!("mobile_usb: remote vault status unavailable during USB session start");
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                usb_session_id: Some(session_id),
                owner: "desktop_client",
                phase: "startup_rpc_vault_status",
                operation: "vault:status",
                duration_ms: Some(started_at.elapsed().as_millis() as u64),
                host_id: Some(host_id),
                bridge_kind: Some(bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            Ok(false)
        }
    }
}

// Startup RPCs are lightweight (`core:capabilities`, `vault:status`), but the
// host may briefly hold its adapter mutex for a heavy UI command (observed
// `vault:unlock` at ~3.5s), so this stays well above that while failing a dead
// session much faster than the generic 15s data-plane response timeout.
const MOBILE_USB_STARTUP_RPC_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

async fn mobile_usb_startup_json_rpc(
    req_tx: &tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    request: chromvoid_core::rpc::types::RpcRequest,
    context: &'static str,
) -> chromvoid_core::rpc::types::RpcResponse {
    mobile_usb_startup_json_rpc_with_timeout(
        req_tx,
        request,
        context,
        MOBILE_USB_STARTUP_RPC_TIMEOUT,
    )
    .await
}

async fn mobile_usb_startup_json_rpc_with_timeout(
    req_tx: &tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    request: chromvoid_core::rpc::types::RpcRequest,
    context: &'static str,
    recv_timeout: std::time::Duration,
) -> chromvoid_core::rpc::types::RpcResponse {
    let command = request.command.clone();
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    let send_result = req_tx
        .send(crate::remote_data_plane::RemoteIoRequest {
            request,
            stream: None,
            reply_tx,
            priority: crate::core_adapter::RemoteRpcPriority::Normal,
            cancel_group: None,
        })
        .await;
    if send_result.is_err() {
        return chromvoid_core::rpc::types::RpcResponse::Error {
            ok: false,
            error: format!("mobile USB startup RPC send failed: {context}"),
            code: Some("DISCONNECTED".to_string()),
        };
    }

    match tokio::time::timeout(recv_timeout, reply_rx).await {
        Ok(Ok(chromvoid_core::rpc::RpcReply::Json(response))) => response,
        Ok(Ok(chromvoid_core::rpc::RpcReply::Stream(_)))
        | Ok(Ok(chromvoid_core::rpc::RpcReply::RangeStream(_))) => {
            chromvoid_core::rpc::types::RpcResponse::Error {
                ok: false,
                error: format!("mobile USB startup RPC returned a stream: {command}"),
                code: Some("STREAM_UNEXPECTED".to_string()),
            }
        }
        Ok(Err(_)) => chromvoid_core::rpc::types::RpcResponse::Error {
            ok: false,
            error: format!("mobile USB startup RPC reply channel closed: {command}"),
            code: Some("DISCONNECTED".to_string()),
        },
        Err(_) => chromvoid_core::rpc::types::RpcResponse::Error {
            ok: false,
            error: format!(
                "mobile USB startup RPC recv timeout after {}ms: {command}",
                recv_timeout.as_millis()
            ),
            code: Some("TIMEOUT".to_string()),
        },
    }
}

fn mobile_usb_startup_transport_error(
    context: &'static str,
    response: &chromvoid_core::rpc::types::RpcResponse,
) -> Option<MobileUsbError> {
    let code = response.code()?;
    // A silent or closed peer is a session-liveness failure (NFR-008), not a
    // record-layer framing violation; only a protocol-shape breach maps there.
    let error_code = match code {
        "TIMEOUT" | "DISCONNECTED" => MobileUsbErrorCode::CableDisconnected,
        "STREAM_UNEXPECTED" => MobileUsbErrorCode::RecordLayerFailed,
        _ => return None,
    };
    let message = response
        .error_message()
        .unwrap_or("mobile USB startup RPC failed");
    Some(MobileUsbError::new(
        error_code,
        format!("mobile USB startup RPC failed ({context}): {message}"),
    ))
}

#[cfg(test)]
mod startup_rpc_tests {
    use super::*;

    #[tokio::test]
    async fn startup_rpc_waits_for_remote_data_plane_reply_beyond_initial_probe_window() {
        let (req_tx, mut req_rx) =
            tokio::sync::mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let pending = tokio::spawn(async move {
            mobile_usb_startup_json_rpc(
                &req_tx,
                chromvoid_core::rpc::types::RpcRequest::new(
                    "core:capabilities",
                    serde_json::json!({}),
                ),
                "core:capabilities",
            )
            .await
        });

        let request = req_rx.recv().await.expect("startup rpc request");
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        let _ = request.reply_tx.send(chromvoid_core::rpc::RpcReply::Json(
            chromvoid_core::rpc::types::RpcResponse::success(serde_json::json!({
                "features": ["remote_core_status_v1"]
            })),
        ));

        let response = pending.await.expect("startup rpc task");
        assert!(response.is_ok());
        assert_eq!(
            response.result().unwrap()["features"][0],
            "remote_core_status_v1"
        );
    }

    #[tokio::test]
    async fn startup_rpc_times_out_when_host_goes_silent() {
        let (req_tx, mut req_rx) =
            tokio::sync::mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let pending = tokio::spawn(async move {
            mobile_usb_startup_json_rpc_with_timeout(
                &req_tx,
                chromvoid_core::rpc::types::RpcRequest::new(
                    "core:capabilities",
                    serde_json::json!({}),
                ),
                "core:capabilities",
                std::time::Duration::from_millis(50),
            )
            .await
        });

        // Keep the request (and its reply channel) alive but never answer:
        // a dead host session leaves the reply pending forever.
        let request = req_rx.recv().await.expect("startup rpc request");
        let response = pending.await.expect("startup rpc task");
        drop(request);

        assert!(!response.is_ok());
        assert_eq!(response.code(), Some("TIMEOUT"));
    }

    #[test]
    fn startup_transport_error_maps_liveness_failures_to_cable_disconnected() {
        for code in ["TIMEOUT", "DISCONNECTED"] {
            let response =
                chromvoid_core::rpc::types::RpcResponse::error("host silent", Some(code));
            let error = mobile_usb_startup_transport_error("core:capabilities", &response)
                .expect("transport error");
            assert_eq!(error.code, MobileUsbErrorCode::CableDisconnected, "{code}");
        }

        let response = chromvoid_core::rpc::types::RpcResponse::error(
            "unexpected stream",
            Some("STREAM_UNEXPECTED"),
        );
        let error =
            mobile_usb_startup_transport_error("vault:status", &response).expect("transport error");
        assert_eq!(error.code, MobileUsbErrorCode::RecordLayerFailed);

        let response = chromvoid_core::rpc::types::RpcResponse::error(
            "vault is writer locked",
            Some("WRITER_LOCKED"),
        );
        assert!(
            mobile_usb_startup_transport_error("vault:status", &response).is_none(),
            "application-level errors are not transport failures"
        );
    }
}
