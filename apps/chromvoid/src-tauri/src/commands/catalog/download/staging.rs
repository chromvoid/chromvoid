use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::Mutex;

use tauri::Manager;

use super::gallery::StagedCatalogFile;
use super::preview::sanitize_preview_id_segment;
use super::rpc::load_catalog_download_stream;
use super::CatalogDownloadError;

pub(super) const EXTERNAL_ACTION_STAGING_MAX_AGE_SECS: u64 = 24 * 60 * 60;
pub(super) const OPEN_EXTERNAL_STAGING_DIR: &str = "chromvoid-open";
pub(super) const SHARE_FILES_STAGING_DIR: &str = "chromvoid-share";
static STAGED_FILE_COUNTER: AtomicU64 = AtomicU64::new(1);

pub(super) fn unix_now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub(super) fn extension_for_mime_type(mime_type: &str) -> &'static str {
    match mime_type.trim().to_ascii_lowercase().as_str() {
        "image/webp" => "webp",
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/svg+xml" => "svg",
        "image/avif" => "avif",
        "image/heic" => "heic",
        "image/heif" => "heif",
        "image/bmp" => "bmp",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/mp4" => "m4a",
        "audio/wav" | "audio/x-wav" => "wav",
        "audio/ogg" => "ogg",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "application/pdf" => "pdf",
        "text/markdown" => "md",
        "text/plain" => "txt",
        _ => "bin",
    }
}

fn next_opaque_staging_id() -> String {
    format!("{:x}", STAGED_FILE_COUNTER.fetch_add(1, Ordering::Relaxed))
}

pub(super) fn opaque_staged_file_name(ts: u64, opaque_id: &str, mime_type: &str) -> String {
    format!(
        "{}_{}.{}",
        ts,
        sanitize_preview_id_segment(opaque_id),
        extension_for_mime_type(mime_type)
    )
}

pub(super) fn prune_staged_external_files(
    tmp_dir: &std::path::Path,
    now_secs: u64,
    max_age_secs: u64,
) {
    let Ok(entries) = std::fs::read_dir(tmp_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some((timestamp, _)) = name.split_once('_') else {
            continue;
        };
        let Ok(created_at) = timestamp.parse::<u64>() else {
            continue;
        };

        if now_secs.saturating_sub(created_at) <= max_age_secs {
            continue;
        }
        let _ = std::fs::remove_file(&path);
    }
}

pub(super) fn write_stream_to_staged_file<F>(
    reader: &mut dyn Read,
    file_path: &std::path::Path,
    total_bytes: u64,
    mut on_progress: F,
) -> Result<u64, CatalogDownloadError>
where
    F: FnMut(u64, u64),
{
    write_stream_to_file_atomically(
        reader,
        file_path,
        total_bytes,
        |bytes_written, total_bytes| {
            (
                format!(
                    "Incomplete write: {} of {} bytes",
                    bytes_written, total_bytes
                ),
                Some("IO".to_string()),
            )
        },
        &mut on_progress,
    )
}

pub(super) fn write_stream_to_file_atomically<F, E>(
    reader: &mut dyn Read,
    file_path: &std::path::Path,
    total_bytes: u64,
    incomplete_error: E,
    mut on_progress: F,
) -> Result<u64, CatalogDownloadError>
where
    F: FnMut(u64, u64),
    E: Fn(u64, u64) -> CatalogDownloadError,
{
    let parent = file_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| std::path::Path::new("."));
    let mut temp = tempfile::Builder::new()
        .prefix(".chromvoid-download-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|e| {
            (
                format!("Failed to create file: {e}"),
                Some("IO".to_string()),
            )
        })?;
    let bytes_written = {
        let mut writer = std::io::BufWriter::new(temp.as_file_mut());
        let mut bytes_written: u64 = 0;
        let mut buf = vec![0u8; 64 * 1024];

        loop {
            let n = reader.read(&mut buf).map_err(|e| {
                (
                    format!("Failed to read stream: {e}"),
                    Some("IO".to_string()),
                )
            })?;
            if n == 0 {
                break;
            }
            writer
                .write_all(&buf[..n])
                .map_err(|e| (format!("Failed to write file: {e}"), Some("IO".to_string())))?;
            bytes_written = bytes_written.saturating_add(n as u64);
            on_progress(bytes_written, total_bytes);
        }

        writer
            .flush()
            .map_err(|e| (format!("Failed to flush file: {e}"), Some("IO".to_string())))?;
        bytes_written
    };

    if total_bytes > 0 && bytes_written != total_bytes {
        return Err(incomplete_error(bytes_written, total_bytes));
    }

    temp.as_file_mut()
        .sync_all()
        .map_err(|e| (format!("Failed to flush file: {e}"), Some("IO".to_string())))?;
    temp.persist(file_path).map_err(|e| {
        (
            format!("Failed to write file: {}", e.error),
            Some("IO".to_string()),
        )
    })?;

    Ok(bytes_written)
}

pub(super) fn stage_catalog_download_for_external_action_in_root<F>(
    staging_root: &std::path::Path,
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    preferred_mime_type: Option<&str>,
    max_age_secs: u64,
    mut on_progress: F,
) -> Result<StagedCatalogFile, CatalogDownloadError>
where
    F: FnMut(u64, u64),
{
    let out = load_catalog_download_stream(adapter, node_id)?;
    let meta = out.meta;
    let mut reader = out.reader;

    std::fs::create_dir_all(staging_root).map_err(|e| {
        (
            format!("Failed to create cache dir: {e}"),
            Some("IO".to_string()),
        )
    })?;
    let ts = unix_now_secs();
    prune_staged_external_files(staging_root, ts, max_age_secs);
    let filename_mime_type = preferred_mime_type
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(meta.mime_type.as_str());
    let file_path = staging_root.join(opaque_staged_file_name(
        ts,
        &next_opaque_staging_id(),
        filename_mime_type,
    ));

    write_stream_to_staged_file(&mut reader, &file_path, meta.size, &mut on_progress)?;

    Ok(StagedCatalogFile {
        path: file_path,
        mime_type: meta.mime_type,
    })
}

pub(super) fn stage_catalog_download_for_external_action<F>(
    app: &tauri::AppHandle,
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    staging_dir_name: &str,
    preferred_mime_type: Option<&str>,
    max_age_secs: u64,
    on_progress: F,
) -> Result<StagedCatalogFile, CatalogDownloadError>
where
    F: FnMut(u64, u64),
{
    let cache_dir = app.path().cache_dir().map_err(|e| {
        (
            format!("Failed to resolve cache dir: {e}"),
            Some("IO".to_string()),
        )
    })?;
    let tmp_dir = cache_dir.join(staging_dir_name);
    stage_catalog_download_for_external_action_in_root(
        &tmp_dir,
        adapter,
        node_id,
        preferred_mime_type,
        max_age_secs,
        on_progress,
    )
}
