use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

use crate::app_state::AppState;
use crate::helpers::*;
use crate::media_source::{effective_catalog_media_mime_type, LocalMediaKind};
use crate::media_stream::format::{
    playable_media_kind_with_media_info, PlayableMediaKind, ERR_MEDIA_UNSUPPORTED,
};
use crate::mobile;
use crate::types::*;

use super::native_media_source::load_native_media_source_metadata;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidMediaSessionSnapshot {
    active: bool,
    track_id: u64,
    title: String,
    playback_state: String,
    position_ms: u64,
    duration_ms: u64,
    can_seek: bool,
    has_previous: bool,
    has_next: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidVideoStartArgs {
    node_id: u64,
    file_name: String,
    mime_type: Option<String>,
    last_modified: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidVideoStartResult {
    started: bool,
    token: String,
    mime_type: String,
    size: u64,
    source_revision: u64,
}

#[cfg(desktop)]
use crate::commands::volume_ops::perform_volume_teardown;

#[tauri::command]
pub(crate) async fn mobile_notify_background(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    let invalidated = crate::mobile::android::invalidate_all_password_save_requests(
        &state.android_password_save_runtime,
        "mobile_background",
    );
    if invalidated > 0 {
        crate::mobile::android::notify_password_save_review_result(None, "dismissed", false);
    }

    let mut locked = false;
    let should_lock_on_background = match state.session_settings.lock() {
        Ok(settings) => settings.lock_on_mobile_background || settings.lock_on_sleep,
        Err(_) => {
            tracing::warn!("mobile_notify_background: session settings mutex poisoned");
            false
        }
    };

    tracing::info!(
        "mobile_notify_background: should_lock_on_background={} invalidated_password_save_requests={}",
        should_lock_on_background,
        invalidated
    );

    let quick_lock_unlocked =
        match mobile_background_lock_phase(&app, &state, should_lock_on_background).await {
            Ok(phase) => {
                locked = phase.locked;
                phase.unlocked
            }
            Err(error) => {
                tracing::warn!("mobile_notify_background: lock phase failed: {error}");
                false
            }
        };

    if locked {
        super::release_mobile_native_sessions(&app, &state, "mobile_background");
        state.media_streams.clear();
        #[cfg(desktop)]
        {
            match state.gateway.lock() {
                Ok(mut gw) => gw.revoke_all_grants(),
                Err(_) => tracing::warn!("mobile_notify_background: gateway mutex poisoned"),
            }
            perform_volume_teardown(&app, &state.volume_manager);
        }
        let _ = crate::commands::catalog::purge_catalog_preview_cache_for_app(
            &app,
            "mobile_background",
        );
        let _ = app.emit(
            "vault:locked",
            serde_json::json!({"reason": "mobile_background"}),
        );
    }

    if !locked {
        let _ = crate::commands::catalog::purge_catalog_preview_cache_for_app(&app, "background");
    }

    match state.mobile_is_foreground.lock() {
        Ok(mut foreground) => *foreground = false,
        Err(_) => tracing::warn!("mobile_notify_background: foreground mutex poisoned"),
    }
    sync_mobile_ios_idle_timer_phase(&app, &state, "mobile_notify_background").await;
    super::sync_android_vault_quick_lock_with_unlocked(&app, &state, quick_lock_unlocked);

    // Best-effort: save connection state for foreground reconnect (iOS lifecycle).
    crate::network::ios_lifecycle::handle_background_suspend(Some(&app));

    Ok(rpc_ok(serde_json::json!({ "locked": locked })))
}

async fn sync_mobile_ios_idle_timer_phase(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    context: &'static str,
) {
    let app = app.clone();
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            crate::ios_keep_awake::sync_ios_idle_timer(&app, adapter.as_ref());
            Ok::<(), String>(())
        })
        .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::warn!("{context}: {error}"),
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Mobile iOS idle timer sync");
            tracing::warn!("{context}: failed to sync iOS idle timer: {error}");
        }
    }
}

struct MobileBackgroundLockPhase {
    locked: bool,
    unlocked: bool,
}

async fn mobile_background_lock_phase(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    should_lock_on_background: bool,
) -> Result<MobileBackgroundLockPhase, String> {
    let app = app.clone();
    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let mut adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            let was_unlocked = adapter.is_unlocked();
            let locked =
                crate::mobile_background_lock_adapter(adapter.as_mut(), should_lock_on_background);
            if locked {
                flush_core_events(&app, adapter.as_mut());
                match storage_root.lock() {
                    Ok(root) => emit_basic_state(&app, &root, adapter.as_ref()),
                    Err(_) => {
                        tracing::warn!("mobile_notify_background: storage root mutex poisoned");
                    }
                }
            }
            tracing::info!(
                "mobile_notify_background: adapter_state was_unlocked={} now_unlocked={} locked={}",
                was_unlocked,
                adapter.is_unlocked(),
                locked
            );
            Ok(MobileBackgroundLockPhase {
                locked,
                unlocked: adapter.is_unlocked(),
            })
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Mobile background lock");
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) async fn mobile_notify_foreground(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    touch_last_activity(&state.last_activity, "mobile_notify_foreground");

    match state.mobile_is_foreground.lock() {
        Ok(mut foreground) => *foreground = true,
        Err(_) => tracing::warn!("mobile_notify_foreground: foreground mutex poisoned"),
    }

    let unlocked = match mobile_foreground_unlocked_phase(&app, &state).await {
        Ok(unlocked) => unlocked,
        Err(error) => {
            tracing::warn!("mobile_notify_foreground: unlocked phase failed: {error}");
            false
        }
    };

    tracing::info!("mobile_notify_foreground: unlocked={}", unlocked);
    super::sync_android_vault_quick_lock_with_unlocked(&app, &state, unlocked);

    let _ = app.emit(
        "mobile:foreground",
        serde_json::json!({ "unlocked": unlocked }),
    );

    // Best-effort: attempt reconnect if acceptor was active before background.
    match state.storage_root.lock() {
        Ok(root) => crate::network::ios_lifecycle::handle_foreground_resume(app, root.clone()),
        Err(_) => tracing::warn!("mobile_notify_foreground: storage root mutex poisoned"),
    }

    #[cfg(target_os = "android")]
    {
        match state.storage_root.lock() {
            Ok(storage_root) => {
                let storage_root = storage_root.clone();
                let task_lifecycle = state.task_lifecycle.clone();
                let android_host_runtime = state.android_host_runtime.clone();
                let mobile_acceptor_runtime = state.mobile_acceptor_runtime.clone();
                let adapter = state.adapter.clone();
                if let Err(error) = crate::network::mobile_host::schedule_android_host_mode_resume(
                    task_lifecycle,
                    android_host_runtime,
                    mobile_acceptor_runtime,
                    Some(adapter),
                    storage_root,
                    "mobile_notify_foreground",
                ) {
                    tracing::warn!(
                    "mobile_notify_foreground: android mobile host resume was not scheduled: {}",
                    error
                );
                }
            }
            Err(_) => tracing::warn!("mobile_notify_foreground: storage root mutex poisoned"),
        }
    }
    Ok(rpc_ok(serde_json::json!({ "unlocked": unlocked })))
}

async fn mobile_foreground_unlocked_phase(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let app = app.clone();
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            crate::ios_keep_awake::sync_ios_idle_timer(&app, adapter.as_ref());
            Ok(crate::mobile_foreground_is_unlocked(adapter.as_ref()))
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Mobile foreground unlock state");
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) fn android_password_save_finish(
    state: tauri::State<'_, AppState>,
    token: String,
    outcome: String,
) -> RpcResult<Value> {
    let Some(outcome) = crate::mobile::android::AndroidPasswordSaveOutcome::parse(&outcome) else {
        return rpc_err(
            "android_password_save_finish: invalid outcome",
            Some("BAD_REQUEST".to_string()),
        );
    };

    match crate::mobile::android::finish_password_save_request(
        &state.android_password_save_runtime,
        &token,
        outcome,
    ) {
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
pub(crate) fn android_media_session_update(
    _app: tauri::AppHandle,
    snapshot: AndroidMediaSessionSnapshot,
) -> RpcResult<Value> {
    let Ok(snapshot_json) = serde_json::to_string(&snapshot) else {
        return rpc_err(
            "android_media_session_update: failed to serialize snapshot",
            Some("BAD_REQUEST".to_string()),
        );
    };

    let updated = crate::mobile::android::update_media_session(&snapshot_json);
    rpc_ok(serde_json::json!({ "updated": updated }))
}

#[tauri::command]
pub(crate) fn android_media_session_stop(_app: tauri::AppHandle) -> RpcResult<Value> {
    let stopped = crate::mobile::android::stop_media_session();
    rpc_ok(serde_json::json!({ "stopped": stopped }))
}

#[tauri::command]
pub(crate) async fn android_video_start(
    state: tauri::State<'_, AppState>,
    args: AndroidVideoStartArgs,
) -> TauriRpcResult<AndroidVideoStartResult> {
    let _ = (&args.file_name, args.last_modified);
    let metadata = match load_native_media_source_metadata(
        &state,
        args.node_id,
        "Native video source metadata",
    )
    .await
    {
        Ok(metadata) => metadata,
        Err((error, code)) => return Ok(rpc_error(error, code)),
    };
    if metadata.node_type != chromvoid_core::NodeType::File || metadata.size == 0 {
        return Ok(rpc_error(
            "Video source is not playable",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        ));
    }
    let mime_type = effective_catalog_media_mime_type(&metadata, args.mime_type);
    if playable_media_kind_with_media_info(
        &metadata.name,
        Some(&mime_type),
        metadata.media_info.as_ref(),
    ) != Ok(PlayableMediaKind::Video)
    {
        return Ok(rpc_error(
            "Video source is not playable",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        ));
    }

    let session = match state.media_streams.register(
        metadata.node_id,
        LocalMediaKind::Video,
        mime_type.clone(),
        metadata.size,
        metadata.source_revision,
    ) {
        Ok(session) => session,
        Err(error) => return Ok(rpc_error(error, Some("INTERNAL".to_string()))),
    };
    let source_json = serde_json::json!({
        "token": session.token,
        "nodeId": metadata.node_id,
        "name": metadata.name,
        "mimeType": mime_type,
        "size": metadata.size,
        "sourceRevision": metadata.source_revision,
    })
    .to_string();

    let started = if cfg!(target_os = "android") {
        crate::mobile::android::start_video_playback(&source_json)
    } else if cfg!(target_os = "ios") {
        crate::mobile::ios::native_bridge::start_video_playback(&source_json)
    } else {
        false
    };
    if !started {
        state.media_streams.release(&session.token);
        return Ok(rpc_error(
            "Native video player failed to start",
            Some("ERR_NATIVE_VIDEO_START_FAILED".to_string()),
        ));
    }

    Ok(RpcResult::Success {
        ok: true,
        result: AndroidVideoStartResult {
            started,
            token: session.token,
            mime_type,
            size: metadata.size,
            source_revision: metadata.source_revision,
        },
    })
}

#[tauri::command]
pub(crate) fn android_video_stop(
    state: tauri::State<'_, AppState>,
    token: String,
) -> RpcResult<Value> {
    if !token.trim().is_empty() {
        if cfg!(target_os = "android") {
            let _ = crate::mobile::android::stop_video_playback(&token);
        } else if cfg!(target_os = "ios") {
            let _ = crate::mobile::ios::native_bridge::stop_video_playback(&token);
        }
        state.media_streams.release(&token);
    }
    rpc_ok(serde_json::json!({ "stopped": true }))
}

#[tauri::command]
pub(crate) async fn mobile_biometric_auth(
    state: tauri::State<'_, AppState>,
    reason: Option<String>,
) -> TauriRpcResult<Value> {
    // App-gate only: this verifies local device presence and must not unlock vault state.
    let prompt = biometric_prompt(reason);

    #[cfg(target_os = "android")]
    let auth_result = {
        let runtime = state.android_biometric_runtime.clone();
        crate::mobile::android::authenticate_with_biometric(&runtime, &prompt).await
    };

    #[cfg(not(target_os = "android"))]
    let auth_result = mobile::authenticate_with_biometric(&prompt).await;

    Ok(biometric_auth_result(auth_result))
}

fn biometric_prompt(reason: Option<String>) -> String {
    reason
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Continue to ChromVoid".to_string())
}

fn biometric_auth_result(result: Result<(), mobile::BiometricAuthError>) -> RpcResult<Value> {
    match result {
        Ok(()) => rpc_ok(serde_json::json!({ "authenticated": true })),
        Err(e) => {
            let code = e.code().to_string();
            rpc_err(e.into_message(), Some(code))
        }
    }
}

fn rpc_error<T>(error: impl Into<String>, code: Option<String>) -> RpcResult<T> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code,
    }
}

async fn passkeys_core_rpc(
    state: &tauri::State<'_, AppState>,
    command: &'static str,
    data: Value,
) -> Result<Value, (String, Option<String>)> {
    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = adapter.lock().map_err(|_| {
                (
                    "Adapter unavailable".to_string(),
                    Some("INTERNAL".to_string()),
                )
            })?;
            match adapter.handle(&RpcRequest::new(command.to_string(), data)) {
                RpcResponse::Success { result, .. } => {
                    if matches!(
                        command,
                        "passkeys:delete"
                            | "credential_provider:passkey:create"
                            | "credential_provider:passkey:get"
                    ) {
                        adapter
                            .save()
                            .map_err(|error| (error, Some("INTERNAL".to_string())))?;
                    }
                    Ok(result)
                }
                RpcResponse::Error { error, code, .. } => Err((error, code)),
            }
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, code) = error.into_rpc_error("Credential provider passkeys");
            Err((error, code))
        }
    }
}

#[tauri::command]
pub(crate) fn android_autofill_provider_status() -> RpcResult<Value> {
    match crate::mobile::android::autofill_provider_selected() {
        Ok(selected) => rpc_ok(serde_json::json!({
            "platform": "android",
            "selected": selected,
            "available": true,
            "passkeysLiteAvailable": true,
            "passkeysLiteReason": Value::Null,
            "settingsAction": "open_credential_provider_settings",
        })),
        Err(error) => rpc_err(error, Some("UNSUPPORTED".to_string())),
    }
}

#[tauri::command]
pub(crate) async fn android_open_autofill_provider_settings(
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    if let Err(error) = crate::pro::guard_pro_feature_async(
        &state,
        chromvoid_core::license::PRO_FEATURE_CREDENTIAL_PROVIDER,
    )
    .await
    {
        return Ok(error);
    }
    Ok(
        match crate::mobile::android::open_autofill_provider_settings() {
            Ok(true) => rpc_ok(serde_json::json!({
                "opened": true,
                "settingsAction": "open_credential_provider_settings",
            })),
            Ok(false) => rpc_err(
                "Failed to open Android credential provider settings",
                Some("UNAVAILABLE".to_string()),
            ),
            Err(error) => rpc_err(error, Some("UNSUPPORTED".to_string())),
        },
    )
}

#[tauri::command]
pub(crate) fn credential_provider_status() -> RpcResult<Value> {
    if cfg!(target_os = "android") {
        return android_autofill_provider_status();
    }

    if cfg!(target_os = "ios") {
        let passkeys_lite_available = crate::mobile::credential_provider_passkeys_lite_supported();
        return rpc_ok(serde_json::json!({
            "platform": "ios",
            "selected": Value::Null,
            "available": crate::mobile::autofill_extension_ready(),
            "passkeysLiteAvailable": passkeys_lite_available,
            "passkeysLiteReason": if passkeys_lite_available {
                Value::Null
            } else {
                Value::String("passkeys_lite requires iOS 17+".to_string())
            },
            "settingsAction": "open_app_settings",
        }));
    }

    rpc_err(
        "Credential Provider is not available on this platform",
        Some("UNSUPPORTED".to_string()),
    )
}

#[tauri::command]
pub(crate) async fn open_credential_provider_settings(
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    if cfg!(target_os = "android") {
        return android_open_autofill_provider_settings(state).await;
    }

    if let Err(error) = crate::pro::guard_pro_feature_async(
        &state,
        chromvoid_core::license::PRO_FEATURE_CREDENTIAL_PROVIDER,
    )
    .await
    {
        return Ok(error);
    }

    Ok(if cfg!(target_os = "ios") {
        match crate::mobile::ios::native_bridge::open_app_settings() {
            Ok(()) => rpc_ok(serde_json::json!({
                "opened": true,
                "settingsAction": "open_app_settings",
            })),
            Err(error) => rpc_err(error, Some("UNAVAILABLE".to_string())),
        }
    } else {
        rpc_err(
            "Credential Provider settings are not available on this platform",
            Some("UNSUPPORTED".to_string()),
        )
    })
}

#[tauri::command]
pub(crate) async fn android_passkeys_list(
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    let started_at = std::time::Instant::now();
    tracing::info!("[android-passkeys-management] command=list phase=start");
    let mut passkeys = match passkeys_core_rpc(&state, "passkeys:list", serde_json::json!({})).await
    {
        Ok(value) => take_passkeys_from_list_response(value),
        Err((error, code)) => {
            tracing::warn!(
                "[android-passkeys-management] command=list phase=core_error dt_ms={} error={}",
                started_at.elapsed().as_millis(),
                error
            );
            return Ok(rpc_err(error, code));
        }
    };

    passkeys.sort_by(|a, b| {
        b.get("lastUsedEpochMs")
            .and_then(Value::as_u64)
            .cmp(&a.get("lastUsedEpochMs").and_then(Value::as_u64))
            .then_with(|| {
                a.get("rpId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .cmp(b.get("rpId").and_then(Value::as_str).unwrap_or(""))
            })
    });
    tracing::info!(
        "[android-passkeys-management] command=list phase=done dt_ms={}",
        started_at.elapsed().as_millis()
    );
    Ok(rpc_ok(serde_json::json!({ "passkeys": passkeys })))
}

fn take_passkeys_from_list_response(mut value: Value) -> Vec<Value> {
    match value.get_mut("passkeys") {
        Some(passkeys) => match passkeys.as_array_mut() {
            Some(passkeys) => std::mem::take(passkeys),
            None => {
                tracing::warn!(
                    "[android-passkeys-management] command=list phase=malformed_response field=passkeys"
                );
                Vec::new()
            }
        },
        None => {
            tracing::warn!(
                "[android-passkeys-management] command=list phase=malformed_response missing=passkeys"
            );
            Vec::new()
        }
    }
}

#[tauri::command]
pub(crate) async fn credential_provider_passkeys_list(
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    android_passkeys_list(state).await
}

#[tauri::command]
pub(crate) async fn android_passkey_delete(
    state: tauri::State<'_, AppState>,
    credential_id: String,
) -> TauriRpcResult<Value> {
    let started_at = std::time::Instant::now();
    tracing::info!(
        "[android-passkeys-management] command=delete phase=start credential_len={}",
        credential_id.len()
    );
    match passkeys_core_rpc(
        &state,
        "passkeys:delete",
        serde_json::json!({ "credentialIdB64Url": credential_id }),
    )
    .await
    {
        Ok(value) => {
            tracing::info!(
                "[android-passkeys-management] command=delete phase=core_done dt_ms={}",
                started_at.elapsed().as_millis()
            );
            Ok(rpc_ok(value))
        }
        Err((error, code)) => {
            tracing::warn!(
                "[android-passkeys-management] command=delete phase=core_error dt_ms={} error={}",
                started_at.elapsed().as_millis(),
                error
            );
            Ok(rpc_err(error, code))
        }
    }
}

#[tauri::command]
pub(crate) async fn credential_provider_passkey_delete(
    state: tauri::State<'_, AppState>,
    credential_id: String,
) -> TauriRpcResult<Value> {
    android_passkey_delete(state, credential_id).await
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
    match biometric_auth_result(mobile::authenticate_with_biometric_for_tests(
        &biometric_prompt(reason),
    )) {
        RpcResult::Success { result, .. } => Ok(result),
        RpcResult::Error { error, code, .. } => Err((error, code)),
    }
}

#[cfg(any(test, debug_assertions))]
pub fn mobile_set_test_biometric_override(data: Option<mobile::TestBiometricOverride>) {
    mobile::set_test_biometric_override(data);
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn passkeys_list_response_parser_takes_passkeys_array() {
        let passkeys = take_passkeys_from_list_response(json!({
            "passkeys": [
                { "credentialIdB64Url": "a" },
                { "credentialIdB64Url": "b" }
            ]
        }));

        assert_eq!(passkeys.len(), 2);
    }

    #[test]
    fn passkeys_list_response_parser_defaults_malformed_to_empty() {
        assert!(take_passkeys_from_list_response(json!({ "passkeys": "none" })).is_empty());
        assert!(take_passkeys_from_list_response(json!({})).is_empty());
    }
}
