mod range_reader;
mod session;

use std::sync::{Arc, Mutex};
use std::time::Instant;

use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::NodeType;
use serde::{Deserialize, Serialize};

use crate::core_adapter::{CoreAdapter, CoreMode};

pub(crate) use range_reader::{read_local_media_range, LocalMediaRangeError};
pub(crate) use session::{LocalMediaKind, LocalMediaSourceManager, LocalMediaSourceSession};
pub use session::{MAX_MEDIA_RANGE_BYTES, MEDIA_STREAM_IDLE_TTL_MS};

pub(crate) const ERR_MEDIA_SOURCE_LOCKED: &str = "ERR_MEDIA_STREAM_LOCKED";
pub(crate) const ERR_MEDIA_SOURCE_LOAD_FAILED: &str = "ERR_MEDIA_SOURCE_LOAD_FAILED";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct CatalogSourceMetadata {
    pub(crate) node_id: u64,
    pub(crate) node_type: NodeType,
    pub(crate) name: String,
    pub(crate) mime_type: Option<String>,
    pub(crate) media_info: Option<CatalogMediaInfo>,
    pub(crate) size: u64,
    pub(crate) source_revision: u64,
    #[serde(default)]
    pub(crate) media_inspected_revision: u64,
    #[serde(default)]
    pub(crate) source_revision_initialized: bool,
}

pub(crate) fn effective_catalog_media_mime_type(
    metadata: &CatalogSourceMetadata,
    requested_mime_type: Option<String>,
) -> String {
    metadata
        .media_info
        .as_ref()
        .and_then(|info| info.playback_mime_type.as_deref())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string())
        .or_else(|| {
            metadata
                .mime_type
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(|value| value.trim().to_string())
        })
        .or_else(|| requested_mime_type.filter(|value| !value.trim().is_empty()))
        .unwrap_or_else(|| "application/octet-stream".to_string())
}

pub(crate) fn load_catalog_source_metadata(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    node_id: u64,
) -> Result<CatalogSourceMetadata, (String, Option<String>)> {
    let lock_wait_started = Instant::now();
    let mut adapter = adapter.lock().map_err(|_| {
        (
            "Adapter mutex poisoned".to_string(),
            Some(ERR_MEDIA_SOURCE_LOAD_FAILED.to_string()),
        )
    })?;
    let lock_wait_ms = lock_wait_started.elapsed().as_millis();

    if adapter.mode() != CoreMode::Local {
        return Err((
            "Media sources are only available for local Core mode".to_string(),
            Some(ERR_MEDIA_SOURCE_LOAD_FAILED.to_string()),
        ));
    }
    if !adapter.is_unlocked() {
        return Err((
            "Vault is locked".to_string(),
            Some(ERR_MEDIA_SOURCE_LOCKED.to_string()),
        ));
    }

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
                        Some(ERR_MEDIA_SOURCE_LOAD_FAILED.to_string()),
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
