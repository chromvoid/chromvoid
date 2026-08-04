use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tauri::{Emitter, Manager};

use super::controller::{
    MobileUsbSessionHandle, MobileUsbSessionStarter, MobileUsbStartSessionRequest,
};
use super::error_mapping::mobile_usb_session_event_from_remote_runtime_event;
use super::observability::{log_timeline_event, MobileUsbTimelineEvent};
use super::types::{
    MobileUsbError, MobileUsbErrorCode, MobileUsbSessionEvent, MobileUsbSessionState,
    MobileUsbStatus, SessionId,
};

pub(crate) const MOBILE_USB_STATUS_CHANGED_EVENT: &str = "mobile_usb_status_changed";

mod startup;

use startup::{mobile_usb_startup_capabilities, mobile_usb_startup_vault_is_unlocked};

pub(crate) trait MobileUsbSessionEventTarget: Send + Sync + 'static {
    fn handle_mobile_usb_session_event(&self, event: MobileUsbSessionEvent);
}

impl MobileUsbSessionEventTarget for tauri::AppHandle {
    fn handle_mobile_usb_session_event(&self, event: MobileUsbSessionEvent) {
        let Some(state) = self.try_state::<crate::app_state::AppState>() else {
            tracing::warn!("mobile_usb: AppState unavailable while handling session event");
            return;
        };
        let host_unlock_confirmed =
            matches!(event, MobileUsbSessionEvent::HostUnlockConfirmed { .. });
        let terminal_lock_reason = mobile_usb_terminal_lock_reason(&event);

        let status = match state.mobile_usb_runtime.handle_session_event(event) {
            Ok(status) => status,
            Err(error) => {
                tracing::warn!("mobile_usb: failed to handle session event: {error}");
                emit_mobile_usb_status_changed(self, &state);
                return;
            }
        };

        if host_unlock_confirmed {
            match state.adapter.lock() {
                Ok(mut adapter) => adapter.mark_mobile_usb_session_approved(),
                Err(_) => tracing::warn!(
                    "mobile_usb: adapter mutex poisoned while marking USB session approved"
                ),
            }
        }
        if let Some(reason) =
            terminal_lock_reason.filter(|_| mobile_usb_status_is_terminal(&status))
        {
            emit_mobile_usb_terminal_frontend_lock(self, &status, reason);
            if let Err(error) =
                restore_local_after_mobile_usb_session_end(self, &state, "session_stopped")
            {
                tracing::warn!("mobile_usb: failed to restore local adapter after stop: {error}");
            }
        }
        emit_mobile_usb_status_changed(self, &state);
    }
}

fn mobile_usb_terminal_lock_reason(event: &MobileUsbSessionEvent) -> Option<&'static str> {
    match event {
        MobileUsbSessionEvent::HostLocked { .. } => Some("remote_usb_host_locked"),
        MobileUsbSessionEvent::RemoteIoStopped { .. } => Some("remote_usb_transport_stopped"),
        MobileUsbSessionEvent::CableDisconnected { .. } => Some("remote_usb_cable_disconnected"),
        MobileUsbSessionEvent::HostUnlockConfirmed { .. } => None,
    }
}

fn emit_mobile_usb_terminal_frontend_lock(
    app: &tauri::AppHandle,
    status: &MobileUsbStatus,
    reason: &'static str,
) {
    let _ = app.emit("vault:locked", serde_json::json!({"reason": reason}));
    let _ = app.emit(MOBILE_USB_STATUS_CHANGED_EVENT, status.clone());
    tracing::info!(
        reason,
        "mobile_usb: emitted terminal frontend lock before local restore"
    );
}

pub(crate) fn emit_mobile_usb_status_changed(
    app: &tauri::AppHandle,
    state: &crate::app_state::AppState,
) {
    match state.mobile_usb_runtime.status() {
        Ok(status) => {
            let _ = app.emit(MOBILE_USB_STATUS_CHANGED_EVENT, status);
        }
        Err(error) => {
            tracing::warn!("mobile_usb: failed to read status for event emit: {error}");
        }
    }
}

pub(crate) fn restore_local_after_mobile_usb_session_end(
    app: &tauri::AppHandle,
    state: &crate::app_state::AppState,
    reason: &'static str,
) -> Result<(), String> {
    let previous_mode = state
        .adapter
        .lock()
        .map_err(|_| "Adapter mutex poisoned".to_string())?
        .mode();
    if !matches!(
        previous_mode,
        crate::core_adapter::CoreMode::Remote {
            host: crate::core_adapter::RemoteHost::MobileUsb { .. }
        }
    ) {
        return Ok(());
    }

    state.sync_runtime.reset()?;
    let _ = app.emit("sync:status", serde_json::json!({ "phase": "cleared" }));

    let storage_root = state
        .storage_root
        .lock()
        .map_err(|_| "Storage root mutex poisoned".to_string())?
        .clone();
    let local_adapter = crate::core_adapter::LocalCoreAdapter::new_with_license_store(
        storage_root.clone(),
        state.license_root.clone(),
        crate::pro::current_build_policy(),
    )?;

    let (current_mode, remote_core_features, transport_session_generation) = {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        *adapter = Box::new(local_adapter) as Box<dyn crate::core_adapter::CoreAdapter>;
        crate::helpers::emit_basic_state(app, &storage_root, adapter.as_ref());
        (
            adapter.mode(),
            adapter.remote_core_features(),
            adapter.transport_session_generation(),
        )
    };

    let _ = app.emit(
        "connection:status",
        serde_json::json!({
            "phase": "disconnected",
            "transport_type": "usb_mobile",
            "reason": reason,
        }),
    );
    let _ = app.emit(
        "mode:changed",
        serde_json::json!({
            "previous_mode": previous_mode,
            "current_mode": current_mode,
            "remote_core_features": remote_core_features,
            "transport_session_generation": transport_session_generation,
            "auto_locked": false,
            "drain_completed": true,
        }),
    );
    Ok(())
}

pub(crate) fn disconnect_mobile_usb_and_restore_local(
    app: &tauri::AppHandle,
    state: &crate::app_state::AppState,
    reason: &'static str,
) {
    if let Err(error) = state.mobile_usb_runtime.disconnect_terminal() {
        tracing::warn!(
            reason,
            error = %error.message,
            "mobile_usb: disconnect failed during terminal teardown"
        );
    }
    if let Err(error) = restore_local_after_mobile_usb_session_end(app, state, reason) {
        tracing::warn!(
            reason,
            "mobile_usb: local restore failed during terminal teardown: {error}"
        );
    }
    emit_mobile_usb_status_changed(app, state);
}

pub(crate) fn disconnect_mobile_usb_for_system_sleep(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<crate::app_state::AppState>() else {
        tracing::warn!("mobile_usb: AppState unavailable during system sleep disconnect");
        return;
    };
    let Ok(status) = state.mobile_usb_runtime.status() else {
        tracing::warn!("mobile_usb: failed to read status during system sleep disconnect");
        return;
    };
    if !mobile_usb_status_requires_system_sleep_disconnect(&status) {
        return;
    }
    disconnect_mobile_usb_and_restore_local(app, &state, "system_sleep");
}

fn mobile_usb_status_is_terminal(status: &MobileUsbStatus) -> bool {
    matches!(
        status.session_state,
        MobileUsbSessionState::Disconnected | MobileUsbSessionState::Error
    ) && status.selected_transport.is_none()
}

fn mobile_usb_status_requires_system_sleep_disconnect(status: &MobileUsbStatus) -> bool {
    status.selected_transport == Some(chromvoid_protocol::TransportType::UsbMobile)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(
        session_state: MobileUsbSessionState,
        selected_transport: Option<chromvoid_protocol::TransportType>,
    ) -> MobileUsbStatus {
        MobileUsbStatus {
            transport_family: "usb_mobile",
            available_transports: vec![chromvoid_protocol::TransportType::UsbMobile],
            selected_transport,
            session_state,
            fallback_allowed: false,
            active_host: None,
            paired_hosts: Vec::new(),
            in_flight: None,
            pairing_approval: None,
            error_code: None,
        }
    }

    #[test]
    fn terminal_status_requires_disconnected_or_error_without_selected_transport() {
        assert!(mobile_usb_status_is_terminal(&status(
            MobileUsbSessionState::Disconnected,
            None,
        )));
        assert!(mobile_usb_status_is_terminal(&status(
            MobileUsbSessionState::Error,
            None,
        )));
        assert!(!mobile_usb_status_is_terminal(&status(
            MobileUsbSessionState::TransportReadyHostLocked,
            Some(chromvoid_protocol::TransportType::UsbMobile),
        )));
    }

    #[test]
    fn system_sleep_disconnect_only_targets_active_usb_transport() {
        assert!(mobile_usb_status_requires_system_sleep_disconnect(&status(
            MobileUsbSessionState::RemoteDashboardOpen,
            Some(chromvoid_protocol::TransportType::UsbMobile),
        )));
        assert!(!mobile_usb_status_requires_system_sleep_disconnect(
            &status(MobileUsbSessionState::Disconnected, None,)
        ));
    }

    #[test]
    fn terminal_session_events_map_to_frontend_lock_reasons() {
        assert_eq!(
            mobile_usb_terminal_lock_reason(&MobileUsbSessionEvent::HostLocked {
                session_id: "session-1".to_string(),
            }),
            Some("remote_usb_host_locked"),
        );
        assert_eq!(
            mobile_usb_terminal_lock_reason(&MobileUsbSessionEvent::CableDisconnected {
                session_id: "session-1".to_string(),
            }),
            Some("remote_usb_cable_disconnected"),
        );
        assert_eq!(
            mobile_usb_terminal_lock_reason(&MobileUsbSessionEvent::RemoteIoStopped {
                session_id: "session-1".to_string(),
                reason: super::super::types::RemoteIoStopReason::Liveness("timeout".to_string()),
            }),
            Some("remote_usb_transport_stopped"),
        );
        assert_eq!(
            mobile_usb_terminal_lock_reason(&MobileUsbSessionEvent::HostUnlockConfirmed {
                session_id: "session-1".to_string(),
            }),
            None,
        );
    }
}

pub(crate) struct TauriMobileUsbSessionEventSink<T: MobileUsbSessionEventTarget> {
    target: T,
    session_id: SessionId,
}

impl<T: MobileUsbSessionEventTarget> TauriMobileUsbSessionEventSink<T> {
    pub(crate) fn new(target: T, session_id: SessionId) -> Self {
        Self { target, session_id }
    }
}

impl<T: MobileUsbSessionEventTarget> crate::remote_io_runtime::RemoteIoRuntimeEventSink
    for TauriMobileUsbSessionEventSink<T>
{
    fn on_remote_io_event(&self, event: crate::remote_io_runtime::RemoteIoRuntimeEvent) {
        self.target.handle_mobile_usb_session_event(
            mobile_usb_session_event_from_remote_runtime_event(&self.session_id, event),
        );
    }
}

pub(crate) struct TauriMobileUsbSessionStarter {
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn crate::core_adapter::CoreAdapter>>>,
    remote_io_runtime: Arc<crate::remote_io_runtime::RemoteIoRuntimeState>,
}

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
        let peer_features = request.config.peer_features.clone();
        let remote_session = self
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
        let req_tx = remote_session.req_tx.clone();
        let transport_session_generation = remote_session.generation;
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
        let mut adapter =
            crate::core_adapter::RemoteCoreAdapter::from_remote_sender_with_metrics_generation_and_features(
                crate::core_adapter::RemoteHost::MobileUsb {
                    host_id: host_id.clone(),
                    label,
                    platform,
                },
                remote_session.req_tx,
                Some(request.metrics),
                Some(transport_session_generation),
                peer_features,
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
                "transport_session_generation": transport_session_generation,
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
            transport_session_generation,
        })
    }

    async fn disconnect_user(&self) -> Result<(), MobileUsbError> {
        const ACK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);
        const TASK_GRACE: std::time::Duration = std::time::Duration::from_secs(1);

        self.remote_io_runtime
            .disconnect_active_mobile_usb(ACK_TIMEOUT, TASK_GRACE)
            .await
            .map(|_| ())
            .map_err(|error| {
                MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    format!("failed to gracefully disconnect mobile USB remote session: {error}"),
                )
            })
    }

    fn disconnect_terminal(&self) -> Result<(), MobileUsbError> {
        self.remote_io_runtime
            .stop_active(crate::remote_io_runtime::RemoteIoStopReason::ModeSwitchLocal)
            .map_err(|error| {
                MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    format!("failed to stop mobile USB remote session: {error}"),
                )
            })
    }
}
