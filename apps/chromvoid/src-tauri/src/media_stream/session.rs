use serde::Serialize;

use crate::media_source::LocalMediaSourceSession;

pub const SCHEME: &str = "chromvoid-media";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreparedMediaStreamDelivery {
    CustomScheme,
    LoopbackHttp,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreparedVideoProvider {
    LocalCatalog,
    MobileLocalCatalog,
    RemoteUsb,
    RemoteNetwork,
    Mock,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "delivery",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PreparedVideoDelivery {
    LoopbackHttp {
        platform: &'static str,
        url: String,
    },
    Mse {
        platform: &'static str,
        #[serde(skip_serializing_if = "Option::is_none")]
        fetch_url: Option<String>,
        init_segment: PreparedVideoByteRange,
        media_segments: Vec<PreparedVideoSegmentRange>,
    },
    NativeVideo {
        platform: &'static str,
        native_source_token: String,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedVideoByteRange {
    pub offset: u64,
    pub length: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreparedVideoSegmentRange {
    pub offset: u64,
    pub length: u64,
    pub timestamp_us: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedMediaStreamSource {
    pub kind: &'static str,
    pub stream_id: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_url: Option<String>,
    pub delivery: PreparedMediaStreamDelivery,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub source_revision: u64,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedVideoSource {
    pub kind: &'static str,
    pub stream_id: String,
    pub source_token: String,
    pub platform: &'static str,
    pub provider: PreparedVideoProvider,
    pub deliveries: Vec<PreparedVideoDelivery>,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub source_revision: u64,
    pub media_source_generation: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_session_generation: Option<u64>,
    pub app_foreground_epoch: u64,
    pub expires_at: u64,
}

pub(crate) fn prepared_media_stream_source(
    session: &LocalMediaSourceSession,
    name: String,
    loopback_base_url: Option<String>,
) -> PreparedMediaStreamSource {
    let custom_scheme_url = format!("{SCHEME}://localhost/{}", session.token);
    let (url, fallback_url, delivery) = match loopback_base_url {
        Some(base_url) => (
            format!("{}/media/{}", base_url.trim_end_matches('/'), session.token),
            Some(custom_scheme_url),
            PreparedMediaStreamDelivery::LoopbackHttp,
        ),
        None => (
            custom_scheme_url,
            None,
            PreparedMediaStreamDelivery::CustomScheme,
        ),
    };

    PreparedMediaStreamSource {
        kind: "media-stream",
        stream_id: session.token.clone(),
        url,
        fallback_url,
        delivery,
        name,
        mime_type: session.mime_type.clone(),
        size: session.size,
        source_revision: session.source_revision,
        expires_at: session.expires_at,
    }
}

pub(crate) fn prepared_video_source(
    session: &LocalMediaSourceSession,
    name: String,
    platform: &'static str,
    provider: PreparedVideoProvider,
    deliveries: Vec<PreparedVideoDelivery>,
    transport_session_generation: Option<u64>,
) -> PreparedVideoSource {
    PreparedVideoSource {
        kind: "video-source",
        stream_id: session.token.clone(),
        source_token: session.token.clone(),
        platform,
        provider,
        deliveries,
        name,
        mime_type: session.mime_type.clone(),
        size: session.size,
        source_revision: session.source_revision,
        media_source_generation: session.generation,
        transport_session_generation,
        app_foreground_epoch: 1,
        expires_at: session.expires_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media_source::{LocalMediaKind, LocalMediaSourceManager};

    #[test]
    fn register_returns_opaque_url_without_name() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1024, 42)
            .expect("register media source");
        let source = prepared_media_stream_source(&session, "private-track.mp3".to_string(), None);

        assert_eq!(source.kind, "media-stream");
        assert!(source.url.starts_with("chromvoid-media://localhost/"));
        assert_eq!(source.delivery, PreparedMediaStreamDelivery::CustomScheme);
        assert!(source.fallback_url.is_none());
        assert!(!source.url.contains("private-track"));
        assert_eq!(manager.count(), 1);
    }

    #[test]
    fn register_can_return_loopback_http_url_with_custom_scheme_fallback() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Video, "video/mp4".to_string(), 1024, 42)
            .expect("register media source");
        let source = prepared_media_stream_source(
            &session,
            "private-video.mp4".to_string(),
            Some("http://127.0.0.1:43210".to_string()),
        );

        assert_eq!(source.kind, "media-stream");
        assert!(source.url.starts_with("http://127.0.0.1:43210/media/"));
        assert_eq!(source.delivery, PreparedMediaStreamDelivery::LoopbackHttp);
        assert!(source
            .fallback_url
            .as_deref()
            .is_some_and(|url| url.starts_with("chromvoid-media://localhost/")));
        assert!(!source.url.contains("private-video"));
    }

    #[test]
    fn release_is_idempotent() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register media source");
        let source = prepared_media_stream_source(&session, "track.mp3".to_string(), None);

        assert!(manager.release(&source.stream_id));
        assert!(!manager.release(&source.stream_id));
        assert_eq!(manager.count(), 0);
    }
}
