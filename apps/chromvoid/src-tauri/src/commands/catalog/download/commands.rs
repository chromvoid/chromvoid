use std::time::Instant;

#[cfg(desktop)]
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
#[cfg(desktop)]
use chromvoid_core::rpc::RpcReply;
use serde_json::Value;
use tauri::Emitter;
use tauri::Manager;
#[cfg(desktop)]
use tracing::info;

use crate::app_state::AppState;
use crate::helpers::touch_last_activity;
#[cfg(desktop)]
use crate::host_path_capability::HostPathPurpose;
use crate::types::*;

use super::derivatives::{
    build_core_backed_image_derivative_stream_cancellable, is_display_derivative_candidate,
};
use super::external::{open_staged_file_with_system, share_staged_files_with_system};
use super::gallery::{build_gallery_save_payload, save_gallery_payload, StagedCatalogFile};
use super::image_metadata::{load_catalog_image_metadata_cancellable, CatalogImageMetadata};
use super::preview::{
    purge_catalog_preview_cache_for_app, release_catalog_preview_file_in_root, PREVIEW_STAGING_DIR,
};
use super::rpc::{load_catalog_download_bytes, rpc_result_err, rpc_stream_err};
#[cfg(desktop)]
use super::staging::write_stream_to_file_atomically;
use super::staging::{
    stage_catalog_download_for_external_action, EXTERNAL_ACTION_STAGING_MAX_AGE_SECS,
    OPEN_EXTERNAL_STAGING_DIR, SHARE_FILES_STAGING_DIR,
};
use super::CatalogDownloadError;
use super::GallerySaveError;

fn catalog_blocking_stream_err(
    error: crate::catalog_blocking_io::CatalogBlockingIoError,
    task_label: &str,
) -> RpcResult<StreamOut> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_stream_err(error, code)
}

fn catalog_blocking_result_err<T>(
    error: crate::catalog_blocking_io::CatalogBlockingIoError,
    task_label: &str,
) -> RpcResult<T> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_result_err(error, code)
}

#[tauri::command]
pub(crate) async fn catalog_download(
    state: tauri::State<'_, AppState>,
    node_id: u64,
) -> TauriRpcResult<StreamOut> {
    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    match catalog_blocking_io_runtime
        .spawn_blocking(move || load_catalog_download_bytes(&adapter, node_id))
        .await
    {
        Ok(Ok(result)) => Ok(RpcResult::Success { ok: true, result }),
        Ok(Err((error, code))) => Ok(rpc_stream_err(error, code)),
        Err(error) => Ok(catalog_blocking_stream_err(error, "Catalog download")),
    }
}

#[tauri::command]
pub(crate) async fn catalog_preview_image(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: PreviewImageArgs,
) -> Result<RpcResult<StreamOut>, String> {
    let PreviewImageArgs {
        node_id,
        file_name,
        mime_type,
        refresh_derivative_cache,
    } = args;

    if !is_display_derivative_candidate(&file_name, mime_type.as_deref()) {
        return Ok(rpc_stream_err(
            "Preview conversion is only available for image files or embedded audio artwork",
            Some("UNSUPPORTED".to_string()),
        ));
    }

    tracing::info!(
        "perf:image_derivative event=request tier={} node_id={} source_mime_type={}",
        crate::image_preview::ImageDerivativeTier::DisplayPreview.label(),
        node_id,
        mime_type.as_deref().unwrap_or("")
    );
    let adapter = state.adapter.clone();
    let cancellation_epoch = state
        .vault_background_io_runtime
        .cancellation_epoch_handle();
    let image_preview_runtime = state.image_preview_runtime.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let app_cache_dir = app.path().app_cache_dir().ok();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || -> Result<StreamOut, CatalogDownloadError> {
            let total_started = Instant::now();
            if let Some(app_cache_dir) = app_cache_dir.as_deref() {
                let _ = image_preview_runtime.cleanup_legacy_derivative_cache_once(app_cache_dir);
            }
            let preview = build_core_backed_image_derivative_stream_cancellable(
                &adapter,
                &image_preview_runtime,
                node_id,
                &file_name,
                mime_type.as_deref(),
                crate::image_preview::ImageDerivativeTier::DisplayPreview,
                cancellation_epoch,
                refresh_derivative_cache,
            )?;
            tracing::info!(
                "perf:image_derivative event=done total_ms={} tier={} storage_version={} output_bytes={} output_mime_type={} node_id={}",
                total_started.elapsed().as_millis(),
                crate::image_preview::ImageDerivativeTier::DisplayPreview.label(),
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                preview.bytes.len(),
                preview.meta.mime_type,
                node_id,
            );
            Ok(preview)
        })
        .await;

    Ok(match out {
        Ok(Ok(result)) => RpcResult::Success { ok: true, result },
        Ok(Err((error, code))) => {
            tracing::warn!(
                "perf:image_derivative event=failed tier={} node_id={} code={:?} error={}",
                crate::image_preview::ImageDerivativeTier::DisplayPreview.label(),
                node_id,
                code,
                error
            );
            rpc_stream_err(error, code)
        }
        Err(error) => {
            tracing::warn!(
                "perf:image_derivative event=task_failed tier={} node_id={} error={}",
                crate::image_preview::ImageDerivativeTier::DisplayPreview.label(),
                node_id,
                format!("{:?}", error)
            );
            catalog_blocking_stream_err(error, "Preview")
        }
    })
}

#[tauri::command]
pub(crate) async fn catalog_thumbnail_image(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: PreviewImageArgs,
) -> Result<RpcResult<StreamOut>, String> {
    let PreviewImageArgs {
        node_id,
        file_name,
        mime_type,
        refresh_derivative_cache,
    } = args;

    if !is_display_derivative_candidate(&file_name, mime_type.as_deref()) {
        return Ok(rpc_stream_err(
            "Thumbnail conversion is only available for image files or embedded audio artwork",
            Some("UNSUPPORTED".to_string()),
        ));
    }

    tracing::info!(
        "perf:image_derivative event=request tier={} node_id={} source_mime_type={}",
        crate::image_preview::ImageDerivativeTier::Thumbnail.label(),
        node_id,
        mime_type.as_deref().unwrap_or("")
    );
    let adapter = state.adapter.clone();
    let cancellation_epoch = state
        .vault_background_io_runtime
        .cancellation_epoch_handle();
    let image_preview_runtime = state.image_preview_runtime.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let app_cache_dir = app.path().app_cache_dir().ok();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || -> Result<StreamOut, CatalogDownloadError> {
            let total_started = Instant::now();
            if let Some(app_cache_dir) = app_cache_dir.as_deref() {
                let _ = image_preview_runtime.cleanup_legacy_derivative_cache_once(app_cache_dir);
            }
            let thumbnail = build_core_backed_image_derivative_stream_cancellable(
                &adapter,
                &image_preview_runtime,
                node_id,
                &file_name,
                mime_type.as_deref(),
                crate::image_preview::ImageDerivativeTier::Thumbnail,
                cancellation_epoch,
                refresh_derivative_cache,
            )?;
            tracing::info!(
                "perf:image_derivative event=done total_ms={} tier={} storage_version={} output_bytes={} output_mime_type={} node_id={}",
                total_started.elapsed().as_millis(),
                crate::image_preview::ImageDerivativeTier::Thumbnail.label(),
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                thumbnail.bytes.len(),
                thumbnail.meta.mime_type,
                node_id,
            );
            Ok(thumbnail)
        })
        .await;

    Ok(match out {
        Ok(Ok(result)) => RpcResult::Success { ok: true, result },
        Ok(Err((error, code))) => {
            tracing::warn!(
                "perf:image_derivative event=failed tier={} node_id={} code={:?} error={}",
                crate::image_preview::ImageDerivativeTier::Thumbnail.label(),
                node_id,
                code,
                error
            );
            rpc_stream_err(error, code)
        }
        Err(error) => {
            tracing::warn!(
                "perf:image_derivative event=task_failed tier={} node_id={} error={}",
                crate::image_preview::ImageDerivativeTier::Thumbnail.label(),
                node_id,
                format!("{:?}", error)
            );
            catalog_blocking_stream_err(error, "Thumbnail")
        }
    })
}

#[tauri::command]
pub(crate) async fn catalog_image_metadata(
    state: tauri::State<'_, AppState>,
    args: PreviewImageArgs,
) -> Result<RpcResult<CatalogImageMetadata>, String> {
    let adapter = state.adapter.clone();
    let cancellation_epoch = state
        .vault_background_io_runtime
        .cancellation_epoch_handle();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let started = Instant::now();
    let node_id = args.node_id;
    tracing::info!(
        "perf:source_metadata event=start command=catalog_image_metadata node_id={} file_name={} mime_type={}",
        node_id,
        args.file_name.as_str(),
        args.mime_type.as_deref().unwrap_or("")
    );
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || {
            load_catalog_image_metadata_cancellable(&adapter, args, cancellation_epoch)
        })
        .await;

    Ok(match out {
        Ok(Ok(result)) => {
            tracing::info!(
                "perf:source_metadata event=done command=catalog_image_metadata node_id={} duration_ms={} source_revision={}",
                node_id,
                started.elapsed().as_millis(),
                result.source_revision.unwrap_or(0)
            );
            RpcResult::Success { ok: true, result }
        }
        Ok(Err((error, code))) => {
            tracing::warn!(
                "perf:source_metadata event=failed command=catalog_image_metadata node_id={} duration_ms={} code={:?} error={}",
                node_id,
                started.elapsed().as_millis(),
                code,
                error
            );
            rpc_result_err(error, code)
        }
        Err(error) => {
            tracing::warn!(
                "perf:source_metadata event=task_failed command=catalog_image_metadata node_id={} duration_ms={} error={}",
                node_id,
                started.elapsed().as_millis(),
                format!("{:?}", error)
            );
            catalog_blocking_result_err(error, "Image metadata")
        }
    })
}

#[tauri::command]
pub(crate) async fn prepare_catalog_preview_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: PreparePreviewFileArgs,
) -> Result<RpcResult<PreparedPreviewFileResult>, String> {
    touch_last_activity(&state.last_activity, "prepare_catalog_preview_file");

    let adapter = state.adapter.clone();
    let cancellation_epoch = state
        .vault_background_io_runtime
        .cancellation_epoch_handle();
    let image_preview_runtime = state.image_preview_runtime.clone();
    let prepared_preview_runtime = state.prepared_preview_runtime.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let preview_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {error}"))?
        .join(PREVIEW_STAGING_DIR);

    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || {
            super::preview::prepare_catalog_preview_file_in_root_cancellable(
                &preview_root,
                &adapter,
                &image_preview_runtime,
                &prepared_preview_runtime,
                args,
                cancellation_epoch,
            )
        })
        .await;

    Ok(match out {
        Ok(Ok(result)) => {
            tracing::info!(
                "perf:prepared_source event=done command=prepare_catalog_preview_file preview_id={} size={}",
                result.preview_id,
                result.size
            );
            rpc_ok(result)
        }
        Ok(Err((error, code))) => rpc_result_err(error, code),
        Err(error) => catalog_blocking_result_err(error, "Preview staging"),
    })
}

#[tauri::command]
pub(crate) async fn release_catalog_preview_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: ReleasePreviewFileArgs,
) -> Result<RpcResult<Value>, String> {
    let prepared_preview_runtime = state.prepared_preview_runtime.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let preview_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {error}"))?
        .join(PREVIEW_STAGING_DIR);

    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || {
            release_catalog_preview_file_in_root(
                &preview_root,
                Some(prepared_preview_runtime.as_ref()),
                args,
            )
        })
        .await;

    Ok(match out {
        Ok(Ok(())) => rpc_ok(serde_json::json!({"released": true})),
        Ok(Err((error, code))) => rpc_err(error, code),
        Err(error) => catalog_blocking_result_err(error, "Preview release"),
    })
}

#[tauri::command]
pub(crate) async fn purge_catalog_preview_cache(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: PurgePreviewCacheArgs,
) -> Result<RpcResult<PurgePreviewCacheResult>, String> {
    let reason = args.reason.trim().to_string();
    let reason = if reason.is_empty() {
        "unspecified".to_string()
    } else {
        reason
    };

    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || purge_catalog_preview_cache_for_app(&app, &reason))
        .await;

    Ok(match out {
        Ok(Ok(result)) => rpc_ok(result),
        Ok(Err(error)) => rpc_result_err(error, Some("IO".to_string())),
        Err(error) => catalog_blocking_result_err(error, "Preview cache purge"),
    })
}

#[tauri::command]
pub(crate) async fn catalog_save_image_to_gallery(
    state: tauri::State<'_, AppState>,
    args: SaveImageToGalleryArgs,
) -> Result<RpcResult<SaveImageToGalleryResult>, String> {
    let SaveImageToGalleryArgs {
        node_id,
        file_name,
        mime_type,
    } = args;

    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(
            move || -> Result<SaveImageToGalleryResult, GallerySaveError> {
                let source = load_catalog_download_bytes(&adapter, node_id)?;
                let payload = build_gallery_save_payload(source, &file_name, mime_type.as_deref());
                save_gallery_payload(payload)
            },
        )
        .await;

    Ok(match out {
        Ok(Ok(result)) => rpc_ok(result),
        Ok(Err((error, code))) => rpc_result_err(error, code),
        Err(error) => catalog_blocking_result_err(error, "Save-to-gallery"),
    })
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn catalog_download_path(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: DownloadPathArgs,
) -> Result<RpcResult<DownloadPathResult>, String> {
    let DownloadPathArgs {
        node_id,
        target_path_token,
        download_id,
    } = args;

    let target_path = match state
        .host_path_capabilities
        .consume(&target_path_token, HostPathPurpose::Download)
    {
        Ok(path) => path,
        Err(error) => {
            return Ok(rpc_result_err(
                error,
                Some("INVALID_PATH_TOKEN".to_string()),
            ))
        }
    };

    touch_last_activity(&state.last_activity, "catalog_download_path");
    info!(
        "catalog_download_path: start node_id={} target_path={}",
        node_id,
        target_path.display()
    );

    let adapter = state.adapter.clone();
    let app2 = app.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    let out = catalog_blocking_io_runtime.spawn_blocking(move || -> Result<DownloadPathResult, (String, Option<String>)> {
        let reply = {
            let mut adapter = adapter
                .lock()
                .map_err(|_| ("Adapter mutex poisoned".to_string(), Some("INTERNAL".to_string())))?;
            let req = RpcRequest::new(
                "catalog:download".to_string(),
                serde_json::json!({ "node_id": node_id }),
            );
            adapter.handle_with_stream(&req, None)
        };

        match reply {
            RpcReply::Json(resp) => match resp {
                RpcResponse::Success { .. } => {
                    Err(("Unexpected JSON reply".to_string(), Some("INTERNAL".to_string())))
                }
                RpcResponse::Error { error, code, .. } => Err((error, code)),
            },
            RpcReply::Stream(out) => {
                let meta = out.meta;
                let total_bytes = meta.size;
                let mut reader = out.reader;

                let mut last_emit = std::time::Instant::now();
                let bytes_written = write_stream_to_file_atomically(
                    &mut reader,
                    target_path.as_path(),
                    total_bytes,
                    |bytes_written, total_bytes| {
                        tracing::error!(
                            "catalog_download_path: incomplete node_id={} wrote={} expected={} target_path={}",
                            node_id, bytes_written, total_bytes, target_path.display()
                        );
                        (
                            format!(
                                "Download incomplete: wrote {bytes_written} of {total_bytes} bytes"
                            ),
                            Some("INCOMPLETE".to_string()),
                        )
                    },
                    |bytes_written, total_bytes| {
                        let now = std::time::Instant::now();
                        if now.duration_since(last_emit).as_millis() >= 120
                            || (total_bytes > 0 && bytes_written >= total_bytes)
                        {
                            last_emit = now;
                            let _ = app2.emit(
                                "download:progress",
                                serde_json::json!({
                                    "downloadId": download_id.clone(),
                                    "nodeId": node_id,
                                    "writtenBytes": bytes_written,
                                    "totalBytes": total_bytes,
                                }),
                            );
                        }
                    },
                )?;

                info!(
                    "catalog_download_path: done node_id={} bytes_written={} target_path={}",
                    node_id, bytes_written, target_path.display()
                );
                Ok(DownloadPathResult {
                    bytes_written,
                    name: meta.name,
                    mime_type: meta.mime_type,
                })
            }
            RpcReply::RangeStream(_) => Err((
                "Unexpected range stream reply".to_string(),
                Some("INTERNAL".to_string()),
            )),
        }
    })
    .await;

    Ok(match out {
        Ok(Ok(result)) => rpc_ok(result),
        Ok(Err((msg, code))) => RpcResult::Error {
            ok: false,
            error: msg,
            code,
        },
        Err(error) => catalog_blocking_result_err(error, "Download"),
    })
}

#[tauri::command]
pub(crate) async fn catalog_open_external(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: OpenExternalArgs,
) -> Result<RpcResult<Value>, String> {
    let OpenExternalArgs { node_id, open_id } = args;

    touch_last_activity(&state.last_activity, "catalog_open_external");

    let adapter = state.adapter.clone();
    let app2 = app.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    let out = catalog_blocking_io_runtime
        .spawn_blocking(
            move || -> Result<(std::path::PathBuf, String), (String, Option<String>)> {
                let mut last_emit = std::time::Instant::now();
                let staged = stage_catalog_download_for_external_action(
                    &app2,
                    &adapter,
                    node_id,
                    OPEN_EXTERNAL_STAGING_DIR,
                    None,
                    EXTERNAL_ACTION_STAGING_MAX_AGE_SECS,
                    |bytes_written, total_bytes| {
                        if let Some(ref open_id) = open_id {
                            let now = std::time::Instant::now();
                            if now.duration_since(last_emit).as_millis() >= 120
                                || (total_bytes > 0 && bytes_written >= total_bytes)
                            {
                                last_emit = now;
                                let _ = app2.emit(
                                    "open_external:progress",
                                    serde_json::json!({
                                        "openId": open_id,
                                        "nodeId": node_id,
                                        "writtenBytes": bytes_written,
                                        "totalBytes": total_bytes,
                                    }),
                                );
                            }
                        }
                    },
                )?;

                Ok((staged.path, staged.mime_type))
            },
        )
        .await;

    match out {
        Ok(Ok((path, mime_type))) => {
            if let Err(e) = open_staged_file_with_system(&path, &mime_type) {
                return Ok(rpc_err(e, Some("OPEN_FAILED".to_string())));
            }
            Ok(rpc_ok(serde_json::json!({
                "path": path.to_string_lossy().to_string()
            })))
        }
        Ok(Err((msg, code))) => Ok(rpc_err(msg, code)),
        Err(error) => Ok(catalog_blocking_result_err(error, "Open")),
    }
}

#[tauri::command]
pub(crate) async fn catalog_share_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: ShareFilesArgs,
) -> Result<RpcResult<Value>, String> {
    let ShareFilesArgs { items } = args;

    touch_last_activity(&state.last_activity, "catalog_share_files");

    if items.is_empty() {
        return Ok(rpc_result_err(
            "No files provided for sharing",
            Some("INVALID".to_string()),
        ));
    }

    let adapter = state.adapter.clone();
    let app2 = app.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || -> Result<(), CatalogDownloadError> {
            let mut staged_files = Vec::with_capacity(items.len());

            for item in items {
                let ShareFileItemArgs {
                    node_id,
                    file_name: _display_name_hint,
                    mime_type,
                } = item;
                let requested_mime_type = mime_type
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty());
                let staged = stage_catalog_download_for_external_action(
                    &app2,
                    &adapter,
                    node_id,
                    SHARE_FILES_STAGING_DIR,
                    requested_mime_type,
                    EXTERNAL_ACTION_STAGING_MAX_AGE_SECS,
                    |_bytes_written, _total_bytes| {},
                )?;

                let share_mime_type = requested_mime_type
                    .unwrap_or(staged.mime_type.as_str())
                    .to_string();

                staged_files.push(StagedCatalogFile {
                    path: staged.path,
                    mime_type: share_mime_type,
                });
            }

            share_staged_files_with_system(&staged_files)
                .map_err(|error| (error, Some("SHARE_FAILED".to_string())))
        })
        .await;

    Ok(match out {
        Ok(Ok(())) => rpc_ok(serde_json::json!({"shared": true})),
        Ok(Err((msg, code))) => rpc_err(msg, code),
        Err(error) => catalog_blocking_result_err(error, "Share"),
    })
}
