use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use chromvoid_protocol::{RemoteTransport, TransportMetrics, TransportType};
#[cfg(desktop)]
use tauri::{Emitter, Manager};

use super::bridge::MobileUsbBridge;
#[cfg(test)]
use super::observability::MobileUsbMetricsSnapshot;
use super::observability::{
    bridge_kind_name, log_operation_finish, log_operation_start, log_state_transition,
    log_timeline_event, mobile_usb_operation_name, new_timeline_trace_id, redacted_identifier,
    MobileUsbObservability, MobileUsbTimelineEvent, MOBILE_USB_TRANSPORT_FAMILY,
};
use super::pairing_protocol::{
    hex_encode as mobile_usb_hex_encode, recv_pairing_hello as recv_mobile_usb_pairing_hello,
    send_pairing_hello as send_mobile_usb_pairing_hello, MobileUsbPairingHello,
};
use super::pairing_store::{
    classify_scan_result, commit_pairing_with_secret, MobileUsbPairingStore,
};
use super::record_transport::MobileUsbRemoteTransport;
use super::secret_store::MobileUsbSecretStore;
use super::types::RemoteIoStopReason as MobileUsbRemoteIoStopReason;
use super::types::{
    HostId, MobileUsbError, MobileUsbErrorCode, MobileUsbHostView, MobileUsbOperationKind,
    MobileUsbPairRequest, MobileUsbPairedHostRecord, MobileUsbPairingState,
    MobileUsbScanClassification, MobileUsbScannedHost, MobileUsbSessionEvent,
    MobileUsbSessionState, MobileUsbStateMachine, MobileUsbStatus, SessionId,
};

const PAIR_HANDSHAKE_ATTEMPTS: usize = 10;
const PAIR_HANDSHAKE_RETRY_DELAY: Duration = Duration::from_millis(500);
#[cfg(not(test))]
const CONNECT_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
#[cfg(test)]
const CONNECT_HANDSHAKE_TIMEOUT: Duration = Duration::from_millis(50);
const CONNECT_HANDSHAKE_ATTEMPTS: usize = 2;
#[cfg(not(test))]
const CONNECT_HANDSHAKE_RETRY_DELAY: Duration = Duration::from_millis(500);
#[cfg(test)]
const CONNECT_HANDSHAKE_RETRY_DELAY: Duration = Duration::from_millis(1);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MobileUsbSessionHandle {
    pub session_id: SessionId,
    pub host_unlocked: bool,
}

pub struct MobileUsbStartSessionRequest {
    pub host: MobileUsbPairedHostRecord,
    pub config: crate::remote_data_plane::RemoteIoTaskConfig,
    pub metrics: TransportMetrics,
    pub timeline_trace_id: String,
}

#[async_trait]
pub trait MobileUsbSessionStarter: Send + Sync {
    async fn start_session(
        &self,
        request: MobileUsbStartSessionRequest,
    ) -> Result<MobileUsbSessionHandle, MobileUsbError>;
}

#[cfg(desktop)]
pub(crate) trait MobileUsbSessionEventTarget: Send + Sync + 'static {
    fn handle_mobile_usb_session_event(&self, event: MobileUsbSessionEvent);
}

#[cfg(desktop)]
impl MobileUsbSessionEventTarget for tauri::AppHandle {
    fn handle_mobile_usb_session_event(&self, event: MobileUsbSessionEvent) {
        let Some(state) = self.try_state::<crate::app_state::AppState>() else {
            tracing::warn!("mobile_usb: AppState unavailable while handling session event");
            return;
        };

        if let Err(error) = state.mobile_usb_runtime.handle_session_event(event) {
            tracing::warn!("mobile_usb: failed to handle session event: {error}");
        }
    }
}

#[cfg(desktop)]
pub(crate) struct TauriMobileUsbSessionEventSink<T: MobileUsbSessionEventTarget> {
    target: T,
    session_id: SessionId,
}

#[cfg(desktop)]
impl<T: MobileUsbSessionEventTarget> TauriMobileUsbSessionEventSink<T> {
    pub(crate) fn new(target: T, session_id: SessionId) -> Self {
        Self { target, session_id }
    }
}

#[cfg(desktop)]
impl<T: MobileUsbSessionEventTarget> crate::remote_io_runtime::RemoteIoRuntimeEventSink
    for TauriMobileUsbSessionEventSink<T>
{
    fn on_remote_io_event(&self, event: crate::remote_io_runtime::RemoteIoRuntimeEvent) {
        self.target.handle_mobile_usb_session_event(
            mobile_usb_session_event_from_remote_runtime_event(&self.session_id, event),
        );
    }
}

#[cfg(desktop)]
pub(crate) struct TauriMobileUsbSessionStarter {
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn crate::core_adapter::CoreAdapter>>>,
    remote_io_runtime: Arc<crate::remote_io_runtime::RemoteIoRuntimeState>,
}

#[cfg(desktop)]
impl TauriMobileUsbSessionStarter {
    pub(crate) fn new(
        app: tauri::AppHandle,
        adapter: Arc<Mutex<Box<dyn crate::core_adapter::CoreAdapter>>>,
        remote_io_runtime: Arc<crate::remote_io_runtime::RemoteIoRuntimeState>,
    ) -> Self {
        Self {
            app,
            adapter,
            remote_io_runtime,
        }
    }
}

#[cfg(desktop)]
#[async_trait]
impl MobileUsbSessionStarter for TauriMobileUsbSessionStarter {
    async fn start_session(
        &self,
        request: MobileUsbStartSessionRequest,
    ) -> Result<MobileUsbSessionHandle, MobileUsbError> {
        let session_id = format!("mobile-usb-session-{}", uuid::Uuid::new_v4());
        let host_id = request.host.host_id.clone();
        let bridge_kind = request.host.bridge_kind;
        let timeline_trace_id = request.timeline_trace_id.clone();
        let label = Some(request.host.label.clone());
        let platform = match request.host.platform {
            super::types::MobileUsbPlatform::Android => "android".to_string(),
            super::types::MobileUsbPlatform::Ios => "ios".to_string(),
        };
        let event_sink = Arc::new(TauriMobileUsbSessionEventSink::new(
            self.app.clone(),
            session_id.clone(),
        ));
        let req_tx = self
            .remote_io_runtime
            .start_remote_session_with_event_sink(
                self.app.clone(),
                request.config,
                Some(event_sink),
            )
            .map_err(|error| {
                MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    format!("failed to start mobile USB remote session: {error}"),
                )
            })?;
        log_timeline_event(MobileUsbTimelineEvent {
            trace_id: Some(&timeline_trace_id),
            usb_session_id: Some(&session_id),
            owner: "desktop_client",
            phase: "client_data_plane_start",
            operation: "start_session",
            host_id: Some(&host_id),
            bridge_kind: Some(bridge_kind),
            ..MobileUsbTimelineEvent::default()
        });

        let startup_features = match mobile_usb_startup_capabilities(
            &req_tx,
            &timeline_trace_id,
            &session_id,
            &host_id,
            bridge_kind,
        )
        .await
        {
            Ok(features) => features,
            Err(error) => {
                let _ = self
                    .remote_io_runtime
                    .stop_active(crate::remote_io_runtime::RemoteIoStopReason::StartFailed);
                return Err(error);
            }
        };
        let host_unlocked = match mobile_usb_startup_vault_is_unlocked(
            &req_tx,
            &timeline_trace_id,
            &session_id,
            &host_id,
            bridge_kind,
        )
        .await
        {
            Ok(host_unlocked) => host_unlocked,
            Err(error) => {
                let _ = self
                    .remote_io_runtime
                    .stop_active(crate::remote_io_runtime::RemoteIoStopReason::StartFailed);
                return Err(error);
            }
        };
        let mut adapter = crate::core_adapter::RemoteCoreAdapter::from_remote_sender_with_metrics(
            crate::core_adapter::RemoteHost::MobileUsb {
                host_id: host_id.clone(),
                label,
                platform,
            },
            req_tx,
            Some(request.metrics),
        );
        adapter.apply_startup_state(startup_features, host_unlocked);
        let current_mode = crate::core_adapter::CoreAdapter::mode(&adapter);
        let remote_core_features = crate::core_adapter::CoreAdapter::remote_core_features(&adapter);
        let previous_mode = match self.adapter.lock() {
            Ok(current) => current.mode(),
            Err(_) => {
                let _ = self
                    .remote_io_runtime
                    .stop_active(crate::remote_io_runtime::RemoteIoStopReason::StartFailed);
                return Err(MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    "core adapter mutex poisoned while reading previous mode",
                ));
            }
        };

        let mut current = match self.adapter.lock() {
            Ok(current) => current,
            Err(_) => {
                let _ = self
                    .remote_io_runtime
                    .stop_active(crate::remote_io_runtime::RemoteIoStopReason::StartFailed);
                return Err(MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    "core adapter mutex poisoned while starting mobile USB remote session",
                ));
            }
        };
        *current = Box::new(adapter);
        log_timeline_event(MobileUsbTimelineEvent {
            trace_id: Some(&timeline_trace_id),
            usb_session_id: Some(&session_id),
            owner: "desktop_client",
            phase: "adapter_swap",
            operation: "start_session",
            host_id: Some(&host_id),
            bridge_kind: Some(bridge_kind),
            ..MobileUsbTimelineEvent::default()
        });

        let app_state = self.app.state::<crate::app_state::AppState>();
        if let Ok(storage_root) = app_state.storage_root.lock() {
            crate::helpers::emit_basic_state(&self.app, &storage_root, current.as_ref());
        }
        drop(current);

        let _ = self.app.emit(
            "connection:status",
            serde_json::json!({
                "phase": "connected",
                "peer_id": &host_id,
                "transport_type": "usb_mobile",
            }),
        );

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        if let Err(error) = app_state.sync_runtime.bootstrap(0, now_ms) {
            tracing::warn!("mobile_usb: sync bootstrap failed for USB remote mode: {error}");
        } else {
            let _ = self.app.emit(
                "sync:status",
                serde_json::json!({
                    "phase": "bootstrap_started",
                    "subscribed": true,
                }),
            );
        }

        let _ = self.app.emit(
            "mode:changed",
            serde_json::json!({
                "previous_mode": previous_mode,
                "current_mode": current_mode,
                "remote_core_features": remote_core_features,
                "auto_locked": false,
                "drain_completed": true,
            }),
        );
        log_timeline_event(MobileUsbTimelineEvent {
            trace_id: Some(&timeline_trace_id),
            usb_session_id: Some(&session_id),
            owner: "desktop_client",
            phase: "remote_ready",
            operation: "start_session",
            host_id: Some(&host_id),
            bridge_kind: Some(bridge_kind),
            ..MobileUsbTimelineEvent::default()
        });

        Ok(MobileUsbSessionHandle {
            session_id,
            host_unlocked,
        })
    }
}

#[cfg(desktop)]
async fn mobile_usb_startup_capabilities(
    req_tx: &tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    timeline_trace_id: &str,
    session_id: &SessionId,
    host_id: &HostId,
    bridge_kind: super::types::MobileUsbBridgeKind,
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

#[cfg(desktop)]
async fn mobile_usb_startup_vault_is_unlocked(
    req_tx: &tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    timeline_trace_id: &str,
    session_id: &SessionId,
    host_id: &HostId,
    bridge_kind: super::types::MobileUsbBridgeKind,
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

#[cfg(desktop)]
async fn mobile_usb_startup_json_rpc(
    req_tx: &tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    request: chromvoid_core::rpc::types::RpcRequest,
    context: &'static str,
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

    match reply_rx.await {
        Ok(chromvoid_core::rpc::RpcReply::Json(response)) => response,
        Ok(chromvoid_core::rpc::RpcReply::Stream(_))
        | Ok(chromvoid_core::rpc::RpcReply::RangeStream(_)) => {
            chromvoid_core::rpc::types::RpcResponse::Error {
                ok: false,
                error: format!("mobile USB startup RPC returned a stream: {command}"),
                code: Some("STREAM_UNEXPECTED".to_string()),
            }
        }
        Err(_) => chromvoid_core::rpc::types::RpcResponse::Error {
            ok: false,
            error: format!("mobile USB startup RPC reply channel closed: {command}"),
            code: Some("DISCONNECTED".to_string()),
        },
    }
}

#[cfg(desktop)]
fn mobile_usb_startup_transport_error(
    context: &'static str,
    response: &chromvoid_core::rpc::types::RpcResponse,
) -> Option<MobileUsbError> {
    let code = response.code()?;
    if !matches!(code, "DISCONNECTED" | "TIMEOUT" | "STREAM_UNEXPECTED") {
        return None;
    }
    let message = response
        .error_message()
        .unwrap_or("mobile USB startup RPC failed");
    Some(MobileUsbError::new(
        MobileUsbErrorCode::RecordLayerFailed,
        format!("mobile USB startup RPC failed ({context}): {message}"),
    ))
}

#[cfg(all(test, desktop))]
mod startup_rpc_tests {
    use super::*;

    #[tokio::test]
    async fn startup_rpc_waits_for_remote_data_plane_reply_beyond_initial_probe_window() {
        let (req_tx, mut req_rx) =
            tokio::sync::mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = tokio::spawn(async move {
            let request = req_rx.recv().await.expect("startup request");
            assert_eq!(request.request.command, "core:capabilities");
            tokio::time::sleep(Duration::from_millis(3_200)).await;
            let _ = request.reply_tx.send(chromvoid_core::rpc::RpcReply::Json(
                chromvoid_core::rpc::types::RpcResponse::success(serde_json::json!({
                    "features": []
                })),
            ));
        });

        let response = tokio::time::timeout(
            Duration::from_secs(5),
            mobile_usb_startup_json_rpc(
                &req_tx,
                chromvoid_core::rpc::types::RpcRequest::new(
                    "core:capabilities",
                    serde_json::json!({}),
                ),
                "core:capabilities",
            ),
        )
        .await
        .expect("startup RPC should not use the old 3s probe timeout");

        host.await.expect("host task");
        assert!(response.is_ok());
    }
}

pub struct MobileUsbController {
    bridge: Arc<dyn MobileUsbBridge>,
    store: Arc<dyn MobileUsbPairingStore>,
    secrets: Arc<dyn MobileUsbSecretStore>,
    session_starter: Arc<dyn MobileUsbSessionStarter>,
    state: Mutex<MobileUsbStateMachine>,
    observability: MobileUsbObservability,
}

impl MobileUsbController {
    pub fn new(
        bridge: Arc<dyn MobileUsbBridge>,
        store: Arc<dyn MobileUsbPairingStore>,
        secrets: Arc<dyn MobileUsbSecretStore>,
        session_starter: Arc<dyn MobileUsbSessionStarter>,
    ) -> Self {
        Self {
            bridge,
            store,
            secrets,
            session_starter,
            state: Mutex::new(MobileUsbStateMachine::new()),
            observability: MobileUsbObservability::default(),
        }
    }

    pub async fn scan(&self) -> Result<Vec<MobileUsbScannedHost>, MobileUsbError> {
        let started_at = self.begin(MobileUsbOperationKind::Scan)?;
        let result = self.scan_inner().await;
        self.complete_or_fail(
            MobileUsbOperationKind::Scan,
            started_at,
            &result,
            None,
            None,
            None,
        );
        result
    }

    pub async fn pair(
        &self,
        request: MobileUsbPairRequest,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let bridge_kind = Some(request.bridge_kind);
        let started_at = self.begin(MobileUsbOperationKind::Pair)?;
        let result = self.pair_inner(request).await;
        let host_id = active_host_id_from_status_result(&result);
        self.complete_or_fail(
            MobileUsbOperationKind::Pair,
            started_at,
            &result,
            host_id.as_ref(),
            None,
            bridge_kind,
        );
        result
    }

    pub async fn connect(&self, host_id: HostId) -> Result<MobileUsbStatus, MobileUsbError> {
        let host_id_for_observability = host_id.clone();
        if self.with_state(|state| state.can_reuse_active_host(&host_id))? {
            let started_at = Instant::now();
            log_operation_start("connect", Some(&host_id), None, None);
            tracing::info!(
                transport_family = MOBILE_USB_TRANSPORT_FAMILY,
                selected_transport = "usb_mobile",
                fallback_allowed = false,
                host_id = %redacted_identifier(Some(&host_id)),
                "mobile_usb connect reused active session"
            );
            let result = self.status_inner();
            self.record_operation_result(
                "connect",
                started_at,
                &result,
                Some(&host_id),
                None,
                None,
            );
            return result;
        }

        let started_at = self.begin(MobileUsbOperationKind::Connect)?;
        let result = self.connect_inner(host_id).await;
        self.complete_or_fail(
            MobileUsbOperationKind::Connect,
            started_at,
            &result,
            Some(&host_id_for_observability),
            None,
            None,
        );
        result
    }

    pub fn disconnect(&self) -> Result<MobileUsbStatus, MobileUsbError> {
        let started_at = Instant::now();
        let result = self.with_state(|state| {
            let state_from = state.session_state();
            state.disconnect();
            (state_from, state.session_state())
        });
        if let Ok((state_from, state_to)) = result {
            self.record_state_transition(state_from, state_to, None, None, None);
        }
        let result = result.map(|_| ()).and_then(|_| self.status_inner());
        self.record_operation_result("disconnect", started_at, &result, None, None, None);
        result
    }

    pub fn handle_session_event(
        &self,
        event: MobileUsbSessionEvent,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let started_at = Instant::now();
        let (operation, session_id, result) = match event {
            MobileUsbSessionEvent::HostUnlockConfirmed { session_id } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    let result = state.confirm_host_unlock(&session_id);
                    (state_from, state.session_state(), result)
                });
                ("host_unlock_confirmed", session_id, result)
            }
            MobileUsbSessionEvent::RemoteIoStopped { session_id, reason } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    state.remote_io_stopped(&session_id, reason);
                    (state_from, state.session_state(), Ok(()))
                });
                ("remote_io_stopped", session_id, result)
            }
            MobileUsbSessionEvent::CableDisconnected { session_id } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    state.remote_io_stopped(&session_id, MobileUsbRemoteIoStopReason::Disconnected);
                    (state_from, state.session_state(), Ok(()))
                });
                ("cable_disconnected", session_id, result)
            }
        };

        let result = match result {
            Ok((state_from, state_to, Ok(()))) => {
                self.record_state_transition(state_from, state_to, None, None, Some(&session_id));
                self.status_inner()
            }
            Ok((state_from, state_to, Err(error))) => {
                self.record_state_transition(
                    state_from,
                    state_to,
                    Some(error.code),
                    None,
                    Some(&session_id),
                );
                Err(error)
            }
            Err(error) => Err(error),
        };
        self.record_operation_result(
            operation,
            started_at,
            &result,
            None,
            Some(&session_id),
            None,
        );
        result
    }

    pub fn status(&self) -> Result<MobileUsbStatus, MobileUsbError> {
        let started_at = Instant::now();
        let result = self.status_inner();
        self.record_operation_result("status", started_at, &result, None, None, None);
        result
    }

    pub fn list_paired(&self) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        let started_at = Instant::now();
        let result = self.list_paired_inner();
        self.record_operation_result("list_paired", started_at, &result, None, None, None);
        result
    }

    fn status_inner(&self) -> Result<MobileUsbStatus, MobileUsbError> {
        let paired_hosts = self.list_paired_inner()?;
        self.with_state(|state| state.status(paired_hosts))
    }

    fn list_paired_inner(&self) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        Ok(self
            .store
            .list()?
            .iter()
            .map(|record| {
                let pairing_state = if record.is_valid_for_auto_match()
                    && self.secrets.load_client_key(&record.client_key_ref).is_ok()
                {
                    MobileUsbPairingState::Paired
                } else {
                    MobileUsbPairingState::BrokenLocalState
                };
                MobileUsbHostView::from_record(record, pairing_state)
            })
            .collect())
    }

    pub fn remove_paired(&self, host_id: HostId) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        let started_at = Instant::now();
        log_operation_start("remove_paired", Some(&host_id), None, None);
        let result = self.remove_paired_inner(&host_id);
        self.record_operation_result(
            "remove_paired",
            started_at,
            &result,
            Some(&host_id),
            None,
            None,
        );
        result
    }

    fn remove_paired_inner(
        &self,
        host_id: &HostId,
    ) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        if self.with_state(|state| state.is_active_host(host_id))? {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "cannot remove active mobile USB host before disconnect",
            ));
        }

        let existing = self.store.get(host_id)?;
        self.store.remove(host_id)?;
        if let Some(record) = existing {
            let _ = self.secrets.delete_client_key(&record.client_key_ref);
        }
        self.list_paired_inner()
    }

    async fn scan_inner(&self) -> Result<Vec<MobileUsbScannedHost>, MobileUsbError> {
        let records = self.store.list()?;
        let scans = self.bridge.scan().await?;
        let hosts = scans
            .into_iter()
            .map(|scan| MobileUsbScannedHost {
                classification: classify_scan_result(&scan, &records, self.secrets.as_ref()),
                scan,
            })
            .collect::<Vec<_>>();
        tracing::info!(
            scan_count = hosts.len(),
            classifications = %scan_classification_summary(&hosts),
            "mobile_usb scan classified hosts"
        );
        Ok(hosts)
    }

    async fn pair_inner(
        &self,
        request: MobileUsbPairRequest,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let timeline_trace_id = new_timeline_trace_id();
        let keypair = noise_static_keypair()?;
        let (mut transport, mut noise_transport, peer_pubkey) = self
            .open_pair_transport_with_retry(&request, &keypair.private, &timeline_trace_id)
            .await?;

        let host_id = new_host_id();
        Self::confirm_usb_pairing_with_remote(
            transport.as_mut(),
            &mut noise_transport,
            &host_id,
            &keypair.public,
            &peer_pubkey,
        )
        .await?;

        let record = MobileUsbPairedHostRecord {
            host_id,
            label: request
                .label
                .clone()
                .unwrap_or_else(|| "Mobile USB host".to_string()),
            platform: request.platform,
            bridge_kind: request.bridge_kind,
            peer_pubkey,
            client_pubkey: keypair.public.clone(),
            client_key_ref: String::new(),
            usb_hint: request.usb_hint,
            paired_at: now_secs(),
            last_seen: Some(now_secs()),
            pairing_confirmed_at: Some(now_secs()),
        };
        let record = commit_pairing_with_secret(
            self.store.as_ref(),
            self.secrets.as_ref(),
            record,
            &keypair.private,
        )?;

        self.start_data_plane(record, transport, noise_transport, timeline_trace_id)
            .await
    }

    async fn confirm_usb_pairing_with_remote(
        transport: &mut dyn RemoteTransport,
        noise_transport: &mut chromvoid_protocol::NoiseTransport,
        host_id: &HostId,
        client_pubkey: &[u8],
        peer_pubkey: &[u8],
    ) -> Result<(), MobileUsbError> {
        let client_peer_id = format!("{host_id}:desktop");
        let hello = MobileUsbPairingHello {
            peer_id: client_peer_id,
            peer_label: desktop_usb_pairing_label(),
            peer_pubkey_hex: mobile_usb_hex_encode(client_pubkey),
            platform: "desktop".to_string(),
        };
        send_mobile_usb_pairing_hello(transport, noise_transport, &hello)
            .await
            .map_err(mobile_usb_pairing_confirmation_error)?;
        let remote = recv_mobile_usb_pairing_hello(transport, noise_transport)
            .await
            .map_err(mobile_usb_pairing_confirmation_error)?;
        if remote.peer_pubkey_hex != mobile_usb_hex_encode(peer_pubkey) {
            return Err(mobile_usb_pairing_confirmation_error(
                "remote pairing hello pubkey mismatch".to_string(),
            ));
        }
        Ok(())
    }

    async fn open_pair_transport_with_retry(
        &self,
        request: &MobileUsbPairRequest,
        client_privkey: &[u8],
        timeline_trace_id: &str,
    ) -> Result<
        (
            Box<dyn RemoteTransport>,
            chromvoid_protocol::NoiseTransport,
            Vec<u8>,
        ),
        MobileUsbError,
    > {
        let mut last_error = None;

        for attempt in 0..PAIR_HANDSHAKE_ATTEMPTS {
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "open_stream",
                operation: "pair",
                bridge_kind: Some(request.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let stream = match self.bridge.open_pair_stream(request).await {
                Ok(stream) => stream,
                Err(error) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "open_stream",
                        operation: "pair",
                        bridge_kind: Some(request.bridge_kind),
                        error_code: Some(error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Err(error);
                }
            };
            let transport = MobileUsbRemoteTransport::new(stream, request.bridge_kind);
            let handshake_started_at = Instant::now();
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "handshake_xx",
                operation: "pair",
                bridge_kind: Some(request.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let result = crate::remote_data_plane::handshake_xx_over_transport(
                Box::new(transport) as Box<dyn RemoteTransport>,
                client_privkey,
            )
            .await;

            match result {
                Ok(result) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_xx",
                        operation: "pair",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        bridge_kind: Some(request.bridge_kind),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Ok(result);
                }
                Err(error) => {
                    let retryable = is_retryable_xx_first_write_error(&error)
                        && attempt + 1 < PAIR_HANDSHAKE_ATTEMPTS;
                    let mobile_error = mobile_usb_xx_handshake_error(&error);
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_xx",
                        operation: "pair",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        bridge_kind: Some(request.bridge_kind),
                        error_code: Some(mobile_error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    if retryable {
                        tracing::warn!(
                            attempt = attempt + 1,
                            next_attempt = attempt + 2,
                            error = %error,
                            "mobile_usb pair XX handshake first write failed; reopening USB stream"
                        );
                        last_error = Some(mobile_error);
                        tokio::time::sleep(PAIR_HANDSHAKE_RETRY_DELAY).await;
                        continue;
                    }
                    return Err(mobile_error);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            MobileUsbError::new(
                MobileUsbErrorCode::HandshakeFailed,
                "mobile USB XX handshake failed before opening USB stream",
            )
        }))
    }

    async fn connect_inner(&self, host_id: HostId) -> Result<MobileUsbStatus, MobileUsbError> {
        let timeline_trace_id = new_timeline_trace_id();
        let record = self
            .store
            .get(&host_id)?
            .ok_or_else(|| MobileUsbError::new(MobileUsbErrorCode::NotPaired, "host not paired"))?;
        tracing::info!(
            transport_family = MOBILE_USB_TRANSPORT_FAMILY,
            selected_transport = "usb_mobile",
            fallback_allowed = false,
            host_id = %redacted_identifier(Some(&record.host_id)),
            bridge_kind = bridge_kind_name(record.bridge_kind),
            "mobile_usb connect transport selected"
        );
        let client_privkey = self.secrets.load_client_key(&record.client_key_ref)?;
        let (mut transport, mut noise_transport) = self
            .open_connect_transport_with_retry(&record, &client_privkey, &timeline_trace_id)
            .await?;

        let record = if record.pairing_confirmed_at.is_none() {
            tracing::info!(
                transport_family = MOBILE_USB_TRANSPORT_FAMILY,
                selected_transport = "usb_mobile",
                fallback_allowed = false,
                host_id = %redacted_identifier(Some(&record.host_id)),
                bridge_kind = bridge_kind_name(record.bridge_kind),
                "mobile_usb connect confirming legacy pairing before startup RPC"
            );
            Self::confirm_usb_pairing_with_remote(
                transport.as_mut(),
                &mut noise_transport,
                &record.host_id,
                &record.client_pubkey,
                &record.peer_pubkey,
            )
            .await?;
            self.store
                .mark_pairing_confirmed(&record.host_id, now_secs())?
        } else {
            self.store.touch_last_seen(&record.host_id, now_secs())?
        };
        self.start_data_plane(record, transport, noise_transport, timeline_trace_id)
            .await
    }

    async fn open_connect_transport_with_retry(
        &self,
        record: &MobileUsbPairedHostRecord,
        client_privkey: &[u8],
        timeline_trace_id: &str,
    ) -> Result<(Box<dyn RemoteTransport>, chromvoid_protocol::NoiseTransport), MobileUsbError>
    {
        let mut last_error = None;

        for attempt in 0..CONNECT_HANDSHAKE_ATTEMPTS {
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "open_stream",
                operation: "connect",
                host_id: Some(&record.host_id),
                bridge_kind: Some(record.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let stream = match self.bridge.open_connect_stream(record).await {
                Ok(stream) => stream,
                Err(error) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "open_stream",
                        operation: "connect",
                        host_id: Some(&record.host_id),
                        bridge_kind: Some(record.bridge_kind),
                        error_code: Some(error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Err(error);
                }
            };
            let transport = MobileUsbRemoteTransport::new(stream, record.bridge_kind);
            let handshake_started_at = Instant::now();
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "handshake_ik",
                operation: "connect",
                host_id: Some(&record.host_id),
                bridge_kind: Some(record.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let handshake_result = match tokio::time::timeout(
                CONNECT_HANDSHAKE_TIMEOUT,
                crate::remote_data_plane::handshake_ik_over_transport(
                    Box::new(transport) as Box<dyn RemoteTransport>,
                    client_privkey,
                    &record.peer_pubkey,
                ),
            )
            .await
            {
                Ok(Ok(result)) => Ok(result),
                Ok(Err(error)) => Err(mobile_usb_ik_handshake_error(error)),
                Err(_) => Err(MobileUsbError::new(
                    MobileUsbErrorCode::HandshakeFailed,
                    format!(
                        "mobile USB IK handshake timed out after {:?}",
                        CONNECT_HANDSHAKE_TIMEOUT
                    ),
                )),
            };

            match handshake_result {
                Ok(result) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_ik",
                        operation: "connect",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        host_id: Some(&record.host_id),
                        bridge_kind: Some(record.bridge_kind),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Ok(result);
                }
                Err(error) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_ik",
                        operation: "connect",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        host_id: Some(&record.host_id),
                        bridge_kind: Some(record.bridge_kind),
                        error_code: Some(error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    if attempt + 1 < CONNECT_HANDSHAKE_ATTEMPTS
                        && is_retryable_ik_handshake_error(&error)
                    {
                        tracing::warn!(
                            attempt = attempt + 1,
                            next_attempt = attempt + 2,
                            error = %error.message,
                            "mobile_usb connect IK handshake failed; reopening USB stream"
                        );
                        last_error = Some(error);
                        tokio::time::sleep(CONNECT_HANDSHAKE_RETRY_DELAY).await;
                        continue;
                    }
                    return Err(error);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            MobileUsbError::new(
                MobileUsbErrorCode::HandshakeFailed,
                "mobile USB IK handshake failed before opening USB stream",
            )
        }))
    }

    async fn start_data_plane(
        &self,
        record: MobileUsbPairedHostRecord,
        transport: Box<dyn RemoteTransport>,
        noise_transport: chromvoid_protocol::NoiseTransport,
        timeline_trace_id: String,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        tracing::info!(
            transport_family = MOBILE_USB_TRANSPORT_FAMILY,
            selected_transport = "usb_mobile",
            fallback_allowed = false,
            host_id = %redacted_identifier(Some(&record.host_id)),
            bridge_kind = bridge_kind_name(record.bridge_kind),
            "mobile_usb data plane start"
        );
        let handle_result = self
            .session_starter
            .start_session(MobileUsbStartSessionRequest {
                host: record.clone(),
                config: crate::remote_data_plane::RemoteIoTaskConfig {
                    transport,
                    noise_transport,
                },
                metrics: TransportMetrics {
                    transport_type: Some(TransportType::UsbMobile),
                    ..TransportMetrics::default()
                },
                timeline_trace_id: timeline_trace_id.clone(),
            })
            .await;
        let handle = match handle_result {
            Ok(handle) => handle,
            Err(error) => {
                log_timeline_event(MobileUsbTimelineEvent {
                    trace_id: Some(&timeline_trace_id),
                    owner: "desktop_client",
                    phase: "client_data_plane_start",
                    operation: "start_session",
                    host_id: Some(&record.host_id),
                    bridge_kind: Some(record.bridge_kind),
                    error_code: Some(error.code),
                    ..MobileUsbTimelineEvent::default()
                });
                return Err(error);
            }
        };

        let (state_from, state_to, establish_result) = self.with_state(|state| {
            let state_from = state.session_state();
            let establish_result = state.establish_session(
                handle.session_id.clone(),
                MobileUsbHostView::from_record(&record, MobileUsbPairingState::Paired),
                handle.host_unlocked,
            );
            (state_from, state.session_state(), establish_result)
        })?;
        self.record_state_transition(
            state_from,
            state_to,
            establish_result.as_ref().err().map(|error| error.code),
            Some(&record.host_id),
            Some(&handle.session_id),
        );
        establish_result?;
        self.status_inner()
    }

    fn begin(&self, operation: MobileUsbOperationKind) -> Result<Instant, MobileUsbError> {
        let operation_name = mobile_usb_operation_name(operation);
        let result = self.with_state(|state| {
            let state_from = state.session_state();
            let result = state.begin_operation(operation);
            (state_from, state.session_state(), result)
        });

        match result {
            Ok((state_from, state_to, Ok(()))) => {
                self.record_state_transition(state_from, state_to, None, None, None);
                log_operation_start(operation_name, None, None, None);
                Ok(Instant::now())
            }
            Ok((_, _, Err(error))) | Err(error) => {
                self.observability
                    .record_operation(operation_name, "error", Some(error.code), 0);
                log_operation_finish(
                    operation_name,
                    "error",
                    Some(error.code),
                    0,
                    None,
                    None,
                    None,
                );
                Err(error)
            }
        }
    }

    fn complete_or_fail<T>(
        &self,
        operation: MobileUsbOperationKind,
        started_at: Instant,
        result: &Result<T, MobileUsbError>,
        host_id: Option<&HostId>,
        session_id: Option<&SessionId>,
        bridge_kind: Option<super::types::MobileUsbBridgeKind>,
    ) {
        let error_code = result.as_ref().err().map(|error| error.code);
        let transition = self.with_state(|state| {
            let state_from = state.session_state();
            if let Err(error) = result {
                state.fail(error.code);
            } else {
                state.complete_operation();
            }
            (state_from, state.session_state())
        });
        if let Ok((state_from, state_to)) = transition {
            self.record_state_transition(state_from, state_to, error_code, host_id, session_id);
        }
        self.record_operation_result(
            mobile_usb_operation_name(operation),
            started_at,
            result,
            host_id,
            session_id,
            bridge_kind,
        );
    }

    fn record_operation_result<T>(
        &self,
        operation: &str,
        started_at: Instant,
        result: &Result<T, MobileUsbError>,
        host_id: Option<&HostId>,
        session_id: Option<&SessionId>,
        bridge_kind: Option<super::types::MobileUsbBridgeKind>,
    ) {
        let duration_ms = started_at.elapsed().as_millis() as u64;
        let error_code = result.as_ref().err().map(|error| error.code);
        let outcome = if result.is_ok() { "success" } else { "error" };
        self.observability
            .record_operation(operation, outcome, error_code, duration_ms);
        log_operation_finish(
            operation,
            outcome,
            error_code,
            duration_ms,
            host_id,
            session_id,
            bridge_kind,
        );
    }

    fn record_state_transition(
        &self,
        state_from: MobileUsbSessionState,
        state_to: MobileUsbSessionState,
        error_code: Option<MobileUsbErrorCode>,
        host_id: Option<&HostId>,
        session_id: Option<&SessionId>,
    ) {
        self.observability
            .record_state_transition(state_from, state_to);
        log_state_transition(state_from, state_to, error_code, host_id, session_id);
    }

    #[cfg(test)]
    pub(crate) fn observability_snapshot_for_test(&self) -> MobileUsbMetricsSnapshot {
        self.observability.snapshot()
    }

    fn with_state<T>(
        &self,
        f: impl FnOnce(&mut MobileUsbStateMachine) -> T,
    ) -> Result<T, MobileUsbError> {
        let mut state = self.state.lock().map_err(|_| {
            MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "mobile USB controller state lock poisoned",
            )
        })?;
        Ok(f(&mut state))
    }
}

fn active_host_id_from_status_result(
    result: &Result<MobileUsbStatus, MobileUsbError>,
) -> Option<HostId> {
    result
        .as_ref()
        .ok()
        .and_then(|status| status.active_host.as_ref())
        .map(|host| host.host_id.clone())
}

fn scan_classification_summary(hosts: &[MobileUsbScannedHost]) -> String {
    if hosts.is_empty() {
        return "none".to_string();
    }

    hosts
        .iter()
        .map(|host| {
            let classification = match &host.classification {
                MobileUsbScanClassification::Unpaired => "unpaired".to_string(),
                MobileUsbScanClassification::Ambiguous => "ambiguous".to_string(),
                MobileUsbScanClassification::Paired { host_id } => {
                    format!("paired:{}", redacted_identifier(Some(host_id)))
                }
                MobileUsbScanClassification::BrokenLocalState { host_id } => {
                    format!("broken_local_state:{}", redacted_identifier(Some(host_id)))
                }
            };
            let label = host.scan.label.as_deref().unwrap_or("unknown");
            format!("{label}:{classification}")
        })
        .collect::<Vec<_>>()
        .join(",")
}

struct NoiseStaticKeypair {
    private: Vec<u8>,
    public: Vec<u8>,
}

fn noise_static_keypair() -> Result<NoiseStaticKeypair, MobileUsbError> {
    let params: snow::params::NoiseParams =
        chromvoid_protocol::NOISE_PARAMS_XX
            .parse()
            .map_err(|error: snow::Error| {
                MobileUsbError::new(
                    MobileUsbErrorCode::HandshakeFailed,
                    format!("noise params failed: {error}"),
                )
            })?;
    let keypair = snow::Builder::new(params)
        .generate_keypair()
        .map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::HandshakeFailed,
                format!("noise keypair generation failed: {error}"),
            )
        })?;
    Ok(NoiseStaticKeypair {
        private: keypair.private,
        public: keypair.public,
    })
}

fn new_host_id() -> HostId {
    format!("mobile-usb-{}", uuid::Uuid::new_v4())
}

fn desktop_usb_pairing_label() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ChromVoid Desktop".to_string())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn is_transport_closed_error(error: &str) -> bool {
    error.contains("transport closed")
        || error.contains("Broken pipe")
        || error.contains("broken pipe")
        || error.contains("UnexpectedEof")
}

fn mobile_usb_xx_handshake_error(error: &str) -> MobileUsbError {
    let code = if is_transport_closed_error(error) {
        MobileUsbErrorCode::CableDisconnected
    } else {
        MobileUsbErrorCode::HandshakeFailed
    };
    MobileUsbError::new(code, format!("mobile USB XX handshake failed: {error}"))
}

fn mobile_usb_pairing_confirmation_error(error: String) -> MobileUsbError {
    MobileUsbError::new(
        MobileUsbErrorCode::PairCommitFailed,
        format!("mobile USB pairing confirmation failed: {error}"),
    )
}

fn mobile_usb_ik_handshake_error(error: String) -> MobileUsbError {
    let code = if is_ik_send_closed_error(&error) {
        MobileUsbErrorCode::CableDisconnected
    } else if is_ik_first_write_transport_error(&error) {
        MobileUsbErrorCode::HandshakeFailed
    } else {
        MobileUsbErrorCode::StalePairing
    };
    MobileUsbError::new(code, format!("mobile USB IK handshake failed: {error}"))
}

fn is_retryable_xx_first_write_error(error: &str) -> bool {
    error.contains("xx msg1 send")
        && error.contains("mobile_usb record write failed")
        && (is_timeout_error(error) || error.contains("Android AOA endpoint failed"))
}

fn is_timeout_error(error: &str) -> bool {
    error.contains("transport timeout")
        || error.contains("TimedOut")
        || error.contains("timed out")
        || error.contains("Timeout")
        || error.contains("timeout")
}

fn is_ik_send_closed_error(error: &str) -> bool {
    error.contains("ik msg1 send") && is_transport_closed_error(error)
}

fn is_ik_first_write_transport_error(error: &str) -> bool {
    error.contains("ik msg1 send")
        && error.contains("mobile_usb record write failed")
        && (is_timeout_error(error) || error.contains("Android AOA endpoint failed"))
}

fn is_retryable_ik_handshake_error(error: &MobileUsbError) -> bool {
    error.code == MobileUsbErrorCode::HandshakeFailed
        && (error.message.contains("IK handshake timed out")
            || is_ik_first_write_transport_error(&error.message))
}

#[cfg(desktop)]
fn mobile_usb_session_event_from_remote_runtime_event(
    session_id: &SessionId,
    event: crate::remote_io_runtime::RemoteIoRuntimeEvent,
) -> MobileUsbSessionEvent {
    match event {
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected { reason }
            if is_transport_closed_error(&reason) =>
        {
            MobileUsbSessionEvent::CableDisconnected {
                session_id: session_id.clone(),
            }
        }
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected { reason } => {
            MobileUsbSessionEvent::RemoteIoStopped {
                session_id: session_id.clone(),
                reason: MobileUsbRemoteIoStopReason::Error(reason),
            }
        }
    }
}
