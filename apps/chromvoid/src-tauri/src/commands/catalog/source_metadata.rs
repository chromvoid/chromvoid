use std::sync::{Arc, Mutex};
use std::time::Instant;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct CatalogSourceMetadata {
    pub(crate) name: String,
    pub(crate) mime_type: Option<String>,
    pub(crate) size: u64,
    pub(crate) source_revision: u64,
    #[serde(default)]
    pub(crate) source_revision_initialized: bool,
}

pub(crate) fn load_catalog_source_metadata(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
) -> Result<CatalogSourceMetadata, (String, Option<String>)> {
    let lock_wait_started = Instant::now();
    let mut adapter = adapter.lock().map_err(|_| {
        (
            "Adapter mutex poisoned".to_string(),
            Some("INTERNAL".to_string()),
        )
    })?;
    let lock_wait_ms = lock_wait_started.elapsed().as_millis();
    let handle_started = Instant::now();
    let response = adapter.handle(&RpcRequest::new(
        "catalog:source:metadata".to_string(),
        serde_json::json!({
            "node_id": node_id,
        }),
    ));
    let handle_ms = handle_started.elapsed().as_millis();

    match response {
        RpcResponse::Success { result, .. } => {
            let metadata =
                serde_json::from_value::<CatalogSourceMetadata>(result).map_err(|error| {
                    (
                        format!("Invalid source metadata response: {error}"),
                        Some("INTERNAL".to_string()),
                    )
                })?;
            let mut save_ms = 0;
            if metadata.source_revision_initialized {
                let save_started = Instant::now();
                let _ = adapter.save();
                save_ms = save_started.elapsed().as_millis();
            }
            tracing::info!(
                "perf:source_metadata event=load source-metadata:lock_wait_ms={} source-metadata:handle_ms={} source-metadata:save_ms={} node_id={} source_revision={} initialized={}",
                lock_wait_ms,
                handle_ms,
                save_ms,
                node_id,
                metadata.source_revision,
                metadata.source_revision_initialized,
            );
            Ok(metadata)
        }
        RpcResponse::Error { error, code, .. } => Err((error, code)),
    }
}
