use chromvoid_core::catalog::{CatalogMediaInfo, CatalogMediaKind};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlayableMediaKind {
    Audio,
    Video,
}

pub const ERR_MEDIA_UNSUPPORTED: &str = "ERR_MEDIA_UNSUPPORTED";

const PLAYABLE_AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "m4a", "aac"];
const PLAYABLE_AUDIO_MIME_TYPES: &[&str] = &[
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",
];
const PLAYABLE_VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov"];
const PLAYABLE_VIDEO_MIME_TYPES: &[&str] = &["video/mp4", "video/webm", "video/quicktime"];
const AUDIO_FALLBACK_EXTENSIONS: &[&str] = &["flac", "wma"];
const VIDEO_FALLBACK_EXTENSIONS: &[&str] = &["avi", "mkv", "wmv", "flv"];

pub fn playable_media_kind(
    file_name: &str,
    mime_type: Option<&str>,
) -> Result<PlayableMediaKind, &'static str> {
    match detect_playable_media_kind(file_name, mime_type) {
        Some(kind) => Ok(kind),
        None => Err(ERR_MEDIA_UNSUPPORTED),
    }
}

pub fn playable_media_kind_with_media_info(
    file_name: &str,
    mime_type: Option<&str>,
    media_info: Option<&CatalogMediaInfo>,
) -> Result<PlayableMediaKind, &'static str> {
    match detect_playable_media_kind_with_media_info(file_name, mime_type, media_info) {
        Some(kind) => Ok(kind),
        None => Err(ERR_MEDIA_UNSUPPORTED),
    }
}

pub fn detect_playable_media_kind(
    file_name: &str,
    mime_type: Option<&str>,
) -> Option<PlayableMediaKind> {
    let extension = file_extension(file_name);
    if matches_extension(extension, PLAYABLE_AUDIO_EXTENSIONS) {
        return Some(PlayableMediaKind::Audio);
    }
    if matches_extension(extension, PLAYABLE_VIDEO_EXTENSIONS) {
        return Some(PlayableMediaKind::Video);
    }
    if matches_extension(extension, AUDIO_FALLBACK_EXTENSIONS)
        || matches_extension(extension, VIDEO_FALLBACK_EXTENSIONS)
    {
        return None;
    }

    let mime_type = normalize_mime_type(mime_type)?;
    if PLAYABLE_AUDIO_MIME_TYPES.contains(&mime_type.as_str()) {
        return Some(PlayableMediaKind::Audio);
    }
    if PLAYABLE_VIDEO_MIME_TYPES.contains(&mime_type.as_str()) {
        return Some(PlayableMediaKind::Video);
    }

    None
}

pub fn detect_playable_media_kind_with_media_info(
    file_name: &str,
    mime_type: Option<&str>,
    media_info: Option<&CatalogMediaInfo>,
) -> Option<PlayableMediaKind> {
    match media_info.map(|info| &info.kind) {
        Some(CatalogMediaKind::Audio) => Some(PlayableMediaKind::Audio),
        Some(CatalogMediaKind::Video) => Some(PlayableMediaKind::Video),
        None => detect_playable_media_kind(file_name, mime_type),
    }
}

pub fn is_playable_audio(file_name: &str, mime_type: Option<&str>) -> bool {
    detect_playable_media_kind(file_name, mime_type) == Some(PlayableMediaKind::Audio)
}

pub fn is_playable_video(file_name: &str, mime_type: Option<&str>) -> bool {
    detect_playable_media_kind(file_name, mime_type) == Some(PlayableMediaKind::Video)
}

fn file_extension(file_name: &str) -> Option<&str> {
    let (stem, extension) = file_name.rsplit_once('.')?;
    if stem.is_empty() || extension.is_empty() {
        return None;
    }
    Some(extension)
}

fn matches_extension(extension: Option<&str>, allowed: &[&str]) -> bool {
    extension
        .map(|extension| {
            allowed
                .iter()
                .any(|candidate| extension.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}

fn normalize_mime_type(mime_type: Option<&str>) -> Option<String> {
    let mime_type = mime_type?.split(';').next()?.trim();
    if mime_type.is_empty() {
        return None;
    }
    Some(mime_type.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::catalog::{CatalogMediaInfo, CatalogMediaKind};

    #[test]
    fn media_stream_format_accepts_playable_audio_extensions() {
        for extension in PLAYABLE_AUDIO_EXTENSIONS {
            let file_name = format!("track.{extension}");

            assert_eq!(
                playable_media_kind(&file_name, None),
                Ok(PlayableMediaKind::Audio),
                "{file_name}"
            );
            assert!(is_playable_audio(&file_name, None), "{file_name}");
        }
    }

    #[test]
    fn media_stream_format_accepts_playable_audio_mime_types() {
        for mime_type in PLAYABLE_AUDIO_MIME_TYPES {
            assert_eq!(
                playable_media_kind("track.bin", Some(mime_type)),
                Ok(PlayableMediaKind::Audio),
                "{mime_type}"
            );
        }
    }

    #[test]
    fn media_stream_format_accepts_playable_video_extensions() {
        for extension in PLAYABLE_VIDEO_EXTENSIONS {
            let file_name = format!("movie.{extension}");

            assert_eq!(
                playable_media_kind(&file_name, None),
                Ok(PlayableMediaKind::Video),
                "{file_name}"
            );
            assert!(is_playable_video(&file_name, None), "{file_name}");
        }
    }

    #[test]
    fn media_stream_format_accepts_playable_video_mime_types() {
        for mime_type in PLAYABLE_VIDEO_MIME_TYPES {
            assert_eq!(
                playable_media_kind("movie.bin", Some(mime_type)),
                Ok(PlayableMediaKind::Video),
                "{mime_type}"
            );
        }
    }

    #[test]
    fn media_stream_format_rejects_recognized_but_non_playable_media() {
        for (file_name, mime_type) in [
            ("album.flac", None),
            ("album.flac", Some("audio/mpeg")),
            ("legacy.wma", None),
            ("movie.mkv", None),
            ("movie.mkv", Some("video/mp4")),
            ("movie.avi", None),
            ("download.bin", Some("audio/flac")),
            ("download.bin", Some("video/x-matroska")),
        ] {
            assert_eq!(
                playable_media_kind(file_name, mime_type),
                Err(ERR_MEDIA_UNSUPPORTED)
            );
        }
    }

    #[test]
    fn media_stream_format_normalizes_case_and_mime_parameters() {
        assert_eq!(
            playable_media_kind("TRACK.MP3", Some("application/octet-stream")),
            Ok(PlayableMediaKind::Audio)
        );
        assert_eq!(
            playable_media_kind("download.bin", Some("VIDEO/MP4; codecs=\"avc1\"")),
            Ok(PlayableMediaKind::Video)
        );
    }

    #[test]
    fn media_stream_format_uses_catalog_media_info_before_extension_or_mime() {
        let audio_only_mp4 = CatalogMediaInfo {
            kind: CatalogMediaKind::Audio,
            audio_tracks: 1,
            video_tracks: 0,
            playback_mime_type: Some("audio/mp4".to_string()),
        };
        let video_m4a = CatalogMediaInfo {
            kind: CatalogMediaKind::Video,
            audio_tracks: 1,
            video_tracks: 1,
            playback_mime_type: Some("video/mp4".to_string()),
        };

        assert_eq!(
            playable_media_kind_with_media_info(
                "podcast.mp4",
                Some("video/mp4"),
                Some(&audio_only_mp4)
            ),
            Ok(PlayableMediaKind::Audio)
        );
        assert_eq!(
            playable_media_kind_with_media_info("clip.m4a", Some("audio/mp4"), Some(&video_m4a)),
            Ok(PlayableMediaKind::Video)
        );
    }
}
