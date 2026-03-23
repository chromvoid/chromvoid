use super::*;

#[tauri::command]
pub(crate) fn restore_local_cancel(state: tauri::State<'_, AppState>) -> RpcResult<Value> {
    state
        .restore_cancel_requested
        .store(true, Ordering::Relaxed);
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
    backup_path: String,
) -> Result<RpcResult<Value>, String> {
    if master_password.trim().is_empty() {
        return Ok(rpc_err(
            "master_password is required",
            Some("BAD_REQUEST".to_string()),
        ));
    }

    let path = PathBuf::from(&backup_path);
    if !path.exists() {
        return Ok(rpc_err(
            "Backup path does not exist",
            Some("BAD_REQUEST".to_string()),
        ));
    }

    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let cancel_requested = state.restore_cancel_requested.clone();
    cancel_requested.store(false, Ordering::Relaxed);
    let cancel_requested_bg = cancel_requested.clone();

    let out = tauri::async_runtime::spawn_blocking(move || {
        restore_local_from_folder_inner(
            app,
            adapter,
            storage_root,
            master_password,
            backup_path,
            cancel_requested_bg,
        )
    })
    .await;

    cancel_requested.store(false, Ordering::Relaxed);

    Ok(match out {
        Ok(result) => result,
        Err(e) => rpc_err(
            format!("Restore task failed: {e}"),
            Some("INTERNAL".to_string()),
        ),
    })
}

fn restore_local_from_folder_inner(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    storage_root: Arc<Mutex<PathBuf>>,
    master_password: String,
    backup_path: String,
    cancel_requested: Arc<AtomicBool>,
) -> RpcResult<Value> {
    use base64::engine::general_purpose;
    use base64::Engine;

    let path = PathBuf::from(&backup_path);
    let mut chunk_files: Vec<(String, PathBuf)> = Vec::new();
    let chunks_dir = path.join("chunks");
    if chunks_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&chunks_dir) {
            for entry in entries.flatten() {
                let Ok(ft) = entry.file_type() else { continue };
                if !ft.is_dir() {
                    continue;
                }
                if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                    for sub_entry in sub_entries.flatten() {
                        let Ok(sub_ft) = sub_entry.file_type() else {
                            continue;
                        };
                        if !sub_ft.is_file() {
                            continue;
                        }
                        let chunk_name = sub_entry.file_name().to_string_lossy().to_string();
                        chunk_files.push((chunk_name, sub_entry.path()));
                    }
                }
            }
        }
    }
    chunk_files.sort_by(|a, b| a.0.cmp(&b.0));

    if cancel_requested.load(Ordering::Relaxed) {
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

    let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
    adapter.set_master_key(Some(master_password));

    if cancel_requested.load(Ordering::Relaxed) {
        adapter.set_master_key(None);
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

    let backup_path_arg = backup_path.clone();
    match adapter.handle(&RpcRequest::new(
        "restore:local:validate".to_string(),
        serde_json::json!({"backup_path": backup_path_arg}),
    )) {
        RpcResponse::Success { result, .. } => {
            let valid = result
                .get("valid")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
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
        serde_json::json!({"backup_path": backup_path}),
    )) {
        RpcResponse::Success { result, .. } => result
            .get("restore_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
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

    for (i, (chunk_name, chunk_path)) in chunk_files.iter().enumerate() {
        if cancel_requested.load(Ordering::Relaxed) {
            restore_cancel_session(adapter.as_mut(), &restore_id);
            adapter.set_master_key(None);
            return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
        }

        let bytes = match std::fs::read(chunk_path) {
            Ok(b) => b,
            Err(e) => {
                restore_cancel_session(adapter.as_mut(), &restore_id);
                adapter.set_master_key(None);
                return rpc_err(
                    format!("Failed to read chunk file: {e}"),
                    Some("INTERNAL".to_string()),
                );
            }
        };

        let data_b64 = general_purpose::STANDARD.encode(&bytes);
        let is_last = i + 1 == chunk_files.len();
        match adapter.handle(&RpcRequest::new(
            "restore:local:uploadChunk".to_string(),
            serde_json::json!({
                "restore_id": restore_id.clone(),
                "chunk_index": i as u64,
                "chunk_name": chunk_name,
                "data": data_b64,
                "is_last": is_last,
            }),
        )) {
            RpcResponse::Success { .. } => {}
            RpcResponse::Error { error, code, .. } => {
                restore_cancel_session(adapter.as_mut(), &restore_id);
                adapter.set_master_key(None);
                return RpcResult::Error {
                    ok: false,
                    error,
                    code,
                };
            }
        }
    }

    if cancel_requested.load(Ordering::Relaxed) {
        restore_cancel_session(adapter.as_mut(), &restore_id);
        adapter.set_master_key(None);
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

    let metadata_path = path.join("metadata.enc");
    let metadata_bytes = match std::fs::read(metadata_path) {
        Ok(b) => b,
        Err(e) => {
            restore_cancel_session(adapter.as_mut(), &restore_id);
            adapter.set_master_key(None);
            return rpc_err(
                format!("Failed to read metadata: {e}"),
                Some("INTERNAL".to_string()),
            );
        }
    };
    let metadata_b64 = general_purpose::STANDARD.encode(&metadata_bytes);

    let master_salt_path = path.join("master.salt");
    let master_salt = if master_salt_path.exists() {
        std::fs::read(master_salt_path)
            .ok()
            .map(|b| general_purpose::STANDARD.encode(b))
    } else {
        None
    };

    let master_verify_path = path.join("master.verify");
    let master_verify = if master_verify_path.exists() {
        std::fs::read(master_verify_path)
            .ok()
            .map(|b| general_purpose::STANDARD.encode(b))
    } else {
        None
    };

    if cancel_requested.load(Ordering::Relaxed) {
        restore_cancel_session(adapter.as_mut(), &restore_id);
        adapter.set_master_key(None);
        return rpc_err("Restore cancelled by user", Some("CANCELLED".to_string()));
    }

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
            let storage_root = storage_root.lock().map(|p| p.clone()).unwrap_or_default();
            emit_basic_state(&app, &storage_root, adapter.as_ref());
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
