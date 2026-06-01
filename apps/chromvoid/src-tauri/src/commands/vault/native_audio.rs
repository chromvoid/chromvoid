use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::app_state::AppState;
use crate::commands::vault::android_audio::{
    android_audio_command_session_id, android_audio_session_command, prepare_android_audio_source,
    release_prepared_audio_tracks, rpc_error, AndroidAudioCommandArgs, AndroidAudioCommandResult,
    AndroidAudioPreparedTrackResult,
};
use crate::media_source::LocalMediaKind;
use crate::types::{RpcResult, TauriRpcResult};

static NATIVE_AUDIO_DISPATCH_SEQ: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub(crate) async fn native_audio_session_command(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: AndroidAudioCommandArgs,
) -> TauriRpcResult<AndroidAudioCommandResult> {
    if cfg!(target_os = "android") {
        return android_audio_session_command(state, args).await;
    }
    if !cfg!(target_os = "ios") {
        return Ok(rpc_error(
            "Native audio playback is not available on this target",
            Some("ERR_NATIVE_AUDIO_UNAVAILABLE".to_string()),
        ));
    }

    Ok(match args {
        AndroidAudioCommandArgs::StartSession {
            native_session_id,
            tracks,
            index,
            autoplay,
        } => ios_audio_start_session(app, state, native_session_id, tracks, index, autoplay).await,
        command => ios_audio_forward_command(app, state, command),
    })
}

async fn ios_audio_start_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    native_session_id: String,
    tracks: Vec<crate::commands::vault::android_audio::AndroidAudioTrackInput>,
    index: usize,
    autoplay: bool,
) -> RpcResult<AndroidAudioCommandResult> {
    let native_session_id = native_session_id.trim().to_string();
    if native_session_id.is_empty() {
        return rpc_error(
            "Native audio nativeSessionId is required",
            Some("BAD_REQUEST".to_string()),
        );
    }
    if tracks.is_empty() || index >= tracks.len() {
        return rpc_error(
            "Native audio startSession requires tracks and a valid index",
            Some("BAD_REQUEST".to_string()),
        );
    }

    let mut prepared_tracks = Vec::with_capacity(tracks.len());
    let mut registry_tracks = Vec::with_capacity(tracks.len());
    let mut result_tracks = Vec::with_capacity(tracks.len());

    for track in tracks {
        let prepared = match prepare_android_audio_source(&state, track).await {
            Ok(prepared) => prepared,
            Err((error, code)) => {
                release_prepared_audio_tracks(&state, &registry_tracks);
                return rpc_error(error, code);
            }
        };

        let session = match state.media_streams.register(
            prepared.node_id,
            LocalMediaKind::Audio,
            prepared.mime_type.clone(),
            prepared.size,
            prepared.source_revision,
        ) {
            Ok(session) => session,
            Err(error) => {
                release_prepared_audio_tracks(&state, &registry_tracks);
                return rpc_error(error, Some("INTERNAL".to_string()));
            }
        };
        prepared_tracks.push(serde_json::json!({
            "trackId": prepared.node_id,
            "systemTitle": "ChromVoid audio",
            "mimeType": prepared.mime_type.clone(),
            "size": prepared.size,
            "sourceRevision": prepared.source_revision,
            "sourceToken": session.token.clone(),
        }));
        registry_tracks.push(crate::mobile::android::AndroidAudioSessionTrack {
            track_id: prepared.node_id,
            source_revision: prepared.source_revision,
            token: session.token,
            generation: session.generation,
        });
        result_tracks.push(AndroidAudioPreparedTrackResult {
            track_id: prepared.node_id,
            mime_type: prepared.mime_type,
            size: prepared.size,
            source_revision: prepared.source_revision,
        });
    }

    let command_json = serde_json::json!({
        "dispatchId": next_native_audio_dispatch_id(),
        "command": "startSession",
        "nativeSessionId": native_session_id,
        "tracks": prepared_tracks,
        "index": index,
        "autoplay": autoplay,
    })
    .to_string();
    if let Err(error) = state.android_audio_sessions.register_session(
        native_session_id.clone(),
        registry_tracks,
        state.media_streams.as_ref(),
    ) {
        return rpc_error(
            format!("Native audio session registry unavailable: {error}"),
            Some("INTERNAL".to_string()),
        );
    }

    if !crate::mobile::ios::native_bridge::send_audio_playback_command(app, &command_json) {
        if let Err(error) = state
            .android_audio_sessions
            .release_session(&native_session_id, state.media_streams.as_ref())
        {
            tracing::warn!("native_audio: failed to release start-failed session: {error}");
        }
        return rpc_error(
            "iOS native audio player failed to start",
            Some("ERR_NATIVE_AUDIO_START_FAILED".to_string()),
        );
    }

    crate::types::rpc_ok(AndroidAudioCommandResult {
        accepted: true,
        tracks: result_tracks,
    })
}

fn ios_audio_forward_command(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    command: AndroidAudioCommandArgs,
) -> RpcResult<AndroidAudioCommandResult> {
    let native_session_id = android_audio_command_session_id(&command)
        .trim()
        .to_string();
    if native_session_id.is_empty() {
        return rpc_error(
            "Native audio nativeSessionId is required",
            Some("BAD_REQUEST".to_string()),
        );
    }

    let has_session = match state
        .android_audio_sessions
        .contains_session(&native_session_id)
    {
        Ok(has_session) => has_session,
        Err(error) => {
            return rpc_error(
                format!("Native audio session registry unavailable: {error}"),
                Some("INTERNAL".to_string()),
            );
        }
    };

    if !has_session {
        return crate::types::rpc_ok(AndroidAudioCommandResult {
            accepted: matches!(command, AndroidAudioCommandArgs::Stop { .. }),
            tracks: Vec::new(),
        });
    }

    let command_json = match native_audio_command_json_with_dispatch_id(&command) {
        Ok(value) => value,
        Err(error) => {
            return rpc_error(
                format!("Native audio command serialization failed: {error}"),
                Some("BAD_REQUEST".to_string()),
            );
        }
    };
    let sent = crate::mobile::ios::native_bridge::send_audio_playback_command(app, &command_json);
    if matches!(command, AndroidAudioCommandArgs::Stop { .. }) {
        if let Err(error) = state
            .android_audio_sessions
            .release_session(&native_session_id, state.media_streams.as_ref())
        {
            return rpc_error(
                format!("Native audio session registry unavailable: {error}"),
                Some("INTERNAL".to_string()),
            );
        }
        return crate::types::rpc_ok(AndroidAudioCommandResult {
            accepted: sent,
            tracks: Vec::new(),
        });
    }
    if !sent {
        return rpc_error(
            "iOS native audio command failed",
            Some("ERR_NATIVE_AUDIO_COMMAND_FAILED".to_string()),
        );
    }

    crate::types::rpc_ok(AndroidAudioCommandResult {
        accepted: true,
        tracks: Vec::new(),
    })
}

fn native_audio_command_json_with_dispatch_id(
    command: &AndroidAudioCommandArgs,
) -> Result<String, serde_json::Error> {
    let mut value = serde_json::to_value(command)?;
    if let Value::Object(map) = &mut value {
        map.insert(
            "dispatchId".to_string(),
            Value::String(next_native_audio_dispatch_id()),
        );
    }
    serde_json::to_string(&value)
}

fn next_native_audio_dispatch_id() -> String {
    let seq = NATIVE_AUDIO_DISPATCH_SEQ.fetch_add(1, Ordering::Relaxed);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("native-audio-{millis:x}-{seq:x}")
}

pub(crate) fn release_mobile_native_sessions(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    reason: &str,
) {
    if cfg!(target_os = "ios") {
        let released = match state
            .android_audio_sessions
            .release_all(state.media_streams.as_ref())
        {
            Ok(released) => released,
            Err(error) => {
                tracing::warn!(
                    "release_mobile_native_sessions: audio registry release failed: {error}"
                );
                0
            }
        };
        let native_released =
            crate::mobile::ios::native_bridge::release_lifecycle_sessions(app.clone(), reason);
        match crate::mobile::ios::staging::app_group_container_path()
            .and_then(|root| crate::mobile::ios::staging::purge_all(&root))
        {
            Ok(()) => {}
            Err(error) => {
                tracing::warn!("release_mobile_native_sessions: iOS staging purge failed: {error}");
            }
        }
        tracing::info!(
            "release_mobile_native_sessions: ios native_released={} audio_sessions={}",
            native_released,
            released
        );
        return;
    }

    let cancelled_uploads = crate::mobile::android::cancel_all_native_uploads(
        &state.android_native_upload_runtime,
        reason == "app_exit",
    );
    super::stop_android_audio_sessions(state);
    tracing::info!(
        "release_mobile_native_sessions: android native_uploads_cancelled={}",
        cancelled_uploads
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_audio_command_envelope_adds_internal_dispatch_id() {
        let command_json =
            native_audio_command_json_with_dispatch_id(&AndroidAudioCommandArgs::SeekTo {
                native_session_id: "native-1".to_string(),
                position_ms: 42_000,
            })
            .expect("command should serialize");
        let value = serde_json::from_str::<Value>(&command_json).expect("command should parse");

        assert_eq!(value.get("command").and_then(Value::as_str), Some("seekTo"));
        assert_eq!(
            value.get("nativeSessionId").and_then(Value::as_str),
            Some("native-1"),
        );
        assert!(value
            .get("dispatchId")
            .and_then(Value::as_str)
            .is_some_and(|value| value.starts_with("native-audio-")),);
    }
}
