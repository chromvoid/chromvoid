use tauri::Emitter;

use crate::core_adapter::CoreAdapter;
use crate::types::StorageConfig;

pub(crate) fn load_storage_root(data_dir: &std::path::Path) -> std::path::PathBuf {
    let default_root = data_dir.join("storage");
    let cfg_path = data_dir.join("storage.json");
    let Ok(bytes) = std::fs::read(&cfg_path) else {
        return default_root;
    };
    let Ok(cfg) = serde_json::from_slice::<StorageConfig>(&bytes) else {
        return default_root;
    };
    let s = cfg.storage_root.trim();
    if s.is_empty() {
        return default_root;
    }
    std::path::PathBuf::from(s)
}

pub(crate) fn save_storage_root(data_dir: &std::path::Path, storage_root: &std::path::Path) {
    let cfg_path = data_dir.join("storage.json");
    let cfg = StorageConfig {
        storage_root: storage_root.to_string_lossy().to_string(),
    };
    let Ok(json) = serde_json::to_vec_pretty(&cfg) else {
        return;
    };
    let _ = std::fs::write(cfg_path, json);
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
