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

static SAVED_STATE: Mutex<Option<SavedConnectionState>> = Mutex::new(None);
static LAST_FOREGROUND_RESUME: Mutex<Option<Instant>> = Mutex::new(None);

// ── Public API ──────────────────────────────────────────────────────────

/// Capture current acceptor + sync state for later reconnect.
///
/// Called from `mobile_notify_background` when the app enters background.
/// The acceptor is NOT explicitly stopped here — iOS will suspend the process
/// and the signaling WebSocket will time out naturally.
pub fn save_connection_state() {
    let status = mobile_acceptor::get_status();
    let was_active = matches!(
        status.state,
        AcceptorState::Listening | AcceptorState::Connected
    );

    // sync_cmds/mode_cmds are desktop-only modules. On mobile, sync state
    // is not available — acceptor restart is the primary mechanism.
    #[cfg(desktop)]
    let (sync_version, sync_timestamp_ms, sync_was_active) = {
        let cursor = crate::commands::sync_cmds::get_sync_cursor();
        let active = crate::commands::sync_cmds::is_sync_active();
        match cursor {
            Some((v, ts)) => (v, ts, active),
            None => (0, 0, active),
        }
    };
    #[cfg(not(desktop))]
    let (sync_version, sync_timestamp_ms, sync_was_active) = (0u64, 0u64, false);

    let state = SavedConnectionState {
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

    let mut guard = SAVED_STATE.lock().unwrap();
    *guard = Some(state);
}

pub fn handle_background_suspend() {
    save_connection_state();
}

/// Take (consume) the saved connection state.
/// Returns `None` if no state was saved or already consumed.
pub fn take_saved_state() -> Option<SavedConnectionState> {
    SAVED_STATE.lock().unwrap().take()
}

fn should_run_foreground_resume() -> bool {
    let mut guard = LAST_FOREGROUND_RESUME.lock().unwrap();
    let now = Instant::now();
    if guard
        .as_ref()
        .is_some_and(|last| now.duration_since(*last) < Duration::from_millis(1500))
    {
        return false;
    }
    *guard = Some(now);
    true
}

pub fn handle_foreground_resume(app: tauri::AppHandle, storage_root: std::path::PathBuf) {
    if !should_run_foreground_resume() {
        info!("ios_lifecycle: skipping duplicate foreground resume");
        return;
    }

    info!("ios_lifecycle: foreground resume triggered");
    attempt_foreground_reconnect(app.clone(), storage_root.clone());

    #[cfg(target_os = "ios")]
    tauri::async_runtime::spawn(async move {
        info!("ios_lifecycle: checking pending wake or host-mode resume");
        if let Err(error) =
            crate::network::ios_pairing::handle_pending_wake_or_resume_host_mode(&storage_root)
                .await
        {
            warn!(
                "ios_lifecycle: host mode foreground resume failed: {}",
                error
            );
        }
    });
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
    let saved = match take_saved_state() {
        Some(s) => s,
        None => {
            info!("ios_lifecycle: no saved state, skipping reconnect");
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
        relay_url,
        room_id,
        saved.sync_was_active,
        saved.sync_version,
        saved.sync_timestamp_ms
    );

    let app_clone = app.clone();
    let _sync_version = saved.sync_version;
    let _sync_timestamp_ms = saved.sync_timestamp_ms;
    let _sync_was_active = saved.sync_was_active;

    tauri::async_runtime::spawn(async move {
        // Stop stale acceptor state (WebSocket is dead after background).
        info!("ios_lifecycle: stopping stale acceptor before foreground reconnect");
        let _ = mobile_acceptor::stop_listening();

        // Attempt to restart the acceptor.
        match mobile_acceptor::start_listening(&relay_url, &room_id, &storage_root).await {
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

                if let Err(e) =
                    crate::network::ios_pairing::publish_presence(&relay_url, &storage_root).await
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
    });
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
