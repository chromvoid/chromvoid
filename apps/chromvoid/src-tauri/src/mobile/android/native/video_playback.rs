use jni::objects::{JObject, JString, JValue};
use jni::sys::{jbyteArray, jint, jlong, jstring};
use tauri::{Emitter, Manager};

use crate::app_state::AppState;
use crate::media_source::read_local_media_range;

const VIDEO_NATIVE_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/VideoPlaybackNativeShell";

fn read_video_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
    field: &'static str,
) -> Option<String> {
    match super::jni::try_get_java_string(env, value) {
        Ok(value) => Some(value),
        Err(error) => {
            tracing::warn!("Android video callback ignored invalid {field} string: {error}");
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

pub fn start_video_playback(source_json: &str) -> bool {
    match jni_start_video_playback(source_json) {
        Ok(()) => true,
        Err(error) => {
            tracing::error!("Failed to start Android video playback via JNI: {error}");
            false
        }
    }
}

pub fn stop_video_playback(token: &str) -> bool {
    match jni_stop_video_playback(token) {
        Ok(()) => true,
        Err(error) => {
            tracing::error!("Failed to stop Android video playback via JNI: {error}");
            false
        }
    }
}

fn jni_start_video_playback(source_json: &str) -> Result<(), String> {
    super::jni::with_jni_env("android_video_start", |env, context| {
        let class = super::jni::find_class(env, &context, VIDEO_NATIVE_SHELL_CLASS)?;
        let j_source = env
            .new_string(source_json)
            .map_err(|e| format!("new_string source: {e}"))?;

        let started = env
            .call_static_method(
                class,
                "start",
                "(Landroid/content/Context;Ljava/lang/String;)Z",
                &[
                    JValue::Object(&context),
                    JValue::Object(&JObject::from(j_source)),
                ],
            )
            .map_err(|e| format!("call start: {e}"))?
            .z()
            .map_err(|e| format!("start return type: {e}"))?;
        if !started {
            return Err("Android video shell returned false".to_string());
        }
        Ok(())
    })
}

fn jni_stop_video_playback(token: &str) -> Result<(), String> {
    super::jni::with_jni_env("android_video_stop", |env, context| {
        let class = super::jni::find_class(env, &context, VIDEO_NATIVE_SHELL_CLASS)?;
        let j_token = env
            .new_string(token)
            .map_err(|e| format!("new_string token: {e}"))?;

        env.call_static_method(
            class,
            "stop",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[
                JValue::Object(&context),
                JValue::Object(&JObject::from(j_token)),
            ],
        )
        .map_err(|e| format!("call stop: {e}"))?;
        Ok(())
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_VideoPlaybackNativeShell_nativeReadVideoSource(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
    offset: jlong,
    length: jint,
) -> jbyteArray {
    let Some(token) = read_video_string(&mut env, &token, "token") else {
        return std::ptr::null_mut();
    };
    if token.is_empty() || offset < 0 || length <= 0 {
        return std::ptr::null_mut();
    }

    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("Android video range read ignored before app handle registration");
        return std::ptr::null_mut();
    };
    let Some(state) = app.try_state::<AppState>() else {
        tracing::warn!("Android video range read ignored before app state registration");
        return std::ptr::null_mut();
    };
    let Some(session) = state.media_streams.get(&token) else {
        return std::ptr::null_mut();
    };
    let Some(_lease) = state
        .media_streams
        .begin_request(&session.token, session.generation)
    else {
        return std::ptr::null_mut();
    };
    let Ok(_read_lock) = session.read_lock.lock() else {
        return std::ptr::null_mut();
    };
    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return std::ptr::null_mut();
    }

    let bytes = match read_local_media_range(&state.adapter, &session, offset as u64, length as u64)
    {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!("Android video range read failed: {:?}", error);
            return std::ptr::null_mut();
        }
    };

    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return std::ptr::null_mut();
    }
    state
        .media_streams
        .refresh(&session.token, session.generation);

    match env.byte_array_from_slice(&bytes) {
        Ok(array) => array.into_raw(),
        Err(error) => {
            tracing::warn!("Android video range read failed to allocate byte array: {error}");
            std::ptr::null_mut()
        }
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_VideoPlaybackNativeShell_nativeReleaseVideoSource(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
) {
    let Some(token) = read_video_string(&mut env, &token, "token") else {
        return;
    };
    if token.is_empty() {
        return;
    }
    if let Some(app) = crate::mobile::android::runtime::app_handle() {
        let Some(state) = app.try_state::<AppState>() else {
            tracing::warn!("Android video release ignored before app state registration");
            return;
        };
        state.media_streams.release(&token);
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_VideoPlaybackNativeShell_nativeOnVideoPlayerEvent(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
    event: JString<'_>,
    position_ms: jlong,
    duration_ms: jlong,
    error: JString<'_>,
) -> jstring {
    let Some(token) = read_video_string(&mut env, &token, "token") else {
        return native_ok_response(&mut env);
    };
    let Some(event) = read_video_string(&mut env, &event, "event") else {
        return native_ok_response(&mut env);
    };
    let error = read_video_string(&mut env, &error, "error");

    if !token.is_empty() && !event.is_empty() {
        if let Some(app) = crate::mobile::android::runtime::app_handle() {
            let mut payload = serde_json::json!({
                "token": token,
                "event": event,
            });
            if position_ms >= 0 {
                payload["positionMs"] = serde_json::json!(position_ms as u64);
            }
            if duration_ms >= 0 {
                payload["durationMs"] = serde_json::json!(duration_ms as u64);
            }
            if let Some(error) = error.filter(|error| !error.is_empty()) {
                payload["error"] = serde_json::json!(error);
            }
            let _ = app.emit("android-video-player:event", payload);
        }
    }

    native_ok_response(&mut env)
}
