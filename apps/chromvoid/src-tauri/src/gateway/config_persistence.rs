use std::path::PathBuf;
use std::sync::Arc;

use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};

use super::GatewayConfig;

pub(crate) type GatewayConfigSaveSnapshot = (PathBuf, GatewayConfig);

pub(crate) async fn save_config_snapshot_best_effort(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    (path, config): GatewayConfigSaveSnapshot,
    task_label: &'static str,
) {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || crate::helpers::storage::write_json_pretty_atomic(&path, &config))
        .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::warn!("gateway: failed to save config: {error}"),
        Err(error) => {
            let (error, _code) = config_blocking_err(error, task_label);
            tracing::warn!("gateway: failed to save config: {error}");
        }
    }
}

fn config_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> (String, Option<String>) {
    error.into_rpc_error(task_label)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_blocking_error_keeps_task_context() {
        let (error, code) = config_blocking_err(
            CatalogBlockingIoError::TaskFailed("join failed".to_string()),
            "Gateway config save",
        );

        assert_eq!(code.as_deref(), Some("INTERNAL"));
        assert!(error.contains("Gateway config save task failed"));
        assert!(error.contains("join failed"));
    }
}
