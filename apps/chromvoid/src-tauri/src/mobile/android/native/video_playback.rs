use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use jni::objects::{JObject, JString, JValue};
use jni::sys::{jint, jlong, jobject, jstring};
use tauri::{Emitter, Manager};

use crate::app_state::AppState;
use crate::media_source::{
    read_local_media_range, stream_media_source_range, LocalMediaRangeError,
};

const VIDEO_NATIVE_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/VideoPlaybackNativeShell";
const VIDEO_SOURCE_READ_RESULT_CLASS: &str = "com/chromvoid/app/nativebridge/VideoSourceReadResult";
const VIDEO_SOURCE_READ_HANDLE_RESULT_CLASS: &str =
    "com/chromvoid/app/nativebridge/VideoSourceReadHandleResult";
const ANDROID_VIDEO_APP_FOREGROUND_EPOCH: u64 = 1;

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

#[derive(Clone, Debug, Eq, PartialEq)]
struct VideoSourceReadIdentity {
    token: String,
    media_source_generation: u64,
    source_revision: u64,
    transport_session_generation: Option<u64>,
    app_foreground_epoch: u64,
}

impl VideoSourceReadIdentity {
    fn from_jni(
        token: String,
        media_source_generation: jlong,
        source_revision: jlong,
        transport_session_generation: jlong,
        app_foreground_epoch: jlong,
    ) -> Option<Self> {
        if token.is_empty()
            || media_source_generation < 1
            || source_revision < 0
            || app_foreground_epoch < 1
        {
            return None;
        }

        Some(Self {
            token,
            media_source_generation: media_source_generation as u64,
            source_revision: source_revision as u64,
            transport_session_generation: (transport_session_generation >= 0)
                .then_some(transport_session_generation as u64),
            app_foreground_epoch: app_foreground_epoch as u64,
        })
    }
}

#[derive(Clone, Debug)]
struct VideoSourceReadCursor {
    identity: VideoSourceReadIdentity,
    offset: u64,
    remaining: u64,
}

#[derive(Debug)]
struct VideoSourceReadCursorReservation {
    identity: VideoSourceReadIdentity,
    offset: u64,
    length: u64,
}

#[derive(Debug)]
struct VideoSourceReadCursorRegistry {
    next_handle: jlong,
    cursors: HashMap<jlong, VideoSourceReadCursor>,
}

impl Default for VideoSourceReadCursorRegistry {
    fn default() -> Self {
        Self {
            next_handle: 1,
            cursors: HashMap::new(),
        }
    }
}

impl VideoSourceReadCursorRegistry {
    fn open(&mut self, identity: VideoSourceReadIdentity, offset: u64, length: u64) -> jlong {
        let handle = self.next_handle.max(1);
        self.next_handle = handle.saturating_add(1).max(1);
        self.cursors.insert(
            handle,
            VideoSourceReadCursor {
                identity,
                offset,
                remaining: length,
            },
        );
        handle
    }

    fn reserve_read(
        &self,
        handle: jlong,
        identity: &VideoSourceReadIdentity,
        max_length: u64,
    ) -> Result<VideoSourceReadCursorReservation, &'static str> {
        if handle <= 0 || max_length == 0 {
            return Err("ERR_NATIVE_VIDEO_RANGE_INVALID");
        }
        let Some(cursor) = self.cursors.get(&handle) else {
            return Err("ERR_NATIVE_VIDEO_SOURCE_ABORTED");
        };
        if &cursor.identity != identity {
            return Err("ERR_NATIVE_VIDEO_SOURCE_STALE");
        }
        let length = max_length.min(cursor.remaining);
        Ok(VideoSourceReadCursorReservation {
            identity: cursor.identity.clone(),
            offset: cursor.offset,
            length,
        })
    }

    fn commit_read(
        &mut self,
        handle: jlong,
        identity: &VideoSourceReadIdentity,
        expected_offset: u64,
        served: u64,
    ) -> Result<(), &'static str> {
        let Some(cursor) = self.cursors.get_mut(&handle) else {
            return Err("ERR_NATIVE_VIDEO_SOURCE_ABORTED");
        };
        if &cursor.identity != identity || cursor.offset != expected_offset {
            return Err("ERR_NATIVE_VIDEO_SOURCE_STALE");
        }
        cursor.offset = cursor.offset.saturating_add(served);
        cursor.remaining = cursor.remaining.saturating_sub(served);
        Ok(())
    }

    fn close(
        &mut self,
        handle: jlong,
        identity: &VideoSourceReadIdentity,
    ) -> Result<bool, &'static str> {
        if handle <= 0 {
            return Ok(false);
        }
        let Some(cursor) = self.cursors.get(&handle) else {
            return Ok(false);
        };
        if &cursor.identity != identity {
            return Err("ERR_NATIVE_VIDEO_SOURCE_STALE");
        }
        self.cursors.remove(&handle);
        Ok(true)
    }

    fn close_token(&mut self, token: &str) -> usize {
        let before = self.cursors.len();
        self.cursors
            .retain(|_, cursor| cursor.identity.token != token);
        before.saturating_sub(self.cursors.len())
    }
}

fn video_source_read_cursors() -> &'static Mutex<VideoSourceReadCursorRegistry> {
    static CURSORS: OnceLock<Mutex<VideoSourceReadCursorRegistry>> = OnceLock::new();
    CURSORS.get_or_init(|| Mutex::new(VideoSourceReadCursorRegistry::default()))
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
pub extern "system" fn Java_com_chromvoid_app_nativebridge_VideoPlaybackNativeShell_nativeOpenVideoSourceRead(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
    offset: jlong,
    length: jlong,
    media_source_generation: jlong,
    source_revision: jlong,
    transport_session_generation: jlong,
    app_foreground_epoch: jlong,
) -> jobject {
    let Some(token) = read_video_string(&mut env, &token, "token") else {
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    };
    let Some(identity) = VideoSourceReadIdentity::from_jni(
        token,
        media_source_generation,
        source_revision,
        transport_session_generation,
        app_foreground_epoch,
    ) else {
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    };
    if offset < 0 || length <= 0 {
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    }

    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("Android video cursor open ignored before app handle registration");
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    let Some(state) = app.try_state::<AppState>() else {
        tracing::warn!("Android video cursor open ignored before app state registration");
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    let Some(session) = state.media_streams.get(&identity.token) else {
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    };
    let Some(_lease) = state
        .media_streams
        .begin_request(&session.token, session.generation)
    else {
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    };
    let Some(current_transport_session_generation) =
        read_current_transport_session_generation(&state)
    else {
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    if !android_video_identity_matches(&session, &identity, current_transport_session_generation) {
        tracing::warn!(
            "Android video cursor open rejected stale identity offset={} length={} media_source_generation={} source_revision={} transport_session_generation={:?} app_foreground_epoch={} current_transport_session_generation={:?}",
            offset,
            length,
            identity.media_source_generation,
            identity.source_revision,
            identity.transport_session_generation,
            identity.app_foreground_epoch,
            current_transport_session_generation
        );
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }
    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }

    let handle = match video_source_read_cursors().lock() {
        Ok(mut cursors) => cursors.open(identity, offset as u64, length as u64),
        Err(_) => return video_read_handle_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ"),
    };
    video_read_handle_success(&mut env, handle)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_VideoPlaybackNativeShell_nativeReadVideoSourceChunk(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
    handle: jlong,
    max_length: jint,
    media_source_generation: jlong,
    source_revision: jlong,
    transport_session_generation: jlong,
    app_foreground_epoch: jlong,
) -> jobject {
    let Some(token) = read_video_string(&mut env, &token, "token") else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    };
    let Some(identity) = VideoSourceReadIdentity::from_jni(
        token,
        media_source_generation,
        source_revision,
        transport_session_generation,
        app_foreground_epoch,
    ) else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    };
    if max_length <= 0 {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    }

    let reservation = match video_source_read_cursors()
        .lock()
        .map_err(|_| "ERR_NATIVE_VIDEO_SOURCE_READ")
        .and_then(|cursors| cursors.reserve_read(handle, &identity, max_length as u64))
    {
        Ok(reservation) => reservation,
        Err(error) => return video_read_error(&mut env, error),
    };
    if reservation.length == 0 {
        return video_read_success(&mut env, &[]);
    }

    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("Android video cursor read ignored before app handle registration");
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    let Some(state) = app.try_state::<AppState>() else {
        tracing::warn!("Android video cursor read ignored before app state registration");
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    let Some(session) = state.media_streams.get(&reservation.identity.token) else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    };
    let Some(_lease) = state
        .media_streams
        .begin_request(&session.token, session.generation)
    else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    };
    let Some(current_transport_session_generation) =
        read_current_transport_session_generation(&state)
    else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    if !android_video_identity_matches(
        &session,
        &reservation.identity,
        current_transport_session_generation,
    ) {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }

    let mut bytes = Vec::with_capacity(usize::try_from(reservation.length).unwrap_or(0));
    let read_result = stream_media_source_range(
        &state.adapter,
        &session,
        reservation.offset,
        reservation.length,
        |chunk| {
            bytes.extend_from_slice(chunk);
            Ok(())
        },
    );
    let served = match read_result {
        Ok(served) => served,
        Err(error) => {
            tracing::warn!("Android video cursor read failed: {:?}", error);
            return video_read_error(&mut env, map_video_range_error(error));
        }
    };
    if served == 0 || bytes.is_empty() || bytes.len() as u64 > reservation.length {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    }
    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }
    if read_current_transport_session_generation(&state)
        != Some(current_transport_session_generation)
    {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }
    match video_source_read_cursors()
        .lock()
        .map_err(|_| "ERR_NATIVE_VIDEO_SOURCE_READ")
        .and_then(|mut cursors| {
            cursors.commit_read(handle, &identity, reservation.offset, bytes.len() as u64)
        }) {
        Ok(()) => {}
        Err(error) => return video_read_error(&mut env, error),
    }
    state
        .media_streams
        .refresh(&session.token, session.generation);

    video_read_success(&mut env, &bytes)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_VideoPlaybackNativeShell_nativeCloseVideoSourceRead(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
    handle: jlong,
    media_source_generation: jlong,
    source_revision: jlong,
    transport_session_generation: jlong,
    app_foreground_epoch: jlong,
) -> jstring {
    let Some(token) = read_video_string(&mut env, &token, "token") else {
        return native_ok_response(&mut env);
    };
    let Some(identity) = VideoSourceReadIdentity::from_jni(
        token,
        media_source_generation,
        source_revision,
        transport_session_generation,
        app_foreground_epoch,
    ) else {
        return native_ok_response(&mut env);
    };
    if let Err(error) = video_source_read_cursors()
        .lock()
        .map_err(|_| "ERR_NATIVE_VIDEO_SOURCE_READ")
        .and_then(|mut cursors| cursors.close(handle, &identity).map(|_| ()))
    {
        tracing::warn!("Android video cursor close failed: {error}");
    }
    native_ok_response(&mut env)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_VideoPlaybackNativeShell_nativeReadVideoSource(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    token: JString<'_>,
    offset: jlong,
    length: jint,
    media_source_generation: jlong,
    source_revision: jlong,
    transport_session_generation: jlong,
    app_foreground_epoch: jlong,
) -> jobject {
    let Some(token) = read_video_string(&mut env, &token, "token") else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    };
    if token.is_empty() || offset < 0 || length <= 0 {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_RANGE_INVALID");
    }

    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("Android video range read ignored before app handle registration");
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    let Some(state) = app.try_state::<AppState>() else {
        tracing::warn!("Android video range read ignored before app state registration");
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    let Some(session) = state.media_streams.get(&token) else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    };
    let Some(_lease) = state
        .media_streams
        .begin_request(&session.token, session.generation)
    else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    };
    let Some(current_transport_session_generation) =
        read_current_transport_session_generation(&state)
    else {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_READ");
    };
    if !android_video_read_identity_matches(
        &session,
        media_source_generation,
        source_revision,
        transport_session_generation,
        app_foreground_epoch,
        current_transport_session_generation,
    ) {
        tracing::warn!(
            "Android video range read rejected stale identity offset={} length={} media_source_generation={} source_revision={} transport_session_generation={} app_foreground_epoch={} current_transport_session_generation={:?}",
            offset,
            length,
            media_source_generation,
            source_revision,
            transport_session_generation,
            app_foreground_epoch,
            current_transport_session_generation
        );
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }
    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }

    let bytes = match read_local_media_range(&state.adapter, &session, offset as u64, length as u64)
    {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!("Android video range read failed: {:?}", error);
            return video_read_error(&mut env, map_video_range_error(error));
        }
    };

    if !state
        .media_streams
        .is_current(&session.token, session.generation)
    {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }
    if read_current_transport_session_generation(&state)
        != Some(current_transport_session_generation)
    {
        return video_read_error(&mut env, "ERR_NATIVE_VIDEO_SOURCE_STALE");
    }
    state
        .media_streams
        .refresh(&session.token, session.generation);

    video_read_success(&mut env, &bytes)
}

fn read_current_transport_session_generation(state: &AppState) -> Option<Option<u64>> {
    state
        .adapter
        .lock()
        .ok()
        .map(|adapter| adapter.transport_session_generation())
}

fn android_video_read_identity_matches(
    session: &crate::media_source::LocalMediaSourceSession,
    media_source_generation: jlong,
    source_revision: jlong,
    transport_session_generation: jlong,
    app_foreground_epoch: jlong,
    current_transport_session_generation: Option<u64>,
) -> bool {
    let Some(identity) = VideoSourceReadIdentity::from_jni(
        session.token.clone(),
        media_source_generation,
        source_revision,
        transport_session_generation,
        app_foreground_epoch,
    ) else {
        return false;
    };

    android_video_identity_matches(session, &identity, current_transport_session_generation)
}

fn android_video_identity_matches(
    session: &crate::media_source::LocalMediaSourceSession,
    identity: &VideoSourceReadIdentity,
    current_transport_session_generation: Option<u64>,
) -> bool {
    session.token == identity.token
        && session.generation == identity.media_source_generation
        && session.source_revision == identity.source_revision
        && identity.transport_session_generation == current_transport_session_generation
        && identity.app_foreground_epoch == ANDROID_VIDEO_APP_FOREGROUND_EPOCH
}

fn map_video_range_error(error: LocalMediaRangeError) -> &'static str {
    match error {
        LocalMediaRangeError::RangeInvalid => "ERR_NATIVE_VIDEO_RANGE_INVALID",
        LocalMediaRangeError::StreamLocked => "ERR_NATIVE_VIDEO_VAULT_LOCKED",
        LocalMediaRangeError::StreamStale | LocalMediaRangeError::StreamNotFound => {
            "ERR_NATIVE_VIDEO_SOURCE_STALE"
        }
        LocalMediaRangeError::Aborted => "ERR_NATIVE_VIDEO_SOURCE_ABORTED",
        LocalMediaRangeError::ProviderUnavailable => "ERR_NATIVE_VIDEO_PROVIDER_UNAVAILABLE",
        LocalMediaRangeError::Timeout => "ERR_NATIVE_VIDEO_PROVIDER_TIMEOUT",
        LocalMediaRangeError::SourceStarved => "ERR_MEDIA_SOURCE_STARVED",
        LocalMediaRangeError::SourceLoadFailed | LocalMediaRangeError::RangeReadFailed => {
            "ERR_NATIVE_VIDEO_SOURCE_READ"
        }
    }
}

fn video_read_success(env: &mut jni::JNIEnv<'_>, bytes: &[u8]) -> jobject {
    match env.byte_array_from_slice(bytes) {
        Ok(array) => new_video_read_result(env, JObject::from(array), JObject::null()),
        Err(error) => {
            tracing::warn!("Android video range read failed to allocate byte array: {error}");
            video_read_error(env, "ERR_NATIVE_VIDEO_SOURCE_READ")
        }
    }
}

fn video_read_error(env: &mut jni::JNIEnv<'_>, error_code: &str) -> jobject {
    let error = env
        .new_string(error_code)
        .map(JObject::from)
        .unwrap_or_else(|_| JObject::null());
    new_video_read_result(env, JObject::null(), error)
}

fn video_read_handle_success(env: &mut jni::JNIEnv<'_>, handle: jlong) -> jobject {
    new_video_read_handle_result(env, handle, JObject::null())
}

fn video_read_handle_error(env: &mut jni::JNIEnv<'_>, error_code: &str) -> jobject {
    let error = env
        .new_string(error_code)
        .map(JObject::from)
        .unwrap_or_else(|_| JObject::null());
    new_video_read_handle_result(env, 0, error)
}

fn new_video_read_handle_result(
    env: &mut jni::JNIEnv<'_>,
    handle: jlong,
    error_code: JObject<'_>,
) -> jobject {
    let Ok(class) = env.find_class(VIDEO_SOURCE_READ_HANDLE_RESULT_CLASS) else {
        return std::ptr::null_mut();
    };
    match env.new_object(
        class,
        "(JLjava/lang/String;)V",
        &[JValue::Long(handle), JValue::Object(&error_code)],
    ) {
        Ok(result) => result.into_raw(),
        Err(error) => {
            tracing::warn!("Android video read handle result allocation failed: {error}");
            std::ptr::null_mut()
        }
    }
}

fn new_video_read_result(
    env: &mut jni::JNIEnv<'_>,
    bytes: JObject<'_>,
    error_code: JObject<'_>,
) -> jobject {
    let Ok(class) = env.find_class(VIDEO_SOURCE_READ_RESULT_CLASS) else {
        return std::ptr::null_mut();
    };
    match env.new_object(
        class,
        "([BLjava/lang/String;)V",
        &[JValue::Object(&bytes), JValue::Object(&error_code)],
    ) {
        Ok(result) => result.into_raw(),
        Err(error) => {
            tracing::warn!("Android video read result allocation failed: {error}");
            std::ptr::null_mut()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media_source::{LocalMediaKind, LocalMediaSourceManager};

    fn session() -> crate::media_source::LocalMediaSourceSession {
        LocalMediaSourceManager::new()
            .register(41, LocalMediaKind::Video, "video/mp4".to_string(), 1024, 77)
            .expect("register video source")
    }

    fn identity(session: &crate::media_source::LocalMediaSourceSession) -> VideoSourceReadIdentity {
        VideoSourceReadIdentity {
            token: session.token.clone(),
            media_source_generation: session.generation,
            source_revision: session.source_revision,
            transport_session_generation: Some(12),
            app_foreground_epoch: ANDROID_VIDEO_APP_FOREGROUND_EPOCH,
        }
    }

    #[test]
    fn android_video_read_identity_accepts_current_tuple() {
        let session = session();

        assert!(android_video_read_identity_matches(
            &session,
            session.generation as jlong,
            session.source_revision as jlong,
            12,
            ANDROID_VIDEO_APP_FOREGROUND_EPOCH as jlong,
            Some(12),
        ));
    }

    #[test]
    fn android_video_read_identity_rejects_stale_tuple_parts() {
        let session = session();

        assert!(!android_video_read_identity_matches(
            &session,
            session.generation as jlong + 1,
            session.source_revision as jlong,
            12,
            ANDROID_VIDEO_APP_FOREGROUND_EPOCH as jlong,
            Some(12),
        ));
        assert!(!android_video_read_identity_matches(
            &session,
            session.generation as jlong,
            session.source_revision as jlong + 1,
            12,
            ANDROID_VIDEO_APP_FOREGROUND_EPOCH as jlong,
            Some(12),
        ));
        assert!(!android_video_read_identity_matches(
            &session,
            session.generation as jlong,
            session.source_revision as jlong,
            -1,
            ANDROID_VIDEO_APP_FOREGROUND_EPOCH as jlong,
            Some(12),
        ));
        assert!(!android_video_read_identity_matches(
            &session,
            session.generation as jlong,
            session.source_revision as jlong,
            12,
            ANDROID_VIDEO_APP_FOREGROUND_EPOCH as jlong + 1,
            Some(12),
        ));
    }

    #[test]
    fn video_source_cursor_registry_tracks_offsets_and_unique_handles() {
        let session = session();
        let identity = identity(&session);
        let mut registry = VideoSourceReadCursorRegistry::default();

        let first = registry.open(identity.clone(), 4, 8);
        let second = registry.open(identity.clone(), 4, 8);

        assert_ne!(first, second);
        let reservation = registry
            .reserve_read(first, &identity, 3)
            .expect("reserve read");
        assert_eq!(reservation.offset, 4);
        assert_eq!(reservation.length, 3);

        registry
            .commit_read(first, &identity, reservation.offset, 3)
            .expect("commit read");
        let next = registry
            .reserve_read(first, &identity, 8)
            .expect("reserve next read");
        assert_eq!(next.offset, 7);
        assert_eq!(next.length, 5);
    }

    #[test]
    fn video_source_cursor_registry_rejects_stale_identity_and_unknown_handle() {
        let session = session();
        let identity = identity(&session);
        let mut stale_identity = identity.clone();
        stale_identity.source_revision += 1;
        let mut registry = VideoSourceReadCursorRegistry::default();
        let handle = registry.open(identity.clone(), 0, 8);

        assert_eq!(
            registry.reserve_read(handle, &stale_identity, 1),
            Err("ERR_NATIVE_VIDEO_SOURCE_STALE")
        );
        assert_eq!(
            registry.reserve_read(handle + 1, &identity, 1),
            Err("ERR_NATIVE_VIDEO_SOURCE_ABORTED")
        );
    }

    #[test]
    fn video_source_cursor_close_is_idempotent_and_release_closes_token_cursors() {
        let session = session();
        let identity = identity(&session);
        let mut registry = VideoSourceReadCursorRegistry::default();
        let first = registry.open(identity.clone(), 0, 8);
        let second = registry.open(identity.clone(), 8, 8);

        assert_eq!(registry.close(first, &identity), Ok(true));
        assert_eq!(registry.close(first, &identity), Ok(false));
        assert_eq!(registry.close_token(&identity.token), 1);
        assert_eq!(
            registry.reserve_read(second, &identity, 1),
            Err("ERR_NATIVE_VIDEO_SOURCE_ABORTED")
        );
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
        if let Ok(mut cursors) = video_source_read_cursors().lock() {
            let closed = cursors.close_token(&token);
            if closed > 0 {
                tracing::info!("Android video release closed {closed} native read cursors");
            }
        }
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
    media_source_generation: jlong,
    source_revision: jlong,
    transport_session_generation: jlong,
    app_foreground_epoch: jlong,
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
                "nativeSourceToken": token.clone(),
                "token": token,
                "event": event,
            });
            if position_ms >= 0 {
                payload["positionMs"] = serde_json::json!(position_ms as u64);
            }
            if duration_ms >= 0 {
                payload["durationMs"] = serde_json::json!(duration_ms as u64);
            }
            if media_source_generation >= 0 {
                payload["mediaSourceGeneration"] =
                    serde_json::json!(media_source_generation as u64);
            }
            if source_revision >= 0 {
                payload["sourceRevision"] = serde_json::json!(source_revision as u64);
            }
            if transport_session_generation >= 0 {
                payload["transportSessionGeneration"] =
                    serde_json::json!(transport_session_generation as u64);
            }
            if app_foreground_epoch >= 0 {
                payload["appForegroundEpoch"] = serde_json::json!(app_foreground_epoch as u64);
            }
            if let Some(error) = error.filter(|error| !error.is_empty()) {
                payload["error"] = serde_json::json!(error);
            }
            let _ = app.emit("android-video-player:event", payload);
        }
    }

    native_ok_response(&mut env)
}
