#[cfg(target_os = "ios")]
use std::path::PathBuf;
#[cfg(target_os = "ios")]
use std::{
    fs::File,
    io::Read,
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;
#[cfg(any(desktop, target_os = "ios"))]
use tauri::Emitter;
use tracing::info;

use crate::app_state::AppState;
#[cfg(target_os = "ios")]
use crate::core_adapter::CoreAdapter;
#[cfg(desktop)]
use crate::core_adapter::CoreAdapter;
use crate::helpers::*;
#[cfg(desktop)]
use crate::host_path_capability::HostPathPurpose;
#[cfg(target_os = "ios")]
use crate::mobile::ios::staging::{self, IosStagingArea, IosStagingManifest};
use crate::types::*;

fn catalog_blocking_upload_err(
    error: crate::catalog_blocking_io::CatalogBlockingIoError,
    task_label: &str,
) -> RpcResult<Value> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_err(error, code)
}

#[cfg(desktop)]
const DEFAULT_PATH_UPLOAD_READ_CHUNK_SIZE: u64 = 512 * 1024;
#[cfg(desktop)]
const PATH_UPLOAD_PROGRESS_EMIT_INTERVAL_MS: u128 = 50;
#[cfg(target_os = "ios")]
const IOS_NATIVE_UPLOAD_DEFAULT_READ_CHUNK_SIZE: u64 = 512 * 1024;
#[cfg(target_os = "ios")]
const IOS_NATIVE_UPLOAD_MAX_READ_CHUNK_SIZE: u64 = 8 * 1024 * 1024;
#[cfg(target_os = "ios")]
const IOS_NATIVE_UPLOAD_PROGRESS_EMIT_INTERVAL_MS: u128 = 50;
#[cfg(target_os = "ios")]
const IOS_STAGING_STALE_SESSION_MAX_AGE_SECS: u64 = 7 * 24 * 60 * 60;

#[cfg(any(desktop, target_os = "ios"))]
fn upload_result_node_id(value: &Value) -> Option<u64> {
    value
        .get("node_id")
        .and_then(Value::as_u64)
        .or_else(|| value.get("nodeId").and_then(Value::as_u64))
}

pub(crate) fn catalog_upload_request_data(
    node_id: Option<u64>,
    parent_path: Option<&str>,
    name: Option<&str>,
    total_size: Option<u64>,
    mime_type: Option<&str>,
    chunk_size: Option<u64>,
    offset: u64,
    size: u64,
    finish: bool,
) -> Value {
    let mut data = serde_json::Map::new();
    data.insert("size".to_string(), Value::from(size));
    data.insert("offset".to_string(), Value::from(offset));
    if let Some(node_id) = node_id {
        data.insert("node_id".to_string(), Value::from(node_id));
    } else {
        if let Some(parent_path) = parent_path {
            data.insert("parent_path".to_string(), Value::from(parent_path));
        }
        if let Some(name) = name {
            data.insert("name".to_string(), Value::from(name));
        }
    }
    if let Some(total_size) = total_size {
        data.insert("total_size".to_string(), Value::from(total_size));
    }
    if let Some(mime_type) = mime_type {
        data.insert("mime_type".to_string(), Value::from(mime_type));
    }
    if let Some(chunk_size) = chunk_size {
        data.insert("chunk_size".to_string(), Value::from(chunk_size));
    }
    if finish {
        data.insert("finish".to_string(), Value::Bool(true));
    }
    Value::Object(data)
}

#[cfg(any(desktop, target_os = "ios"))]
fn ensure_uploaded_exact_size(
    uploaded_bytes: u64,
    total_bytes: u64,
    source_label: &str,
) -> Result<(), (String, Option<String>)> {
    if uploaded_bytes == total_bytes {
        return Ok(());
    }
    Err((
        format!(
            "{source_label} changed while uploading: expected {total_bytes} bytes, read {uploaded_bytes}"
        ),
        Some("UPLOAD_SIZE_MISMATCH".to_string()),
    ))
}

#[cfg(any(desktop, target_os = "ios"))]
fn abort_catalog_upload_session(adapter: &mut dyn CoreAdapter) {
    let req = RpcRequest::new("catalog:upload:abort".to_string(), serde_json::json!({}));
    let _ = adapter.handle(&req);
}

#[tauri::command]
pub(crate) async fn catalog_upload_chunk(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: Option<u64>,
    parent_path: Option<String>,
    name: Option<String>,
    total_size: Option<u64>,
    mime_type: Option<String>,
    chunk_size: Option<u64>,
    finish: Option<bool>,
    offset: u64,
    chunk: Vec<u8>,
) -> TauriRpcResult<Value> {
    touch_last_activity(&state.last_activity, "catalog_upload_chunk");

    let started = std::time::Instant::now();
    let chunk_len = chunk.len() as u64;
    if let Err(error) =
        validate_upload_chunk_bounds("catalog upload", offset, chunk_len, total_size)
    {
        return Ok(rpc_err(error, Some("BAD_REQUEST".to_string())));
    }

    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let request_data = catalog_upload_request_data(
        node_id,
        parent_path.as_deref(),
        name.as_deref(),
        total_size,
        mime_type.as_deref(),
        chunk_size,
        offset,
        chunk_len,
        finish.unwrap_or(false),
    );
    let result = match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = match adapter.lock() {
                Ok(adapter) => adapter,
                Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
            };

            let req = RpcRequest::new("catalog:upload".to_string(), request_data);
            let reply = adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(chunk)));
            let upload_result = catalog_upload_json_reply(reply);

            if let Err(error) = adapter.save() {
                return rpc_err(
                    format!("Catalog upload save failed: {error}"),
                    Some("INTERNAL".to_string()),
                );
            }
            flush_core_events(&app, adapter.as_mut());

            upload_result
        })
        .await
    {
        Ok(result) => result,
        Err(error) => catalog_blocking_upload_err(error, "Catalog upload chunk"),
    };

    let dt_ms = started.elapsed().as_millis();
    if dt_ms >= 50 {
        info!(
            "catalog_upload_chunk: slow dt_ms={} node_id={:?} offset={} size={}",
            dt_ms, node_id, offset, chunk_len
        );
    } else {
        tracing::debug!(
            "catalog_upload_chunk: dt_ms={} node_id={:?} offset={} size={}",
            dt_ms,
            node_id,
            offset,
            chunk_len
        );
    }

    Ok(result)
}

#[tauri::command]
pub(crate) async fn catalog_file_replace(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: u64,
    size: u64,
    mime_type: Option<String>,
    expected_source_revision: Option<u64>,
    conflict_mode: Option<String>,
    bytes: Vec<u8>,
) -> TauriRpcResult<Value> {
    touch_last_activity(&state.last_activity, "catalog_file_replace");

    let started = std::time::Instant::now();
    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    let request_data = serde_json::json!({
            "node_id": node_id,
            "size": size,
            "mime_type": mime_type,
            "expected_source_revision": expected_source_revision,
            "conflict_mode": conflict_mode,
    });
    let result = match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = match adapter.lock() {
                Ok(adapter) => adapter,
                Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
            };

            let req = RpcRequest::new("catalog:file:replace".to_string(), request_data);
            let reply = adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(bytes)));
            let upload_result = catalog_upload_json_reply(reply);

            if let Err(error) = adapter.save() {
                return rpc_err(
                    format!("Catalog file replace save failed: {error}"),
                    Some("INTERNAL".to_string()),
                );
            }
            flush_core_events(&app, adapter.as_mut());

            upload_result
        })
        .await
    {
        Ok(result) => result,
        Err(error) => catalog_blocking_upload_err(error, "Catalog file replace"),
    };

    let dt_ms = started.elapsed().as_millis();
    if dt_ms >= 50 {
        info!(
            "catalog_file_replace: slow dt_ms={} node_id={} size={}",
            dt_ms, node_id, size
        );
    } else {
        tracing::debug!(
            "catalog_file_replace: dt_ms={} node_id={} size={}",
            dt_ms,
            node_id,
            size
        );
    }

    Ok(result)
}

fn catalog_upload_json_reply(reply: RpcReply) -> RpcResult<Value> {
    match reply {
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { ok: _, result } => rpc_ok(result),
            RpcResponse::Error { ok: _, error, code } => RpcResult::Error {
                ok: false,
                error,
                code,
            },
        },
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            rpc_err("Unexpected stream reply", Some("INTERNAL".to_string()))
        }
    }
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn catalog_upload_native_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    parent_path: Option<String>,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    touch_last_activity(&state.last_activity, "catalog_upload_native_files_android");

    let parent_path = parent_path
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/".to_string());
    let out = crate::mobile::android::upload_native_files(
        state.android_native_upload_runtime.clone(),
        app,
        state.adapter.clone(),
        parent_path,
        upload_id,
        read_chunk_size,
    )
    .await;

    Ok(match out {
        Ok(()) => rpc_ok(Value::Null),
        Err(error) => rpc_err(error, Some("NATIVE_UPLOAD".to_string())),
    })
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn catalog_upload_android_shared_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    parent_path: Option<String>,
    upload_id: String,
    share_session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    touch_last_activity(&state.last_activity, "catalog_upload_android_shared_files");

    let parent_path = parent_path
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/".to_string());
    info!(
        "android_share_upload_command: start upload_id={} share_session_id={} read_chunk_size={:?}",
        upload_id, share_session_id, read_chunk_size
    );
    let upload_id_for_log = upload_id.clone();
    let share_session_id_for_log = share_session_id.clone();
    let out = crate::mobile::android::upload_android_shared_files(
        state.android_native_upload_runtime.clone(),
        app,
        state.adapter.clone(),
        parent_path,
        upload_id,
        share_session_id,
        read_chunk_size,
    )
    .await;

    Ok(match out {
        Ok(()) => {
            info!(
                "android_share_upload_command: finish upload_id={} share_session_id={} status=ok",
                upload_id_for_log, share_session_id_for_log
            );
            rpc_ok(Value::Null)
        }
        Err((error, code)) => {
            info!(
                "android_share_upload_command: finish upload_id={} share_session_id={} status=error code={}",
                upload_id_for_log, share_session_id_for_log, code
            );
            rpc_err(error, Some(code))
        }
    })
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn catalog_upload_shared_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    parent_path: Option<String>,
    upload_id: String,
    shared_session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    catalog_upload_android_shared_files(
        app,
        state,
        parent_path,
        upload_id,
        shared_session_id,
        read_chunk_size,
    )
    .await
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn catalog_cancel_native_upload(
    state: tauri::State<'_, AppState>,
    upload_id: String,
) -> RpcResult<Value> {
    if crate::mobile::android::cancel_native_upload(
        &state.android_native_upload_runtime,
        &upload_id,
    ) {
        rpc_ok(Value::Null)
    } else {
        rpc_err(
            "Native upload session not found",
            Some("NATIVE_UPLOAD_NOT_FOUND".to_string()),
        )
    }
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn catalog_cancel_android_shared_files(share_session_id: String) -> RpcResult<Value> {
    match crate::mobile::android::cancel_android_shared_files(&share_session_id) {
        Ok(()) => rpc_ok(Value::Null),
        Err((error, code)) => rpc_err(error, Some(code)),
    }
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn catalog_cancel_shared_files(shared_session_id: String) -> RpcResult<Value> {
    catalog_cancel_android_shared_files(shared_session_id)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn catalog_list_shared_files() -> RpcResult<Value> {
    rpc_ok(serde_json::json!([]))
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) async fn catalog_upload_native_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    parent_path: Option<String>,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    touch_last_activity(&state.last_activity, "catalog_upload_native_files_ios");

    let parent_path = parent_path
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/".to_string());
    let adapter = state.adapter.clone();
    let last_activity = state.last_activity.clone();
    let ios_native_bridge_runtime = state.ios_native_bridge_runtime.clone();
    let session_id = match crate::mobile::ios::native_bridge::pick_upload_files(
        &ios_native_bridge_runtime,
        &upload_id,
    )
    .await
    {
        Ok(session_id) => session_id,
        Err(error) => {
            let code = ios_native_upload_error_code(&error);
            ios_emit_native_upload_failed(&app, &upload_id, &error, Some(code));
            return Ok(RpcResult::Error {
                ok: false,
                error,
                code: Some(code.to_string()),
            });
        }
    };
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let container_root = staging::app_group_container_path().map_err(|error| {
                (
                    error.to_string(),
                    Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
                )
            })?;
            let result = ios_upload_staged_files(
                app.clone(),
                adapter,
                last_activity,
                parent_path,
                upload_id.clone(),
                IosStagingArea::Uploads,
                session_id.clone(),
                read_chunk_size,
            );
            if let Err((message, code)) = &result {
                ios_emit_native_upload_failed(&app, &upload_id, message, code.as_deref());
            }
            let _ = staging::purge_session(&container_root, IosStagingArea::Uploads, &session_id);
            result
        })
        .await;

    Ok(match out {
        Ok(Ok(())) => rpc_ok(Value::Null),
        Ok(Err((msg, code))) => rpc_err(msg, code),
        Err(error) => catalog_blocking_upload_err(error, "Native upload"),
    })
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) async fn catalog_upload_shared_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    parent_path: Option<String>,
    upload_id: String,
    shared_session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    touch_last_activity(&state.last_activity, "catalog_upload_shared_files_ios");

    let parent_path = parent_path
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/".to_string());
    let adapter = state.adapter.clone();
    let last_activity = state.last_activity.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let container_root = staging::app_group_container_path().map_err(|error| {
                (
                    error.to_string(),
                    Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
                )
            })?;
            let result = ios_upload_staged_files(
                app.clone(),
                adapter,
                last_activity,
                parent_path,
                upload_id.clone(),
                IosStagingArea::SharedFiles,
                shared_session_id.clone(),
                read_chunk_size,
            );
            if let Err((message, code)) = &result {
                ios_emit_native_upload_failed(&app, &upload_id, message, code.as_deref());
            }
            let _ = staging::purge_session(
                &container_root,
                IosStagingArea::SharedFiles,
                &shared_session_id,
            );
            result
        })
        .await;

    Ok(match out {
        Ok(Ok(())) => rpc_ok(Value::Null),
        Ok(Err((msg, code))) => rpc_err(msg, code),
        Err(error) => catalog_blocking_upload_err(error, "Shared file upload"),
    })
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) async fn catalog_upload_android_shared_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    parent_path: Option<String>,
    upload_id: String,
    share_session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    catalog_upload_shared_files(
        app,
        state,
        parent_path,
        upload_id,
        share_session_id,
        read_chunk_size,
    )
    .await
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) fn catalog_cancel_native_upload(_upload_id: String) -> RpcResult<Value> {
    rpc_err(
        "iOS native upload cancellation is not available for this session",
        Some("NATIVE_UPLOAD_NOT_FOUND".to_string()),
    )
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) async fn catalog_cancel_shared_files(
    state: tauri::State<'_, AppState>,
    shared_session_id: String,
) -> TauriRpcResult<Value> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    Ok(
        match catalog_blocking_io_runtime
            .spawn_blocking(move || {
                staging::app_group_container_path().and_then(|root| {
                    staging::purge_session(&root, IosStagingArea::SharedFiles, &shared_session_id)
                })
            })
            .await
        {
            Ok(Ok(())) => rpc_ok(Value::Null),
            Ok(Err(error)) => rpc_err(
                error.to_string(),
                Some("ANDROID_SHARE_SESSION_NOT_FOUND".to_string()),
            ),
            Err(error) => catalog_blocking_upload_err(error, "Cancel shared files"),
        },
    )
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) async fn catalog_cancel_android_shared_files(
    state: tauri::State<'_, AppState>,
    share_session_id: String,
) -> TauriRpcResult<Value> {
    catalog_cancel_shared_files(state, share_session_id).await
}

#[cfg(target_os = "ios")]
#[tauri::command]
pub(crate) async fn catalog_list_shared_files(
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    Ok(
        match catalog_blocking_io_runtime
            .spawn_blocking(ios_list_shared_files)
            .await
        {
            Ok(Ok(value)) => rpc_ok(value),
            Ok(Err((error, code))) => rpc_err(error, code),
            Err(error) => catalog_blocking_upload_err(error, "List shared files"),
        },
    )
}

#[cfg(all(mobile, not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) async fn catalog_upload_native_files(
    _app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
    _parent_path: Option<String>,
    _upload_id: String,
    _read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    Ok(rpc_err(
        "Native upload is not available on this platform",
        Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
    ))
}

#[cfg(all(mobile, not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) async fn catalog_upload_shared_files(
    _app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
    _parent_path: Option<String>,
    _upload_id: String,
    _shared_session_id: String,
    _read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    Ok(rpc_err(
        "Shared file upload is not available on this platform",
        Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
    ))
}

#[cfg(all(mobile, not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) async fn catalog_upload_android_shared_files(
    _app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
    _parent_path: Option<String>,
    _upload_id: String,
    _share_session_id: String,
    _read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    Ok(rpc_err(
        "Android shared file upload is not available on this platform",
        Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
    ))
}

#[cfg(all(mobile, not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn catalog_cancel_native_upload(_upload_id: String) -> RpcResult<Value> {
    rpc_err(
        "Native upload is not available on this platform",
        Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
    )
}

#[cfg(all(mobile, not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn catalog_cancel_shared_files(_shared_session_id: String) -> RpcResult<Value> {
    rpc_err(
        "Shared file upload is not available on this platform",
        Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
    )
}

#[cfg(all(mobile, not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn catalog_cancel_android_shared_files(_share_session_id: String) -> RpcResult<Value> {
    rpc_err(
        "Android shared file upload is not available on this platform",
        Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
    )
}

#[cfg(all(mobile, not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub(crate) fn catalog_list_shared_files() -> RpcResult<Value> {
    rpc_ok(serde_json::json!([]))
}

#[cfg(target_os = "ios")]
fn ios_upload_staged_files(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    last_activity: Arc<Mutex<std::time::Instant>>,
    parent_path: String,
    upload_id: String,
    area: IosStagingArea,
    session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(), (String, Option<String>)> {
    let container_root = staging::app_group_container_path().map_err(|error| {
        (
            error.to_string(),
            Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
        )
    })?;
    let manifest = staging::read_manifest(&container_root, area, &session_id).map_err(|error| {
        (
            error.to_string(),
            Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
        )
    })?;
    let read_chunk_size = read_chunk_size
        .unwrap_or(IOS_NATIVE_UPLOAD_DEFAULT_READ_CHUNK_SIZE)
        .clamp(64 * 1024, IOS_NATIVE_UPLOAD_MAX_READ_CHUNK_SIZE) as usize;

    let prepared = ios_prepare_staged_upload_files(
        &app,
        &adapter,
        &parent_path,
        &upload_id,
        &container_root,
        area,
        &manifest,
        read_chunk_size as u64,
    )?;

    for file in prepared {
        ios_stream_staged_upload_file(
            &app,
            &adapter,
            &last_activity,
            &upload_id,
            file,
            read_chunk_size,
        )?;
    }

    {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        adapter
            .save()
            .map_err(|error| (error, Some("INTERNAL".to_string())))?;
        flush_core_events(&app, adapter.as_mut());
    }

    Ok(())
}

#[cfg(target_os = "ios")]
struct IosPreparedUploadFile {
    file_id: String,
    path: PathBuf,
    parent_path: String,
    name: String,
    mime_type: Option<String>,
    chunk_size: u64,
    node_id: Option<u64>,
    total_bytes: u64,
}

#[cfg(target_os = "ios")]
fn ios_prepare_staged_upload_files(
    app: &tauri::AppHandle,
    _adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    parent_path: &str,
    upload_id: &str,
    container_root: &Path,
    area: IosStagingArea,
    manifest: &IosStagingManifest,
    read_chunk_size: u64,
) -> Result<Vec<IosPreparedUploadFile>, (String, Option<String>)> {
    if manifest.files.is_empty() {
        return Err((
            "No files selected".to_string(),
            Some("NATIVE_UPLOAD".to_string()),
        ));
    }

    let mut prepared = Vec::with_capacity(manifest.files.len());
    let mut selected_payload = Vec::with_capacity(manifest.files.len());
    for staged in &manifest.files {
        let path = staging::staged_file_path(
            container_root,
            area,
            &manifest.session_id,
            &staged.staged_name,
        )
        .map_err(|error| {
            (
                error.to_string(),
                Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
            )
        })?;
        let total_bytes = std::fs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(staged.size);
        let file_id = staged.staged_name.clone();
        selected_payload.push(serde_json::json!({
            "fileId": &file_id,
            "name": &staged.display_name,
            "mimeType": &staged.mime_type,
            "totalBytes": total_bytes,
        }));
        prepared.push(IosPreparedUploadFile {
            file_id,
            path,
            parent_path: if parent_path.trim().is_empty() {
                "/".to_string()
            } else {
                parent_path.to_string()
            },
            name: staged.display_name.clone(),
            mime_type: staged.mime_type.clone(),
            chunk_size: read_chunk_size,
            node_id: None,
            total_bytes,
        });
    }

    let _ = app.emit(
        "upload:native-selected",
        serde_json::json!({
            "uploadId": upload_id,
            "files": selected_payload,
        }),
    );

    Ok(prepared)
}

#[cfg(target_os = "ios")]
fn ios_stream_staged_upload_file(
    app: &tauri::AppHandle,
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    last_activity: &Arc<Mutex<std::time::Instant>>,
    upload_id: &str,
    mut file: IosPreparedUploadFile,
    read_chunk_size: usize,
) -> Result<(), (String, Option<String>)> {
    let mut source = File::open(&file.path).map_err(|error| {
        (
            format!("Failed to open staged iOS upload file: {error}"),
            Some("IO".to_string()),
        )
    })?;
    let mut offset = 0_u64;
    let mut loaded = 0_u64;
    let mut buffer = vec![0_u8; read_chunk_size];
    let mut last_emit = Instant::now();

    while offset < file.total_bytes {
        touch_last_activity(last_activity, "ios_stream_staged_upload_file");
        let remaining = file.total_bytes - offset;
        let read = std::cmp::min(read_chunk_size as u64, remaining) as usize;
        source.read_exact(&mut buffer[..read]).map_err(|error| {
            (
                format!("Failed to read staged iOS upload file: {error}"),
                Some("IO".to_string()),
            )
        })?;

        let req = RpcRequest::new(
            "catalog:upload".to_string(),
            catalog_upload_request_data(
                file.node_id,
                Some(&file.parent_path),
                Some(&file.name),
                Some(file.total_bytes),
                file.mime_type.as_deref(),
                Some(file.chunk_size),
                offset,
                read as u64,
                offset.saturating_add(read as u64) >= file.total_bytes,
            ),
        );
        let reply = {
            let mut adapter = adapter.lock().map_err(|_| {
                (
                    "Adapter mutex poisoned".to_string(),
                    Some("INTERNAL".to_string()),
                )
            })?;
            adapter.handle_with_stream(
                &req,
                Some(RpcInputStream::from_bytes(buffer[..read].to_vec())),
            )
        };
        match reply {
            RpcReply::Json(RpcResponse::Success { result, .. }) => {
                if file.node_id.is_none() {
                    file.node_id = upload_result_node_id(&result);
                    if file.node_id.is_none() {
                        return Err((
                            "catalog:upload returned no node_id".to_string(),
                            Some("INTERNAL".to_string()),
                        ));
                    }
                }
            }
            RpcReply::Json(RpcResponse::Error { error, code, .. }) => return Err((error, code)),
            RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                return Err((
                    "Unexpected stream reply".to_string(),
                    Some("INTERNAL".to_string()),
                ));
            }
        }

        offset = offset.saturating_add(read as u64);
        loaded = loaded.saturating_add(read as u64);
        let now = Instant::now();
        if now.duration_since(last_emit).as_millis() >= IOS_NATIVE_UPLOAD_PROGRESS_EMIT_INTERVAL_MS
            || loaded >= file.total_bytes
        {
            last_emit = now;
            ios_emit_native_upload_progress(app, upload_id, &file, loaded);
        }
    }

    if file.total_bytes == 0 {
        let req = RpcRequest::new(
            "catalog:upload".to_string(),
            catalog_upload_request_data(
                file.node_id,
                Some(&file.parent_path),
                Some(&file.name),
                Some(0),
                file.mime_type.as_deref(),
                Some(file.chunk_size),
                0,
                0,
                true,
            ),
        );
        let reply = {
            let mut adapter = adapter.lock().map_err(|_| {
                (
                    "Adapter mutex poisoned".to_string(),
                    Some("INTERNAL".to_string()),
                )
            })?;
            adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(Vec::new())))
        };
        match reply {
            RpcReply::Json(RpcResponse::Success { result, .. }) => {
                if file.node_id.is_none() {
                    file.node_id = upload_result_node_id(&result);
                    if file.node_id.is_none() {
                        return Err((
                            "catalog:upload returned no node_id".to_string(),
                            Some("INTERNAL".to_string()),
                        ));
                    }
                }
            }
            RpcReply::Json(RpcResponse::Error { error, code, .. }) => return Err((error, code)),
            RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                return Err((
                    "Unexpected stream reply".to_string(),
                    Some("INTERNAL".to_string()),
                ));
            }
        }
    }

    ensure_uploaded_exact_size(loaded, file.total_bytes, "Staged iOS upload file")?;

    ios_emit_native_upload_progress(app, upload_id, &file, loaded);
    let _ = app.emit(
        "upload:native-completed",
        ios_native_upload_progress_payload(upload_id, &file, loaded),
    );
    tracing::info!(
        "ios_native_upload: file_complete upload_id={} file_id={} node_id={:?} loaded={} total={}",
        upload_id,
        file.file_id,
        file.node_id,
        loaded,
        file.total_bytes
    );

    Ok(())
}

#[cfg(target_os = "ios")]
fn ios_native_upload_error_code(message: &str) -> &'static str {
    if message.trim() == "Native upload cancelled" {
        "NATIVE_UPLOAD"
    } else {
        "NATIVE_UPLOAD_UNAVAILABLE"
    }
}

#[cfg(target_os = "ios")]
fn ios_emit_native_upload_failed(
    app: &tauri::AppHandle,
    upload_id: &str,
    message: &str,
    code: Option<&str>,
) {
    let _ = app.emit(
        "upload:native-failed",
        serde_json::json!({
            "uploadId": upload_id,
            "message": message,
            "code": code,
        }),
    );
}

#[cfg(target_os = "ios")]
fn ios_emit_native_upload_progress(
    app: &tauri::AppHandle,
    upload_id: &str,
    file: &IosPreparedUploadFile,
    loaded_bytes: u64,
) {
    let _ = app.emit(
        "upload:native-progress",
        ios_native_upload_progress_payload(upload_id, file, loaded_bytes),
    );
}

#[cfg(target_os = "ios")]
fn ios_native_upload_progress_payload(
    upload_id: &str,
    file: &IosPreparedUploadFile,
    loaded_bytes: u64,
) -> Value {
    let percent = if file.total_bytes > 0 {
        Some(((loaded_bytes as f64 / file.total_bytes as f64) * 100.0).round() as u64)
    } else {
        Some(100)
    };
    serde_json::json!({
        "uploadId": upload_id,
        "fileId": file.file_id,
        "nodeId": file.node_id,
        "loadedBytes": loaded_bytes,
        "totalBytes": file.total_bytes,
        "percent": percent,
        "importProvenanceStatus": "not_applicable",
        "mediaLocationPermissionStatus": "not_required",
        "requireOriginalStatus": "not_applicable",
    })
}

#[cfg(target_os = "ios")]
fn ios_list_shared_files() -> Result<Value, (String, Option<String>)> {
    let container_root = staging::app_group_container_path().map_err(|error| {
        (
            error.to_string(),
            Some("NATIVE_UPLOAD_UNAVAILABLE".to_string()),
        )
    })?;
    if let Err(error) = staging::purge_stale_sessions(
        &container_root,
        Duration::from_secs(IOS_STAGING_STALE_SESSION_MAX_AGE_SECS),
    ) {
        tracing::warn!("ios_list_shared_files: stale staging purge failed: {error}");
    }
    let shared_root = staging::staging_root(&container_root).join("shared-files");
    if !shared_root.exists() {
        return Ok(serde_json::json!([]));
    }

    let mut sessions = Vec::new();
    let entries = std::fs::read_dir(&shared_root).map_err(|error| {
        (
            format!("Failed to read iOS shared files staging: {error}"),
            Some("IO".to_string()),
        )
    })?;
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let Some(session_id) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let Ok(manifest) =
            staging::read_manifest(&container_root, IosStagingArea::SharedFiles, &session_id)
        else {
            continue;
        };
        if manifest.files.is_empty() {
            continue;
        }
        let manifest_session_id = manifest.session_id.clone();
        let files: Vec<Value> = manifest
            .files
            .into_iter()
            .map(|file| {
                serde_json::json!({
                    "name": file.display_name,
                    "size": file.size,
                    "mimeType": file.mime_type,
                })
            })
            .collect();
        sessions.push(serde_json::json!({
            "sessionId": manifest_session_id,
            "files": files,
        }));
    }

    Ok(Value::Array(sessions))
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn catalog_upload_path(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    node_id: Option<u64>,
    parent_path: Option<String>,
    name: Option<String>,
    total_bytes: Option<u64>,
    path_token: String,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<RpcResult<Value>, String> {
    touch_last_activity(&state.last_activity, "catalog_upload_path");

    let path = match state
        .host_path_capabilities
        .consume(&path_token, HostPathPurpose::Upload)
    {
        Ok(path) => path,
        Err(error) => return Ok(rpc_err(error, Some("INVALID_PATH_TOKEN".to_string()))),
    };

    let adapter = state.adapter.clone();
    let app2 = app.clone();
    let last_activity = state.last_activity.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    let read_cs = read_chunk_size
        .unwrap_or(DEFAULT_PATH_UPLOAD_READ_CHUNK_SIZE)
        .clamp(64 * 1024, 16 * 1024 * 1024) as usize;

    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || -> Result<u64, (String, Option<String>)> {
            let upload_result = (|| -> Result<u64, (String, Option<String>)> {
                let pb = path;
                let meta = std::fs::metadata(&pb)
                    .map_err(|e| (format!("Failed to stat file: {e}"), Some("IO".to_string())))?;
                if !meta.is_file() {
                    return Err((
                        "Path is not a file".to_string(),
                        Some("INVALID_PATH".to_string()),
                    ));
                }

                let total_bytes = total_bytes.unwrap_or_else(|| meta.len());
                let upload_parent_path = parent_path
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| "/".to_string());
                let upload_name = name
                    .filter(|value| !value.trim().is_empty())
                    .or_else(|| {
                        pb.file_name()
                            .and_then(|name| name.to_str())
                            .map(str::to_string)
                    })
                    .ok_or_else(|| {
                        (
                            "Upload file name is required".to_string(),
                            Some("INVALID_PATH".to_string()),
                        )
                    })?;
                let mut file = std::fs::File::open(&pb)
                    .map_err(|e| (format!("Failed to open file: {e}"), Some("IO".to_string())))?;

                let mut node_id = node_id;
                let mut offset: u64 = 0;
                let mut sent_bytes: u64 = 0;
                let mut buf = vec![0u8; read_cs];
                let mut last_emit = std::time::Instant::now();

                while offset < total_bytes || (total_bytes == 0 && offset == 0) {
                    touch_last_activity(&last_activity, "catalog_upload_path");

                    let n = if total_bytes == 0 {
                        0
                    } else {
                        let remaining = total_bytes - offset;
                        let n = std::cmp::min(read_cs as u64, remaining) as usize;
                        std::io::Read::read_exact(&mut file, &mut buf[..n]).map_err(|e| {
                            (format!("Failed to read file: {e}"), Some("IO".to_string()))
                        })?;
                        n
                    };

                    let chunk = buf[..n].to_vec();
                    let req = RpcRequest::new(
                        "catalog:upload".to_string(),
                        catalog_upload_request_data(
                            node_id,
                            Some(&upload_parent_path),
                            Some(&upload_name),
                            Some(total_bytes),
                            None,
                            Some(read_cs as u64),
                            offset,
                            n as u64,
                            offset.saturating_add(n as u64) >= total_bytes,
                        ),
                    );

                    let reply = {
                        let mut adapter = adapter.lock().map_err(|_| {
                            (
                                "Adapter mutex poisoned".to_string(),
                                Some("INTERNAL".to_string()),
                            )
                        })?;
                        adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(chunk)))
                    };

                    match reply {
                        RpcReply::Json(resp) => match resp {
                            RpcResponse::Success { result, .. } => {
                                if node_id.is_none() {
                                    node_id = upload_result_node_id(&result);
                                    if node_id.is_none() {
                                        return Err((
                                            "catalog:upload returned no node_id".to_string(),
                                            Some("INTERNAL".to_string()),
                                        ));
                                    }
                                }
                            }
                            RpcResponse::Error { error, code, .. } => return Err((error, code)),
                        },
                        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                            return Err((
                                "Unexpected stream reply".to_string(),
                                Some("INTERNAL".to_string()),
                            ))
                        }
                    }

                    offset = offset.saturating_add(n as u64);
                    sent_bytes = sent_bytes.saturating_add(n as u64);

                    let now = std::time::Instant::now();
                    if now.duration_since(last_emit).as_millis()
                        >= PATH_UPLOAD_PROGRESS_EMIT_INTERVAL_MS
                        || sent_bytes >= total_bytes
                    {
                        last_emit = now;
                        let _ = app2.emit(
                            "upload:progress",
                            serde_json::json!({
                                "uploadId": upload_id.clone(),
                                "nodeId": node_id,
                                "sentBytes": sent_bytes,
                                "totalBytes": total_bytes,
                            }),
                        );
                    }
                    if total_bytes == 0 {
                        break;
                    }
                }

                ensure_uploaded_exact_size(sent_bytes, total_bytes, "Upload file")?;

                {
                    let mut adapter = adapter.lock().map_err(|_| {
                        (
                            "Adapter mutex poisoned".to_string(),
                            Some("INTERNAL".to_string()),
                        )
                    })?;
                    adapter
                        .save()
                        .map_err(|error| (error, Some("INTERNAL".to_string())))?;
                    flush_core_events(&app2, adapter.as_mut());
                }

                node_id.ok_or_else(|| {
                    (
                        "catalog:upload returned no node_id".to_string(),
                        Some("INTERNAL".to_string()),
                    )
                })
            })();

            if upload_result.is_err() {
                if let Ok(mut adapter) = adapter.lock() {
                    abort_catalog_upload_session(adapter.as_mut());
                }
            }

            upload_result
        })
        .await;

    Ok(match out {
        Ok(Ok(node_id)) => rpc_ok(serde_json::json!({"node_id": node_id, "nodeId": node_id})),
        Ok(Err((msg, code))) => rpc_err(msg, code),
        Err(error) => catalog_blocking_upload_err(error, "Upload"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::rpc::{RpcOutputStream, RpcStreamMeta};

    #[test]
    fn catalog_upload_json_reply_preserves_success_result() {
        let result = catalog_upload_json_reply(RpcReply::Json(RpcResponse::Success {
            ok: true,
            result: serde_json::json!({"node_id": 42}),
        }));

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result["node_id"], 42);
            }
            RpcResult::Error { error, .. } => panic!("unexpected error: {error}"),
        }
    }

    #[test]
    fn catalog_upload_json_reply_preserves_core_error() {
        let result = catalog_upload_json_reply(RpcReply::Json(RpcResponse::Error {
            ok: false,
            error: "denied".to_string(),
            code: Some("DENIED".to_string()),
        }));

        match result {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "denied");
                assert_eq!(code.as_deref(), Some("DENIED"));
            }
            RpcResult::Success { .. } => panic!("unexpected success"),
        }
    }

    #[test]
    fn catalog_upload_json_reply_rejects_stream_reply() {
        let reply = RpcReply::Stream(RpcOutputStream {
            meta: RpcStreamMeta {
                name: "upload.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                size: 4,
                chunk_size: 4,
            },
            reader: Box::new(std::io::Cursor::new(b"data".to_vec())),
        });

        match catalog_upload_json_reply(reply) {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "Unexpected stream reply");
                assert_eq!(code.as_deref(), Some("INTERNAL"));
            }
            RpcResult::Success { .. } => panic!("unexpected success"),
        }
    }

    #[test]
    fn catalog_upload_request_data_preserves_existing_upload_metadata() {
        let data = catalog_upload_request_data(
            Some(7),
            Some("/ignored"),
            Some("ignored.txt"),
            Some(13),
            Some("text/plain"),
            Some(4),
            8,
            5,
            true,
        );

        assert_eq!(data["node_id"], 7);
        assert_eq!(data["total_size"], 13);
        assert_eq!(data["chunk_size"], 4);
        assert_eq!(data["mime_type"], "text/plain");
        assert_eq!(data["offset"], 8);
        assert_eq!(data["size"], 5);
        assert_eq!(data["finish"], true);
        assert!(data.get("parent_path").is_none());
        assert!(data.get("name").is_none());
    }

    #[test]
    fn ensure_uploaded_exact_size_rejects_short_read() {
        let error = ensure_uploaded_exact_size(4, 8, "Upload file").unwrap_err();
        assert_eq!(error.1.as_deref(), Some("UPLOAD_SIZE_MISMATCH"));
        assert!(error.0.contains("expected 8 bytes, read 4"));
    }
}
