use jni::objects::{JObject, JString, JValue};
use jni::sys::jlong;
use tauri::Emitter;

const SERVICE_CLASS: &str = "com/chromvoid/app/MediaPlaybackForegroundService";

fn read_media_session_action(env: &mut jni::JNIEnv<'_>, action: &JString<'_>) -> Option<String> {
    match super::jni::try_get_java_string(env, action) {
        Ok(action) => Some(action),
        Err(error) => {
            tracing::warn!("Android media session callback ignored invalid action string: {error}");
            None
        }
    }
}

pub fn update_media_session(snapshot_json: &str) -> bool {
    tracing::debug!("Android media session update requested");
    match jni_update_media_session(snapshot_json) {
        Ok(()) => true,
        Err(error) => {
            tracing::error!("Failed to update Android media session via JNI: {error}");
            false
        }
    }
}

pub fn stop_media_session() -> bool {
    tracing::debug!("Android media session stop requested");
    match jni_stop_media_session() {
        Ok(()) => true,
        Err(error) => {
            tracing::error!("Failed to stop Android media session via JNI: {error}");
            false
        }
    }
}

fn jni_update_media_session(snapshot_json: &str) -> Result<(), String> {
    super::jni::with_jni_env("update_media_session", |env, context| {
        let class = super::jni::find_class(env, &context, SERVICE_CLASS)?;
        let j_snapshot = env
            .new_string(snapshot_json)
            .map_err(|e| format!("new_string snapshot: {e}"))?;

        env.call_static_method(
            class,
            "update",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[
                JValue::Object(&context),
                JValue::Object(&JObject::from(j_snapshot)),
            ],
        )
        .map_err(|e| format!("call update: {e}"))?;

        Ok(())
    })
}

fn jni_stop_media_session() -> Result<(), String> {
    super::jni::with_jni_env("stop_media_session", |env, context| {
        let class = super::jni::find_class(env, &context, SERVICE_CLASS)?;

        env.call_static_method(
            class,
            "stop",
            "(Landroid/content/Context;)V",
            &[JValue::Object(&context)],
        )
        .map_err(|e| format!("call stop: {e}"))?;

        Ok(())
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_MediaPlaybackForegroundService_nativeOnMediaSessionAction(
    mut env: jni::JNIEnv<'_>,
    _this: JObject<'_>,
    action: JString<'_>,
    position_ms: jlong,
) {
    let Some(action) = read_media_session_action(&mut env, &action) else {
        return;
    };
    if action.is_empty() {
        tracing::warn!("Android media session callback ignored empty action");
        return;
    }

    let mut payload = serde_json::json!({ "action": action });
    if position_ms >= 0 {
        payload["positionMs"] = serde_json::json!(position_ms as u64);
    }

    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("Android media session callback ignored before app handle registration");
        return;
    };

    if let Err(error) = app.emit("android-media-session:action", payload) {
        tracing::warn!("Failed to emit Android media session action: {error}");
    }
}
