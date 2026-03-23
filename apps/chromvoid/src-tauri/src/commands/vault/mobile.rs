use serde_json::Value;
use tauri::Emitter;

use crate::app_state::AppState;
use crate::helpers::*;
use crate::mobile;
use crate::types::*;

#[cfg(desktop)]
use crate::commands::volume_ops::perform_volume_teardown;

#[tauri::command]
pub(crate) fn mobile_notify_background(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> RpcResult<Value> {
    let invalidated =
        crate::mobile::android::invalidate_all_password_save_requests("mobile_background");
    if invalidated > 0 {
        crate::mobile::android::notify_password_save_review_result(None, "dismissed", false);
    }

    let mut locked = false;
    let should_lock_on_background = state
        .session_settings
        .lock()
        .map(|settings| settings.lock_on_mobile_background)
        .unwrap_or(false);

    if let Ok(mut adapter) = state.adapter.lock() {
        if crate::mobile_background_lock_adapter(adapter.as_mut(), should_lock_on_background) {
            flush_core_events(&app, adapter.as_mut());
            if let Ok(root) = state.storage_root.lock() {
                emit_basic_state(&app, &root, adapter.as_ref());
            }
            locked = true;
        }
    }

    if locked {
        #[cfg(desktop)]
        {
            if let Ok(mut gw) = state.gateway.lock() {
                gw.revoke_all_grants();
            }
            perform_volume_teardown(&app, &state.volume_manager);
        }
        let _ = app.emit(
            "vault:locked",
            serde_json::json!({"reason": "mobile_background"}),
        );
    }

    if let Ok(mut foreground) = state.mobile_is_foreground.lock() {
        *foreground = false;
    }
    if let Ok(adapter) = state.adapter.lock() {
        crate::ios_keep_awake::sync_ios_idle_timer(&app, adapter.as_ref());
    }

    // Best-effort: save connection state for foreground reconnect (iOS lifecycle).
    crate::network::ios_lifecycle::handle_background_suspend();

    rpc_ok(serde_json::json!({ "locked": locked }))
}

#[tauri::command]
pub(crate) fn mobile_notify_foreground(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> RpcResult<Value> {
    if let Ok(mut last) = state.last_activity.lock() {
        *last = std::time::Instant::now();
    }

    if let Ok(mut foreground) = state.mobile_is_foreground.lock() {
        *foreground = true;
    }

    let unlocked = state
        .adapter
        .lock()
        .map(|adapter| {
            crate::ios_keep_awake::sync_ios_idle_timer(&app, adapter.as_ref());
            crate::mobile_foreground_is_unlocked(adapter.as_ref())
        })
        .unwrap_or(false);

    let _ = app.emit(
        "mobile:foreground",
        serde_json::json!({ "unlocked": unlocked }),
    );

    // Best-effort: attempt reconnect if acceptor was active before background.
    if let Ok(root) = state.storage_root.lock() {
        crate::network::ios_lifecycle::handle_foreground_resume(app, root.clone());
    }
    rpc_ok(serde_json::json!({ "unlocked": unlocked }))
}

#[tauri::command]
pub(crate) fn android_password_save_finish(token: String, outcome: String) -> RpcResult<Value> {
    let Some(outcome) = crate::mobile::android::AndroidPasswordSaveOutcome::parse(&outcome) else {
        return rpc_err(
            "android_password_save_finish: invalid outcome",
            Some("BAD_REQUEST".to_string()),
        );
    };

    match crate::mobile::android::finish_password_save_request(&token, outcome) {
        Ok(finished) => {
            crate::mobile::android::notify_password_save_review_result(
                Some(&token),
                match outcome {
                    crate::mobile::android::AndroidPasswordSaveOutcome::Saved => "saved",
                    crate::mobile::android::AndroidPasswordSaveOutcome::Dismissed => "dismissed",
                },
                finished,
            );
            rpc_ok(serde_json::json!({ "finished": finished }))
        }
        Err(error) => rpc_err(error, Some("INTERNAL".to_string())),
    }
}

#[tauri::command]
pub(crate) fn mobile_biometric_auth(reason: Option<String>) -> RpcResult<Value> {
    // App-gate only: this verifies local device presence and must not unlock vault state.
    let prompt = reason
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Continue to ChromVoid".to_string());

    match mobile::authenticate_with_biometric(&prompt) {
        Ok(()) => rpc_ok(serde_json::json!({ "authenticated": true })),
        Err(e) => {
            let code = e.code().to_string();
            rpc_err(e.into_message(), Some(code))
        }
    }
}

#[tauri::command]
pub(crate) fn android_autofill_provider_status() -> RpcResult<Value> {
    match crate::mobile::android::autofill_provider_selected() {
        Ok(selected) => rpc_ok(serde_json::json!({ "selected": selected })),
        Err(error) => rpc_err(error, Some("UNSUPPORTED".to_string())),
    }
}

#[tauri::command]
pub(crate) fn android_open_autofill_provider_settings() -> RpcResult<Value> {
    match crate::mobile::android::open_autofill_provider_settings() {
        Ok(true) => rpc_ok(serde_json::json!({ "opened": true })),
        Ok(false) => rpc_err(
            "Failed to open Android autofill provider settings",
            Some("UNAVAILABLE".to_string()),
        ),
        Err(error) => rpc_err(error, Some("UNSUPPORTED".to_string())),
    }
}

#[tauri::command]
pub(crate) fn setup_native_gestures(app: tauri::AppHandle) {
    mobile::ios::edge_swipe::setup(app.clone());
    mobile::ios::keyboard::setup(app);
}

#[cfg(any(test, debug_assertions))]
pub fn mobile_biometric_auth_for_tests(
    reason: Option<String>,
) -> Result<Value, (String, Option<String>)> {
    match mobile_biometric_auth(reason) {
        RpcResult::Success { result, .. } => Ok(result),
        RpcResult::Error { error, code, .. } => Err((error, code)),
    }
}

#[cfg(any(test, debug_assertions))]
pub fn mobile_set_test_biometric_override(data: Option<mobile::TestBiometricOverride>) {
    mobile::set_test_biometric_override(data);
}
