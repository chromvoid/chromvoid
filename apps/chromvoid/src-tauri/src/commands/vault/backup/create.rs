use super::*;

use chromvoid_core::rpc::RpcReply;

#[tauri::command]
pub(crate) fn backup_local_cancel(state: tauri::State<'_, AppState>) -> RpcResult<Value> {
    state.vault_background_io_runtime.cancel_backup();
    rpc_ok(serde_json::json!({
        "cancelled": true,
        "operation": "backup_local",
    }))
}

#[tauri::command]
pub(crate) async fn backup_local_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    master_password: String,
    target_dir: Option<String>,
) -> Result<RpcResult<BackupLocalCreated>, String> {
    if master_password.trim().is_empty() {
        return Ok(RpcResult::Error {
            ok: false,
            error: "master_password is required".to_string(),
            code: Some("BAD_REQUEST".to_string()),
        });
    }

    let target = match default_backup_target(&app, target_dir) {
        Ok(target) => target,
        Err(error) => {
            return Ok(RpcResult::Error {
                ok: false,
                error,
                code: Some("INTERNAL".to_string()),
            })
        }
    };

    let adapter = state.adapter.clone();
    let android_saf_picker_runtime = state.android_saf_picker_runtime.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();
    let cancel_requested_bg = vault_background_io_runtime.begin_backup_run();

    let out = vault_background_io_runtime
        .spawn_blocking(move || {
            backup_local_create_inner(
                app,
                adapter,
                master_password,
                target,
                cancel_requested_bg,
                android_saf_picker_runtime,
            )
        })
        .await;

    vault_background_io_runtime.finish_backup_run();

    Ok(match out {
        Ok(result) => result,
        Err(error) => {
            let (error, code) = error.into_rpc_error("Backup");
            RpcResult::Error {
                ok: false,
                error,
                code,
            }
        }
    })
}

fn backup_local_create_inner(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    master_password: String,
    target: BackupTarget,
    cancel_requested: Arc<AtomicBool>,
    #[cfg_attr(not(target_os = "android"), allow(unused_variables))]
    android_saf_picker_runtime: Arc<crate::mobile::android::AndroidSafPickerRuntimeState>,
) -> RpcResult<BackupLocalCreated> {
    let operation_started_at = std::time::Instant::now();

    if cancel_requested.load(Ordering::Relaxed) {
        return RpcResult::Error {
            ok: false,
            error: "Backup cancelled by user".to_string(),
            code: Some("CANCELLED".to_string()),
        };
    }

    let start_response = {
        let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
        adapter.handle(&RpcRequest::new(
            "backup:local:start".to_string(),
            serde_json::json!({}),
        ))
    };

    let (backup_id, estimated_size, chunk_count) = match start_response {
        RpcResponse::Success { result, .. } => match parse_backup_start_result(&result) {
            Ok(parsed) => parsed,
            Err(error) => {
                if let Some(backup_id) = result
                    .get("backup_id")
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    if let Err(cancel_error) =
                        cancel_backup_session_with_adapter(&adapter, backup_id)
                    {
                        return backup_internal_error(cancel_error);
                    }
                }
                return backup_internal_error(error);
            }
        },
        RpcResponse::Error { error, code, .. } => {
            return RpcResult::Error {
                ok: false,
                error,
                code,
            }
        }
    };

    if cancel_requested.load(Ordering::Relaxed) {
        if let Err(error) = cancel_backup_session_with_adapter(&adapter, &backup_id) {
            return backup_internal_error(error);
        }
        return RpcResult::Error {
            ok: false,
            error: "Backup cancelled by user".to_string(),
            code: Some("CANCELLED".to_string()),
        };
    }

    let _ = app.emit(
        "backup:progress",
        BackupProgressEvent {
            backup_id: backup_id.clone(),
            phase: "starting".to_string(),
            chunk_index: 0,
            chunk_count,
            bytes_written: 0,
            estimated_size,
        },
    );

    let mut sink = match create_backup_sink(target, &backup_id, &android_saf_picker_runtime) {
        Ok(sink) => sink,
        Err(error) => {
            let code = if error.to_ascii_lowercase().contains("cancel") {
                "CANCELLED"
            } else {
                "INTERNAL"
            };
            if let Err(cancel_error) = cancel_backup_session_with_adapter(&adapter, &backup_id) {
                return backup_internal_error(cancel_error);
            }
            return RpcResult::Error {
                ok: false,
                error,
                code: Some(code.to_string()),
            };
        }
    };

    if cancel_requested.load(Ordering::Relaxed) {
        if let Err(error) = abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut())) {
            return backup_internal_error(error);
        }
        return RpcResult::Error {
            ok: false,
            error: "Backup cancelled by user".to_string(),
            code: Some("CANCELLED".to_string()),
        };
    }

    let metadata_started_at = std::time::Instant::now();
    let metadata_response = {
        let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
        adapter.set_master_key(Some(master_password));
        let response = adapter.handle(&RpcRequest::new(
            "backup:local:getMetadata".to_string(),
            serde_json::json!({"backup_id": backup_id.clone()}),
        ));
        adapter.set_master_key(None);
        response
    };

    let (meta_b64, master_salt_b64, master_verify_b64) = match metadata_response {
        RpcResponse::Success { result, .. } => match parse_backup_metadata_result(&result) {
            Ok(parsed) => parsed,
            Err(error) => {
                if let Err(abort_error) =
                    abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
                {
                    return backup_internal_error(abort_error);
                }
                return backup_internal_error(error);
            }
        },
        RpcResponse::Error { error, code, .. } => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            return RpcResult::Error {
                ok: false,
                error,
                code,
            };
        }
    };

    let meta_bytes = match decode_backup_base64_field(&meta_b64, "metadata") {
        Ok(bytes) => bytes,
        Err(error) => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            return backup_internal_error(error);
        }
    };
    let master_salt_bytes = match decode_backup_base64_field(&master_salt_b64, "master_salt") {
        Ok(bytes) => bytes,
        Err(error) => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            return backup_internal_error(error);
        }
    };
    let master_verify_bytes = match decode_backup_base64_field(&master_verify_b64, "master_verify")
    {
        Ok(bytes) => bytes,
        Err(error) => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            return backup_internal_error(error);
        }
    };
    if let Err(error) = sink.write_file("metadata.enc", &meta_bytes) {
        if let Err(abort_error) =
            abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
        {
            return backup_internal_error(abort_error);
        }
        return RpcResult::Error {
            ok: false,
            error,
            code: Some("INTERNAL".to_string()),
        };
    }

    if let Err(error) = sink.write_file("master.salt", &master_salt_bytes) {
        if let Err(abort_error) =
            abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
        {
            return backup_internal_error(abort_error);
        }
        return RpcResult::Error {
            ok: false,
            error,
            code: Some("INTERNAL".to_string()),
        };
    }
    if let Err(error) = sink.write_file("master.verify", &master_verify_bytes) {
        if let Err(abort_error) =
            abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
        {
            return backup_internal_error(abort_error);
        }
        return RpcResult::Error {
            ok: false,
            error,
            code: Some("INTERNAL".to_string()),
        };
    }
    tracing::info!(
        backup_id = %backup_id,
        elapsed_ms = metadata_started_at.elapsed().as_millis() as u64,
        metadata_bytes = meta_bytes.len() as u64,
        "backup_local_metadata_phase_complete"
    );

    let _ = app.emit(
        "backup:progress",
        BackupProgressEvent {
            backup_id: backup_id.clone(),
            phase: "metadata".to_string(),
            chunk_index: 0,
            chunk_count,
            bytes_written: meta_bytes.len() as u64,
            estimated_size,
        },
    );

    let manifest_started_at = std::time::Instant::now();
    let manifest_response = {
        let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
        adapter.handle(&RpcRequest::new(
            "backup:local:getChunkManifest".to_string(),
            serde_json::json!({"backup_id": backup_id.clone()}),
        ))
    };
    let manifest = match manifest_response {
        RpcResponse::Success { result, .. } => match result.get("manifest").cloned() {
            Some(manifest) => manifest,
            None => {
                if let Err(error) =
                    abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
                {
                    return backup_internal_error(error);
                }
                return backup_internal_error("backup:local:getChunkManifest returned no manifest");
            }
        },
        RpcResponse::Error { error, code, .. } => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            return RpcResult::Error {
                ok: false,
                error,
                code,
            };
        }
    };
    let manifest_bytes = match serde_json::to_vec(&manifest) {
        Ok(bytes) => bytes,
        Err(error) => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            return backup_internal_error(format!("Invalid chunk manifest: {error}"));
        }
    };
    if let Err(error) = sink.write_file(BACKUP_PACK_MANIFEST_FILE_NAME, &manifest_bytes) {
        if let Err(abort_error) =
            abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
        {
            return backup_internal_error(abort_error);
        }
        return RpcResult::Error {
            ok: false,
            error,
            code: Some("INTERNAL".to_string()),
        };
    }
    tracing::info!(
        backup_id = %backup_id,
        elapsed_ms = manifest_started_at.elapsed().as_millis() as u64,
        manifest_bytes = manifest_bytes.len() as u64,
        chunk_count,
        estimated_size,
        "backup_local_manifest_phase_complete"
    );

    let mut bytes_written_total: u64 = meta_bytes.len() as u64 + manifest_bytes.len() as u64;
    let mut last_progress_emit = std::time::Instant::now();

    let pack_started_at = std::time::Instant::now();
    let mut pack_reader = match {
        let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
        adapter.handle_with_stream(
            &RpcRequest::new(
                "backup:local:downloadPack".to_string(),
                serde_json::json!({"backup_id": backup_id.clone()}),
            ),
            None,
        )
    } {
        RpcReply::Stream(out) => out.reader,
        RpcReply::Json(RpcResponse::Error { error, code, .. }) => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            return RpcResult::Error {
                ok: false,
                error,
                code,
            };
        }
        RpcReply::Json(RpcResponse::Success { .. }) | RpcReply::RangeStream(_) => {
            if let Err(error) = abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(error);
            }
            return backup_internal_error("Unexpected backup pack stream reply");
        }
    };

    let pack_base_bytes = bytes_written_total;
    let mut on_pack_progress = |pack_written: u64| {
        let now = std::time::Instant::now();
        if now.duration_since(last_progress_emit).as_millis() >= 120
            || pack_written >= estimated_size
        {
            last_progress_emit = now;
            let chunk_index = if estimated_size > 0 && chunk_count > 0 {
                ((pack_written.saturating_mul(chunk_count)) / estimated_size).min(chunk_count)
            } else {
                chunk_count
            };
            let _ = app.emit(
                "backup:progress",
                BackupProgressEvent {
                    backup_id: backup_id.clone(),
                    phase: "chunks".to_string(),
                    chunk_index,
                    chunk_count,
                    bytes_written: pack_base_bytes.saturating_add(pack_written),
                    estimated_size,
                },
            );
        }
    };
    let pack_written = match sink.write_stream_file(
        BACKUP_PACK_FILE_NAME,
        pack_reader.as_mut(),
        cancel_requested.as_ref(),
        &mut on_pack_progress,
    ) {
        Ok(bytes) => bytes,
        Err(error) => {
            if let Err(abort_error) =
                abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut()))
            {
                return backup_internal_error(abort_error);
            }
            let code = if error.to_ascii_lowercase().contains("cancel") {
                "CANCELLED"
            } else {
                "INTERNAL"
            };
            return RpcResult::Error {
                ok: false,
                error,
                code: Some(code.to_string()),
            };
        }
    };
    bytes_written_total = bytes_written_total.saturating_add(pack_written);
    tracing::info!(
        backup_id = %backup_id,
        elapsed_ms = pack_started_at.elapsed().as_millis() as u64,
        pack_bytes = pack_written,
        total_bytes = bytes_written_total,
        "backup_local_pack_stream_complete"
    );

    if cancel_requested.load(Ordering::Relaxed) {
        if let Err(error) = abort_backup_with_adapter(&adapter, &backup_id, Some(sink.as_mut())) {
            return backup_internal_error(error);
        }
        return RpcResult::Error {
            ok: false,
            error: "Backup cancelled by user".to_string(),
            code: Some("CANCELLED".to_string()),
        };
    }

    let _ = app.emit(
        "backup:progress",
        BackupProgressEvent {
            backup_id: backup_id.clone(),
            phase: "finishing".to_string(),
            chunk_index: chunk_count,
            chunk_count,
            bytes_written: bytes_written_total,
            estimated_size,
        },
    );

    let finish_res = {
        let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
        adapter.handle(&RpcRequest::new(
            "backup:local:finish".to_string(),
            serde_json::json!({"backup_id": backup_id.clone()}),
        ))
    };

    match finish_res {
        RpcResponse::Success { .. } => {
            let backup_dir = sink.display_path();
            #[cfg(target_os = "ios")]
            if let Err(error) = crate::mobile::ios::native_bridge::export_backup_with_files_picker(
                std::path::Path::new(&backup_dir),
            ) {
                return RpcResult::Error {
                    ok: false,
                    error,
                    code: Some("EXPORT_FAILED".to_string()),
                };
            }
            tracing::info!(
                backup_id = %backup_id,
                elapsed_ms = operation_started_at.elapsed().as_millis() as u64,
                pack_bytes = pack_written,
                total_bytes = bytes_written_total,
                chunk_count,
                "backup_local_create_complete"
            );
            rpc_ok(BackupLocalCreated {
                backup_id,
                backup_dir,
                estimated_size,
                chunk_count,
            })
        }
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
    }
}

fn parse_backup_start_result(result: &serde_json::Value) -> Result<(String, u64, u64), String> {
    let backup_id = backup_string_field(result, "backup:local:start", "backup_id")?;
    if backup_id.trim().is_empty() {
        return Err("backup:local:start returned empty backup_id".to_string());
    }
    Ok((
        backup_id,
        backup_u64_field(result, "backup:local:start", "estimated_size")?,
        backup_u64_field(result, "backup:local:start", "chunk_count")?,
    ))
}

fn parse_backup_metadata_result(
    result: &serde_json::Value,
) -> Result<(String, String, String), String> {
    Ok((
        backup_string_field(result, "backup:local:getMetadata", "metadata")?,
        backup_string_field(result, "backup:local:getMetadata", "master_salt")?,
        backup_string_field(result, "backup:local:getMetadata", "master_verify")?,
    ))
}

fn backup_string_field(
    result: &serde_json::Value,
    command: &str,
    field: &str,
) -> Result<String, String> {
    match result.get(field) {
        Some(value) => match value.as_str() {
            Some(value) => Ok(value.to_string()),
            None => {
                tracing::warn!(
                    command,
                    field,
                    "backup_local_create: response field is not a string"
                );
                Err(format!("{command} returned non-string {field}"))
            }
        },
        None => {
            tracing::warn!(
                command,
                field,
                "backup_local_create: response missing string field"
            );
            Err(format!("{command} missing {field}"))
        }
    }
}

fn backup_u64_field(result: &serde_json::Value, command: &str, field: &str) -> Result<u64, String> {
    match result.get(field) {
        Some(value) => match value.as_u64() {
            Some(value) => Ok(value),
            None => {
                tracing::warn!(
                    command,
                    field,
                    "backup_local_create: response field is not an unsigned integer"
                );
                Err(format!("{command} returned non-u64 {field}"))
            }
        },
        None => {
            tracing::warn!(
                command,
                field,
                "backup_local_create: response missing unsigned integer field"
            );
            Err(format!("{command} missing {field}"))
        }
    }
}

fn decode_backup_base64_field(value: &str, field: &str) -> Result<Vec<u8>, String> {
    use base64::engine::general_purpose;
    use base64::Engine;

    general_purpose::STANDARD
        .decode(value.as_bytes())
        .map_err(|_| format!("Invalid backup {field}"))
}

fn cancel_backup_session_with_adapter(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    backup_id: &str,
) -> Result<(), String> {
    let mut adapter = adapter
        .lock()
        .map_err(|_| "Adapter mutex poisoned".to_string())?;
    backup_cancel_session(adapter.as_mut(), backup_id);
    Ok(())
}

fn abort_backup_with_adapter(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    backup_id: &str,
    sink: Option<&mut dyn BackupSink>,
) -> Result<(), String> {
    {
        let mut adapter = adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        backup_cancel_session(adapter.as_mut(), backup_id);
    }
    if let Some(sink) = sink {
        sink.abort();
    }
    Ok(())
}

fn backup_internal_error(error: impl Into<String>) -> RpcResult<BackupLocalCreated> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code: Some("INTERNAL".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn backup_start_parser_reads_expected_fields() {
        let parsed = parse_backup_start_result(&json!({
            "backup_id": "backup-1",
            "estimated_size": 1024,
            "chunk_count": 3,
        }))
        .expect("parse start");

        assert_eq!(parsed, ("backup-1".to_string(), 1024, 3));
    }

    #[test]
    fn backup_start_parser_rejects_malformed_fields() {
        let error = parse_backup_start_result(&json!({
            "backup_id": 42,
            "estimated_size": "1024",
        }))
        .expect_err("malformed start response");

        assert!(error.contains("backup_id"));
    }

    #[test]
    fn backup_start_parser_rejects_missing_fields() {
        let error = parse_backup_start_result(&json!({
            "backup_id": "backup-1",
            "estimated_size": 1024,
        }))
        .expect_err("missing chunk_count");

        assert!(error.contains("chunk_count"));
    }

    #[test]
    fn backup_metadata_parser_reads_expected_fields() {
        let parsed = parse_backup_metadata_result(&json!({
            "metadata": "meta",
            "master_salt": "salt",
            "master_verify": "verify",
        }))
        .expect("parse metadata");

        assert_eq!(
            parsed,
            ("meta".to_string(), "salt".to_string(), "verify".to_string())
        );
    }

    #[test]
    fn backup_metadata_parser_rejects_malformed_fields() {
        let error = parse_backup_metadata_result(&json!({
            "metadata": [],
            "master_salt": "salt",
        }))
        .expect_err("malformed metadata response");

        assert!(error.contains("metadata"));
    }

    #[test]
    fn backup_metadata_parser_rejects_missing_fields() {
        let error = parse_backup_metadata_result(&json!({
            "metadata": "meta",
            "master_salt": "salt",
        }))
        .expect_err("missing master_verify");

        assert!(error.contains("master_verify"));
    }

    #[test]
    fn backup_metadata_base64_decoder_rejects_invalid_fields() {
        let error = decode_backup_base64_field("not base64!!!", "master_verify")
            .expect_err("invalid base64");

        assert_eq!(error, "Invalid backup master_verify");
    }
}
