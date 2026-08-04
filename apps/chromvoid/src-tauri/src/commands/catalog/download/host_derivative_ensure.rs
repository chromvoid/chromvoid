use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use serde_json::Value;

use super::derivatives::{
    build_core_backed_image_derivative_stream_with_metadata_and_cancellation,
    is_display_derivative_candidate, validate_image_derivative_stream, ImageDerivativeCancellation,
};
use super::CatalogDownloadError;
use crate::catalog_blocking_io::CatalogBlockingIoRuntimeState;
use crate::commands::catalog::source_metadata::load_catalog_source_metadata;
use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::image_preview::{
    ImageDerivativeTier, ImagePreviewRuntimeState, DERIVATIVE_STORAGE_VERSION,
};
use crate::types::StreamOut;

#[derive(Clone)]
pub(crate) struct HostDerivativeEnsureServices {
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    image_preview_runtime: Arc<ImagePreviewRuntimeState>,
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    vault_cancellation_epoch: Arc<AtomicU64>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct HostDerivativeEnsureRequest {
    pub(crate) node_id: u64,
    pub(crate) source_version: u64,
    pub(crate) tier: ImageDerivativeTier,
    pub(crate) version: u32,
    pub(crate) refresh_cache: bool,
}

impl HostDerivativeEnsureRequest {
    pub(crate) fn parse(data: &Value) -> Result<Self, CatalogDownloadError> {
        let node_id = required_u64(data, "node_id")?;
        let source_version = required_u64(data, "source_version")?;
        let version = data
            .get("version")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .ok_or_else(|| required_field_error("version"))?;
        let tier = match data.get("tier").and_then(Value::as_str) {
            Some("preview") => ImageDerivativeTier::DisplayPreview,
            Some("thumbnail") => ImageDerivativeTier::Thumbnail,
            Some(_) => {
                return Err((
                    "tier must be preview or thumbnail".to_string(),
                    Some("EMPTY_PAYLOAD".to_string()),
                ))
            }
            None => return Err(required_field_error("tier")),
        };
        let refresh_cache = match data.get("refresh_cache") {
            Some(value) => value
                .as_bool()
                .ok_or_else(|| required_field_error("refresh_cache"))?,
            None => false,
        };
        Ok(Self {
            node_id,
            source_version,
            tier,
            version,
            refresh_cache,
        })
    }
}

impl HostDerivativeEnsureServices {
    pub(crate) fn new(
        adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
        image_preview_runtime: Arc<ImagePreviewRuntimeState>,
        catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
        vault_cancellation_epoch: Arc<AtomicU64>,
    ) -> Self {
        Self {
            adapter,
            image_preview_runtime,
            catalog_blocking_io_runtime,
            vault_cancellation_epoch,
        }
    }

    pub(crate) fn cancellation_snapshot(
        &self,
        operation_epochs: impl IntoIterator<Item = Arc<AtomicU64>>,
    ) -> ImageDerivativeCancellation {
        ImageDerivativeCancellation::capture_all(
            std::iter::once(self.vault_cancellation_epoch.clone()).chain(operation_epochs),
        )
    }

    pub(crate) async fn ensure(
        &self,
        request: HostDerivativeEnsureRequest,
        cancellation: ImageDerivativeCancellation,
    ) -> Result<StreamOut, CatalogDownloadError> {
        let adapter = self.adapter.clone();
        let image_preview_runtime = self.image_preview_runtime.clone();
        self.catalog_blocking_io_runtime
            .spawn_blocking(move || {
                ensure_blocking(&adapter, &image_preview_runtime, request, &cancellation)
            })
            .await
            .map_err(|error| error.into_rpc_error("Remote derivative ensure"))?
    }
}

fn ensure_blocking(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    image_preview_runtime: &ImagePreviewRuntimeState,
    request: HostDerivativeEnsureRequest,
    cancellation: &ImageDerivativeCancellation,
) -> Result<StreamOut, CatalogDownloadError> {
    cancellation.check()?;
    if request.version != DERIVATIVE_STORAGE_VERSION {
        return Err((
            format!(
                "Derivative storage version {} is unsupported by host version {}",
                request.version, DERIVATIVE_STORAGE_VERSION
            ),
            Some("UNSUPPORTED".to_string()),
        ));
    }
    let mode = adapter
        .lock()
        .map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?
        .mode();
    if !matches!(mode, CoreMode::Local) {
        return Err((
            "Remote derivative ensure requires a local host adapter".to_string(),
            Some("REMOTE_CORE_UNSUPPORTED".to_string()),
        ));
    }

    let source_metadata = load_catalog_source_metadata(adapter, request.node_id)?;
    if source_metadata.source_revision != request.source_version {
        return Err((
            "stale source revision".to_string(),
            Some("ERR_MEDIA_STREAM_STALE".to_string()),
        ));
    }
    if !is_display_derivative_candidate(&source_metadata.name, source_metadata.mime_type.as_deref())
    {
        return Err((
            "Preview conversion is only available for image files or embedded audio artwork"
                .to_string(),
            Some("UNSUPPORTED".to_string()),
        ));
    }
    cancellation.check()?;
    let (stream, _) = build_core_backed_image_derivative_stream_with_metadata_and_cancellation(
        adapter,
        image_preview_runtime,
        request.node_id,
        "",
        None,
        request.tier,
        source_metadata,
        Some(cancellation),
        request.refresh_cache,
    )?;
    cancellation.check()?;
    let current_source_metadata = load_catalog_source_metadata(adapter, request.node_id)?;
    if current_source_metadata.source_revision != request.source_version {
        return Err((
            "stale source revision".to_string(),
            Some("ERR_MEDIA_STREAM_STALE".to_string()),
        ));
    }
    validate_image_derivative_stream(&stream, request.tier)?;
    cancellation.check()?;
    Ok(stream)
}

fn required_u64(data: &Value, field: &str) -> Result<u64, CatalogDownloadError> {
    data.get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| required_field_error(field))
}

fn required_field_error(field: &str) -> CatalogDownloadError {
    (
        format!("{field} is required"),
        Some("EMPTY_PAYLOAD".to_string()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_derivative_ensure_request() {
        let request = HostDerivativeEnsureRequest::parse(&serde_json::json!({
            "node_id": 7,
            "source_version": 11,
            "tier": "preview",
            "version": DERIVATIVE_STORAGE_VERSION,
            "refresh_cache": true,
        }))
        .expect("request");

        assert_eq!(request.node_id, 7);
        assert_eq!(request.source_version, 11);
        assert_eq!(request.tier, ImageDerivativeTier::DisplayPreview);
        assert!(request.refresh_cache);
    }

    #[test]
    fn rejects_non_display_derivative_tier() {
        let error = HostDerivativeEnsureRequest::parse(&serde_json::json!({
            "node_id": 7,
            "source_version": 11,
            "tier": "metadata",
            "version": DERIVATIVE_STORAGE_VERSION,
        }))
        .expect_err("metadata tier must be rejected");

        assert_eq!(error.1.as_deref(), Some("EMPTY_PAYLOAD"));
    }

    #[test]
    fn rejects_malformed_refresh_cache_flag() {
        let error = HostDerivativeEnsureRequest::parse(&serde_json::json!({
            "node_id": 7,
            "source_version": 11,
            "tier": "thumbnail",
            "version": DERIVATIVE_STORAGE_VERSION,
            "refresh_cache": "true",
        }))
        .expect_err("refresh_cache must be a boolean");

        assert_eq!(error.1.as_deref(), Some("EMPTY_PAYLOAD"));
    }
}
