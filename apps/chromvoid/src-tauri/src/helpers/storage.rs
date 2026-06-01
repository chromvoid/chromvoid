use std::io::Write;
use std::path::Path;

use serde::de::DeserializeOwned;
use tauri::Emitter;

use crate::core_adapter::CoreAdapter;
use crate::types::StorageConfig;

pub(crate) fn load_storage_root(data_dir: &std::path::Path) -> std::path::PathBuf {
    let default_root = data_dir.join("storage");
    let cfg_path = data_dir.join("storage.json");
    let bytes = match std::fs::read(&cfg_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!(
                    "storage: failed to read storage root config {}: {error}",
                    cfg_path.display()
                );
            }
            return default_root;
        }
    };
    let cfg = match serde_json::from_slice::<StorageConfig>(&bytes) {
        Ok(cfg) => cfg,
        Err(error) => {
            tracing::warn!(
                "storage: failed to parse storage root config {}: {error}",
                cfg_path.display()
            );
            return default_root;
        }
    };
    let s = cfg.storage_root.trim();
    if s.is_empty() {
        return default_root;
    }
    std::path::PathBuf::from(s)
}

pub(crate) fn save_storage_root(
    data_dir: &std::path::Path,
    storage_root: &std::path::Path,
) -> Result<(), String> {
    let cfg_path = data_dir.join("storage.json");
    let cfg = StorageConfig {
        storage_root: storage_root.to_string_lossy().to_string(),
    };
    write_json_pretty_atomic(&cfg_path, &cfg)
}

pub(crate) fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));

    let mut temp = tempfile::Builder::new()
        .prefix(".chromvoid-write-")
        .suffix(".tmp")
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

pub(crate) fn write_json_pretty_atomic<T: serde::Serialize>(
    path: &Path,
    value: &T,
) -> Result<(), String> {
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

pub(crate) fn read_json_or_default<T>(path: &Path, context: &str) -> T
where
    T: DeserializeOwned + Default,
{
    read_optional_json(path, context).unwrap_or_default()
}

pub(crate) fn read_optional_json<T>(path: &Path, context: &str) -> Option<T>
where
    T: DeserializeOwned,
{
    let contents = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                tracing::warn!("{context}: failed to read JSON {}: {error}", path.display());
            }
            return None;
        }
    };

    match serde_json::from_str(&contents) {
        Ok(value) => Some(value),
        Err(error) => {
            tracing::warn!(
                "{context}: failed to parse JSON {}: {error}",
                path.display()
            );
            None
        }
    }
}

pub(crate) fn emit_basic_state(
    app: &tauri::AppHandle,
    storage_root: &std::path::Path,
    adapter: &dyn CoreAdapter,
) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let master_verify = storage_root.join("master.verify").is_file();
    let need_user_init = !master_verify;

    let _ = app.emit(
        "update:state",
        serde_json::json!({
            "TS": ts,
            "SerialNum": "local",
            "PhysicalFreeSpaceMB": 0,
            "PhysicalTotalSpaceMB": 0,
            "StorePath": storage_root.to_string_lossy(),
            "NeedUserInitialization": need_user_init,
            "StorageOpened": adapter.is_unlocked(),
        }),
    );

    crate::ios_keep_awake::sync_ios_idle_timer(app, adapter);
}

pub(crate) fn emit_basic_state_from_locked_root(
    app: &tauri::AppHandle,
    storage_root: &std::sync::Mutex<std::path::PathBuf>,
    adapter: &dyn CoreAdapter,
    context: &str,
) {
    match storage_root.lock() {
        Ok(storage_root) => emit_basic_state(app, &storage_root, adapter),
        Err(_) => {
            tracing::warn!("{context}: storage root mutex poisoned; skipping basic state emit");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::ser::{Serialize, Serializer};

    #[test]
    fn atomic_write_creates_and_overwrites_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("data.json");

        write_bytes_atomic(&path, b"first").expect("first write");
        assert_eq!(std::fs::read(&path).expect("read first"), b"first");

        write_bytes_atomic(&path, b"second").expect("second write");
        assert_eq!(std::fs::read(&path).expect("read second"), b"second");
    }

    #[test]
    fn atomic_json_write_preserves_pretty_json() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("data.json");
        let value = serde_json::json!({"b": 2, "a": 1});

        write_json_pretty_atomic(&path, &value).expect("json write");

        let contents = std::fs::read_to_string(&path).expect("read json");
        assert!(contents.contains('\n'));
        let parsed: serde_json::Value = serde_json::from_str(&contents).expect("parse json");
        assert_eq!(parsed, value);
    }

    #[test]
    fn atomic_json_write_returns_serialize_error_without_creating_target() {
        struct FailingSerialize;

        impl Serialize for FailingSerialize {
            fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                Err(serde::ser::Error::custom("intentional failure"))
            }
        }

        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("data.json");

        let error = write_json_pretty_atomic(&path, &FailingSerialize).expect_err("serialize");

        assert!(error.contains("serialize"));
        assert!(!path.exists());
    }

    #[test]
    fn save_storage_root_writes_config() {
        let dir = tempfile::tempdir().expect("tempdir");
        let storage_root = dir.path().join("vault");

        save_storage_root(dir.path(), &storage_root).expect("save storage root");

        let loaded = load_storage_root(dir.path());
        assert_eq!(loaded, storage_root);
    }

    #[test]
    fn load_storage_root_falls_back_on_invalid_config() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("storage.json"), b"{").expect("invalid config written");

        let loaded = load_storage_root(dir.path());

        assert_eq!(loaded, dir.path().join("storage"));
    }

    #[test]
    fn read_json_or_default_falls_back_on_invalid_json() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("data.json");
        std::fs::write(&path, b"{").expect("invalid json written");

        let loaded: serde_json::Map<String, serde_json::Value> =
            read_json_or_default(&path, "test json default");

        assert!(loaded.is_empty());
    }

    #[test]
    fn read_optional_json_returns_none_for_missing_or_invalid_json() {
        let dir = tempfile::tempdir().expect("tempdir");
        let missing_path = dir.path().join("missing.json");
        let invalid_path = dir.path().join("invalid.json");
        std::fs::write(&invalid_path, b"{").expect("invalid json written");

        let missing: Option<serde_json::Value> =
            read_optional_json(&missing_path, "test optional missing");
        let invalid: Option<serde_json::Value> =
            read_optional_json(&invalid_path, "test optional invalid");

        assert!(missing.is_none());
        assert!(invalid.is_none());
    }
}
