use super::*;

use tauri::Manager;

#[tauri::command]
pub(crate) fn backup_local_cancel(state: tauri::State<'_, AppState>) -> RpcResult<Value> {
    state.backup_cancel_requested.store(true, Ordering::Relaxed);
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

    let parent_dir = if let Some(d) = target_dir {
        PathBuf::from(d)
    } else {
        match app.path().app_data_dir() {
            Ok(p) => p.join("backups"),
            Err(e) => {
                return Ok(RpcResult::Error {
                    ok: false,
                    error: format!("app_data_dir: {e}"),
                    code: Some("INTERNAL".to_string()),
                })
            }
        }
    };

    let _ = std::fs::create_dir_all(&parent_dir);
    let adapter = state.adapter.clone();
    let cancel_requested = state.backup_cancel_requested.clone();
    cancel_requested.store(false, Ordering::Relaxed);
    let cancel_requested_bg = cancel_requested.clone();

    let out = tauri::async_runtime::spawn_blocking(move || {
        backup_local_create_inner(
            app,
            adapter,
            master_password,
            parent_dir,
            cancel_requested_bg,
        )
    })
    .await;

    cancel_requested.store(false, Ordering::Relaxed);

    Ok(match out {
        Ok(result) => result,
        Err(e) => RpcResult::Error {
            ok: false,
            error: format!("Backup task failed: {e}"),
            code: Some("INTERNAL".to_string()),
        },
    })
}

fn backup_local_create_inner(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    master_password: String,
    parent_dir: PathBuf,
    cancel_requested: Arc<AtomicBool>,
) -> RpcResult<BackupLocalCreated> {
    if cancel_requested.load(Ordering::Relaxed) {
        return RpcResult::Error {
            ok: false,
            error: "Backup cancelled by user".to_string(),
            code: Some("CANCELLED".to_string()),
        };
    }

    let mut adapter = lock_or_rpc_err!(adapter, "Adapter");
    adapter.set_master_key(Some(master_password));

    if cancel_requested.load(Ordering::Relaxed) {
        adapter.set_master_key(None);
        return RpcResult::Error {
            ok: false,
            error: "Backup cancelled by user".to_string(),
            code: Some("CANCELLED".to_string()),
        };
    }

    let backup_id: String;
    let estimated_size: u64;
    let chunk_count: u64;

    match adapter.handle(&RpcRequest::new(
        "backup:local:start".to_string(),
        serde_json::json!({}),
    )) {
        RpcResponse::Success { result, .. } => {
            backup_id = result
                .get("backup_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            estimated_size = result
                .get("estimated_size")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            chunk_count = result
                .get("chunk_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
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

    if backup_id.is_empty() {
        adapter.set_master_key(None);
        return RpcResult::Error {
            ok: false,
            error: "Invalid backup_id".to_string(),
            code: Some("INTERNAL".to_string()),
        };
    }

    if cancel_requested.load(Ordering::Relaxed) {
        backup_cancel_session(adapter.as_mut(), &backup_id);
        adapter.set_master_key(None);
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

    let backup_dir = parent_dir.join(&backup_id);
    let chunks_dir = backup_dir.join("chunks");
    if let Err(e) = std::fs::create_dir_all(&chunks_dir) {
        abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
        adapter.set_master_key(None);
        return RpcResult::Error {
            ok: false,
            error: format!("Failed to create backup directory: {e}"),
            code: Some("INTERNAL".to_string()),
        };
    }

    if cancel_requested.load(Ordering::Relaxed) {
        abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
        adapter.set_master_key(None);
        return RpcResult::Error {
            ok: false,
            error: "Backup cancelled by user".to_string(),
            code: Some("CANCELLED".to_string()),
        };
    }

    let (meta_b64, master_salt_b64, master_verify_b64) = match adapter.handle(&RpcRequest::new(
        "backup:local:getMetadata".to_string(),
        serde_json::json!({"backup_id": backup_id.clone()}),
    )) {
        RpcResponse::Success { result, .. } => {
            let m = result
                .get("metadata")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let s = result
                .get("master_salt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let v = result
                .get("master_verify")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            (m, s, v)
        }
        RpcResponse::Error { error, code, .. } => {
            abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error,
                code,
            };
        }
    };

    use base64::engine::general_purpose;
    use base64::Engine;

    let meta_bytes = match general_purpose::STANDARD.decode(meta_b64.as_bytes()) {
        Ok(b) => b,
        Err(_) => {
            abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error: "Invalid backup metadata".to_string(),
                code: Some("INTERNAL".to_string()),
            };
        }
    };
    if let Err(e) = std::fs::write(backup_dir.join("metadata.enc"), &meta_bytes) {
        abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
        adapter.set_master_key(None);
        return RpcResult::Error {
            ok: false,
            error: format!("Failed to write metadata.enc: {e}"),
            code: Some("INTERNAL".to_string()),
        };
    }

    if let Ok(bytes) = general_purpose::STANDARD.decode(master_salt_b64.as_bytes()) {
        if let Err(e) = std::fs::write(backup_dir.join("master.salt"), &bytes) {
            abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error: format!("Failed to write master.salt: {e}"),
                code: Some("INTERNAL".to_string()),
            };
        }
    }
    if let Ok(bytes) = general_purpose::STANDARD.decode(master_verify_b64.as_bytes()) {
        if let Err(e) = std::fs::write(backup_dir.join("master.verify"), &bytes) {
            abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error: format!("Failed to write master.verify: {e}"),
                code: Some("INTERNAL".to_string()),
            };
        }
    }

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

    let mut bytes_written_total: u64 = meta_bytes.len() as u64;
    let mut last_progress_emit = std::time::Instant::now();

    for i in 0..chunk_count {
        if cancel_requested.load(Ordering::Relaxed) {
            abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error: "Backup cancelled by user".to_string(),
                code: Some("CANCELLED".to_string()),
            };
        }

        let resp = adapter.handle(&RpcRequest::new(
            "backup:local:downloadChunk".to_string(),
            serde_json::json!({"backup_id": backup_id.clone(), "chunk_index": i}),
        ));
        let (chunk_name, data_b64) = match resp {
            RpcResponse::Success { result, .. } => {
                let name = result
                    .get("chunk_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let data = result
                    .get("data")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                (name, data)
            }
            RpcResponse::Error { error, code, .. } => {
                abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
                adapter.set_master_key(None);
                return RpcResult::Error {
                    ok: false,
                    error,
                    code,
                };
            }
        };

        let bytes = match general_purpose::STANDARD.decode(data_b64.as_bytes()) {
            Ok(b) => b,
            Err(_) => {
                abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
                adapter.set_master_key(None);
                return RpcResult::Error {
                    ok: false,
                    error: "Invalid base64 chunk".to_string(),
                    code: Some("INTERNAL".to_string()),
                };
            }
        };

        let prefix = chunk_name.chars().next().unwrap_or('_');
        let bucket = chunks_dir.join(prefix.to_string());
        if let Err(e) = std::fs::create_dir_all(&bucket) {
            abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error: format!("Failed to create chunk bucket: {e}"),
                code: Some("INTERNAL".to_string()),
            };
        }
        if let Err(e) = std::fs::write(bucket.join(&chunk_name), &bytes) {
            abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
            adapter.set_master_key(None);
            return RpcResult::Error {
                ok: false,
                error: format!("Failed to write chunk: {e}"),
                code: Some("INTERNAL".to_string()),
            };
        }

        bytes_written_total += bytes.len() as u64;

        let now = std::time::Instant::now();
        if now.duration_since(last_progress_emit).as_millis() >= 120 || i + 1 == chunk_count {
            last_progress_emit = now;
            let _ = app.emit(
                "backup:progress",
                BackupProgressEvent {
                    backup_id: backup_id.clone(),
                    phase: "chunks".to_string(),
                    chunk_index: i + 1,
                    chunk_count,
                    bytes_written: bytes_written_total,
                    estimated_size,
                },
            );
        }
    }

    if cancel_requested.load(Ordering::Relaxed) {
        abort_backup(adapter.as_mut(), &backup_id, Some(&backup_dir));
        adapter.set_master_key(None);
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

    let finish_res = adapter.handle(&RpcRequest::new(
        "backup:local:finish".to_string(),
        serde_json::json!({"backup_id": backup_id.clone()}),
    ));

    adapter.set_master_key(None);

    match finish_res {
        RpcResponse::Success { .. } => rpc_ok(BackupLocalCreated {
            backup_id,
            backup_dir: backup_dir.to_string_lossy().to_string(),
            estimated_size,
            chunk_count,
        }),
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
    }
}
