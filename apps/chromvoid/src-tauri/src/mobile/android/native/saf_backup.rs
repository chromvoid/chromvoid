use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::Duration;

use crate::mobile::android::{AndroidSafPickerRuntimeState, AndroidSafTree};
use jni::objects::{JByteArray, JClass, JObject, JString, JValue};
use tokio::sync::oneshot;

const SAF_BACKUP_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/SafBackupNativeShell";
const SAF_TREE_PICK_TIMEOUT: Duration = Duration::from_secs(300);
const SAF_STREAM_BUFFER_SIZE: usize = 1024 * 1024;

pub fn pick_backup_tree(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<AndroidSafTree, String> {
    pick_tree(runtime, operation_id, "startBackupTreePicker")
}

pub fn pick_restore_tree(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<AndroidSafTree, String> {
    pick_tree(runtime, operation_id, "startRestoreTreePicker")
}

pub async fn pick_restore_tree_async(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<AndroidSafTree, String> {
    pick_tree_async(runtime, operation_id, "startRestoreTreePicker").await
}

pub fn create_directory(parent_uri: &str, name: &str) -> Result<String, String> {
    call_string_method_with_context_and_two_strings(
        "saf_create_directory",
        "createDirectory",
        parent_uri,
        name,
    )
}

pub fn write_file(parent_uri: &str, name: &str, bytes: &[u8]) -> Result<String, String> {
    call_string_method_with_context_two_strings_and_bytes(
        "saf_write_file",
        "writeFile",
        parent_uri,
        name,
        bytes,
    )
}

pub fn delete_document(uri: &str) -> Result<(), String> {
    let deleted =
        call_bool_method_with_context_and_string("saf_delete_document", "deleteDocument", uri)?;
    if deleted {
        Ok(())
    } else {
        Err("Failed to delete SAF document".to_string())
    }
}

pub fn read_named_file(parent_uri: &str, name: &str) -> Result<Option<Vec<u8>>, String> {
    call_optional_bytes_method_with_context_and_two_strings(
        "saf_read_named_file",
        "readNamedFile",
        parent_uri,
        name,
    )
}

pub fn write_stream_file(
    parent_uri: &str,
    name: &str,
    reader: &mut dyn Read,
    cancel_requested: &AtomicBool,
    on_progress: &mut dyn FnMut(u64),
) -> Result<u64, String> {
    let started_at = std::time::Instant::now();
    let session_id = call_string_method_with_context_and_two_strings(
        "saf_open_write_session",
        "openWriteSession",
        parent_uri,
        name,
    )?;
    let mut buffer = vec![0_u8; SAF_STREAM_BUFFER_SIZE];
    let mut written = 0_u64;

    loop {
        if cancel_requested.load(Ordering::Relaxed) {
            let _ = close_write_session(&session_id, true);
            tracing::info!(
                name,
                bytes = written,
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "android_saf_write_stream_cancelled"
            );
            return Err("Backup cancelled by user".to_string());
        }

        let read = match reader.read(&mut buffer) {
            Ok(read) => read,
            Err(error) => {
                let _ = close_write_session(&session_id, true);
                tracing::warn!(
                    name,
                    bytes = written,
                    elapsed_ms = started_at.elapsed().as_millis() as u64,
                    error = %error,
                    "android_saf_write_stream_failed"
                );
                return Err(format!("read stream: {error}"));
            }
        };
        if read == 0 {
            close_write_session(&session_id, false)?;
            tracing::info!(
                name,
                bytes = written,
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "android_saf_write_stream_complete"
            );
            return Ok(written);
        }

        match call_bool_method_with_context_string_and_bytes(
            "saf_write_session_chunk",
            "writeSessionChunk",
            &session_id,
            &buffer[..read],
        ) {
            Ok(true) => {}
            Ok(false) => {
                let _ = close_write_session(&session_id, true);
                return Err("SAF write session rejected a chunk".to_string());
            }
            Err(error) => {
                let _ = close_write_session(&session_id, true);
                return Err(error);
            }
        }
        written = written.saturating_add(read as u64);
        on_progress(written);
    }
}

pub fn open_read_named_file_stream(
    parent_uri: &str,
    name: &str,
) -> Result<Box<dyn Read + Send>, String> {
    let session_id = call_string_method_with_context_and_two_strings(
        "saf_open_read_named_session",
        "openReadNamedSession",
        parent_uri,
        name,
    )?;
    Ok(Box::new(AndroidSafReadStream {
        session_id,
        closed: false,
        buffer: Vec::new(),
        offset: 0,
    }))
}

fn pick_tree(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
    method_name: &str,
) -> Result<AndroidSafTree, String> {
    let (tx, rx) = mpsc::channel();
    runtime.insert(operation_id, tx)?;

    match call_static_int_method_with_string_arg("saf_tree_picker", method_name, operation_id) {
        Ok(0) => {}
        Ok(code) => {
            runtime.remove(operation_id);
            return Err(format!(
                "Android SAF folder picker failed to start ({code})"
            ));
        }
        Err(error) => {
            runtime.remove(operation_id);
            return Err(error);
        }
    }

    match rx.recv_timeout(SAF_TREE_PICK_TIMEOUT) {
        Ok(result) => result,
        Err(RecvTimeoutError::Timeout) => {
            runtime.remove(operation_id);
            tracing::warn!(
                "android saf folder picker timed out operation_id={} method={}",
                operation_id,
                method_name
            );
            Err("SAF folder picker timed out".to_string())
        }
        Err(RecvTimeoutError::Disconnected) => {
            Err("SAF folder picker completed without a result".to_string())
        }
    }
}

async fn pick_tree_async(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
    method_name: &str,
) -> Result<AndroidSafTree, String> {
    let (tx, rx) = oneshot::channel();
    runtime.insert_async(operation_id, tx)?;

    match call_static_int_method_with_string_arg("saf_tree_picker", method_name, operation_id) {
        Ok(0) => {}
        Ok(code) => {
            runtime.remove(operation_id);
            return Err(format!(
                "Android SAF folder picker failed to start ({code})"
            ));
        }
        Err(error) => {
            runtime.remove(operation_id);
            return Err(error);
        }
    }

    match tokio::time::timeout(SAF_TREE_PICK_TIMEOUT, rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("SAF folder picker completed without a result".to_string()),
        Err(_) => {
            runtime.remove(operation_id);
            tracing::warn!(
                "android saf folder picker timed out operation_id={} method={}",
                operation_id,
                method_name
            );
            Err("SAF folder picker timed out".to_string())
        }
    }
}

fn close_write_session(session_id: &str, abort: bool) -> Result<(), String> {
    match call_bool_method_with_context_string_and_bool(
        "saf_close_write_session",
        "closeWriteSession",
        session_id,
        abort,
    )? {
        true => Ok(()),
        false => Err("Failed to close SAF write session".to_string()),
    }
}

fn close_read_session(session_id: &str) -> Result<(), String> {
    match call_bool_method_with_context_and_string(
        "saf_close_read_session",
        "closeReadSession",
        session_id,
    )? {
        true => Ok(()),
        false => Err("Failed to close SAF read session".to_string()),
    }
}

struct AndroidSafReadStream {
    session_id: String,
    closed: bool,
    buffer: Vec<u8>,
    offset: usize,
}

impl Read for AndroidSafReadStream {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        if self.closed {
            return Ok(0);
        }
        if out.is_empty() {
            return Ok(0);
        }

        if self.offset >= self.buffer.len() {
            self.buffer = call_required_bytes_method_with_context_string_and_i32(
                "saf_read_session_chunk",
                "readSessionChunk",
                &self.session_id,
                out.len().min(SAF_STREAM_BUFFER_SIZE) as i32,
            )
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            self.offset = 0;
            if self.buffer.is_empty() {
                self.closed = true;
                let _ = close_read_session(&self.session_id);
                return Ok(0);
            }
        }

        let available = self.buffer.len() - self.offset;
        let to_copy = available.min(out.len());
        out[..to_copy].copy_from_slice(&self.buffer[self.offset..self.offset + to_copy]);
        self.offset += to_copy;
        Ok(to_copy)
    }
}

impl Drop for AndroidSafReadStream {
    fn drop(&mut self) {
        if !self.closed {
            let _ = close_read_session(&self.session_id);
            self.closed = true;
        }
    }
}

fn complete_pick(operation_id: &str, result: Result<AndroidSafTree, String>) {
    let Some(runtime) = super::super::runtime::app_android_saf_picker_runtime() else {
        tracing::warn!("android saf folder picker callback ignored: runtime unavailable");
        return;
    };
    runtime.complete(operation_id, result);
}

fn call_static_int_method_with_string_arg(
    operation: &'static str,
    method_name: &str,
    arg: &str,
) -> Result<i32, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let j_arg = env
            .new_string(arg)
            .map_err(|e| format!("new_string: {e}"))?;
        let j_arg = JObject::from(j_arg);

        env.call_static_method(
            class,
            method_name,
            "(Ljava/lang/String;)I",
            &[JValue::Object(&j_arg)],
        )
        .map_err(|e| format!("call {method_name}: {e}"))?
        .i()
        .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

fn call_string_method_with_context_and_two_strings(
    operation: &'static str,
    method_name: &str,
    first: &str,
    second: &str,
) -> Result<String, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let first = env
            .new_string(first)
            .map_err(|e| format!("new_string first: {e}"))?;
        let second = env
            .new_string(second)
            .map_err(|e| format!("new_string second: {e}"))?;
        let first = JObject::from(first);
        let second = JObject::from(second);

        let value = env
            .call_static_method(
                class,
                method_name,
                "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
                &[
                    JValue::Object(&context),
                    JValue::Object(&first),
                    JValue::Object(&second),
                ],
            )
            .map_err(|e| format!("call {method_name}: {e}"))?
            .l()
            .map_err(|e| format!("{method_name} return type: {e}"))?;
        java_string_result(env, value, method_name)
    })
}

fn call_string_method_with_context_two_strings_and_bytes(
    operation: &'static str,
    method_name: &str,
    first: &str,
    second: &str,
    bytes: &[u8],
) -> Result<String, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let first = env
            .new_string(first)
            .map_err(|e| format!("new_string first: {e}"))?;
        let second = env
            .new_string(second)
            .map_err(|e| format!("new_string second: {e}"))?;
        let bytes = env
            .byte_array_from_slice(bytes)
            .map_err(|e| format!("byte_array_from_slice: {e}"))?;
        let first = JObject::from(first);
        let second = JObject::from(second);
        let bytes = JObject::from(bytes);

        let value = env
            .call_static_method(
                class,
                method_name,
                "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;[B)Ljava/lang/String;",
                &[
                    JValue::Object(&context),
                    JValue::Object(&first),
                    JValue::Object(&second),
                    JValue::Object(&bytes),
                ],
            )
            .map_err(|e| format!("call {method_name}: {e}"))?
            .l()
            .map_err(|e| format!("{method_name} return type: {e}"))?;
        java_string_result(env, value, method_name)
    })
}

fn call_bool_method_with_context_and_string(
    operation: &'static str,
    method_name: &str,
    arg: &str,
) -> Result<bool, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let j_arg = env
            .new_string(arg)
            .map_err(|e| format!("new_string arg: {e}"))?;
        let j_arg = JObject::from(j_arg);
        env.call_static_method(
            class,
            method_name,
            "(Landroid/content/Context;Ljava/lang/String;)Z",
            &[JValue::Object(&context), JValue::Object(&j_arg)],
        )
        .map_err(|e| format!("call {method_name}: {e}"))?
        .z()
        .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

fn call_bool_method_with_context_string_and_bool(
    operation: &'static str,
    method_name: &str,
    arg: &str,
    flag: bool,
) -> Result<bool, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let j_arg = env
            .new_string(arg)
            .map_err(|e| format!("new_string arg: {e}"))?;
        let j_arg = JObject::from(j_arg);
        env.call_static_method(
            class,
            method_name,
            "(Landroid/content/Context;Ljava/lang/String;Z)Z",
            &[
                JValue::Object(&context),
                JValue::Object(&j_arg),
                JValue::Bool(u8::from(flag)),
            ],
        )
        .map_err(|e| format!("call {method_name}: {e}"))?
        .z()
        .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

fn call_bool_method_with_context_string_and_bytes(
    operation: &'static str,
    method_name: &str,
    arg: &str,
    bytes: &[u8],
) -> Result<bool, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let j_arg = env
            .new_string(arg)
            .map_err(|e| format!("new_string arg: {e}"))?;
        let bytes = env
            .byte_array_from_slice(bytes)
            .map_err(|e| format!("byte_array_from_slice: {e}"))?;
        let j_arg = JObject::from(j_arg);
        let bytes = JObject::from(bytes);
        env.call_static_method(
            class,
            method_name,
            "(Landroid/content/Context;Ljava/lang/String;[B)Z",
            &[
                JValue::Object(&context),
                JValue::Object(&j_arg),
                JValue::Object(&bytes),
            ],
        )
        .map_err(|e| format!("call {method_name}: {e}"))?
        .z()
        .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

fn call_optional_bytes_method_with_context_and_two_strings(
    operation: &'static str,
    method_name: &str,
    first: &str,
    second: &str,
) -> Result<Option<Vec<u8>>, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let first = env
            .new_string(first)
            .map_err(|e| format!("new_string first: {e}"))?;
        let second = env
            .new_string(second)
            .map_err(|e| format!("new_string second: {e}"))?;
        let first = JObject::from(first);
        let second = JObject::from(second);
        let value = env
            .call_static_method(
                class,
                method_name,
                "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)[B",
                &[
                    JValue::Object(&context),
                    JValue::Object(&first),
                    JValue::Object(&second),
                ],
            )
            .map_err(|e| format!("call {method_name}: {e}"))?
            .l()
            .map_err(|e| format!("{method_name} return type: {e}"))?;
        if value.is_null() {
            return Ok(None);
        }
        let bytes = env
            .convert_byte_array(JByteArray::from(value))
            .map_err(|e| format!("{method_name} bytes conversion: {e}"))?;
        Ok(Some(bytes))
    })
}

fn call_required_bytes_method_with_context_string_and_i32(
    operation: &'static str,
    method_name: &str,
    arg: &str,
    value: i32,
) -> Result<Vec<u8>, String> {
    super::jni::with_jni_env(operation, |env, context| {
        let class = super::jni::find_class(env, &context, SAF_BACKUP_SHELL_CLASS)?;
        let j_arg = env
            .new_string(arg)
            .map_err(|e| format!("new_string arg: {e}"))?;
        let j_arg = JObject::from(j_arg);
        let value = env
            .call_static_method(
                class,
                method_name,
                "(Landroid/content/Context;Ljava/lang/String;I)[B",
                &[
                    JValue::Object(&context),
                    JValue::Object(&j_arg),
                    JValue::Int(value),
                ],
            )
            .map_err(|e| format!("call {method_name}: {e}"))?
            .l()
            .map_err(|e| format!("{method_name} return type: {e}"))?;
        if value.is_null() {
            return Err(format!("{method_name} returned no bytes"));
        }
        env.convert_byte_array(JByteArray::from(value))
            .map_err(|e| format!("{method_name} bytes conversion: {e}"))
    })
}

fn java_string_result(
    env: &mut jni::JNIEnv<'_>,
    value: JObject<'_>,
    method_name: &str,
) -> Result<String, String> {
    if value.is_null() {
        return Err(format!("{method_name} failed"));
    }
    super::jni::try_get_java_string(env, &JString::from(value))
        .map_err(|error| format!("{method_name} string result: {error}"))
}

fn read_saf_callback_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
    field: &'static str,
) -> Result<String, String> {
    super::jni::try_get_java_string(env, value)
        .map_err(|error| format!("Invalid SAF folder picker string {field}: {error}"))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_SafBackupNativeShell_nativeOnTreePicked(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    operation_id: JString<'_>,
    uri: JString<'_>,
    display_name: JString<'_>,
) {
    let operation_id = match read_saf_callback_string(&mut env, &operation_id, "operation_id") {
        Ok(operation_id) => operation_id,
        Err(error) => {
            tracing::warn!("android saf folder picker ignored selected result: {error}");
            return;
        }
    };
    let uri = match read_saf_callback_string(&mut env, &uri, "uri") {
        Ok(uri) => uri,
        Err(error) => {
            tracing::warn!(
                "android saf folder picker selected result failed operation_id={} error={}",
                operation_id,
                error
            );
            complete_pick(&operation_id, Err(error));
            return;
        }
    };
    let display_name = match read_saf_callback_string(&mut env, &display_name, "display_name") {
        Ok(display_name) => display_name,
        Err(error) => {
            tracing::warn!(
                "android saf folder picker selected result failed operation_id={} error={}",
                operation_id,
                error
            );
            complete_pick(&operation_id, Err(error));
            return;
        }
    };
    complete_pick(&operation_id, Ok(AndroidSafTree { uri, display_name }));
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_SafBackupNativeShell_nativeOnTreePickCancelled(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    operation_id: JString<'_>,
) {
    let operation_id = match read_saf_callback_string(&mut env, &operation_id, "operation_id") {
        Ok(operation_id) => operation_id,
        Err(error) => {
            tracing::warn!("android saf folder picker ignored cancelled result: {error}");
            return;
        }
    };
    complete_pick(
        &operation_id,
        Err("SAF folder selection cancelled".to_string()),
    );
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_SafBackupNativeShell_nativeOnTreePickFailed(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    operation_id: JString<'_>,
    message: JString<'_>,
) {
    let operation_id = match read_saf_callback_string(&mut env, &operation_id, "operation_id") {
        Ok(operation_id) => operation_id,
        Err(error) => {
            tracing::warn!("android saf folder picker ignored failed result: {error}");
            return;
        }
    };
    let message = match read_saf_callback_string(&mut env, &message, "message") {
        Ok(message) => message,
        Err(error) => {
            tracing::warn!(
                "android saf folder picker failed result has invalid message operation_id={} error={}",
                operation_id,
                error
            );
            String::new()
        }
    };
    let message = if message.trim().is_empty() {
        "SAF folder picker failed".to_string()
    } else {
        message
    };
    complete_pick(&operation_id, Err(message));
}
