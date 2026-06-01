use std::sync::{Arc, Mutex};

use chromvoid_core::NodeType;
use serde::Deserialize;
use serde_json::Value;

use crate::app_state::AppState;
use crate::core_adapter::CoreAdapter;
use crate::media_source::{
    effective_catalog_media_mime_type, load_catalog_source_metadata, LocalMediaKind,
    LocalMediaSourceManager,
};
use crate::types::{rpc_ok, RpcResult};

use super::format::PlayableMediaKind;
use super::format::{playable_media_kind_with_media_info, ERR_MEDIA_UNSUPPORTED};
use super::session::{prepared_media_stream_source, PreparedMediaStreamSource};

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

#[tauri::command]
pub(crate) fn prepare_media_stream(
    state: tauri::State<'_, AppState>,
    args: PrepareMediaStreamArgs,
) -> RpcResult<PreparedMediaStreamSource> {
    prepare_media_stream_source(&state.adapter, &state.media_streams, args)
}

#[tauri::command]
pub(crate) fn release_media_stream(
    state: tauri::State<'_, AppState>,
    args: ReleaseMediaStreamArgs,
) -> RpcResult<Value> {
    state.media_streams.release(&args.stream_id);
    rpc_ok(Value::Null)
}

pub(crate) fn prepare_media_stream_source(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    manager: &LocalMediaSourceManager,
    args: PrepareMediaStreamArgs,
) -> RpcResult<PreparedMediaStreamSource> {
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
            )
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
        result: prepared_media_stream_source(&session, metadata.name),
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

    use super::*;
    use crate::core_adapter::CoreMode;

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
        );

        match video_result {
            RpcResult::Success { result, .. } => {
                assert_eq!(result.kind, "media-stream");
                assert_eq!(result.name, "movie.mp4");
                assert_eq!(result.mime_type, "video/mp4");
                assert_eq!(result.size, 456);
                assert!(!result.url.contains("movie.mp4"));
            }
            RpcResult::Error { error, .. } => panic!("unexpected video error: {error}"),
        }
    }

    #[test]
    fn prepare_media_stream_rejects_remote_or_unsupported_sources() {
        let manager = LocalMediaSourceManager::new();
        let remote = boxed_adapter(TestAdapter {
            mode: CoreMode::Switching,
            unlocked: true,
            metadata: success_metadata("track.mp3", Some("audio/mpeg"), 123),
        });
        let remote_result = prepare_media_stream_source(
            &remote,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 9,
                file_name: "track.mp3".to_string(),
                mime_type: None,
                last_modified: None,
            },
        );
        assert!(matches!(
            remote_result,
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
