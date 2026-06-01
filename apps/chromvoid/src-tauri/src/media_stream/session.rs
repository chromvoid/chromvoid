use serde::Serialize;

use crate::media_source::LocalMediaSourceSession;

pub const SCHEME: &str = "chromvoid-media";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedMediaStreamSource {
    pub kind: &'static str,
    pub stream_id: String,
    pub url: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub source_revision: u64,
    pub expires_at: u64,
}

pub(crate) fn prepared_media_stream_source(
    session: &LocalMediaSourceSession,
    name: String,
) -> PreparedMediaStreamSource {
    PreparedMediaStreamSource {
        kind: "media-stream",
        stream_id: session.token.clone(),
        url: format!("{SCHEME}://localhost/{}", session.token),
        name,
        mime_type: session.mime_type.clone(),
        size: session.size,
        source_revision: session.source_revision,
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
        let source = prepared_media_stream_source(&session, "private-track.mp3".to_string());

        assert_eq!(source.kind, "media-stream");
        assert!(source.url.starts_with("chromvoid-media://localhost/"));
        assert!(!source.url.contains("private-track"));
        assert_eq!(manager.count(), 1);
    }

    #[test]
    fn release_is_idempotent() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register media source");
        let source = prepared_media_stream_source(&session, "track.mp3".to_string());

        assert!(manager.release(&source.stream_id));
        assert!(!manager.release(&source.stream_id));
        assert_eq!(manager.count(), 0);
    }
}
