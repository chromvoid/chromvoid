use jni::objects::{JObject, JString, JValue};
use jni::sys::{jint, jlong, jobject, jstring};
use serde_json::Value;
use tauri::{Emitter, Manager};

use crate::app_state::AppState;
use crate::media_source::{read_local_media_range, LocalMediaRangeError};

const AUDIO_NATIVE_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/AudioPlaybackNativeShell";
const AUDIO_SOURCE_READ_RESULT_CLASS: &str = "com/chromvoid/app/nativebridge/AudioSourceReadResult";

fn read_audio_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
    field: &'static str,
) -> Option<String> {
    match super::jni::try_get_java_string(env, value) {
        Ok(value) => Some(value),
        Err(error) => {
            tracing::warn!("Android audio callback ignored invalid {field} string: {error}");
            None
        }
    }
}

fn native_ok_response(env: &mut jni::JNIEnv<'_>) -> jstring {
    match env.new_string("ok") {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

pub fn send_audio_playback_command(command_json: &str) -> bool {
    tracing::info!(
        "Android audio command dispatch: {}",
        audio_command_trace_meta(command_json)
    );
    match jni_send_audio_playback_command(command_json) {
        Ok(()) => {
            tracing::info!(
                "Android audio command dispatched: {}",
                audio_command_trace_meta(command_json)
            );
            true
        }
        Err(error) => {
            tracing::warn!("Failed to send Android audio command via JNI: {error}");
            false
        }
    }
}

pub fn warmup_audio_playback_service() -> bool {
    tracing::info!("Android audio warmup dispatch");
    match jni_warmup_audio_playback_service() {
        Ok(()) => {
            tracing::info!("Android audio warmup dispatched");
            true
        }
        Err(error) => {
            tracing::warn!("Failed to warm up Android audio service via JNI: {error}");
            false
        }
    }
}

fn jni_send_audio_playback_command(command_json: &str) -> Result<(), String> {
    super::jni::with_jni_env("android_audio_command", |env, context| {
        let class = super::jni::find_class(env, &context, AUDIO_NATIVE_SHELL_CLASS)?;
        let j_command = env
            .new_string(command_json)
            .map_err(|e| format!("new_string command: {e}"))?;

        let sent = env
            .call_static_method(
                class,
                "sendCommand",
                "(Landroid/content/Context;Ljava/lang/String;)Z",
                &[
                    JValue::Object(&context),
                    JValue::Object(&JObject::from(j_command)),
                ],
            )
            .map_err(|e| format!("call sendCommand: {e}"))?
            .z()
            .map_err(|e| format!("sendCommand return type: {e}"))?;
        if !sent {
            return Err("Android audio shell returned false".to_string());
        }
        Ok(())
    })
}

fn jni_warmup_audio_playback_service() -> Result<(), String> {
    super::jni::with_jni_env("android_audio_warmup", |env, context| {
        let class = super::jni::find_class(env, &context, AUDIO_NATIVE_SHELL_CLASS)?;
        let warmed = env
            .call_static_method(
                class,
                "warmup",
                "(Landroid/content/Context;)Z",
                &[JValue::Object(&context)],
            )
            .map_err(|e| format!("call warmup: {e}"))?
            .z()
            .map_err(|e| format!("warmup return type: {e}"))?;
        if !warmed {
            return Err("Android audio shell warmup returned false".to_string());
        }
        Ok(())
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_AudioPlaybackNativeShell_nativeReadAudioSource(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
    offset: jlong,
    length: jint,
) -> jobject {
    let Some(token) = read_audio_string(&mut env, &token, "token") else {
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_RANGE_INVALID");
    };
    if token.is_empty() || offset < 0 || length <= 0 {
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_RANGE_INVALID");
    }

    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("Android audio range read ignored before app handle registration");
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_SOURCE_READ");
    };
    let Some(state) = app.try_state::<AppState>() else {
        tracing::warn!("Android audio range read ignored before app state registration");
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_SOURCE_READ");
    };
    let Some(session) = state.media_streams.get(&token) else {
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_SOURCE_STALE");
    };
    let Some(_lease) = state
        .media_streams
        .begin_request(&session.token, session.generation)
    else {
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_SOURCE_STALE");
    };
    let Ok(_read_lock) = session.read_lock.lock() else {
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_SOURCE_READ");
    };
    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_SOURCE_STALE");
    }

    let bytes = match read_local_media_range(&state.adapter, &session, offset as u64, length as u64)
    {
        Ok(bytes) => bytes,
        Err(error) => return audio_read_error(&mut env, map_audio_range_error(error)),
    };

    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return audio_read_error(&mut env, "ERR_NATIVE_AUDIO_SOURCE_STALE");
    }
    state
        .media_streams
        .refresh(&session.token, session.generation);

    audio_read_success(&mut env, &bytes)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_AudioPlaybackNativeShell_nativeReleaseAudioSource(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
) {
    let Some(token) = read_audio_string(&mut env, &token, "token") else {
        return;
    };
    if token.is_empty() {
        return;
    }
    if let Some(app) = crate::mobile::android::runtime::app_handle() {
        let Some(state) = app.try_state::<AppState>() else {
            tracing::warn!("Android audio release ignored before app state registration");
            return;
        };
        state.media_streams.release(&token);
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_AudioPlaybackNativeShell_nativeOnAudioPlayerEvent(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    event_json: JString<'_>,
) -> jstring {
    let Some(event_json) = read_audio_string(&mut env, &event_json, "event_json") else {
        return native_ok_response(&mut env);
    };
    if !event_json.is_empty() {
        if let Some(app) = crate::mobile::android::runtime::app_handle() {
            match serde_json::from_str::<Value>(&event_json) {
                Ok(mut payload) => {
                    redact_source_tokens(&mut payload);
                    let trace_meta = audio_event_trace_meta(&payload);
                    tracing::info!("Android audio player event: {}", trace_meta);
                    let _ = app.emit("android-audio-player:event", payload);
                }
                Err(error) => {
                    tracing::warn!("Android audio event ignored: invalid JSON: {error}");
                }
            }
        }
    }

    native_ok_response(&mut env)
}

fn map_audio_range_error(error: LocalMediaRangeError) -> &'static str {
    match error {
        LocalMediaRangeError::RangeInvalid => "ERR_NATIVE_AUDIO_RANGE_INVALID",
        LocalMediaRangeError::StreamLocked => "ERR_NATIVE_AUDIO_VAULT_LOCKED",
        LocalMediaRangeError::StreamStale | LocalMediaRangeError::StreamNotFound => {
            "ERR_NATIVE_AUDIO_SOURCE_STALE"
        }
        LocalMediaRangeError::SourceLoadFailed | LocalMediaRangeError::RangeReadFailed => {
            "ERR_NATIVE_AUDIO_SOURCE_READ"
        }
    }
}

fn audio_read_success(env: &mut jni::JNIEnv<'_>, bytes: &[u8]) -> jobject {
    let Ok(array) = env.byte_array_from_slice(bytes) else {
        return audio_read_error(env, "ERR_NATIVE_AUDIO_SOURCE_READ");
    };
    new_audio_read_result(env, JObject::from(array), JObject::null())
}

fn audio_read_error(env: &mut jni::JNIEnv<'_>, error_code: &str) -> jobject {
    let error = env
        .new_string(error_code)
        .map(JObject::from)
        .unwrap_or_else(|_| JObject::null());
    new_audio_read_result(env, JObject::null(), error)
}

fn new_audio_read_result(
    env: &mut jni::JNIEnv<'_>,
    bytes: JObject<'_>,
    error_code: JObject<'_>,
) -> jobject {
    let Ok(class) = env.find_class(AUDIO_SOURCE_READ_RESULT_CLASS) else {
        return std::ptr::null_mut();
    };
    match env.new_object(
        class,
        "([BLjava/lang/String;)V",
        &[JValue::Object(&bytes), JValue::Object(&error_code)],
    ) {
        Ok(result) => result.into_raw(),
        Err(error) => {
            tracing::warn!("Android audio read result allocation failed: {error}");
            std::ptr::null_mut()
        }
    }
}

fn redact_source_tokens(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.remove("sourceToken");
            map.remove("token");
            for child in map.values_mut() {
                redact_source_tokens(child);
            }
        }
        Value::Array(items) => {
            for child in items {
                redact_source_tokens(child);
            }
        }
        _ => {}
    }
}

fn audio_command_trace_meta(command_json: &str) -> Value {
    let Ok(payload) = serde_json::from_str::<Value>(command_json) else {
        return serde_json::json!({"command": "invalid_json"});
    };
    let command = payload
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let native_session_id = payload
        .get("nativeSessionId")
        .and_then(Value::as_str)
        .map(redact_identifier);

    match command {
        "startSession" => {
            let tracks = payload
                .get("tracks")
                .and_then(Value::as_array)
                .map(|tracks| {
                    tracks
                        .iter()
                        .map(|track| {
                            serde_json::json!({
                                "trackId": track.get("trackId").and_then(Value::as_i64),
                                "sourceRevision": track.get("sourceRevision").and_then(Value::as_i64),
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            serde_json::json!({
                "command": command,
                "nativeSessionId": native_session_id,
                "trackCount": tracks.len(),
                "tracks": tracks,
                "index": payload.get("index").and_then(Value::as_i64),
                "autoplay": payload.get("autoplay").and_then(Value::as_bool),
            })
        }
        "seekTo" => serde_json::json!({
            "command": command,
            "nativeSessionId": native_session_id,
            "positionMs": payload.get("positionMs").and_then(Value::as_i64),
        }),
        "selectTrack" => serde_json::json!({
            "command": command,
            "nativeSessionId": native_session_id,
            "index": payload.get("index").and_then(Value::as_i64),
        }),
        _ => serde_json::json!({
            "command": command,
            "nativeSessionId": native_session_id,
        }),
    }
}

fn audio_event_trace_meta(payload: &Value) -> Value {
    serde_json::json!({
        "event": payload.get("event").and_then(Value::as_str),
        "nativeSessionId": payload
            .get("nativeSessionId")
            .and_then(Value::as_str)
            .map(redact_identifier),
        "trackId": payload.get("trackId").and_then(Value::as_i64),
        "sourceRevision": payload.get("sourceRevision").and_then(Value::as_i64),
        "index": payload.get("index").and_then(Value::as_i64),
        "playbackState": payload.get("playbackState").and_then(Value::as_str),
        "playbackIntent": payload.get("playbackIntent").and_then(Value::as_str),
        "loadingState": payload.get("loadingState").and_then(Value::as_str),
        "reason": payload.get("reason").and_then(Value::as_str),
        "positionMs": payload.get("positionMs").and_then(Value::as_i64),
        "durationMs": payload.get("durationMs").and_then(Value::as_i64),
        "code": payload.get("code").and_then(Value::as_str),
    })
}

fn redact_identifier(value: &str) -> String {
    let suffix = value
        .chars()
        .rev()
        .take(6)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    format!("{}:{suffix}", value.chars().count())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn android_audio_command_trace_redacts_tokens_and_titles() {
        let command = serde_json::json!({
            "command": "startSession",
            "nativeSessionId": "session-secret-123456",
            "tracks": [
                {
                    "trackId": 42,
                    "systemTitle": "ChromVoid audio",
                    "mimeType": "audio/mpeg",
                    "size": 4096,
                    "sourceRevision": 7,
                    "sourceToken": "secret-source-token",
                    "name": "private-song.mp3",
                    "url": "file:///private-song.mp3"
                }
            ],
            "index": 0,
            "autoplay": true
        });

        let trace = audio_command_trace_meta(&command.to_string()).to_string();

        assert!(trace.contains("\"trackId\":42"));
        assert!(trace.contains("\"sourceRevision\":7"));
        assert!(trace.contains("21:123456"));
        assert!(!trace.contains("session-secret-123456"));
        assert!(!trace.contains("secret-source-token"));
        assert!(!trace.contains("private-song.mp3"));
        assert!(!trace.contains("file:///"));
        assert!(!trace.contains("ChromVoid audio"));
    }

    #[test]
    fn android_audio_event_trace_redacts_nested_source_tokens() {
        let mut event = serde_json::json!({
            "event": "error",
            "nativeSessionId": "event-secret-abcdef",
            "trackId": 9,
            "sourceRevision": 3,
            "reason": "service_destroyed",
            "code": "ERR_NATIVE_AUDIO_SOURCE_READ",
            "sourceToken": "event-source-token",
            "nested": {"token": "nested-source-token"}
        });

        redact_source_tokens(&mut event);
        let trace = audio_event_trace_meta(&event).to_string();

        assert!(trace.contains("\"trackId\":9"));
        assert!(trace.contains("\"sourceRevision\":3"));
        assert!(trace.contains("\"reason\":\"service_destroyed\""));
        assert!(trace.contains("18:abcdef"));
        assert!(!trace.contains("event-secret-abcdef"));
        assert!(!trace.contains("event-source-token"));
        assert!(!trace.contains("nested-source-token"));
    }

    #[test]
    fn android_audio_range_errors_map_to_stable_redacted_codes() {
        assert_eq!(
            map_audio_range_error(LocalMediaRangeError::RangeInvalid),
            "ERR_NATIVE_AUDIO_RANGE_INVALID"
        );
        assert_eq!(
            map_audio_range_error(LocalMediaRangeError::StreamLocked),
            "ERR_NATIVE_AUDIO_VAULT_LOCKED"
        );
        assert_eq!(
            map_audio_range_error(LocalMediaRangeError::StreamStale),
            "ERR_NATIVE_AUDIO_SOURCE_STALE"
        );
        assert_eq!(
            map_audio_range_error(LocalMediaRangeError::StreamNotFound),
            "ERR_NATIVE_AUDIO_SOURCE_STALE"
        );
        assert_eq!(
            map_audio_range_error(LocalMediaRangeError::SourceLoadFailed),
            "ERR_NATIVE_AUDIO_SOURCE_READ"
        );
        assert_eq!(
            map_audio_range_error(LocalMediaRangeError::RangeReadFailed),
            "ERR_NATIVE_AUDIO_SOURCE_READ"
        );
    }
}
