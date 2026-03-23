use super::*;

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn network_import_server_profile(
    state: tauri::State<'_, AppState>,
    profile_json: String,
    allow_update: Option<bool>,
) -> Result<serde_json::Value, String> {
    let store_path = {
        let storage_root = state.storage_root.lock().unwrap();
        storage_root.join("network_server_profiles.json")
    };
    let mut store = network::ServerProfileStore::load(&store_path);
    let imported = store.import_profile_json(&profile_json, allow_update.unwrap_or(false))?;
    store.save()?;
    serde_json::to_value(imported).map_err(|_| "serialize import result failed".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn network_export_server_profile(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<String, String> {
    let store_path = {
        let storage_root = state.storage_root.lock().unwrap();
        storage_root.join("network_server_profiles.json")
    };
    let store = network::ServerProfileStore::load(&store_path);
    store.export_profile_json(&profile_id)
}

#[tauri::command]
pub(crate) fn network_list_server_profiles(
    state: tauri::State<'_, AppState>,
) -> Vec<serde_json::Value> {
    let store_path = {
        let storage_root = state.storage_root.lock().unwrap();
        storage_root.join("network_server_profiles.json")
    };
    let store = network::ServerProfileStore::load(&store_path);
    store
        .list()
        .into_iter()
        .filter_map(|profile| serde_json::to_value(profile).ok())
        .collect()
}

#[tauri::command]
pub(crate) fn network_get_bootstrap_profile(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<serde_json::Value, String> {
    let store_path = {
        let storage_root = state.storage_root.lock().unwrap();
        storage_root.join("network_server_profiles.json")
    };
    let store = network::ServerProfileStore::load(&store_path);
    let bootstrap = store.bootstrap_profile(&profile_id)?;
    serde_json::to_value(bootstrap).map_err(|_| "serialize bootstrap profile failed".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn network_record_profile_endpoint_failure(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<serde_json::Value, String> {
    let store_path = {
        let storage_root = state.storage_root.lock().unwrap();
        storage_root.join("network_server_profiles.json")
    };
    let mut store = network::ServerProfileStore::load(&store_path);
    let result = store.record_endpoint_failure(&profile_id)?;
    store.save()?;
    serde_json::to_value(result).map_err(|_| "serialize rotation result failed".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn network_rollback_profile_endpoint(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<serde_json::Value, String> {
    let store_path = {
        let storage_root = state.storage_root.lock().unwrap();
        storage_root.join("network_server_profiles.json")
    };
    let mut store = network::ServerProfileStore::load(&store_path);
    let result = store.rollback_endpoint(&profile_id)?;
    store.save()?;
    serde_json::to_value(result).map_err(|_| "serialize rotation result failed".to_string())
}
