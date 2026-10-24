//! Atomic replacement for application metadata files. Callers own serialization and secrecy.
//! Parent directories must already exist; a failed parent sync is reported through tracing.

use std::io::Write;
use std::path::Path;

const TEMP_PREFIX: &str = ".chromvoid-write-";
const TEMP_SUFFIX: &str = ".tmp";

pub fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));

    let mut temp = tempfile::Builder::new()
        .prefix(TEMP_PREFIX)
        .suffix(TEMP_SUFFIX)
        .tempfile_in(parent)
        .map_err(|e| format!("create temp file: {e}"))?;
    temp.write_all(bytes)
        .map_err(|e| format!("write temp file: {e}"))?;
    temp.as_file_mut()
        .sync_all()
        .map_err(|e| format!("sync temp file: {e}"))?;
    temp.persist(path)
        .map_err(|e| format!("replace target: {}", e.error))?;
    sync_parent_dir_best_effort(parent);
    Ok(())
}

/// Used by authenticated directory erasure after all metadata writers are fenced.
/// Removes interrupted writes owned by this module; never traverses directories.
pub fn remove_temporary_files(parent: &Path) -> Result<(), String> {
    let mut failed = false;
    for entry in std::fs::read_dir(parent).map_err(|_| "Metadata directory could not be read")? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                failed = true;
                continue;
            }
        };
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if name.starts_with(TEMP_PREFIX)
            && name.ends_with(TEMP_SUFFIX)
            && std::fs::remove_file(entry.path()).is_err()
        {
            failed = true;
        }
    }
    if failed {
        Err("Temporary metadata cleanup did not finish".into())
    } else {
        Ok(())
    }
}

pub fn write_json_pretty_atomic<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value).map_err(|e| format!("serialize: {e}"))?;
    write_bytes_atomic(path, &json)
}

#[cfg(unix)]
fn sync_parent_dir_best_effort(parent: &Path) {
    if let Err(error) = std::fs::File::open(parent).and_then(|dir| dir.sync_all()) {
        tracing::debug!(
            "storage: failed to sync parent directory {}: {error}",
            parent.display()
        );
    }
}

#[cfg(not(unix))]
fn sync_parent_dir_best_effort(_parent: &Path) {}
