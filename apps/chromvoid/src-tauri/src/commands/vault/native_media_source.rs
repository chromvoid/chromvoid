use crate::app_state::AppState;
use crate::media_source::{load_catalog_source_metadata, CatalogSourceMetadata};

pub(super) async fn load_native_media_source_metadata(
    state: &tauri::State<'_, AppState>,
    node_id: u64,
    task_label: &'static str,
) -> Result<CatalogSourceMetadata, (String, Option<String>)> {
    let adapter = state.adapter.clone();
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    match catalog_blocking_io_runtime
        .spawn_blocking(move || load_catalog_source_metadata(&adapter, node_id))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(error.into_rpc_error(task_label)),
    }
}
