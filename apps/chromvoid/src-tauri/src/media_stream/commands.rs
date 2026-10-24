use std::sync::{Arc, Mutex};

use chromvoid_core::catalog::{CatalogMediaByteRange, CatalogMediaInfo, CatalogMediaSegmentRange};
use chromvoid_core::NodeType;
use chromvoid_protocol::TransportType;
use serde::Deserialize;
use serde_json::Value;

use crate::app_state::AppState;
use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::media_source::{
    effective_catalog_media_mime_type, load_catalog_source_metadata, LocalMediaKind,
    LocalMediaSourceManager, ERR_MEDIA_SOURCE_STALE,
};
use crate::types::{rpc_ok, RpcResult, TauriRpcResult};

use super::format::PlayableMediaKind;
use super::format::{playable_media_kind_with_media_info, ERR_MEDIA_UNSUPPORTED};
use super::session::{
    prepared_media_stream_source, prepared_video_source, PreparedMediaStreamSource,
    PreparedVideoByteRange, PreparedVideoDelivery, PreparedVideoProvider,
    PreparedVideoSegmentRange, PreparedVideoSource,
};

#[derive(Debug, Deserialize)]
pub(crate) struct PrepareMediaStreamArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "fileName")]
    pub(crate) file_name: String,

    #[serde(alias = "mimeType")]
    pub(crate) mime_type: Option<String>,

    #[serde(alias = "lastModified")]
    pub(crate) last_modified: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ReleaseMediaStreamArgs {
    #[serde(alias = "streamId")]
    pub(crate) stream_id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PrepareMediaSourceArgs {
    pub(crate) kind: String,

    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "sourceRevision")]
    pub(crate) source_revision: Option<u64>,

    #[serde(alias = "ownerToken")]
    pub(crate) owner_token: Option<String>,

    #[serde(alias = "fileName")]
    pub(crate) file_name: Option<String>,

    #[serde(alias = "mimeType")]
    pub(crate) mime_type: Option<String>,

    #[serde(alias = "lastModified")]
    pub(crate) last_modified: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ReleaseMediaSourceArgs {
    #[serde(alias = "streamId")]
    pub(crate) stream_id: String,

    #[serde(alias = "sourceToken")]
    pub(crate) source_token: String,
}

#[tauri::command]
pub(crate) async fn prepare_media_stream(
    state: tauri::State<'_, AppState>,
    args: PrepareMediaStreamArgs,
) -> TauriRpcResult<PreparedMediaStreamSource> {
    let adapter = state.adapter.clone();
    let media_streams = state.media_streams.clone();
    #[cfg(desktop)]
    let loopback_base_url = state.media_http_stream_runtime.base_url();
    #[cfg(not(desktop))]
    let loopback_base_url = None;
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            prepare_media_stream_source(&adapter, media_streams.as_ref(), args, loopback_base_url)
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => {
            let (error, code) = error.into_rpc_error("Media stream preparation");
            Ok(rpc_error(error, code))
        }
    }
}

#[tauri::command]
pub(crate) fn release_media_stream(
    state: tauri::State<'_, AppState>,
    args: ReleaseMediaStreamArgs,
) -> RpcResult<Value> {
    state.media_streams.release(&args.stream_id);
    rpc_ok(Value::Null)
}

#[tauri::command]
pub(crate) async fn prepare_media_source(
    state: tauri::State<'_, AppState>,
    args: PrepareMediaSourceArgs,
) -> TauriRpcResult<PreparedVideoSource> {
    let adapter = state.adapter.clone();
    let media_streams = state.media_streams.clone();
    #[cfg(desktop)]
    let loopback_base_url = state.media_http_stream_runtime.base_url();
    #[cfg(not(desktop))]
    let loopback_base_url = None;
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();

    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            prepare_media_source_value(&adapter, media_streams.as_ref(), args, loopback_base_url)
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => {
            let (error, code) = error.into_rpc_error("Media source preparation");
            Ok(rpc_error(error, code))
        }
    }
}

#[tauri::command]
pub(crate) fn release_media_source(
    state: tauri::State<'_, AppState>,
    args: ReleaseMediaSourceArgs,
) -> RpcResult<Value> {
    if args.stream_id.trim().is_empty()
        || args.source_token.trim().is_empty()
        || args.stream_id != args.source_token
    {
        return rpc_error(
            "Media source release token mismatch",
            Some("ERR_MEDIA_STREAM_NOT_FOUND".to_string()),
        );
    }

    state.media_streams.release(&args.source_token);
    rpc_ok(Value::Null)
}

pub(crate) fn prepare_media_stream_source(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    manager: &LocalMediaSourceManager,
    args: PrepareMediaStreamArgs,
    loopback_base_url: Option<String>,
) -> RpcResult<PreparedMediaStreamSource> {
    if !crate::types::media_stream_protocol_enabled_for_target() {
        return rpc_error(
            "Media stream protocol is disabled for this runtime",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        );
    }

    let _ = (&args.file_name, args.last_modified);
    let metadata = match load_catalog_source_metadata(adapter, args.node_id) {
        Ok(metadata) => metadata,
        Err((error, code)) => return rpc_error(error, code),
    };

    if metadata.node_type != NodeType::File || metadata.size == 0 {
        return rpc_error(
            "Media source is not playable",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        );
    }

    let mime_type = effective_catalog_media_mime_type(&metadata, args.mime_type);

    let media_kind = match playable_media_kind_with_media_info(
        &metadata.name,
        Some(&mime_type),
        metadata.media_info.as_ref(),
    ) {
        Ok(PlayableMediaKind::Audio) => LocalMediaKind::Audio,
        Ok(PlayableMediaKind::Video) => LocalMediaKind::Video,
        Err(_) => {
            return rpc_error(
                "Media source is not playable",
                Some(ERR_MEDIA_UNSUPPORTED.to_string()),
            );
        }
    };

    let session = match manager.register(
        metadata.node_id,
        media_kind,
        mime_type,
        metadata.size,
        metadata.source_revision,
    ) {
        Ok(session) => session,
        Err(error) => return rpc_error(error, Some("INTERNAL".to_string())),
    };
    debug_assert_eq!(session.kind, media_kind);

    RpcResult::Success {
        ok: true,
        result: prepared_media_stream_source(&session, metadata.name, loopback_base_url),
    }
}

pub(crate) fn prepare_media_source_value(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    manager: &LocalMediaSourceManager,
    args: PrepareMediaSourceArgs,
    loopback_base_url: Option<String>,
) -> RpcResult<PreparedVideoSource> {
    if args.kind != "video" {
        return rpc_error(
            "Only video media sources are supported",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        );
    }
    if !crate::types::media_stream_protocol_enabled_for_target() {
        return rpc_error(
            "Media source protocol is disabled for this runtime",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        );
    }

    let _ = (&args.file_name, args.last_modified, &args.owner_token);
    let metadata = match load_catalog_source_metadata(adapter, args.node_id) {
        Ok(metadata) => metadata,
        Err((error, code)) => return rpc_error(error, code),
    };

    if let Some(expected_revision) = args.source_revision {
        if metadata.source_revision != expected_revision {
            return rpc_error(
                "Media source revision is stale",
                Some(ERR_MEDIA_SOURCE_STALE.to_string()),
            );
        }
    }

    if metadata.node_type != NodeType::File || metadata.size == 0 {
        return rpc_error(
            "Media source is not playable",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        );
    }

    let mime_type = effective_catalog_media_mime_type(&metadata, args.mime_type);
    if playable_media_kind_with_media_info(
        &metadata.name,
        Some(&mime_type),
        metadata.media_info.as_ref(),
    ) != Ok(PlayableMediaKind::Video)
    {
        return rpc_error(
            "Media source is not playable",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        );
    }

    let session = match manager.register(
        metadata.node_id,
        LocalMediaKind::Video,
        mime_type,
        metadata.size,
        metadata.source_revision,
    ) {
        Ok(session) => session,
        Err(error) => return rpc_error(error, Some("INTERNAL".to_string())),
    };

    let platform = media_source_platform();
    let (provider, transport_session_generation) = prepared_video_provider(adapter, platform);
    let deliveries = prepared_video_deliveries(
        &session,
        platform,
        metadata.media_info.as_ref(),
        loopback_base_url,
    );
    if deliveries.is_empty() {
        manager.release(&session.token);
        return rpc_error(
            "No supported video delivery is available for this runtime",
            Some(ERR_MEDIA_UNSUPPORTED.to_string()),
        );
    }

    RpcResult::Success {
        ok: true,
        result: prepared_video_source(
            &session,
            metadata.name,
            platform,
            provider,
            deliveries,
            transport_session_generation,
        ),
    }
}

fn media_source_platform() -> &'static str {
    if cfg!(mobile) {
        "mobile"
    } else {
        "desktop"
    }
}

fn prepared_video_provider(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    platform: &'static str,
) -> (PreparedVideoProvider, Option<u64>) {
    let Ok(adapter) = adapter.lock() else {
        return (PreparedVideoProvider::LocalCatalog, None);
    };
    let transport_metrics = adapter.transport_metrics();
    let transport_session_generation = adapter.transport_session_generation();
    let provider = match adapter.mode() {
        CoreMode::Remote { .. } => {
            if transport_metrics
                .as_ref()
                .and_then(|metrics| metrics.transport_type)
                .is_some_and(|transport_type| transport_type == TransportType::UsbMobile)
            {
                PreparedVideoProvider::RemoteUsb
            } else {
                PreparedVideoProvider::RemoteNetwork
            }
        }
        CoreMode::Local if platform == "mobile" => PreparedVideoProvider::MobileLocalCatalog,
        CoreMode::Local | CoreMode::Switching => PreparedVideoProvider::LocalCatalog,
    };

    (provider, transport_session_generation)
}

fn prepared_video_deliveries(
    session: &crate::media_source::LocalMediaSourceSession,
    platform: &'static str,
    media_info: Option<&CatalogMediaInfo>,
    loopback_base_url: Option<String>,
) -> Vec<PreparedVideoDelivery> {
    let mut deliveries = Vec::new();

    if cfg!(desktop) && crate::types::media_http_stream_enabled_for_target() {
        if let Some(base_url) = loopback_base_url {
            if let Some(mse_delivery) =
                prepared_mse_delivery(session, platform, &base_url, media_info)
            {
                deliveries.push(mse_delivery);
            }
            deliveries.push(PreparedVideoDelivery::LoopbackHttp {
                platform,
                url: format!("{}/media/{}", base_url.trim_end_matches('/'), session.token),
            });
        }
    }

    deliveries
}

fn prepared_mse_delivery(
    session: &crate::media_source::LocalMediaSourceSession,
    platform: &'static str,
    base_url: &str,
    media_info: Option<&CatalogMediaInfo>,
) -> Option<PreparedVideoDelivery> {
    if !crate::types::mse_video_playback_enabled_for_target() {
        return None;
    }

    let media_info = media_info?;
    if media_info.mse_fragmented != Some(true) {
        return None;
    }

    let streaming_metadata = media_info.streaming_metadata.as_ref()?;
    let init_segment = streaming_metadata.init_segment.as_ref()?;
    let media_segments = streaming_metadata.media_segments.as_ref()?;
    if media_segments.is_empty() {
        return None;
    }

    Some(PreparedVideoDelivery::Mse {
        platform,
        fetch_url: Some(format!(
            "{}/media/{}",
            base_url.trim_end_matches('/'),
            session.token
        )),
        init_segment: prepared_byte_range(init_segment),
        media_segments: media_segments.iter().map(prepared_segment_range).collect(),
    })
}

fn prepared_byte_range(range: &CatalogMediaByteRange) -> PreparedVideoByteRange {
    PreparedVideoByteRange {
        offset: range.offset,
        length: range.length,
    }
}

fn prepared_segment_range(range: &CatalogMediaSegmentRange) -> PreparedVideoSegmentRange {
    PreparedVideoSegmentRange {
        offset: range.offset,
        length: range.length,
        timestamp_us: range.timestamp_us,
    }
}

fn rpc_error<T>(error: impl Into<String>, code: Option<String>) -> RpcResult<T> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code,
    }
}

#[cfg(test)]
mod tests {
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcReply};
    use std::sync::{Mutex, MutexGuard};

    use super::*;
    use crate::core_adapter::CoreMode;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EnvGuard {
        key: &'static str,
        previous: Option<String>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: &'static str) -> Self {
            let previous = std::env::var(key).ok();
            unsafe {
                std::env::set_var(key, value);
            }
            Self { key, previous }
        }

        fn unset(key: &'static str) -> Self {
            let previous = std::env::var(key).ok();
            unsafe {
                std::env::remove_var(key);
            }
            Self { key, previous }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            unsafe {
                match &self.previous {
                    Some(previous) => std::env::set_var(self.key, previous),
                    None => std::env::remove_var(self.key),
                }
            }
        }
    }

    fn env_lock() -> MutexGuard<'static, ()> {
        ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    struct TestAdapter {
        mode: CoreMode,
        unlocked: bool,
        metadata: RpcResponse,
    }

    impl CoreAdapter for TestAdapter {
        fn mode(&self) -> CoreMode {
            self.mode.clone()
        }

        fn is_unlocked(&self) -> bool {
            self.unlocked
        }

        fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
            self.metadata.clone()
        }

        fn handle_with_stream(
            &mut self,
            _req: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            RpcReply::Json(RpcResponse::error("unexpected stream call", Some("TEST")))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    fn boxed_adapter(adapter: TestAdapter) -> Arc<Mutex<Box<dyn CoreAdapter>>> {
        Arc::new(Mutex::new(Box::new(adapter)))
    }

    fn success_metadata(name: &str, mime_type: Option<&str>, size: u64) -> RpcResponse {
        RpcResponse::success(serde_json::json!({
            "node_id": 9,
            "node_type": 1,
            "name": name,
            "mime_type": mime_type,
            "size": size,
            "source_revision": 5,
        }))
    }

    fn success_metadata_with_media_info(
        name: &str,
        mime_type: Option<&str>,
        size: u64,
        media_info: Value,
    ) -> RpcResponse {
        RpcResponse::success(serde_json::json!({
            "node_id": 9,
            "node_type": 1,
            "name": name,
            "mime_type": mime_type,
            "media_info": media_info,
            "size": size,
            "source_revision": 5,
        }))
    }

    #[test]
    fn prepare_media_stream_registers_playable_local_source() {
        let manager = LocalMediaSourceManager::new();
        let adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("track.mp3", Some("audio/mpeg"), 123),
        });

        let result = prepare_media_stream_source(
            &adapter,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "ignored.mp3".to_string(),
                mime_type: None,
                last_modified: None,
            },
            None,
        );

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.kind, "media-stream");
                assert_eq!(result.name, "track.mp3");
                assert_eq!(result.size, 123);
                assert_eq!(result.source_revision, 5);
                assert!(!result.url.contains("track.mp3"));
            }
            RpcResult::Error { error, .. } => panic!("unexpected error: {error}"),
        }

        let video_adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("movie.mp4", Some("video/mp4"), 456),
        });
        let video_result = prepare_media_stream_source(
            &video_adapter,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "ignored.mp4".to_string(),
                mime_type: None,
                last_modified: None,
            },
            Some("http://127.0.0.1:43210".to_string()),
        );

        match video_result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.kind, "media-stream");
                assert_eq!(result.name, "movie.mp4");
                assert_eq!(result.mime_type, "video/mp4");
                assert_eq!(result.size, 456);
                assert!(result.url.starts_with("http://127.0.0.1:43210/media/"));
                assert!(result
                    .fallback_url
                    .as_deref()
                    .is_some_and(|url| url.starts_with("chromvoid-media://localhost/")));
                assert!(!result.url.contains("movie.mp4"));
            }
            RpcResult::Error { error, .. } => panic!("unexpected video error: {error}"),
        }
    }

    #[test]
    fn prepare_media_stream_registers_playable_remote_source() {
        let manager = LocalMediaSourceManager::new();
        let remote = boxed_adapter(TestAdapter {
            mode: CoreMode::Remote {
                host: crate::core_adapter::RemoteHost::MobileUsb {
                    host_id: "host-1".to_string(),
                    label: Some("Android".to_string()),
                    platform: "android".to_string(),
                },
            },
            unlocked: true,
            metadata: success_metadata("track.mp3", Some("audio/mpeg"), 123),
        });
        let result = prepare_media_stream_source(
            &remote,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "track.mp3".to_string(),
                mime_type: None,
                last_modified: None,
            },
            None,
        );

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.kind, "media-stream");
                assert_eq!(result.name, "track.mp3");
                assert_eq!(result.size, 123);
                assert_eq!(result.source_revision, 5);
                assert!(!result.url.contains("track.mp3"));
            }
            RpcResult::Error { error, .. } => panic!("unexpected remote error: {error}"),
        }
    }

    #[test]
    fn prepare_media_source_returns_video_source_contract_for_desktop_loopback() {
        let _lock = env_lock();
        let _guard = EnvGuard::unset("CHROMVOID_DISABLE_MEDIA_HTTP_STREAM");
        let _mse_guard = EnvGuard::unset("CHROMVOID_DISABLE_MSE_VIDEO_PLAYBACK");
        let manager = LocalMediaSourceManager::new();
        let adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("movie.mp4", Some("video/mp4"), 456),
        });

        let result = prepare_media_source_value(
            &adapter,
            &manager,
            PrepareMediaSourceArgs {
                kind: "video".to_string(),
                node_id: 9,
                source_revision: Some(5),
                owner_token: Some("owner-1".to_string()),
                file_name: Some("ignored.mp4".to_string()),
                mime_type: None,
                last_modified: None,
            },
            Some("http://127.0.0.1:43210".to_string()),
        );

        if !cfg!(desktop) {
            assert!(matches!(result, RpcResult::Error { .. }));
            return;
        }

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.kind, "video-source");
                assert_eq!(result.stream_id, result.source_token);
                assert_eq!(result.platform, "desktop");
                assert_eq!(result.provider, PreparedVideoProvider::LocalCatalog);
                assert_eq!(result.name, "movie.mp4");
                assert_eq!(result.mime_type, "video/mp4");
                assert_eq!(result.size, 456);
                assert_eq!(result.source_revision, 5);
                assert_eq!(result.media_source_generation, 1);
                assert!(result.transport_session_generation.is_none());
                assert_eq!(result.deliveries.len(), 1);
                match &result.deliveries[0] {
                    PreparedVideoDelivery::LoopbackHttp { platform, url } => {
                        assert_eq!(*platform, "desktop");
                        assert!(url.starts_with("http://127.0.0.1:43210/media/"));
                        assert!(!url.contains("movie.mp4"));
                    }
                    other => panic!("unexpected delivery: {other:?}"),
                }
            }
            RpcResult::Error { error, .. } => panic!("unexpected error: {error}"),
        }
    }

    #[cfg(desktop)]
    #[test]
    fn loopback_media_csp_allows_prepared_desktop_video_source() {
        let _lock = env_lock();
        let _guard = EnvGuard::unset("CHROMVOID_DISABLE_MEDIA_HTTP_STREAM");
        let adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("movie.mp4", Some("video/mp4"), 456),
        });
        let result = prepare_media_source_value(
            &adapter,
            &LocalMediaSourceManager::new(),
            PrepareMediaSourceArgs {
                kind: "video".to_string(),
                node_id: 9,
                source_revision: None,
                owner_token: None,
                file_name: None,
                mime_type: None,
                last_modified: None,
            },
            Some("http://127.0.0.1:43210".to_string()),
        );
        let result = match result {
            RpcResult::Success { result, .. } => result,
            RpcResult::Error { error, .. } => panic!("unexpected error: {error}"),
        };
        let url = result
            .deliveries
            .iter()
            .find_map(|delivery| match delivery {
                PreparedVideoDelivery::LoopbackHttp { url, .. } => Some(url),
                _ => None,
            })
            .expect("prepared video source must include loopback-http delivery");
        let url = url::Url::parse(url).unwrap();
        let loopback_source = format!("{}://{}:*", url.scheme(), url.host_str().unwrap());
        for (name, json) in [
            ("tauri.conf.json", include_str!("../../tauri.conf.json")),
            (
                "tauri.dev.conf.json",
                include_str!("../../tauri.dev.conf.json"),
            ),
        ] {
            let config: Value = serde_json::from_str(json).unwrap();
            let csp = config["app"]["security"]["csp"].as_str().unwrap();
            // The video element needs media-src; MSE segment fetches
            // use the same loopback origin and need connect-src.
            for directive in ["media-src", "connect-src"] {
                assert!(
                    csp.split(';').any(|entry| {
                        let mut tokens = entry.split_whitespace();
                        tokens.next() == Some(directive)
                            && tokens.any(|source| source == loopback_source)
                    }),
                    "{name}: {directive} must allow {loopback_source} for {url}"
                );
            }
        }
    }

    #[test]
    fn prepare_media_source_includes_mse_only_for_proven_fragmented_mp4_segments() {
        let _lock = env_lock();
        let _http_guard = EnvGuard::unset("CHROMVOID_DISABLE_MEDIA_HTTP_STREAM");
        let _mse_guard = EnvGuard::unset("CHROMVOID_DISABLE_MSE_VIDEO_PLAYBACK");
        let manager = LocalMediaSourceManager::new();
        let adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata_with_media_info(
                "fragmented.mp4",
                Some("video/mp4"),
                1024,
                serde_json::json!({
                    "k": "video",
                    "a": 1,
                    "v": 1,
                    "m": "video/mp4",
                    "f": true,
                    "s": {
                        "i": {"o": 0, "l": 128},
                        "g": [
                            {"o": 128, "l": 256, "t": 0},
                            {"o": 384, "l": 256, "t": 33333}
                        ]
                    }
                }),
            ),
        });

        let result = prepare_media_source_value(
            &adapter,
            &manager,
            PrepareMediaSourceArgs {
                kind: "video".to_string(),
                node_id: 9,
                source_revision: Some(5),
                owner_token: None,
                file_name: Some("ignored.mp4".to_string()),
                mime_type: None,
                last_modified: None,
            },
            Some("http://127.0.0.1:43210".to_string()),
        );

        if !cfg!(desktop) {
            assert!(matches!(result, RpcResult::Error { .. }));
            return;
        }

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.deliveries.len(), 2);
                match &result.deliveries[0] {
                    PreparedVideoDelivery::Mse {
                        platform,
                        fetch_url,
                        init_segment,
                        media_segments,
                    } => {
                        assert_eq!(*platform, "desktop");
                        assert!(fetch_url
                            .as_deref()
                            .is_some_and(|url| url.starts_with("http://127.0.0.1:43210/media/")));
                        assert_eq!(init_segment.offset, 0);
                        assert_eq!(init_segment.length, 128);
                        assert_eq!(media_segments.len(), 2);
                        assert_eq!(media_segments[0].offset, 128);
                        assert_eq!(media_segments[0].length, 256);
                        assert_eq!(media_segments[0].timestamp_us, 0);
                    }
                    other => panic!("unexpected first delivery: {other:?}"),
                }
                assert!(matches!(
                    result.deliveries[1],
                    PreparedVideoDelivery::LoopbackHttp { .. }
                ));
            }
            RpcResult::Error { error, .. } => panic!("unexpected error: {error}"),
        }
    }

    #[test]
    fn prepare_media_source_respects_media_http_disable_gate_for_loopback_delivery() {
        let _lock = env_lock();
        let _guard = EnvGuard::set("CHROMVOID_DISABLE_MEDIA_HTTP_STREAM", "1");
        let manager = LocalMediaSourceManager::new();
        let adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("movie.mp4", Some("video/mp4"), 456),
        });

        let result = prepare_media_source_value(
            &adapter,
            &manager,
            PrepareMediaSourceArgs {
                kind: "video".to_string(),
                node_id: 9,
                source_revision: Some(5),
                owner_token: Some("owner-1".to_string()),
                file_name: Some("ignored.mp4".to_string()),
                mime_type: None,
                last_modified: None,
            },
            Some("http://127.0.0.1:43210".to_string()),
        );

        assert!(matches!(
            result,
            RpcResult::Error {
                code: Some(code),
                ..
            } if code == ERR_MEDIA_UNSUPPORTED
        ));
        assert_eq!(manager.count(), 0);
    }

    #[test]
    fn prepare_media_source_rejects_stale_source_revision() {
        let manager = LocalMediaSourceManager::new();
        let adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("movie.mp4", Some("video/mp4"), 456),
        });

        let result = prepare_media_source_value(
            &adapter,
            &manager,
            PrepareMediaSourceArgs {
                kind: "video".to_string(),
                node_id: 9,
                source_revision: Some(4),
                owner_token: None,
                file_name: None,
                mime_type: None,
                last_modified: None,
            },
            Some("http://127.0.0.1:43210".to_string()),
        );

        assert!(matches!(
            result,
            RpcResult::Error {
                code: Some(code),
                ..
            } if code == crate::media_source::ERR_MEDIA_SOURCE_STALE
        ));
        assert_eq!(manager.count(), 0);
    }

    #[test]
    fn prepare_media_stream_rejects_switching_or_unsupported_sources() {
        let manager = LocalMediaSourceManager::new();
        let switching = boxed_adapter(TestAdapter {
            mode: CoreMode::Switching,
            unlocked: true,
            metadata: success_metadata("track.mp3", Some("audio/mpeg"), 123),
        });
        let switching_result = prepare_media_stream_source(
            &switching,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "track.mp3".to_string(),
                mime_type: None,
                last_modified: None,
            },
            None,
        );
        assert!(matches!(
            switching_result,
            RpcResult::Error {
                code: Some(code),
                ..
            } if code == crate::media_source::ERR_MEDIA_SOURCE_LOAD_FAILED
        ));

        let unsupported = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("album.flac", Some("audio/flac"), 123),
        });
        let unsupported_result = prepare_media_stream_source(
            &unsupported,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "album.flac".to_string(),
                mime_type: Some("audio/mpeg".to_string()),
                last_modified: None,
            },
            None,
        );
        assert!(matches!(
            unsupported_result,
            RpcResult::Error {
                code: Some(code),
                ..
            } if code == ERR_MEDIA_UNSUPPORTED
        ));

        let unsupported_video = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata("movie.mkv", Some("video/mp4"), 123),
        });
        let unsupported_video_result = prepare_media_stream_source(
            &unsupported_video,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "movie.mkv".to_string(),
                mime_type: None,
                last_modified: None,
            },
            None,
        );
        assert!(matches!(
            unsupported_video_result,
            RpcResult::Error {
                code: Some(code),
                ..
            } if code == ERR_MEDIA_UNSUPPORTED
        ));
    }

    #[test]
    fn prepare_media_stream_uses_catalog_media_info_for_audio_only_mp4() {
        let manager = LocalMediaSourceManager::new();
        let adapter = boxed_adapter(TestAdapter {
            mode: CoreMode::Local,
            unlocked: true,
            metadata: success_metadata_with_media_info(
                "podcast.mp4",
                Some("video/mp4"),
                456,
                serde_json::json!({"k": "audio", "a": 1, "v": 0, "m": "audio/mp4"}),
            ),
        });

        let result = prepare_media_stream_source(
            &adapter,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "podcast.mp4".to_string(),
                mime_type: Some("video/mp4".to_string()),
                last_modified: None,
            },
            None,
        );

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.name, "podcast.mp4");
                assert_eq!(result.mime_type, "audio/mp4");
                assert_eq!(result.size, 456);
            }
            RpcResult::Error { error, .. } => panic!("unexpected audio-only MP4 error: {error}"),
        }
    }
}
