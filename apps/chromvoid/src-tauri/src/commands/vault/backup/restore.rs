use super::*;

use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use chromvoid_core::rpc::{RpcInputStream, RpcReply};

#[tauri::command]
pub(crate) async fn restore_local_select_source(
    state: tauri::State<'_, AppState>,
) -> Result<RpcResult<RestoreLocalSourceSelected>, String> {
    #[cfg(target_os = "android")]
    {
        let android_saf_picker_runtime = state.android_saf_picker_runtime.clone();
        let out = crate::mobile::android::pick_saf_restore_tree_async(
            &android_saf_picker_runtime,
            "restore-local-select",
        )
        .await;

        return Ok(match out {
            Ok(tree) => rpc_ok(RestoreLocalSourceSelected {
                backup_path: tree.uri,
                display_name: tree.display_name,
            }),
            Err(error) => {
                let code = if error.to_ascii_lowercase().contains("cancel") {
                    "CANCELLED"
                } else {
                    "BAD_REQUEST"
                };
                restore_rpc_error(error, Some(code.to_string()))
            }
        });
    }

    #[cfg(target_os = "ios")]
    {
        let ios_native_bridge_runtime = state.ios_native_bridge_runtime.clone();
        let out = crate::mobile::ios::native_bridge::pick_restore_source(
            &ios_native_bridge_runtime,
            "restore-local-select",
        )
        .await;

        return Ok(match out {
            Ok(source) => rpc_ok(RestoreLocalSourceSelected {
                backup_path: source.backup_path,
                display_name: source.display_name,
            }),
            Err(error) => {
                let code = if error.to_ascii_lowercase().contains("cancel") {
                    "CANCELLED"
                } else {
                    "BAD_REQUEST"
                };
                restore_rpc_error(error, Some(code.to_string()))
            }
        });
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        Ok(restore_rpc_error(
            "restore source selection is only available on mobile backup providers",
            Some("UNSUPPORTED".to_string()),
        ))
    }
}

#[tauri::command]
pub(crate) fn restore_local_cancel(state: tauri::State<'_, AppState>) -> RpcResult<Value> {
    state.vault_background_io_runtime.cancel_restore();
    rpc_ok(serde_json::json!({
        "cancelled": true,
        "operation": "restore_local",
    }))
}

#[tauri::command]
pub(crate) async fn restore_local_from_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    master_password: String,
    backup_path: Option<String>,
) -> Result<RpcResult<Value>, String> {
    if master_password.trim().is_empty() {
        return Ok(rpc_err(
            "master_password is required",
            Some("BAD_REQUEST".to_string()),
        ));
    }

    let source_target = match default_restore_source(backup_path) {
        Ok(source_target) => source_target,
        Err(error) => return Ok(rpc_err(error, Some("BAD_REQUEST".to_string()))),
    };

    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let android_saf_picker_runtime = state.android_saf_picker_runtime.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();
    let cancel_requested_bg = vault_background_io_runtime.begin_restore_run();

    let out = vault_background_io_runtime
        .spawn_blocking(move || {
            restore_local_from_folder_inner(
                app,
                adapter,
                storage_root,
                master_password,
                source_target,
                cancel_requested_bg,
                android_saf_picker_runtime,
            )
        })
        .await;

    vault_background_io_runtime.finish_restore_run();

    Ok(match out {
        Ok(result) => result,
        Err(error) => {
            let (error, code) = error.into_rpc_error("Restore");
            rpc_err(error, code)
        }
    })
}

fn restore_local_from_folder_inner(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    storage_root: Arc<Mutex<PathBuf>>,
    master_password: String,
    source_target: RestoreSourceTarget,
    cancel_requested: Arc<AtomicBool>,
    #[cfg_attr(not(target_os = "android"), allow(unused_variables))]
    android_saf_picker_runtime: Arc<crate::mobile::android::AndroidSafPickerRuntimeState>,
) -> RpcResult<Value> {
    use base64::engine::general_purpose;
    use base64::Engine;

    let operation_started_at = std::time::Instant::now();

    let source = match create_backup_source(source_target, &android_saf_picker_runtime) {
        Ok(source) => source,
        Err(error) => {
            let code = if error.to_ascii_lowercase().contains("cancel") {
                "CANCELLED"
            } else {
                "BAD_REQUEST"
            };
            return rpc_err(error, Some(code.to_string()));
        }
    };

    let _ = app.emit(
        "restore:progress",
        RestoreProgressEvent {
            restore_id: String::new(),
            phase: "metadata".to_string(),
            chunk_index: 0,
            chunk_count: 0,
            bytes_written: 0,
            estimated_size: 0,
        },
    );

    let metadata_bytes = match source.read_required_file("metadata.enc") {
        Ok(bytes) => bytes,
        Err(error) => {
            let message = if error == "metadata.enc not found" {
                format!(
                    "Selected folder is not a ChromVoid backup: {}. Choose the backup folder that contains metadata.enc.",
                    source.display_path()
                )
            } else {
                error
            };
            return rpc_err(message, Some("INVALID_BACKUP".to_string()));
        }
    };
    let metadata_b64 = general_purpose::STANDARD.encode(&metadata_bytes);
    let master_salt = match source.read_optional_file("master.salt") {
        Ok(Some(bytes)) => Some(general_purpose::STANDARD.encode(bytes)),
        Ok(None) => None,
        Err(error) => return rpc_err(error, Some("BAD_REQUEST".to_string())),
    };
    let master_verify = match source.read_optional_file("master.verify") {
        Ok(Some(bytes)) => Some(general_purpose::STANDARD.encode(bytes)),
        Ok(None) => None,
        Err(error) => return rpc_err(error, Some("BAD_REQUEST".to_string())),
    };
    let manifest_bytes = match source.read_required_file(BACKUP_PACK_MANIFEST_FILE_NAME) {
        Ok(bytes) => bytes,
        Err(error) => {
            let message = if error == format!("{BACKUP_PACK_MANIFEST_FILE_NAME} not found") {
                format!(
                    "Selected folder is not a current ChromVoid backup: {}. Choose a backup folder that contains {} and {}.",
                    source.display_path(),
                    BACKUP_PACK_MANIFEST_FILE_NAME,
                    BACKUP_PACK_FILE_NAME,
                )
            } else {
                error
            };
            return rpc_err(message, Some("INVALID_BACKUP".to_string()));
        }
    };
    let manifest: serde_json::Value = match serde_json::from_slice(&manifest_bytes) {
        Ok(manifest) => manifest,
        Err(error) => {
            return rpc_err(
                format!("Invalid {BACKUP_PACK_MANIFEST_FILE_NAME}: {error}"),
                Some("INVALID_BACKUP".to_string()),
            )
        }
    };
    let (chunk_names, chunk_count, estimated_size) = match parse_manifest_summary(&manifest) {
        Ok(summary) => summary,
        Err(error) => return rpc_err(error, Some("INVALID_BACKUP".to_string())),
    };
    tracing::info!(
        source = %source.display_path(),
        elapsed_ms = operation_started_at.elapsed().as_millis() as u64,
        metadata_bytes = metadata_bytes.len() as u64,
        manifest_bytes = manifest_bytes.len() as u64,
        chunk_count,
        estimated_size,
        "restore_local_metadata_phase_complete"
    );

    if cancel_requested.load(Ordering::Relaxed) {
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

    {
        let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
        adapter.set_master_key(Some(master_password.clone()));

        if cancel_requested.load(Ordering::Relaxed) {
            adapter.set_master_key(None);
            return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
        }

        match adapter.handle(&RpcRequest::new(
            "restore:local:validateMasterMaterial".to_string(),
            serde_json::json!({
                "master_salt": master_salt.clone(),
                "master_verify": master_verify.clone(),
            }),
        )) {
            RpcResponse::Success { result, .. } => {
                let valid =
                    parse_restore_validation_valid(&result, "restore:local:validateMasterMaterial");
                adapter.set_master_key(None);
                if !valid {
                    let warnings = result
                        .get("warnings")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null);
                    return rpc_err(
                        format!("Backup invalid: {:?}", warnings),
                        Some("INVALID_BACKUP".to_string()),
                    );
                }
            }
            RpcResponse::Error { error, code, .. } => {
                adapter.set_master_key(None);
                return RpcResult::Error {
                    ok: false,
                    error,
                    code,
                };
            }
        }
    }

    let _ = app.emit(
        "restore:progress",
        RestoreProgressEvent {
            restore_id: String::new(),
            phase: "metadata".to_string(),
            chunk_index: 0,
            chunk_count,
            bytes_written: 0,
            estimated_size,
        },
    );

    if cancel_requested.load(Ordering::Relaxed) {
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

    let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
    adapter.set_master_key(Some(master_password));

    if cancel_requested.load(Ordering::Relaxed) {
        adapter.set_master_key(None);
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

    match adapter.handle(&RpcRequest::new(
        "restore:local:validatePayload".to_string(),
        serde_json::json!({
            "metadata": metadata_b64.clone(),
            "master_salt": master_salt.clone(),
            "master_verify": master_verify.clone(),
            "manifest": manifest.clone(),
            "chunk_names": chunk_names.clone(),
        }),
    )) {
        RpcResponse::Success { result, .. } => {
            let valid = parse_restore_validation_valid(&result, "restore:local:validatePayload");
            if !valid {
                adapter.set_master_key(None);
                let warnings = result
                    .get("warnings")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                return rpc_err(
                    format!("Backup invalid: {:?}", warnings),
                    Some("INVALID_BACKUP".to_string()),
                );
            }
        }
        RpcResponse::Error { error, code, .. } => {
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error,
                code,
            };
        }
    };

    let restore_id = match adapter.handle(&RpcRequest::new(
        "restore:local:start".to_string(),
        serde_json::json!({"backup_path": source.display_path()}),
    )) {
        RpcResponse::Success { result, .. } => parse_restore_id(&result),
        RpcResponse::Error { error, code, .. } => {
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error,
                code,
            };
        }
    };

    if restore_id.is_empty() {
        adapter.set_master_key(None);
        return rpc_err("Invalid restore_id", Some("INTERNAL".to_string()));
    }

    let pack_reader = match source.read_stream_file(BACKUP_PACK_FILE_NAME) {
        Ok(reader) => reader,
        Err(error) => {
            restore_cancel_session(adapter.as_mut(), &restore_id);
            adapter.set_master_key(None);
            let message = if error == format!("{BACKUP_PACK_FILE_NAME} not found") {
                format!(
                    "Selected folder is not a current ChromVoid backup: {}. It must contain {} and {}.",
                    source.display_path(),
                    BACKUP_PACK_MANIFEST_FILE_NAME,
                    BACKUP_PACK_FILE_NAME,
                )
            } else {
                error
            };
            return rpc_err(message, Some("INVALID_BACKUP".to_string()));
        }
    };

    let _ = app.emit(
        "restore:progress",
        RestoreProgressEvent {
            restore_id: restore_id.clone(),
            phase: "chunks".to_string(),
            chunk_index: 0,
            chunk_count,
            bytes_written: 0,
            estimated_size,
        },
    );

    let bytes_read = std::sync::Arc::new(AtomicU64::new(0));
    let progress_reader = RestorePackProgressReader {
        inner: pack_reader,
        app: app.clone(),
        restore_id: restore_id.clone(),
        cancel_requested: cancel_requested.clone(),
        bytes_read: bytes_read.clone(),
        last_progress_emit: std::time::Instant::now(),
        chunk_count,
        estimated_size,
    };

    let pack_started_at = std::time::Instant::now();
    match adapter.handle_with_stream(
        &RpcRequest::new(
            "restore:local:uploadPack".to_string(),
            serde_json::json!({
                "restore_id": restore_id.clone(),
                "manifest": manifest,
            }),
        ),
        Some(RpcInputStream::new(Box::new(progress_reader))),
    ) {
        RpcReply::Json(RpcResponse::Success { .. }) => {}
        RpcReply::Json(RpcResponse::Error { error, code, .. }) => {
            restore_cancel_session(adapter.as_mut(), &restore_id);
            adapter.set_master_key(None);
            if cancel_requested.load(Ordering::Relaxed) {
                return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
            }
            return RpcResult::Error {
                ok: false,
                error,
                code,
            };
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            restore_cancel_session(adapter.as_mut(), &restore_id);
            adapter.set_master_key(None);
            return rpc_err(
                "Unexpected restore pack stream reply",
                Some("INTERNAL".to_string()),
            );
        }
    }

    let bytes_written_total = bytes_read.load(Ordering::Relaxed);
    tracing::info!(
        restore_id = %restore_id,
        elapsed_ms = pack_started_at.elapsed().as_millis() as u64,
        pack_bytes = bytes_written_total,
        chunk_count,
        estimated_size,
        "restore_local_pack_upload_complete"
    );

    if cancel_requested.load(Ordering::Relaxed) {
        restore_cancel_session(adapter.as_mut(), &restore_id);
        adapter.set_master_key(None);
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

    let _ = app.emit(
        "restore:progress",
        RestoreProgressEvent {
            restore_id: restore_id.clone(),
            phase: "finishing".to_string(),
            chunk_index: chunk_count,
            chunk_count,
            bytes_written: bytes_written_total,
            estimated_size,
        },
    );

    let res = adapter.handle(&RpcRequest::new(
        "restore:local:commit".to_string(),
        serde_json::json!({
            "restore_id": restore_id.clone(),
            "metadata": metadata_b64,
            "master_salt": master_salt,
            "master_verify": master_verify
        }),
    ));

    adapter.set_master_key(None);

    match res {
        RpcResponse::Success { result, .. } => {
            tracing::info!(
                restore_id = %restore_id,
                elapsed_ms = operation_started_at.elapsed().as_millis() as u64,
                pack_bytes = bytes_written_total,
                chunk_count,
                "restore_local_from_folder_complete"
            );
            emit_basic_state_from_locked_root(
                &app,
                storage_root.as_ref(),
                adapter.as_ref(),
                "vault: restore local",
            );
            rpc_ok(result)
        }
        RpcResponse::Error { error, code, .. } => {
            restore_cancel_session(adapter.as_mut(), &restore_id);
            RpcResult::Error {
                ok: false,
                error,
                code,
            }
        }
    }
}

fn parse_restore_validation_valid(result: &serde_json::Value, command: &str) -> bool {
    match result.get("valid") {
        Some(value) => match value.as_bool() {
            Some(value) => value,
            None => {
                tracing::warn!(
                    command,
                    "restore_local_from_folder: validation response valid field is not boolean"
                );
                false
            }
        },
        None => {
            tracing::warn!(
                command,
                "restore_local_from_folder: validation response missing valid field"
            );
            false
        }
    }
}

fn parse_restore_id(result: &serde_json::Value) -> String {
    match result.get("restore_id") {
        Some(value) => match value.as_str() {
            Some(value) => value.to_string(),
            None => {
                tracing::warn!("restore_local_from_folder: restore_id field is not a string");
                String::new()
            }
        },
        None => {
            tracing::warn!("restore_local_from_folder: start response missing restore_id field");
            String::new()
        }
    }
}

fn restore_rpc_error<T>(error: impl Into<String>, code: Option<String>) -> RpcResult<T> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code,
    }
}

fn parse_manifest_summary(manifest: &serde_json::Value) -> Result<(Vec<String>, u64, u64), String> {
    let chunks = manifest
        .get("chunks")
        .and_then(|value| value.as_array())
        .ok_or_else(|| format!("{BACKUP_PACK_MANIFEST_FILE_NAME} missing chunks"))?;
    let chunk_count = manifest
        .get("chunk_count")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| format!("{BACKUP_PACK_MANIFEST_FILE_NAME} missing chunk_count"))?;
    if chunk_count != chunks.len() as u64 {
        return Err(format!(
            "{BACKUP_PACK_MANIFEST_FILE_NAME} chunk_count mismatch"
        ));
    }
    let estimated_size = manifest
        .get("total_size")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| format!("{BACKUP_PACK_MANIFEST_FILE_NAME} missing total_size"))?;

    let mut names = Vec::with_capacity(chunks.len());
    for chunk in chunks {
        let name = chunk
            .get("name")
            .and_then(|value| value.as_str())
            .ok_or_else(|| format!("{BACKUP_PACK_MANIFEST_FILE_NAME} contains invalid chunk"))?;
        names.push(name.to_string());
    }
    Ok((names, chunk_count, estimated_size))
}

struct RestorePackProgressReader {
    inner: Box<dyn Read + Send>,
    app: tauri::AppHandle,
    restore_id: String,
    cancel_requested: Arc<AtomicBool>,
    bytes_read: Arc<AtomicU64>,
    last_progress_emit: std::time::Instant,
    chunk_count: u64,
    estimated_size: u64,
}

impl Read for RestorePackProgressReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.cancel_requested.load(Ordering::Relaxed) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "Restore cancelled by user",
            ));
        }

        let read = self.inner.read(buf)?;
        if read == 0 {
            return Ok(0);
        }

        let total = self
            .bytes_read
            .fetch_add(read as u64, Ordering::Relaxed)
            .saturating_add(read as u64);
        let now = std::time::Instant::now();
        if now.duration_since(self.last_progress_emit).as_millis() >= 120
            || total >= self.estimated_size
        {
            self.last_progress_emit = now;
            let chunk_index = if self.estimated_size > 0 && self.chunk_count > 0 {
                ((total.saturating_mul(self.chunk_count)) / self.estimated_size)
                    .min(self.chunk_count)
            } else {
                self.chunk_count
            };
            let _ = self.app.emit(
                "restore:progress",
                RestoreProgressEvent {
                    restore_id: self.restore_id.clone(),
                    phase: "chunks".to_string(),
                    chunk_index,
                    chunk_count: self.chunk_count,
                    bytes_written: total,
                    estimated_size: self.estimated_size,
                },
            );
        }
        Ok(read)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn restore_validation_valid_parser_reads_boolean() {
        assert!(parse_restore_validation_valid(
            &json!({ "valid": true }),
            "restore:test"
        ));
        assert!(!parse_restore_validation_valid(
            &json!({ "valid": false }),
            "restore:test"
        ));
    }

    #[test]
    fn restore_validation_valid_parser_defaults_malformed_to_false() {
        assert!(!parse_restore_validation_valid(
            &json!({ "valid": "yes" }),
            "restore:test"
        ));
        assert!(!parse_restore_validation_valid(&json!({}), "restore:test"));
    }

    #[test]
    fn restore_id_parser_reads_string() {
        assert_eq!(
            parse_restore_id(&json!({ "restore_id": "restore-1" })),
            "restore-1"
        );
    }

    #[test]
    fn restore_id_parser_defaults_malformed_to_empty() {
        assert!(parse_restore_id(&json!({ "restore_id": 42 })).is_empty());
        assert!(parse_restore_id(&json!({})).is_empty());
    }
}
