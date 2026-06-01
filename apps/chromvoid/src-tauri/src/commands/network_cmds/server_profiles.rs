use super::*;
use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use crate::state_ext::lock_or_string_err;
use std::path::PathBuf;
use std::sync::Arc;

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn network_import_server_profile(
    state: tauri::State<'_, AppState>,
    profile_json: String,
    allow_update: Option<bool>,
) -> Result<serde_json::Value, String> {
    let store_path = server_profiles_store_path(&state)?;
    run_server_profile_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Network profile import",
        move |store_path| {
            let mut store = network::ServerProfileStore::load(&store_path);
            let imported =
                store.import_profile_json(&profile_json, allow_update.unwrap_or(false))?;
            store.save()?;
            serde_json::to_value(imported).map_err(|_| "serialize import result failed".to_string())
        },
    )
    .await
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn network_export_server_profile(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<String, String> {
    let store_path = server_profiles_store_path(&state)?;
    run_server_profile_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Network profile export",
        move |store_path| {
            let store = network::ServerProfileStore::load(&store_path);
            store.export_profile_json(&profile_id)
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn network_list_server_profiles(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let store_path = server_profiles_store_path(&state)?;
    run_server_profile_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Network profile list",
        move |store_path| {
            let store = network::ServerProfileStore::load(&store_path);
            Ok(store
                .list()
                .into_iter()
                .filter_map(|profile| serde_json::to_value(profile).ok())
                .collect())
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn network_get_bootstrap_profile(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<serde_json::Value, String> {
    let store_path = server_profiles_store_path(&state)?;
    run_server_profile_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Network bootstrap profile",
        move |store_path| {
            let store = network::ServerProfileStore::load(&store_path);
            let bootstrap = store.bootstrap_profile(&profile_id)?;
            serde_json::to_value(bootstrap)
                .map_err(|_| "serialize bootstrap profile failed".to_string())
        },
    )
    .await
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn network_record_profile_endpoint_failure(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<serde_json::Value, String> {
    let store_path = server_profiles_store_path(&state)?;
    run_server_profile_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Network profile endpoint failure",
        move |store_path| {
            let mut store = network::ServerProfileStore::load(&store_path);
            let result = store.record_endpoint_failure(&profile_id)?;
            store.save()?;
            serde_json::to_value(result).map_err(|_| "serialize rotation result failed".to_string())
        },
    )
    .await
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn network_rollback_profile_endpoint(
    state: tauri::State<'_, AppState>,
    profile_id: String,
) -> Result<serde_json::Value, String> {
    let store_path = server_profiles_store_path(&state)?;
    run_server_profile_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Network profile endpoint rollback",
        move |store_path| {
            let mut store = network::ServerProfileStore::load(&store_path);
            let result = store.rollback_endpoint(&profile_id)?;
            store.save()?;
            serde_json::to_value(result).map_err(|_| "serialize rotation result failed".to_string())
        },
    )
    .await
}

fn server_profiles_store_path(state: &tauri::State<'_, AppState>) -> Result<PathBuf, String> {
    let storage_root = lock_or_string_err!(state.storage_root, "Storage root");
    Ok(storage_root.join("network_server_profiles.json"))
}

async fn run_server_profile_store_task<T, F>(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    store_path: PathBuf,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf) -> Result<T, String> + Send + 'static,
{
    match catalog_blocking_io_runtime
        .spawn_blocking(move || task(store_path))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(server_profile_store_blocking_err(error, task_label)),
    }
}

fn server_profile_store_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_profile_store_blocking_err_maps_shutdown() {
        assert_eq!(
            server_profile_store_blocking_err(
                CatalogBlockingIoError::ShuttingDown,
                "Network profile list",
            ),
            "Catalog background IO is shutting down"
        );
    }
}
