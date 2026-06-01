//! iOS best-effort background resume for network connections.
//!
//! When the app transitions to background, [`save_connection_state`] captures
//! the current acceptor + sync state. When the app returns to foreground,
//! [`attempt_foreground_reconnect`] reads the saved state and tries to restart
//! the acceptor so Desktop peers can reconnect.
//!
//! This is a best-effort mechanism: if iOS kills the app, the in-memory saved
//! state is lost and no reconnect is attempted on next cold launch.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::mobile_acceptor::{self, AcceptorState};
use crate::task_lifecycle::EventTaskName;
use tauri::Manager;

// ── Saved state ─────────────────────────────────────────────────────────

/// Connection state snapshot captured on background entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedConnectionState {
    /// Whether the acceptor was actively listening or connected.
    pub was_active: bool,
    /// Relay URL the acceptor was connected to.
    pub relay_url: Option<String>,
    /// Room ID for signaling.
    pub room_id: Option<String>,
    /// Sync cursor version at the time of backgrounding.
    pub sync_version: u64,
    /// Sync cursor timestamp at the time of backgrounding.
    pub sync_timestamp_ms: u64,
    /// Whether sync subscription was active.
    pub sync_was_active: bool,
}

pub struct IosLifecycleRuntimeState {
    saved_state: Mutex<Option<SavedConnectionState>>,
    last_foreground_resume: Mutex<Option<Instant>>,
}

impl IosLifecycleRuntimeState {
    pub fn new() -> Self {
        Self {
            saved_state: Mutex::new(None),
            last_foreground_resume: Mutex::new(None),
        }
    }

    fn save_state(&self, state: SavedConnectionState) -> Result<(), String> {
        let mut guard = self
            .saved_state
            .lock()
            .map_err(|_| "iOS lifecycle saved state mutex poisoned".to_string())?;
        *guard = Some(state);
        Ok(())
    }

    fn take_saved_state(&self) -> Result<Option<SavedConnectionState>, String> {
        self.saved_state
            .lock()
            .map(|mut guard| guard.take())
            .map_err(|_| "iOS lifecycle saved state mutex poisoned".to_string())
    }

    fn should_run_foreground_resume(&self) -> Result<bool, String> {
        let mut guard = self
            .last_foreground_resume
            .lock()
            .map_err(|_| "iOS lifecycle resume mutex poisoned".to_string())?;
        let now = Instant::now();
        if guard
            .as_ref()
            .is_some_and(|last| now.duration_since(*last) < Duration::from_millis(1500))
        {
            return Ok(false);
        }
        *guard = Some(now);
        Ok(true)
    }
}

impl Default for IosLifecycleRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

// ── Public API ──────────────────────────────────────────────────────────

/// Capture current acceptor + sync state for later reconnect.
///
/// Called from `mobile_notify_background` when the app enters background.
/// The acceptor is NOT explicitly stopped here — iOS will suspend the process
/// and the signaling WebSocket will time out naturally.
pub fn save_connection_state(app: Option<&tauri::AppHandle>) {
    let Some(app) = app else {
        warn!("ios_lifecycle: cannot save connection state without AppHandle");
        return;
    };
    let Some(app_state) = app.try_state::<crate::app_state::AppState>() else {
        warn!("ios_lifecycle: AppState unavailable while saving connection state");
        return;
    };
    let status = match mobile_acceptor::get_status(&app_state.mobile_acceptor_runtime) {
        Ok(status) => status,
        Err(error) => {
            warn!("ios_lifecycle: failed to read acceptor status: {}", error);
            return;
        }
    };
    let was_active = matches!(
        status.state,
        AcceptorState::Listening | AcceptorState::Connected
    );

    // sync_cmds/mode_cmds are desktop-only modules. On mobile, sync state
    // is not available — acceptor restart is the primary mechanism.
    #[cfg(desktop)]
    let (sync_version, sync_timestamp_ms, sync_was_active) = {
        let cursor = match app_state.sync_runtime.get_cursor_pair() {
            Ok(cursor) => cursor,
            Err(error) => {
                warn!("ios_lifecycle: failed to read sync cursor: {}", error);
                None
            }
        };
        let active = match app_state.sync_runtime.is_active() {
            Ok(active) => active,
            Err(error) => {
                warn!("ios_lifecycle: failed to read sync active state: {}", error);
                false
            }
        };
        match cursor {
            Some((v, ts)) => (v, ts, active),
            None => (0, 0, active),
        }
    };
    #[cfg(not(desktop))]
    let (sync_version, sync_timestamp_ms, sync_was_active) = (0u64, 0u64, false);

    let saved_state = SavedConnectionState {
        was_active,
        relay_url: status.relay_url,
        room_id: status.room_id,
        sync_version,
        sync_timestamp_ms,
        sync_was_active,
    };

    info!(
        "ios_lifecycle: saved connection state (was_active={}, sync_active={})",
        was_active, sync_was_active
    );

    if let Err(error) = app_state.ios_lifecycle_runtime.save_state(saved_state) {
        warn!("ios_lifecycle: failed to save connection state: {}", error);
    }
}

pub fn handle_background_suspend(app: Option<&tauri::AppHandle>) {
    save_connection_state(app);
}

/// Take (consume) the saved connection state.
/// Returns `None` if no state was saved or already consumed.
pub fn take_saved_state(
    runtime: &IosLifecycleRuntimeState,
) -> Result<Option<SavedConnectionState>, String> {
    runtime.take_saved_state()
}

pub fn handle_foreground_resume(app: tauri::AppHandle, storage_root: std::path::PathBuf) {
    let Some(state) = app.try_state::<crate::app_state::AppState>() else {
        warn!("ios_lifecycle: AppState unavailable on foreground resume");
        return;
    };
    match state.ios_lifecycle_runtime.should_run_foreground_resume() {
        Ok(false) => {
            info!("ios_lifecycle: skipping duplicate foreground resume");
            return;
        }
        Ok(true) => {}
        Err(error) => {
            warn!(
                "ios_lifecycle: foreground resume debounce failed: {}",
                error
            );
            return;
        }
    }
    info!("ios_lifecycle: foreground resume triggered");
    #[cfg(target_os = "ios")]
    let task_lifecycle = state.task_lifecycle.clone();
    attempt_foreground_reconnect(app.clone(), storage_root.clone());
    drop(state);

    #[cfg(target_os = "ios")]
    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::IosPendingWakeOrHostResume,
        move |mut shutdown_rx| async move {
            tokio::select! {
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        info!("ios_lifecycle: pending wake or host-mode resume stopped by lifecycle shutdown");
                    }
                }
                result = async move {
                    info!("ios_lifecycle: checking pending wake or host-mode resume");
                    match app.try_state::<crate::app_state::AppState>() {
                        Some(state) => {
                            let ios_host_runtime = state.ios_host_runtime.clone();
                            let mobile_acceptor_runtime = state.mobile_acceptor_runtime.clone();
                            let adapter = state.adapter.clone();
                            drop(state);
                            crate::network::ios_pairing::handle_pending_wake_or_resume_host_mode(
                                ios_host_runtime,
                                mobile_acceptor_runtime,
                                Some(adapter),
                                &storage_root,
                            )
                            .await
                        }
                        None => Err("AppState unavailable".to_string()),
                    }
                } => {
                    if let Err(error) = result {
                        warn!(
                            "ios_lifecycle: host mode foreground resume failed: {}",
                            error
                        );
                    }
                }
            }
        },
    ) {
        warn!(
            "ios_lifecycle: host mode foreground resume was not scheduled: {}",
            error
        );
    }
}

/// Best-effort foreground reconnect.
///
/// Stops any stale acceptor state, then restarts the acceptor with the
/// previously saved relay_url and room_id. If sync was active, triggers
/// a reconnect via `handle_sync_reconnect` so the Desktop thin client
/// can resume delta or full-resync.
///
/// Spawns the reconnect as an async task (non-blocking) so the foreground
/// handler returns immediately.
pub fn attempt_foreground_reconnect(app: tauri::AppHandle, storage_root: std::path::PathBuf) {
    let Some(state) = app.try_state::<crate::app_state::AppState>() else {
        warn!("ios_lifecycle: AppState unavailable for reconnect");
        return;
    };
    let saved = match state.ios_lifecycle_runtime.take_saved_state() {
        Ok(Some(s)) => s,
        Ok(None) => {
            info!("ios_lifecycle: no saved state, skipping reconnect");
            return;
        }
        Err(error) => {
            warn!("ios_lifecycle: failed to take saved state: {}", error);
            return;
        }
    };

    if !saved.was_active {
        info!("ios_lifecycle: acceptor was not active, skipping reconnect");
        return;
    }

    let relay_url = match saved.relay_url {
        Some(ref url) if !url.is_empty() => url.clone(),
        _ => {
            warn!("ios_lifecycle: no relay_url in saved state, cannot reconnect");
            return;
        }
    };

    let room_id = match saved.room_id {
        Some(ref id) if !id.is_empty() => id.clone(),
        _ => {
            warn!("ios_lifecycle: no room_id in saved state, cannot reconnect");
            return;
        }
    };

    info!(
        "ios_lifecycle: attempting foreground reconnect relay={} room_id={} sync_was_active={} sync_version={} sync_timestamp_ms={}",
        relay_url, room_id, saved.sync_was_active, saved.sync_version, saved.sync_timestamp_ms
    );

    let app_clone = app.clone();
    let acceptor_runtime = state.mobile_acceptor_runtime.clone();
    let ios_host_runtime = state.ios_host_runtime.clone();
    let adapter = state.adapter.clone();
    let task_lifecycle = state.task_lifecycle.clone();
    drop(state);
    let _sync_version = saved.sync_version;
    let _sync_timestamp_ms = saved.sync_timestamp_ms;
    let _sync_was_active = saved.sync_was_active;

    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::IosForegroundReconnect,
        move |mut shutdown_rx| async move {
            tokio::select! {
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        info!("ios_lifecycle: foreground reconnect stopped by lifecycle shutdown");
                    }
                }
                _ = async move {
                    // Stop stale acceptor state (WebSocket is dead after background).
                    info!("ios_lifecycle: stopping stale acceptor before foreground reconnect");
                    let _ = mobile_acceptor::stop_listening(&acceptor_runtime);

                    // Attempt to restart the acceptor.
                    match mobile_acceptor::start_listening(
                        acceptor_runtime.clone(),
                        Some(adapter.clone()),
                        &relay_url,
                        &room_id,
                        &storage_root,
                    )
                    .await
                    {
                        Ok(status) => {
                            info!(
                                "ios_lifecycle: acceptor restarted state={:?} room_id={:?}",
                                status.state, status.room_id
                            );

                            use tauri::Emitter;
                            let _ = app_clone.emit(
                                "connection:ios_resume",
                                serde_json::json!({
                                    "phase": "acceptor_restarted",
                                    "state": status.state,
                                }),
                            );

                            if let Err(e) = crate::network::ios_pairing::publish_presence(
                                ios_host_runtime.clone(),
                                acceptor_runtime.clone(),
                                &relay_url,
                                &storage_root,
                            )
                            .await
                            {
                                warn!("ios_lifecycle: presence republish failed: {}", e);
                            }

                            // If sync was active before background, trigger reconnect.
                            // sync_cmds/mode_cmds are desktop-only; on mobile this is a no-op.
                            #[cfg(desktop)]
                            if _sync_was_active && _sync_version > 0 {
                                let _ = crate::commands::mode_cmds::handle_sync_reconnect(
                                    &app_clone,
                                    _sync_version,
                                    _sync_timestamp_ms,
                                );
                                info!("ios_lifecycle: sync reconnect triggered");
                            }
                        }
                        Err(e) => {
                            warn!("ios_lifecycle: acceptor restart failed: {}", e);

                            use tauri::Emitter;
                            let _ = app_clone.emit(
                                "connection:ios_resume",
                                serde_json::json!({
                                    "phase": "reconnect_failed",
                                    "error": e,
                                }),
                            );
                        }
                    }
                } => {}
            }
        },
    ) {
        warn!(
            "ios_lifecycle: foreground reconnect was not scheduled: {}",
            error
        );
    }
}

// ── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── All tests use local SavedConnectionState instances to avoid
    //    global state races when Rust runs tests in parallel. ──

    #[test]
    fn saved_state_serializes() {
        let state = SavedConnectionState {
            was_active: true,
            relay_url: Some("wss://relay.example.com".to_string()),
            room_id: Some("abc123".to_string()),
            sync_version: 42,
            sync_timestamp_ms: 1700000000000,
            sync_was_active: true,
        };

        let json = serde_json::to_string(&state).unwrap();
        let deserialized: SavedConnectionState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.was_active, true);
        assert_eq!(
            deserialized.relay_url.as_deref(),
            Some("wss://relay.example.com")
        );
        assert_eq!(deserialized.room_id.as_deref(), Some("abc123"));
        assert_eq!(deserialized.sync_version, 42);
        assert_eq!(deserialized.sync_timestamp_ms, 1700000000000);
        assert_eq!(deserialized.sync_was_active, true);
    }

    #[test]
    fn saved_state_inactive_fields() {
        let state = SavedConnectionState {
            was_active: false,
            relay_url: None,
            room_id: None,
            sync_version: 0,
            sync_timestamp_ms: 0,
            sync_was_active: false,
        };

        assert!(!state.was_active);
        assert!(state.relay_url.is_none());
        assert!(state.room_id.is_none());
        assert_eq!(state.sync_version, 0);
        assert!(!state.sync_was_active);
    }

    #[test]
    fn saved_state_with_sync_cursor() {
        let state = SavedConnectionState {
            was_active: true,
            relay_url: Some("wss://relay.test".to_string()),
            room_id: Some("room-42".to_string()),
            sync_version: 500,
            sync_timestamp_ms: 1700000000000,
            sync_was_active: true,
        };

        // Verify all fields set correctly
        assert!(state.was_active);
        assert_eq!(state.relay_url.as_deref(), Some("wss://relay.test"));
        assert_eq!(state.room_id.as_deref(), Some("room-42"));
        assert_eq!(state.sync_version, 500);
        assert_eq!(state.sync_timestamp_ms, 1700000000000);
        assert!(state.sync_was_active);
    }

    #[test]
    fn saved_state_clone() {
        let state = SavedConnectionState {
            was_active: true,
            relay_url: Some("wss://relay.test".to_string()),
            room_id: Some("room-42".to_string()),
            sync_version: 100,
            sync_timestamp_ms: 999,
            sync_was_active: false,
        };

        let cloned = state.clone();
        assert_eq!(cloned.was_active, state.was_active);
        assert_eq!(cloned.relay_url, state.relay_url);
        assert_eq!(cloned.room_id, state.room_id);
        assert_eq!(cloned.sync_version, state.sync_version);
        assert_eq!(cloned.sync_timestamp_ms, state.sync_timestamp_ms);
        assert_eq!(cloned.sync_was_active, state.sync_was_active);
    }

    #[test]
    fn saved_state_serde_roundtrip_with_none_fields() {
        let state = SavedConnectionState {
            was_active: false,
            relay_url: None,
            room_id: None,
            sync_version: 0,
            sync_timestamp_ms: 0,
            sync_was_active: false,
        };

        let json = serde_json::to_string(&state).unwrap();
        let deserialized: SavedConnectionState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.was_active, false);
        assert!(deserialized.relay_url.is_none());
        assert!(deserialized.room_id.is_none());
        assert_eq!(deserialized.sync_version, 0);
    }
}
