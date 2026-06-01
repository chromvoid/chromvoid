use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::app_state::AppState;
use crate::media_source::{effective_catalog_media_mime_type, LocalMediaKind};
use crate::media_stream::format::{
    playable_media_kind_with_media_info, PlayableMediaKind, ERR_MEDIA_UNSUPPORTED,
};
use crate::types::{RpcResult, TauriRpcResult};

use super::native_media_source::load_native_media_source_metadata;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidAudioTrackInput {
    pub(crate) track_id: u64,
    pub(crate) system_title: String,
    pub(crate) mime_type: Option<String>,
    pub(crate) size: Option<u64>,
    pub(crate) source_revision: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", tag = "command")]
pub(crate) enum AndroidAudioCommandArgs {
    StartSession {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
        tracks: Vec<AndroidAudioTrackInput>,
        index: usize,
        autoplay: bool,
    },
    Play {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
    },
    Pause {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
    },
    Stop {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
    },
    NextTrack {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
    },
    PreviousTrack {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
    },
    SeekTo {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
        #[serde(rename = "positionMs")]
        position_ms: u64,
    },
    SelectTrack {
        #[serde(rename = "nativeSessionId")]
        native_session_id: String,
        index: usize,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidAudioPreparedTrackResult {
    pub(crate) track_id: u64,
    pub(crate) mime_type: String,
    pub(crate) size: u64,
    pub(crate) source_revision: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidAudioCommandResult {
    pub(crate) accepted: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) tracks: Vec<AndroidAudioPreparedTrackResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidAudioWarmupResult {
    accepted: bool,
}

#[derive(Debug, Clone)]
pub(super) struct AndroidAudioPreparedSource {
    pub(super) node_id: u64,
    pub(super) mime_type: String,
    pub(super) size: u64,
    pub(super) source_revision: u64,
}

static ANDROID_AUDIO_DISPATCH_SEQ: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub(crate) async fn android_audio_session_command(
    state: tauri::State<'_, AppState>,
    args: AndroidAudioCommandArgs,
) -> TauriRpcResult<AndroidAudioCommandResult> {
    if !cfg!(target_os = "android") {
        return Ok(rpc_error(
            "Android native audio playback is not available on this target",
            Some("ERR_NATIVE_AUDIO_UNAVAILABLE".to_string()),
        ));
    }

    Ok(match args {
        AndroidAudioCommandArgs::StartSession {
            native_session_id,
            tracks,
            index,
            autoplay,
        } => android_audio_start_session(state, native_session_id, tracks, index, autoplay).await,
        command => android_audio_forward_command(state, command),
    })
}

#[tauri::command]
pub(crate) fn android_audio_warmup() -> RpcResult<AndroidAudioWarmupResult> {
    RpcResult::Success {
        ok: true,
        result: AndroidAudioWarmupResult {
            accepted: crate::mobile::android::warmup_audio_playback_service(),
        },
    }
}

async fn android_audio_start_session(
    state: tauri::State<'_, AppState>,
    native_session_id: String,
    tracks: Vec<AndroidAudioTrackInput>,
    index: usize,
    autoplay: bool,
) -> RpcResult<AndroidAudioCommandResult> {
    let native_session_id = native_session_id.trim().to_string();
    if native_session_id.is_empty() {
        return rpc_error(
            "Android audio nativeSessionId is required",
            Some("BAD_REQUEST".to_string()),
        );
    }
    if tracks.is_empty() || index >= tracks.len() {
        return rpc_error(
            "Android audio startSession requires tracks and a valid index",
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
        "dispatchId": next_android_audio_dispatch_id(),
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
            format!("Android audio session registry unavailable: {error}"),
            Some("INTERNAL".to_string()),
        );
    }

    if !crate::mobile::android::send_audio_playback_command(&command_json) {
        if let Err(error) = state
            .android_audio_sessions
            .release_session(&native_session_id, state.media_streams.as_ref())
        {
            tracing::warn!("android_audio: failed to release start-failed session: {error}");
        }
        return rpc_error(
            "Android native audio player failed to start",
            Some("ERR_NATIVE_AUDIO_START_FAILED".to_string()),
        );
    }

    RpcResult::Success {
        ok: true,
        result: AndroidAudioCommandResult {
            accepted: true,
            tracks: result_tracks,
        },
    }
}

pub(super) async fn prepare_android_audio_source(
    state: &tauri::State<'_, AppState>,
    track: AndroidAudioTrackInput,
) -> Result<AndroidAudioPreparedSource, (String, Option<String>)> {
    if track.system_title != "ChromVoid audio" {
        return Err((
            "Android audio system title must be generic".to_string(),
            Some("ERR_NATIVE_AUDIO_UNSUPPORTED".to_string()),
        ));
    }

    if let Some(source) = prepared_source_from_complete_track_input(&track) {
        return Ok(source);
    }

    let metadata =
        load_native_media_source_metadata(state, track.track_id, "Native audio source metadata")
            .await?;
    if metadata.node_type != chromvoid_core::NodeType::File
        || metadata.size == 0
        || metadata.node_id != track.track_id
    {
        return Err((
            "Audio source is not playable".to_string(),
            Some("ERR_NATIVE_AUDIO_UNSUPPORTED".to_string()),
        ));
    }

    let mime_type = effective_catalog_media_mime_type(&metadata, track.mime_type);
    if playable_media_kind_with_media_info(
        &metadata.name,
        Some(&mime_type),
        metadata.media_info.as_ref(),
    ) != Ok(PlayableMediaKind::Audio)
    {
        return Err((
            "Audio source is not playable".to_string(),
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        ));
    }

    Ok(AndroidAudioPreparedSource {
        node_id: metadata.node_id,
        mime_type,
        size: metadata.size,
        source_revision: metadata.source_revision,
    })
}

fn prepared_source_from_complete_track_input(
    track: &AndroidAudioTrackInput,
) -> Option<AndroidAudioPreparedSource> {
    let mime_type = track.mime_type.as_deref()?.trim();
    if mime_type.is_empty() {
        return None;
    }
    if playable_media_kind_with_media_info("", Some(mime_type), None)
        != Ok(PlayableMediaKind::Audio)
    {
        return None;
    }

    let size = track.size?;
    if size == 0 {
        return None;
    }
    let source_revision = track.source_revision?;

    Some(AndroidAudioPreparedSource {
        node_id: track.track_id,
        mime_type: mime_type.to_string(),
        size,
        source_revision,
    })
}

fn android_audio_forward_command(
    state: tauri::State<'_, AppState>,
    command: AndroidAudioCommandArgs,
) -> RpcResult<AndroidAudioCommandResult> {
    let native_session_id = android_audio_command_session_id(&command)
        .trim()
        .to_string();
    if native_session_id.is_empty() {
        return rpc_error(
            "Android audio nativeSessionId is required",
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
                format!("Android audio session registry unavailable: {error}"),
                Some("INTERNAL".to_string()),
            );
        }
    };

    if !has_session {
        return RpcResult::Success {
            ok: true,
            result: AndroidAudioCommandResult {
                accepted: matches!(command, AndroidAudioCommandArgs::Stop { .. }),
                tracks: Vec::new(),
            },
        };
    }

    let command_json = match android_audio_command_json_with_dispatch_id(&command) {
        Ok(value) => value,
        Err(error) => {
            return rpc_error(
                format!("Android audio command serialization failed: {error}"),
                Some("BAD_REQUEST".to_string()),
            );
        }
    };
    let sent = crate::mobile::android::send_audio_playback_command(&command_json);
    if matches!(command, AndroidAudioCommandArgs::Stop { .. }) {
        if let Err(error) = state
            .android_audio_sessions
            .release_session(&native_session_id, state.media_streams.as_ref())
        {
            return rpc_error(
                format!("Android audio session registry unavailable: {error}"),
                Some("INTERNAL".to_string()),
            );
        }
        return RpcResult::Success {
            ok: true,
            result: AndroidAudioCommandResult {
                accepted: sent,
                tracks: Vec::new(),
            },
        };
    }
    if !sent {
        return rpc_error(
            "Android native audio command failed",
            Some("ERR_NATIVE_AUDIO_COMMAND_FAILED".to_string()),
        );
    }

    RpcResult::Success {
        ok: true,
        result: AndroidAudioCommandResult {
            accepted: true,
            tracks: Vec::new(),
        },
    }
}

fn android_audio_command_json_with_dispatch_id(
    command: &AndroidAudioCommandArgs,
) -> Result<String, serde_json::Error> {
    let mut value = serde_json::to_value(command)?;
    if let Value::Object(map) = &mut value {
        map.insert(
            "dispatchId".to_string(),
            Value::String(next_android_audio_dispatch_id()),
        );
    }
    serde_json::to_string(&value)
}

fn next_android_audio_dispatch_id() -> String {
    let seq = ANDROID_AUDIO_DISPATCH_SEQ.fetch_add(1, Ordering::Relaxed);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("android-audio-{millis:x}-{seq:x}")
}

pub(super) fn android_audio_command_session_id(command: &AndroidAudioCommandArgs) -> &str {
    match command {
        AndroidAudioCommandArgs::StartSession {
            native_session_id, ..
        }
        | AndroidAudioCommandArgs::Play { native_session_id }
        | AndroidAudioCommandArgs::Pause { native_session_id }
        | AndroidAudioCommandArgs::Stop { native_session_id }
        | AndroidAudioCommandArgs::NextTrack { native_session_id }
        | AndroidAudioCommandArgs::PreviousTrack { native_session_id }
        | AndroidAudioCommandArgs::SeekTo {
            native_session_id, ..
        }
        | AndroidAudioCommandArgs::SelectTrack {
            native_session_id, ..
        } => native_session_id,
    }
}

pub(super) fn release_prepared_audio_tracks(
    state: &tauri::State<'_, AppState>,
    tracks: &[crate::mobile::android::AndroidAudioSessionTrack],
) {
    for track in tracks {
        state.media_streams.release(&track.token);
    }
}

pub(crate) fn stop_android_audio_sessions(state: &tauri::State<'_, AppState>) {
    if let Err(error) = state
        .android_audio_sessions
        .stop_all(state.media_streams.as_ref())
    {
        tracing::warn!("android_audio: failed to stop all native sessions: {error}");
    }
}

pub(super) fn rpc_error<T>(error: impl Into<String>, code: Option<String>) -> RpcResult<T> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code,
    }
}

#[cfg(test)]
mod android_audio_tests {
    use super::*;

    #[test]
    fn android_audio_command_deserializes_camel_case_start_session() {
        let command = serde_json::from_value::<AndroidAudioCommandArgs>(serde_json::json!({
            "command": "startSession",
            "nativeSessionId": "native-1",
            "tracks": [{
                "trackId": 41,
                "systemTitle": "ChromVoid audio",
                "mimeType": "audio/mpeg",
                "size": 1234,
                "sourceRevision": 77
            }],
            "index": 0,
            "autoplay": true
        }))
        .expect("command should deserialize");

        match command {
            AndroidAudioCommandArgs::StartSession {
                native_session_id,
                tracks,
                index,
                autoplay,
            } => {
                assert_eq!(native_session_id, "native-1");
                assert_eq!(tracks.len(), 1);
                assert_eq!(tracks[0].track_id, 41);
                assert_eq!(tracks[0].system_title, "ChromVoid audio");
                assert_eq!(tracks[0].source_revision, Some(77));
                assert_eq!(index, 0);
                assert!(autoplay);
            }
            _ => panic!("expected startSession"),
        }
    }

    #[test]
    fn android_audio_command_deserializes_minimal_start_session_track() {
        let command = serde_json::from_value::<AndroidAudioCommandArgs>(serde_json::json!({
            "command": "startSession",
            "nativeSessionId": "native-1",
            "tracks": [{
                "trackId": 41,
                "systemTitle": "ChromVoid audio"
            }],
            "index": 0,
            "autoplay": true
        }))
        .expect("command should deserialize");

        match command {
            AndroidAudioCommandArgs::StartSession { tracks, .. } => {
                assert_eq!(tracks.len(), 1);
                assert_eq!(tracks[0].track_id, 41);
                assert_eq!(tracks[0].mime_type, None);
                assert_eq!(tracks[0].size, None);
                assert_eq!(tracks[0].source_revision, None);
            }
            _ => panic!("expected startSession"),
        }
    }

    #[test]
    fn android_audio_uses_complete_track_input_without_metadata_lookup() {
        let source = prepared_source_from_complete_track_input(&AndroidAudioTrackInput {
            track_id: 41,
            system_title: "ChromVoid audio".to_string(),
            mime_type: Some(" audio/mpeg ".to_string()),
            size: Some(1234),
            source_revision: Some(77),
        })
        .expect("complete audio track should be usable");

        assert_eq!(source.node_id, 41);
        assert_eq!(source.mime_type, "audio/mpeg");
        assert_eq!(source.size, 1234);
        assert_eq!(source.source_revision, 77);
    }

    #[test]
    fn android_audio_requires_complete_audio_input_for_fast_path() {
        assert!(
            prepared_source_from_complete_track_input(&AndroidAudioTrackInput {
                track_id: 41,
                system_title: "ChromVoid audio".to_string(),
                mime_type: Some("video/mp4".to_string()),
                size: Some(1234),
                source_revision: Some(77),
            })
            .is_none()
        );
        assert!(
            prepared_source_from_complete_track_input(&AndroidAudioTrackInput {
                track_id: 41,
                system_title: "ChromVoid audio".to_string(),
                mime_type: Some("audio/mpeg".to_string()),
                size: Some(1234),
                source_revision: None,
            })
            .is_none()
        );
    }

    #[test]
    fn android_audio_command_serializes_camel_case_seek() {
        let value = serde_json::to_value(AndroidAudioCommandArgs::SeekTo {
            native_session_id: "native-1".to_string(),
            position_ms: 42_000,
        })
        .expect("command should serialize");

        assert_eq!(
            value,
            serde_json::json!({
                "command": "seekTo",
                "nativeSessionId": "native-1",
                "positionMs": 42000
            }),
        );
    }

    #[test]
    fn android_audio_command_envelope_adds_internal_dispatch_id() {
        let command_json =
            android_audio_command_json_with_dispatch_id(&AndroidAudioCommandArgs::SeekTo {
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
        assert_eq!(
            value.get("positionMs").and_then(Value::as_u64),
            Some(42_000)
        );
        assert!(value
            .get("dispatchId")
            .and_then(Value::as_str)
            .is_some_and(|value| value.starts_with("android-audio-")),);
    }

    #[test]
    fn android_audio_dispatch_id_stays_out_of_public_json() {
        let command_value = serde_json::to_value(AndroidAudioCommandArgs::SeekTo {
            native_session_id: "native-1".to_string(),
            position_ms: 42_000,
        })
        .expect("command should serialize");
        let result_value = serde_json::to_value(AndroidAudioCommandResult {
            accepted: true,
            tracks: Vec::new(),
        })
        .expect("result should serialize");

        assert!(command_value.get("dispatchId").is_none());
        assert!(result_value.get("dispatchId").is_none());
    }
}
