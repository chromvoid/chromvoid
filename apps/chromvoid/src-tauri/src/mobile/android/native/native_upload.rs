use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use jni::objects::{JByteArray, JClass, JObject, JString, JValue};
use jni::sys::jboolean;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::Emitter;
use tokio::sync::oneshot;

use crate::commands::catalog::catalog_upload_request_data;
use crate::commands::catalog::image_import_provenance::{
    persist_image_import_provenance, CatalogImageImportProvenance,
};
use crate::commands::catalog::source_metadata::load_catalog_source_metadata;
use crate::core_adapter::CoreAdapter;
use crate::mobile::android::native_upload_errors::{
    map_shared_start_code, native_upload_failure_code, NativeShareUploadError,
};
use crate::mobile::android::native_upload_runtime::{
    AndroidNativeUploadRuntimeState, NativeUploadFileState, NativeUploadPerfSnapshot,
    PendingNativeUpload, PendingNativeUploadImportProvenance,
};

const NATIVE_UPLOAD_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/NativeUploadNativeShell";
const ANDROID_SHARE_IMPORT_SHELL_CLASS: &str =
    "com/chromvoid/app/nativebridge/AndroidShareImportNativeShell";
const DEFAULT_READ_CHUNK_SIZE: u64 = 512 * 1024;
const MAX_READ_CHUNK_SIZE: u64 = 8 * 1024 * 1024;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(50);
const PERF_LOG_INTERVAL: Duration = Duration::from_secs(2);
const PERF_LOG_BYTE_INTERVAL: u64 = 8 * 1024 * 1024;
const SLOW_CHUNK_LOG_THRESHOLD: Duration = Duration::from_millis(250);

fn read_native_upload_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
    field: &'static str,
) -> Result<String, String> {
    super::jni::try_get_java_string(env, value)
        .map_err(|error| format!("Invalid Android native upload string {field}: {error}"))
}

fn upload_result_node_id(value: &Value) -> Option<u64> {
    value
        .get("node_id")
        .and_then(Value::as_u64)
        .or_else(|| value.get("nodeId").and_then(Value::as_u64))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectedNativeFile {
    file_id: String,
    name: String,
    size: i64,
    mime_type: Option<String>,
}

pub async fn upload_native_files(
    runtime: Arc<AndroidNativeUploadRuntimeState>,
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    parent_path: String,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(), String> {
    let (read_chunk_size, rx) = create_pending_upload(
        &runtime,
        app,
        adapter,
        parent_path,
        upload_id.clone(),
        read_chunk_size,
    )?;
    tracing::info!(
        "native_upload: start upload_id={} read_chunk_size={}",
        upload_id,
        read_chunk_size
    );

    match jni_start_file_picker(&upload_id, read_chunk_size) {
        Ok(0) => {
            tracing::info!("native_upload: picker_started upload_id={}", upload_id);
        }
        Ok(code) => {
            complete_upload(
                &runtime,
                &upload_id,
                Err(format!(
                    "Android native upload picker failed to start ({code})"
                )),
            );
        }
        Err(error) => {
            complete_upload(&runtime, &upload_id, Err(error));
        }
    }

    wait_pending_upload(rx).await
}

pub async fn upload_android_shared_files(
    runtime: Arc<AndroidNativeUploadRuntimeState>,
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    parent_path: String,
    upload_id: String,
    share_session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(), NativeShareUploadError> {
    let (read_chunk_size, rx) = create_pending_upload(
        &runtime,
        app,
        adapter,
        parent_path,
        upload_id.clone(),
        read_chunk_size,
    )
    .map_err(NativeShareUploadError::native_upload)?;

    tracing::info!(
        "native_upload: share_start upload_id={} share_session_id={} read_chunk_size={}",
        upload_id,
        share_session_id,
        read_chunk_size
    );

    match jni_start_shared_files_upload(&upload_id, &share_session_id, read_chunk_size) {
        Ok(0) => {
            tracing::info!(
                "native_upload: share_started upload_id={} share_session_id={}",
                upload_id,
                share_session_id
            );
        }
        Ok(code) => {
            let error = map_shared_start_code(code);
            complete_upload(&runtime, &upload_id, Err(error.message().to_string()));
            return Err(error);
        }
        Err(error) => {
            let error = NativeShareUploadError::unavailable(error);
            complete_upload(&runtime, &upload_id, Err(error.message().to_string()));
            return Err(error);
        }
    }

    wait_pending_upload(rx)
        .await
        .map_err(NativeShareUploadError::from_upload_failure)
}

pub fn cancel_android_shared_files(share_session_id: &str) -> Result<(), NativeShareUploadError> {
    match jni_cancel_share_session(share_session_id) {
        Ok(true) => Ok(()),
        Ok(false) => Err(NativeShareUploadError::session_not_found()),
        Err(error) => Err(NativeShareUploadError::unavailable(error)),
    }
}

fn create_pending_upload(
    runtime: &AndroidNativeUploadRuntimeState,
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    parent_path: String,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(u64, oneshot::Receiver<Result<(), String>>), String> {
    let read_chunk_size = read_chunk_size
        .unwrap_or(DEFAULT_READ_CHUNK_SIZE)
        .clamp(64 * 1024, MAX_READ_CHUNK_SIZE);
    let (tx, rx) = oneshot::channel();

    runtime.insert_pending_upload(
        upload_id,
        PendingNativeUpload {
            app,
            adapter,
            parent_path,
            read_chunk_size,
            files: HashMap::new(),
            tx: Some(tx),
            cancelled: false,
            started_at: Instant::now(),
            last_emit: Instant::now(),
        },
    )?;

    Ok((read_chunk_size, rx))
}

async fn wait_pending_upload(rx: oneshot::Receiver<Result<(), String>>) -> Result<(), String> {
    rx.await
        .unwrap_or_else(|_| Err("Native upload completed without a result".to_string()))
}

pub fn cancel_native_upload(runtime: &AndroidNativeUploadRuntimeState, upload_id: &str) -> bool {
    emit_upload_failed(runtime, upload_id, "Native upload cancelled");
    complete_upload(
        runtime,
        upload_id,
        Err("Native upload cancelled".to_string()),
    )
}

fn jni_start_file_picker(upload_id: &str, read_chunk_size: u64) -> Result<i32, String> {
    super::jni::with_jni_env("native_upload_start_file_picker", |env, context| {
        let class = super::jni::find_class(env, &context, NATIVE_UPLOAD_SHELL_CLASS)?;
        let upload_id = env
            .new_string(upload_id)
            .map_err(|e| format!("new_string upload_id: {e}"))?;

        let upload_id = JObject::from(upload_id);
        env.call_static_method(
            class,
            "startFilePicker",
            "(Ljava/lang/String;J)I",
            &[
                JValue::Object(&upload_id),
                JValue::Long(read_chunk_size.min(i64::MAX as u64) as i64),
            ],
        )
        .map_err(|e| format!("call startFilePicker: {e}"))?
        .i()
        .map_err(|e| format!("startFilePicker return type: {e}"))
    })
}

fn jni_start_shared_files_upload(
    upload_id: &str,
    share_session_id: &str,
    read_chunk_size: u64,
) -> Result<i32, String> {
    super::jni::with_jni_env("native_upload_start_shared_files_upload", |env, context| {
        let class = super::jni::find_class(env, &context, ANDROID_SHARE_IMPORT_SHELL_CLASS)?;
        let upload_id = env
            .new_string(upload_id)
            .map_err(|e| format!("new_string upload_id: {e}"))?;
        let share_session_id = env
            .new_string(share_session_id)
            .map_err(|e| format!("new_string share_session_id: {e}"))?;

        let upload_id = JObject::from(upload_id);
        let share_session_id = JObject::from(share_session_id);
        env.call_static_method(
            class,
            "startSharedFilesUpload",
            "(Ljava/lang/String;Ljava/lang/String;J)I",
            &[
                JValue::Object(&upload_id),
                JValue::Object(&share_session_id),
                JValue::Long(read_chunk_size.min(i64::MAX as u64) as i64),
            ],
        )
        .map_err(|e| format!("call startSharedFilesUpload: {e}"))?
        .i()
        .map_err(|e| format!("startSharedFilesUpload return type: {e}"))
    })
}

fn jni_cancel_share_session(share_session_id: &str) -> Result<bool, String> {
    super::jni::with_jni_env("native_upload_cancel_share_session", |env, context| {
        let class = super::jni::find_class(env, &context, ANDROID_SHARE_IMPORT_SHELL_CLASS)?;
        let share_session_id = env
            .new_string(share_session_id)
            .map_err(|e| format!("new_string share_session_id: {e}"))?;

        let share_session_id = JObject::from(share_session_id);
        env.call_static_method(
            class,
            "cancelShareSession",
            "(Ljava/lang/String;)Z",
            &[JValue::Object(&share_session_id)],
        )
        .map_err(|e| format!("call cancelShareSession: {e}"))?
        .z()
        .map_err(|e| format!("cancelShareSession return type: {e}"))
    })
}

fn complete_upload(
    runtime: &AndroidNativeUploadRuntimeState,
    upload_id: &str,
    result: Result<(), String>,
) -> bool {
    let (sender, summary): (
        Option<oneshot::Sender<Result<(), String>>>,
        Option<(u64, u64, u64, Duration)>,
    ) = match runtime.remove(upload_id) {
        Some(mut session) => {
            let total_loaded: u64 = session.files.values().map(|file| file.loaded_bytes).sum();
            let total_declared: u64 = session.files.values().map(|file| file.total_bytes).sum();
            let total_chunks: u64 = session.files.values().map(|file| file.chunk_count).sum();
            let elapsed = session.started_at.elapsed();
            (
                session.tx.take(),
                Some((total_loaded, total_declared, total_chunks, elapsed)),
            )
        }
        None => (None, None),
    };

    if let Some((total_loaded, total_declared, total_chunks, elapsed)) = summary {
        match &result {
            Ok(()) => tracing::info!(
                "native_upload: finish upload_id={} status=ok loaded={} declared={} chunks={} elapsed_ms={:.2} avg_mib_s={:.2}",
                upload_id,
                total_loaded,
                total_declared,
                total_chunks,
                duration_ms(elapsed),
                mib_per_second(total_loaded, elapsed)
            ),
            Err(error) => tracing::info!(
                "native_upload: finish upload_id={} status=error loaded={} declared={} chunks={} elapsed_ms={:.2} avg_mib_s={:.2} error={}",
                upload_id,
                total_loaded,
                total_declared,
                total_chunks,
                duration_ms(elapsed),
                mib_per_second(total_loaded, elapsed),
                error
            ),
        }
    }

    if let Some(tx) = sender {
        let _ = tx.send(result);
        true
    } else {
        false
    }
}

fn session_context(
    runtime: &AndroidNativeUploadRuntimeState,
    upload_id: &str,
) -> Result<
    (
        tauri::AppHandle,
        Arc<Mutex<Box<dyn CoreAdapter>>>,
        String,
        u64,
    ),
    String,
> {
    let pending = runtime.pending()?;
    let session = pending
        .get(upload_id)
        .ok_or_else(|| "Native upload session not found".to_string())?;
    if session.cancelled {
        return Err("Native upload cancelled".to_string());
    }
    Ok((
        session.app.clone(),
        session.adapter.clone(),
        session.parent_path.clone(),
        session.read_chunk_size,
    ))
}

fn handle_files_selected(
    runtime: &AndroidNativeUploadRuntimeState,
    upload_id: &str,
    files_json: &str,
) -> Result<(), String> {
    tracing::info!(
        "native_upload: files_selected_enter upload_id={} payload_bytes={}",
        upload_id,
        files_json.len()
    );
    let selected: Vec<SelectedNativeFile> = serde_json::from_str(files_json)
        .map_err(|e| format!("Invalid native files payload: {e}"))?;
    if selected.is_empty() {
        return Err("No files selected".to_string());
    }

    let selected_count = selected.len();
    let declared_bytes: u64 = selected
        .iter()
        .filter_map(|file| (file.size >= 0).then_some(file.size as u64))
        .sum();
    let unknown_sizes = selected.iter().filter(|file| file.size < 0).count();
    let (app, _adapter, _parent_path, read_chunk_size) = session_context(runtime, upload_id)?;
    let mut prepared_files = Vec::with_capacity(selected.len());
    let prepare_started = Instant::now();

    for file in selected {
        let SelectedNativeFile {
            file_id,
            name,
            size,
            mime_type,
        } = file;
        let total_bytes = if size >= 0 { size as u64 } else { 0 };
        prepared_files.push(NativeUploadFileState {
            file_id,
            name,
            mime_type,
            node_id: None,
            total_bytes,
            loaded_bytes: 0,
            chunk_count: 0,
            first_chunk_at: None,
            last_perf_log_at: None,
            last_perf_log_bytes: 0,
            total_adapter_elapsed: Duration::from_millis(0),
            slowest_adapter_elapsed: Duration::from_millis(0),
            total_adapter_wait_elapsed: Duration::from_millis(0),
            slowest_adapter_wait_elapsed: Duration::from_millis(0),
            total_jni_convert_elapsed: Duration::from_millis(0),
            slowest_jni_convert_elapsed: Duration::from_millis(0),
            import_provenance: None,
        });
    }
    tracing::info!(
        "native_upload: files_selected upload_id={} files={} declared={} unknown_sizes={} read_chunk_size={} prepare_ms={:.2}",
        upload_id,
        selected_count,
        declared_bytes,
        unknown_sizes,
        read_chunk_size,
        duration_ms(prepare_started.elapsed())
    );

    let payload_files: Vec<Value> = prepared_files
        .iter()
        .map(|file| {
            json!({
                "fileId": &file.file_id,
                "nodeId": file.node_id,
                "name": &file.name,
                "mimeType": &file.mime_type,
                "totalBytes": file.total_bytes,
            })
        })
        .collect();

    {
        let mut pending = runtime.pending()?;
        let session = pending
            .get_mut(upload_id)
            .ok_or_else(|| "Native upload session not found".to_string())?;
        for file in prepared_files {
            session.files.insert(file.file_id.clone(), file);
        }
    }

    let _ = app.emit(
        "upload:native-selected",
        json!({
            "uploadId": upload_id,
            "files": payload_files,
        }),
    );
    Ok(())
}

fn handle_file_stream_started(
    runtime: &AndroidNativeUploadRuntimeState,
    upload_id: &str,
    file_id: &str,
    provenance_json: &str,
) -> Result<(), String> {
    let provenance: PendingNativeUploadImportProvenance = serde_json::from_str(provenance_json)
        .map_err(|error| format!("Invalid native upload import provenance: {error}"))?;
    validate_import_provenance(&provenance)?;
    let mut pending = runtime.pending()?;
    let session = pending
        .get_mut(upload_id)
        .ok_or_else(|| "Native upload session not found".to_string())?;
    if session.cancelled {
        return Err("Native upload cancelled".to_string());
    }
    let file = session
        .files
        .get_mut(file_id)
        .ok_or_else(|| "Native upload file not found".to_string())?;
    tracing::info!(
        "native_upload: import_provenance_received upload_id={} file_id={} node_id={:?} image_candidate={} permission_status={} require_original_status={} original_stream_used={} regular_stream_fallback={} uri_scheme={} uri_authority={}",
        upload_id,
        file_id,
        file.node_id,
        provenance.image_candidate,
        provenance.permission_status,
        provenance.require_original_status,
        provenance.original_stream_used,
        provenance.regular_stream_fallback,
        provenance.uri_scheme.as_deref().unwrap_or(""),
        provenance.uri_authority.as_deref().unwrap_or(""),
    );
    file.import_provenance = Some(provenance);
    Ok(())
}

fn validate_import_provenance(
    provenance: &PendingNativeUploadImportProvenance,
) -> Result<(), String> {
    if !matches!(
        provenance.permission_status.as_str(),
        "not_required" | "granted" | "denied"
    ) {
        return Err("Invalid native upload media location permission status".to_string());
    }
    if !matches!(
        provenance.require_original_status.as_str(),
        "not_applicable"
            | "not_attempted_permission_missing"
            | "attempted_used"
            | "attempted_set_require_original_failed"
            | "attempted_open_original_failed"
            | "attempted_regular_fallback"
    ) {
        return Err("Invalid native upload require-original status".to_string());
    }
    Ok(())
}

fn handle_file_chunk(
    runtime: &AndroidNativeUploadRuntimeState,
    upload_id: &str,
    file_id: &str,
    offset: u64,
    bytes: Vec<u8>,
    jni_convert_elapsed: Duration,
) -> Result<(), String> {
    let chunk_len = bytes.len() as u64;
    if offset == 0 {
        tracing::info!(
            "native_upload: first_chunk_enter upload_id={} file_id={} size={} jni_convert_ms={:.2}",
            upload_id,
            file_id,
            chunk_len,
            duration_ms(jni_convert_elapsed)
        );
    }
    let (app, adapter, parent_path, read_chunk_size, file_snapshot) = {
        let pending = runtime.pending()?;
        let session = pending
            .get(upload_id)
            .ok_or_else(|| "Native upload session not found".to_string())?;
        if session.cancelled {
            return Err("Native upload cancelled".to_string());
        }
        let file = session
            .files
            .get(file_id)
            .ok_or_else(|| "Native upload file not found".to_string())?;
        (
            session.app.clone(),
            session.adapter.clone(),
            session.parent_path.clone(),
            session.read_chunk_size,
            file.clone(),
        )
    };
    let end_offset = crate::helpers::validate_upload_chunk_bounds(
        "native upload",
        offset,
        chunk_len,
        (file_snapshot.total_bytes > 0).then_some(file_snapshot.total_bytes),
    )?;

    let req = RpcRequest::new(
        "catalog:upload".to_string(),
        catalog_upload_request_data(
            file_snapshot.node_id,
            Some(if parent_path.trim().is_empty() {
                "/"
            } else {
                parent_path.as_str()
            }),
            Some(file_snapshot.name.as_str()),
            (file_snapshot.total_bytes > 0).then_some(file_snapshot.total_bytes),
            file_snapshot.mime_type.as_deref(),
            Some(read_chunk_size),
            offset,
            chunk_len,
            false,
        ),
    );
    let adapter_wait_started = Instant::now();
    let reply = {
        let mut adapter = adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        let adapter_wait_elapsed = adapter_wait_started.elapsed();
        let adapter_started = Instant::now();
        let reply = adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(bytes)));
        (reply, adapter_wait_elapsed, adapter_started.elapsed())
    };
    let (reply, adapter_wait_elapsed, adapter_elapsed) = reply;
    let returned_node_id = match reply {
        RpcReply::Json(RpcResponse::Success { result, .. }) => upload_result_node_id(&result),
        RpcReply::Json(RpcResponse::Error { error, code, .. }) => {
            return Err(format_rpc_error(error, code));
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            return Err("Unexpected stream reply".to_string());
        }
    };
    if file_snapshot.node_id.is_none() && returned_node_id.is_none() {
        return Err("catalog:upload returned no node_id".to_string());
    }

    let mut should_emit = false;
    let mut perf_snapshot: Option<NativeUploadPerfSnapshot> = None;
    let payload = {
        let mut pending = runtime.pending()?;
        let session = pending
            .get_mut(upload_id)
            .ok_or_else(|| "Native upload session not found".to_string())?;
        let file = session
            .files
            .get_mut(file_id)
            .ok_or_else(|| "Native upload file not found".to_string())?;
        if file.node_id.is_none() {
            file.node_id = returned_node_id;
        }
        let now = Instant::now();
        let first_chunk_at = match file.first_chunk_at {
            Some(started) => started,
            None => {
                file.first_chunk_at = Some(now);
                file.last_perf_log_at = Some(now);
                now
            }
        };
        file.chunk_count = file.chunk_count.saturating_add(1);
        file.loaded_bytes = end_offset;
        file.total_adapter_elapsed = file.total_adapter_elapsed.saturating_add(adapter_elapsed);
        file.slowest_adapter_elapsed = file.slowest_adapter_elapsed.max(adapter_elapsed);
        file.total_adapter_wait_elapsed = file
            .total_adapter_wait_elapsed
            .saturating_add(adapter_wait_elapsed);
        file.slowest_adapter_wait_elapsed =
            file.slowest_adapter_wait_elapsed.max(adapter_wait_elapsed);
        file.total_jni_convert_elapsed = file
            .total_jni_convert_elapsed
            .saturating_add(jni_convert_elapsed);
        file.slowest_jni_convert_elapsed =
            file.slowest_jni_convert_elapsed.max(jni_convert_elapsed);
        if now.duration_since(session.last_emit) >= PROGRESS_EMIT_INTERVAL
            || (file.total_bytes > 0 && file.loaded_bytes >= file.total_bytes)
        {
            session.last_emit = now;
            should_emit = true;
        }
        let should_log_perf = should_log_chunk_perf(
            file,
            adapter_wait_elapsed,
            adapter_elapsed,
            jni_convert_elapsed,
            now,
        );
        if should_log_perf {
            file.last_perf_log_at = Some(now);
            file.last_perf_log_bytes = file.loaded_bytes;
            perf_snapshot = Some(perf_snapshot_from_file(
                file,
                now.duration_since(first_chunk_at),
            ));
        }
        native_progress_payload(upload_id, file)
    };

    if should_emit {
        let _ = app.emit("upload:native-progress", payload);
    }
    if offset == 0 {
        tracing::info!(
            "native_upload: first_chunk_ok upload_id={} file_id={} node_id={:?} size={} adapter_wait_ms={:.2} adapter_ms={:.2}",
            upload_id,
            file_id,
            file_snapshot.node_id.or(returned_node_id),
            chunk_len,
            duration_ms(adapter_wait_elapsed),
            duration_ms(adapter_elapsed)
        );
    }
    if let Some(snapshot) = perf_snapshot {
        tracing::info!(
            "native_upload: chunk upload_id={} file_id={} node_id={:?} offset={} size={} loaded={} total={} chunks={} elapsed_ms={:.2} avg_mib_s={:.2} jni_convert_ms={:.2} adapter_wait_ms={:.2} adapter_ms={:.2} total_jni_convert_ms={:.2} total_adapter_wait_ms={:.2} total_adapter_ms={:.2}",
            upload_id,
            file_id,
            file_snapshot.node_id.or(returned_node_id),
            offset,
            chunk_len,
            snapshot.loaded_bytes,
            snapshot.total_bytes,
            snapshot.chunk_count,
            duration_ms(snapshot.elapsed),
            mib_per_second(snapshot.loaded_bytes, snapshot.elapsed),
            duration_ms(jni_convert_elapsed),
            duration_ms(adapter_wait_elapsed),
            duration_ms(adapter_elapsed),
            duration_ms(snapshot.total_jni_convert_elapsed),
            duration_ms(snapshot.total_adapter_wait_elapsed),
            duration_ms(snapshot.total_adapter_elapsed)
        );
    }
    Ok(())
}

fn handle_file_completed(
    runtime: &AndroidNativeUploadRuntimeState,
    upload_id: &str,
    file_id: &str,
) -> Result<(), String> {
    let (app, adapter, parent_path, read_chunk_size, mut file) = {
        let pending = runtime.pending()?;
        let session = pending
            .get(upload_id)
            .ok_or_else(|| "Native upload session not found".to_string())?;
        let file = session
            .files
            .get(file_id)
            .cloned()
            .ok_or_else(|| "Native upload file not found".to_string())?;
        (
            session.app.clone(),
            session.adapter.clone(),
            session.parent_path.clone(),
            session.read_chunk_size,
            file,
        )
    };

    let finalize_started = Instant::now();
    {
        let mut adapter = adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        if file.loaded_bytes == 0 {
            let req = RpcRequest::new(
                "catalog:upload".to_string(),
                catalog_upload_request_data(
                    file.node_id,
                    Some(if parent_path.trim().is_empty() {
                        "/"
                    } else {
                        parent_path.as_str()
                    }),
                    Some(file.name.as_str()),
                    Some(0),
                    file.mime_type.as_deref(),
                    Some(read_chunk_size),
                    0,
                    0,
                    false,
                ),
            );
            match adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(Vec::new()))) {
                RpcReply::Json(RpcResponse::Success { result, .. }) => {
                    if file.node_id.is_none() {
                        file.node_id = upload_result_node_id(&result);
                        if file.node_id.is_none() {
                            return Err("catalog:upload returned no node_id".to_string());
                        }
                    }
                }
                RpcReply::Json(RpcResponse::Error { error, code, .. }) => {
                    return Err(format_rpc_error(error, code));
                }
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                    return Err("Unexpected stream reply".to_string());
                }
            }
        }

        if file.total_bytes == 0 && file.loaded_bytes > 0 {
            let req = RpcRequest::new(
                "catalog:upload".to_string(),
                catalog_upload_request_data(
                    file.node_id,
                    Some(if parent_path.trim().is_empty() {
                        "/"
                    } else {
                        parent_path.as_str()
                    }),
                    Some(file.name.as_str()),
                    None,
                    file.mime_type.as_deref(),
                    Some(read_chunk_size),
                    file.loaded_bytes,
                    0,
                    true,
                ),
            );
            match adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(Vec::new()))) {
                RpcReply::Json(RpcResponse::Success { result, .. }) => {
                    if file.node_id.is_none() {
                        file.node_id = upload_result_node_id(&result);
                        if file.node_id.is_none() {
                            return Err("catalog:upload returned no node_id".to_string());
                        }
                    }
                }
                RpcReply::Json(RpcResponse::Error { error, code, .. }) => {
                    return Err(format_rpc_error(error, code));
                }
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                    return Err("Unexpected stream reply".to_string());
                }
            }
        }

        if file.node_id.is_none() {
            return Err("catalog:upload returned no node_id".to_string());
        }

        adapter.save()?;
        crate::helpers::flush_core_events(&app, adapter.as_mut());
    }
    let finalize_elapsed = finalize_started.elapsed();
    let completed_node_id = file.node_id;

    let provenance_summary = persist_completed_file_import_provenance(&adapter, &file);

    let (payload, completion_snapshot) = {
        let mut pending = runtime.pending()?;
        let session = pending
            .get_mut(upload_id)
            .ok_or_else(|| "Native upload session not found".to_string())?;
        let file = session
            .files
            .get_mut(file_id)
            .ok_or_else(|| "Native upload file not found".to_string())?;
        if file.node_id.is_none() {
            file.node_id = completed_node_id;
        }
        if file.total_bytes == 0 {
            file.total_bytes = file.loaded_bytes;
        }
        file.import_provenance = provenance_summary.clone();
        let elapsed = file
            .first_chunk_at
            .map(|started| started.elapsed())
            .unwrap_or_else(|| Duration::from_millis(0));
        let completion_snapshot = perf_snapshot_from_file(file, elapsed);
        let payload = native_progress_payload(upload_id, file);
        (payload, completion_snapshot)
    };

    let _ = app.emit("upload:native-progress", payload.clone());
    let _ = app.emit("upload:native-completed", payload);
    tracing::info!(
        "native_upload: file_complete upload_id={} file_id={} node_id={:?} loaded={} total={} chunks={} stream_ms={:.2} avg_mib_s={:.2} total_jni_convert_ms={:.2} slowest_jni_convert_ms={:.2} total_adapter_wait_ms={:.2} slowest_adapter_wait_ms={:.2} total_adapter_ms={:.2} slowest_adapter_ms={:.2} finalize_ms={:.2}",
        upload_id,
        file_id,
        file.node_id,
        completion_snapshot.loaded_bytes,
        completion_snapshot.total_bytes,
        completion_snapshot.chunk_count,
        duration_ms(completion_snapshot.elapsed),
        mib_per_second(completion_snapshot.loaded_bytes, completion_snapshot.elapsed),
        duration_ms(completion_snapshot.total_jni_convert_elapsed),
        duration_ms(completion_snapshot.slowest_jni_convert_elapsed),
        duration_ms(completion_snapshot.total_adapter_wait_elapsed),
        duration_ms(completion_snapshot.slowest_adapter_wait_elapsed),
        duration_ms(completion_snapshot.total_adapter_elapsed),
        duration_ms(completion_snapshot.slowest_adapter_elapsed),
        duration_ms(finalize_elapsed)
    );
    Ok(())
}

fn persist_completed_file_import_provenance(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    file: &NativeUploadFileState,
) -> Option<PendingNativeUploadImportProvenance> {
    let Some(provenance) = file.import_provenance.clone() else {
        return None;
    };
    let Some(node_id) = file.node_id else {
        tracing::warn!(
            "native_upload: import_provenance_source_metadata_skipped missing node_id file_id={}",
            file.file_id
        );
        return Some(provenance);
    };
    let source_metadata = match load_catalog_source_metadata(adapter, node_id) {
        Ok(metadata) => metadata,
        Err((error, code)) => {
            tracing::warn!(
                "native_upload: import_provenance_source_metadata_failed node_id={} code={:?} error={}",
                node_id,
                code,
                error
            );
            return Some(provenance);
        }
    };
    let stored = CatalogImageImportProvenance {
        source_revision: source_metadata.source_revision,
        platform: "android".to_string(),
        image_candidate: provenance.image_candidate,
        permission_status: provenance.permission_status.clone(),
        require_original_status: provenance.require_original_status.clone(),
        original_stream_used: provenance.original_stream_used,
        regular_stream_fallback: provenance.regular_stream_fallback,
        uri_scheme: provenance.uri_scheme.clone(),
        uri_authority: provenance.uri_authority.clone(),
        captured_at_ms: provenance.captured_at_ms,
    };
    match persist_image_import_provenance(
        adapter,
        node_id,
        source_metadata.source_revision,
        &stored,
    ) {
        Ok(()) => tracing::info!(
            "native_upload: import_provenance_persisted node_id={} source_revision={} import_provenance_status={} permission_status={} require_original_status={} original_stream_used={} regular_stream_fallback={}",
            node_id,
            source_metadata.source_revision,
            classify_import_provenance_status(&provenance),
            provenance.permission_status,
            provenance.require_original_status,
            provenance.original_stream_used,
            provenance.regular_stream_fallback,
        ),
        Err((error, code)) => tracing::warn!(
            "native_upload: import_provenance_failed node_id={} source_revision={} code={:?} error={}",
            node_id,
            source_metadata.source_revision,
            code,
            error
        ),
    }
    Some(provenance)
}

fn native_progress_payload(upload_id: &str, file: &NativeUploadFileState) -> Value {
    let percent = if file.total_bytes > 0 {
        Some(((file.loaded_bytes as f64 / file.total_bytes as f64) * 100.0).round() as u64)
    } else {
        None
    };
    json!({
        "uploadId": upload_id,
        "fileId": &file.file_id,
        "nodeId": file.node_id,
        "loadedBytes": file.loaded_bytes,
        "totalBytes": file.total_bytes,
        "percent": percent,
        "importProvenanceStatus": file.import_provenance.as_ref().map(classify_import_provenance_status).unwrap_or("unknown"),
        "mediaLocationPermissionStatus": file.import_provenance.as_ref().map(|provenance| provenance.permission_status.as_str()).unwrap_or("unknown"),
        "requireOriginalStatus": file.import_provenance.as_ref().map(|provenance| provenance.require_original_status.as_str()).unwrap_or("unknown"),
    })
}

fn classify_import_provenance_status(
    provenance: &PendingNativeUploadImportProvenance,
) -> &'static str {
    if !provenance.image_candidate {
        return "not_applicable";
    }
    if provenance.permission_status == "not_required" || provenance.original_stream_used {
        return "preserved";
    }
    if provenance.permission_status == "denied"
        || provenance.regular_stream_fallback
        || (provenance.require_original_status.starts_with("attempted_")
            && provenance.require_original_status != "attempted_used")
    {
        return "at_risk";
    }
    "unknown"
}

fn should_log_chunk_perf(
    file: &NativeUploadFileState,
    adapter_wait_elapsed: Duration,
    adapter_elapsed: Duration,
    jni_convert_elapsed: Duration,
    now: Instant,
) -> bool {
    if adapter_wait_elapsed >= SLOW_CHUNK_LOG_THRESHOLD
        || adapter_elapsed >= SLOW_CHUNK_LOG_THRESHOLD
        || jni_convert_elapsed >= SLOW_CHUNK_LOG_THRESHOLD
    {
        return true;
    }

    if file
        .last_perf_log_at
        .map(|last_log| now.duration_since(last_log) >= PERF_LOG_INTERVAL)
        .unwrap_or(false)
    {
        return true;
    }

    if file.loaded_bytes.saturating_sub(file.last_perf_log_bytes) >= PERF_LOG_BYTE_INTERVAL {
        return true;
    }

    file.total_bytes > 0 && file.loaded_bytes >= file.total_bytes
}

fn perf_snapshot_from_file(
    file: &NativeUploadFileState,
    elapsed: Duration,
) -> NativeUploadPerfSnapshot {
    NativeUploadPerfSnapshot {
        loaded_bytes: file.loaded_bytes,
        total_bytes: file.total_bytes,
        chunk_count: file.chunk_count,
        elapsed,
        total_adapter_elapsed: file.total_adapter_elapsed,
        slowest_adapter_elapsed: file.slowest_adapter_elapsed,
        total_adapter_wait_elapsed: file.total_adapter_wait_elapsed,
        slowest_adapter_wait_elapsed: file.slowest_adapter_wait_elapsed,
        total_jni_convert_elapsed: file.total_jni_convert_elapsed,
        slowest_jni_convert_elapsed: file.slowest_jni_convert_elapsed,
    }
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}

fn mib_per_second(bytes: u64, duration: Duration) -> f64 {
    let seconds = duration.as_secs_f64();
    if bytes == 0 || seconds <= 0.0 {
        0.0
    } else {
        (bytes as f64 / (1024.0 * 1024.0)) / seconds
    }
}

fn emit_upload_failed(runtime: &AndroidNativeUploadRuntimeState, upload_id: &str, message: &str) {
    emit_upload_failed_with_code(runtime, upload_id, message, None);
}

fn emit_upload_failed_with_code(
    runtime: &AndroidNativeUploadRuntimeState,
    upload_id: &str,
    message: &str,
    code: Option<&str>,
) {
    let app = runtime.app(upload_id);
    if let Some(app) = app {
        let _ = app.emit(
            "upload:native-failed",
            json!({
                "uploadId": upload_id,
                "message": message,
                "code": code,
            }),
        );
    }
}

fn format_rpc_error(error: String, code: Option<String>) -> String {
    match code {
        Some(code) => format!("{error} ({code})"),
        None => error,
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_NativeUploadNativeShell_nativeOnFilesSelected(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    upload_id: JString<'_>,
    files_json: JString<'_>,
) -> jboolean {
    let upload_id = match read_native_upload_string(&mut env, &upload_id, "upload_id") {
        Ok(upload_id) => upload_id,
        Err(error) => {
            tracing::warn!("native_upload: jni_files_selected_invalid_upload_id error={error}");
            return 0;
        }
    };
    let files_json = match read_native_upload_string(&mut env, &files_json, "files_json") {
        Ok(files_json) => files_json,
        Err(error) => {
            tracing::warn!(
                "native_upload: jni_files_selected_invalid_payload upload_id={} error={}",
                upload_id,
                error
            );
            if let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() {
                emit_upload_failed(&runtime, &upload_id, &error);
                complete_upload(&runtime, &upload_id, Err(error));
            }
            return 0;
        }
    };
    tracing::info!(
        "native_upload: jni_files_selected_enter upload_id={} payload_bytes={}",
        upload_id,
        files_json.len()
    );
    let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() else {
        tracing::warn!(
            "native_upload: jni_files_selected_runtime_unavailable upload_id={}",
            upload_id
        );
        return 0;
    };
    match handle_files_selected(&runtime, &upload_id, &files_json) {
        Ok(()) => {
            tracing::info!(
                "native_upload: jni_files_selected_ok upload_id={}",
                upload_id
            );
            1
        }
        Err(error) => {
            tracing::info!(
                "native_upload: jni_files_selected_error upload_id={} error={}",
                upload_id,
                error
            );
            emit_upload_failed(&runtime, &upload_id, &error);
            complete_upload(&runtime, &upload_id, Err(error));
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_NativeUploadNativeShell_nativeOnFileStreamStarted(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    upload_id: JString<'_>,
    file_id: JString<'_>,
    provenance_json: JString<'_>,
) -> jboolean {
    let upload_id = match read_native_upload_string(&mut env, &upload_id, "upload_id") {
        Ok(upload_id) => upload_id,
        Err(error) => {
            tracing::warn!(
                "native_upload: import_provenance_callback_invalid_upload_id error={error}"
            );
            return 0;
        }
    };
    let file_id = match read_native_upload_string(&mut env, &file_id, "file_id") {
        Ok(file_id) => file_id,
        Err(error) => {
            tracing::warn!(
                "native_upload: import_provenance_callback_invalid_file_id upload_id={} error={}",
                upload_id,
                error
            );
            return 0;
        }
    };
    let provenance_json = match read_native_upload_string(
        &mut env,
        &provenance_json,
        "provenance_json",
    ) {
        Ok(provenance_json) => provenance_json,
        Err(error) => {
            tracing::warn!(
                    "native_upload: import_provenance_callback_invalid_payload upload_id={} file_id={} error={}",
                    upload_id,
                    file_id,
                    error
                );
            return 0;
        }
    };
    let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() else {
        tracing::warn!(
            "native_upload: import_provenance_callback_runtime_unavailable upload_id={} file_id={}",
            upload_id,
            file_id
        );
        return 0;
    };
    match handle_file_stream_started(&runtime, &upload_id, &file_id, &provenance_json) {
        Ok(()) => 1,
        Err(error) => {
            tracing::warn!(
                "native_upload: import_provenance_callback_failed upload_id={} file_id={} error={}",
                upload_id,
                file_id,
                error
            );
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_NativeUploadNativeShell_nativeOnFileChunk(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    upload_id: JString<'_>,
    file_id: JString<'_>,
    offset: i64,
    chunk: JByteArray<'_>,
) -> jboolean {
    let upload_id = match read_native_upload_string(&mut env, &upload_id, "upload_id") {
        Ok(upload_id) => upload_id,
        Err(error) => {
            tracing::warn!("native_upload: jni_file_chunk_invalid_upload_id error={error}");
            return 0;
        }
    };
    let file_id = match read_native_upload_string(&mut env, &file_id, "file_id") {
        Ok(file_id) => file_id,
        Err(error) => {
            tracing::warn!(
                "native_upload: jni_file_chunk_invalid_file_id upload_id={} error={}",
                upload_id,
                error
            );
            if let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() {
                emit_upload_failed(&runtime, &upload_id, &error);
                complete_upload(&runtime, &upload_id, Err(error));
            }
            return 0;
        }
    };
    let convert_started = Instant::now();
    let bytes = match env.convert_byte_array(&chunk) {
        Ok(bytes) => bytes,
        Err(error) => {
            let message = format!("Failed to read Android upload chunk: {error}");
            if let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() {
                emit_upload_failed(&runtime, &upload_id, &message);
                complete_upload(&runtime, &upload_id, Err(message));
            }
            return 0;
        }
    };
    let jni_convert_elapsed = convert_started.elapsed();
    if offset <= 0 {
        tracing::info!(
            "native_upload: jni_first_chunk_enter upload_id={} file_id={} size={} convert_ms={:.2}",
            upload_id,
            file_id,
            bytes.len(),
            duration_ms(jni_convert_elapsed)
        );
    }

    let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() else {
        tracing::warn!(
            "native_upload: jni_file_chunk_runtime_unavailable upload_id={} file_id={}",
            upload_id,
            file_id
        );
        return 0;
    };
    match handle_file_chunk(
        &runtime,
        &upload_id,
        &file_id,
        offset.max(0) as u64,
        bytes,
        jni_convert_elapsed,
    ) {
        Ok(()) => 1,
        Err(error) => {
            emit_upload_failed(&runtime, &upload_id, &error);
            complete_upload(&runtime, &upload_id, Err(error));
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_NativeUploadNativeShell_nativeOnFileCompleted(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    upload_id: JString<'_>,
    file_id: JString<'_>,
) -> jboolean {
    let upload_id = match read_native_upload_string(&mut env, &upload_id, "upload_id") {
        Ok(upload_id) => upload_id,
        Err(error) => {
            tracing::warn!("native_upload: jni_file_completed_invalid_upload_id error={error}");
            return 0;
        }
    };
    let file_id = match read_native_upload_string(&mut env, &file_id, "file_id") {
        Ok(file_id) => file_id,
        Err(error) => {
            tracing::warn!(
                "native_upload: jni_file_completed_invalid_file_id upload_id={} error={}",
                upload_id,
                error
            );
            if let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() {
                emit_upload_failed(&runtime, &upload_id, &error);
                complete_upload(&runtime, &upload_id, Err(error));
            }
            return 0;
        }
    };
    tracing::info!(
        "native_upload: jni_file_completed_enter upload_id={} file_id={}",
        upload_id,
        file_id
    );
    let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() else {
        tracing::warn!(
            "native_upload: jni_file_completed_runtime_unavailable upload_id={} file_id={}",
            upload_id,
            file_id
        );
        return 0;
    };
    match handle_file_completed(&runtime, &upload_id, &file_id) {
        Ok(()) => {
            tracing::info!(
                "native_upload: jni_file_completed_ok upload_id={} file_id={}",
                upload_id,
                file_id
            );
            1
        }
        Err(error) => {
            tracing::info!(
                "native_upload: jni_file_completed_error upload_id={} file_id={} error={}",
                upload_id,
                file_id,
                error
            );
            emit_upload_failed(&runtime, &upload_id, &error);
            complete_upload(&runtime, &upload_id, Err(error));
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_NativeUploadNativeShell_nativeOnUploadFinished(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    upload_id: JString<'_>,
) {
    let upload_id = match read_native_upload_string(&mut env, &upload_id, "upload_id") {
        Ok(upload_id) => upload_id,
        Err(error) => {
            tracing::warn!("native_upload: jni_upload_finished_invalid_upload_id error={error}");
            return;
        }
    };
    tracing::info!("native_upload: jni_upload_finished upload_id={}", upload_id);
    let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() else {
        tracing::warn!(
            "native_upload: jni_upload_finished_runtime_unavailable upload_id={}",
            upload_id
        );
        return;
    };
    complete_upload(&runtime, &upload_id, Ok(()));
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_NativeUploadNativeShell_nativeOnUploadCancelled(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    upload_id: JString<'_>,
) {
    let upload_id = match read_native_upload_string(&mut env, &upload_id, "upload_id") {
        Ok(upload_id) => upload_id,
        Err(error) => {
            tracing::warn!("native_upload: jni_upload_cancelled_invalid_upload_id error={error}");
            return;
        }
    };
    let message = "Native upload cancelled".to_string();
    tracing::info!(
        "native_upload: jni_upload_cancelled upload_id={}",
        upload_id
    );
    let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() else {
        tracing::warn!(
            "native_upload: jni_upload_cancelled_runtime_unavailable upload_id={}",
            upload_id
        );
        return;
    };
    emit_upload_failed(&runtime, &upload_id, &message);
    complete_upload(&runtime, &upload_id, Err(message));
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_NativeUploadNativeShell_nativeOnUploadFailed(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    upload_id: JString<'_>,
    message: JString<'_>,
) {
    let upload_id = match read_native_upload_string(&mut env, &upload_id, "upload_id") {
        Ok(upload_id) => upload_id,
        Err(error) => {
            tracing::warn!("native_upload: jni_upload_failed_invalid_upload_id error={error}");
            return;
        }
    };
    let message = match read_native_upload_string(&mut env, &message, "message") {
        Ok(message) => message,
        Err(error) => {
            tracing::warn!(
                "native_upload: jni_upload_failed_invalid_message upload_id={} error={}",
                upload_id,
                error
            );
            String::new()
        }
    };
    let message = if message.trim().is_empty() {
        "Native upload failed".to_string()
    } else {
        message
    };
    tracing::info!(
        "native_upload: jni_upload_failed upload_id={} message={}",
        upload_id,
        message
    );
    let code = native_upload_failure_code(&message);
    let Some(runtime) = super::super::runtime::app_android_native_upload_runtime() else {
        tracing::warn!(
            "native_upload: jni_upload_failed_runtime_unavailable upload_id={}",
            upload_id
        );
        return;
    };
    emit_upload_failed_with_code(&runtime, &upload_id, &message, code);
    complete_upload(&runtime, &upload_id, Err(message));
}
