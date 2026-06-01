use std::io::{BufReader, Read, Seek};

use lofty::config::ParseOptions;
use lofty::file::{FileType, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::probe::Probe;

pub(crate) const ARTWORK_METADATA_RANGE_BUDGET_BYTES: u64 = 8 * 1024 * 1024;
pub(crate) const ARTWORK_METADATA_RANGE_CHUNK_BYTES: u64 = 128 * 1024;

const AUDIO_ARTWORK_EXTENSIONS: &[&str] = &[
    "aac", "aiff", "aif", "ape", "flac", "m4a", "m4b", "m4p", "m4r", "mp1", "mp2", "mp3", "mp4",
    "mpc", "oga", "ogg", "opus", "speex", "wav", "wave", "wv",
];

pub(crate) struct EmbeddedAudioArtwork {
    pub(crate) bytes: Vec<u8>,
    pub(crate) mime_type: &'static str,
}

pub(crate) fn is_audio_artwork_candidate(file_name: &str, mime_type: Option<&str>) -> bool {
    let ext = extension(file_name);
    if AUDIO_ARTWORK_EXTENSIONS.contains(&ext.as_str()) {
        return true;
    }

    let normalized_mime = normalize_mime(mime_type);
    normalized_mime.starts_with("audio/")
        || matches!(
            normalized_mime.as_str(),
            "application/ogg" | "application/x-ogg"
        )
}

pub(crate) fn extract_embedded_artwork<R>(
    reader: R,
    file_name: &str,
    mime_type: Option<&str>,
) -> Result<Option<EmbeddedAudioArtwork>, String>
where
    R: Read + Seek,
{
    let reader = BufReader::new(reader);
    let options = ParseOptions::new().read_properties(false);
    let probe = match resolve_file_type(file_name, mime_type) {
        Some(file_type) => Probe::with_file_type(reader, file_type),
        None => Probe::new(reader)
            .guess_file_type()
            .map_err(|error| format!("Failed to detect audio file type: {error}"))?,
    };
    let tagged_file = probe
        .options(options)
        .read()
        .map_err(|error| format!("Failed to read audio metadata: {error}"))?;

    let pictures = tagged_file
        .tags()
        .iter()
        .flat_map(|tag| tag.pictures().iter());
    let Some(picture) = select_picture(pictures) else {
        return Ok(None);
    };
    let Some(mime_type) = supported_picture_mime(picture) else {
        return Ok(None);
    };

    Ok(Some(EmbeddedAudioArtwork {
        bytes: picture.data().to_vec(),
        mime_type,
    }))
}

fn select_picture<'a>(pictures: impl Iterator<Item = &'a Picture>) -> Option<&'a Picture> {
    let mut first_supported = None;

    for picture in pictures {
        if supported_picture_mime(picture).is_none() {
            continue;
        }
        if picture.pic_type() == PictureType::CoverFront {
            return Some(picture);
        }
        if first_supported.is_none() {
            first_supported = Some(picture);
        }
    }

    first_supported
}

fn supported_picture_mime(picture: &Picture) -> Option<&'static str> {
    if let Some(mime_type) = picture.mime_type().and_then(supported_lofty_mime) {
        return Some(mime_type);
    }

    supported_mime_from_bytes(picture.data())
}

fn supported_lofty_mime(mime_type: &MimeType) -> Option<&'static str> {
    match mime_type {
        MimeType::Jpeg => Some("image/jpeg"),
        MimeType::Png => Some("image/png"),
        MimeType::Tiff => Some("image/tiff"),
        MimeType::Bmp => Some("image/bmp"),
        MimeType::Gif => Some("image/gif"),
        MimeType::Unknown(value) => supported_mime_from_name(value),
        _ => None,
    }
}

fn supported_mime_from_name(value: &str) -> Option<&'static str> {
    match normalize_mime(Some(value)).as_str() {
        "image/jpeg" | "image/jpg" => Some("image/jpeg"),
        "image/png" => Some("image/png"),
        "image/tiff" | "image/tif" => Some("image/tiff"),
        "image/bmp" | "image/x-ms-bmp" => Some("image/bmp"),
        "image/gif" => Some("image/gif"),
        _ => None,
    }
}

fn supported_mime_from_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.starts_with(b"BM") {
        return Some("image/bmp");
    }
    if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
        return Some("image/tiff");
    }

    None
}

fn resolve_file_type(file_name: &str, mime_type: Option<&str>) -> Option<FileType> {
    let ext = extension(file_name);
    if let Some(file_type) = FileType::from_ext(ext.as_str()) {
        return Some(file_type);
    }

    match normalize_mime(mime_type).as_str() {
        "audio/aac" | "audio/aacp" => Some(FileType::Aac),
        "audio/aiff" | "audio/x-aiff" => Some(FileType::Aiff),
        "audio/flac" | "audio/x-flac" => Some(FileType::Flac),
        "audio/mpeg" | "audio/mp3" | "audio/mp4a-latm" => Some(FileType::Mpeg),
        "audio/mp4" | "audio/x-m4a" | "video/mp4" => Some(FileType::Mp4),
        "audio/ogg" | "application/ogg" | "application/x-ogg" => Some(FileType::Vorbis),
        "audio/opus" => Some(FileType::Opus),
        "audio/wav" | "audio/wave" | "audio/x-wav" => Some(FileType::Wav),
        "audio/x-ape" | "audio/ape" => Some(FileType::Ape),
        "audio/x-musepack" => Some(FileType::Mpc),
        "audio/wavpack" | "audio/x-wavpack" => Some(FileType::WavPack),
        _ => None,
    }
}

fn extension(file_name: &str) -> String {
    file_name
        .rsplit('.')
        .next()
        .map(|part| part.trim().to_ascii_lowercase())
        .unwrap_or_default()
}

fn normalize_mime(mime_type: Option<&str>) -> String {
    mime_type
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}
