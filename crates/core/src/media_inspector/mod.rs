//! Bounded media metadata inspection.

mod iso_bmff;

use crate::catalog::CatalogMediaInfo;

pub(crate) const MAX_MEDIA_INSPECTION_READ_BYTES: u64 = 8 * 1024 * 1024;
pub(crate) const MAX_ISO_BMFF_BOX_DEPTH: usize = 8;
pub(crate) const MAX_ISO_BMFF_BOX_HEADER_SCAN: u64 = 512 * 1024;

pub struct MediaInspectionInput<'a, R> {
    pub file_name: &'a str,
    pub mime_type: Option<&'a str>,
    pub size: u64,
    pub reader: R,
}

pub trait MediaByteReader {
    fn read_range(&mut self, offset: u64, length: u64) -> Result<Vec<u8>, MediaInspectionError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaInspectionError {
    Cancelled,
    ReadFailed(String),
    ReadLimitExceeded,
    InvalidRange,
}

pub fn inspect_media_info<R: MediaByteReader>(
    input: MediaInspectionInput<'_, R>,
) -> Result<Option<CatalogMediaInfo>, MediaInspectionError> {
    if !is_iso_bmff_candidate(input.file_name, input.mime_type) {
        return Ok(None);
    }

    let mut reader = BoundedMediaReader::new(input.reader);
    Ok(iso_bmff::inspect_iso_bmff(input.size, &mut reader).unwrap_or(None))
}

pub(crate) fn is_iso_bmff_candidate(file_name: &str, mime_type: Option<&str>) -> bool {
    if let Some(mime_type) = mime_type {
        let normalized = mime_type
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        if matches!(
            normalized.as_str(),
            "video/mp4" | "audio/mp4" | "video/quicktime"
        ) {
            return true;
        }
    }

    let Some(extension) = file_name.rsplit_once('.').map(|(_, extension)| extension) else {
        return false;
    };

    matches!(
        extension.to_ascii_lowercase().as_str(),
        "mp4" | "m4a" | "mov"
    )
}

struct BoundedMediaReader<R> {
    inner: R,
    bytes_read: u64,
}

impl<R> BoundedMediaReader<R> {
    fn new(inner: R) -> Self {
        Self {
            inner,
            bytes_read: 0,
        }
    }
}

impl<R: MediaByteReader> MediaByteReader for BoundedMediaReader<R> {
    fn read_range(&mut self, offset: u64, length: u64) -> Result<Vec<u8>, MediaInspectionError> {
        let next_total = self
            .bytes_read
            .checked_add(length)
            .ok_or(MediaInspectionError::ReadLimitExceeded)?;
        if next_total > MAX_MEDIA_INSPECTION_READ_BYTES {
            return Err(MediaInspectionError::ReadLimitExceeded);
        }

        let bytes = self.inner.read_range(offset, length)?;
        if bytes.len() != length as usize {
            return Err(MediaInspectionError::InvalidRange);
        }
        self.bytes_read = next_total;
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::CatalogMediaKind;

    struct FixtureReader {
        bytes: Vec<u8>,
    }

    impl MediaByteReader for FixtureReader {
        fn read_range(
            &mut self,
            offset: u64,
            length: u64,
        ) -> Result<Vec<u8>, MediaInspectionError> {
            let offset = offset as usize;
            let length = length as usize;
            let Some(end) = offset.checked_add(length) else {
                return Err(MediaInspectionError::InvalidRange);
            };
            let Some(bytes) = self.bytes.get(offset..end) else {
                return Err(MediaInspectionError::InvalidRange);
            };
            Ok(bytes.to_vec())
        }
    }

    #[test]
    fn classifies_minimal_audio_only_mp4() {
        let info = inspect_fixture("podcast.mp4", Some("video/mp4"), minimal_file(&["soun"]))
            .expect("inspection should not fail")
            .expect("audio-only MP4 should be classified");

        assert_eq!(info.kind, CatalogMediaKind::Audio);
        assert_eq!(info.audio_tracks, 1);
        assert_eq!(info.video_tracks, 0);
        assert_eq!(info.playback_mime_type.as_deref(), Some("audio/mp4"));
    }

    #[test]
    fn classifies_minimal_video_only_mp4() {
        let info = inspect_fixture("movie.mp4", Some("video/mp4"), minimal_file(&["vide"]))
            .expect("inspection should not fail")
            .expect("video MP4 should be classified");

        assert_eq!(info.kind, CatalogMediaKind::Video);
        assert_eq!(info.audio_tracks, 0);
        assert_eq!(info.video_tracks, 1);
        assert_eq!(info.playback_mime_type.as_deref(), Some("video/mp4"));
    }

    #[test]
    fn classifies_mixed_mp4_as_video() {
        let info = inspect_fixture(
            "clip.mp4",
            Some("video/mp4"),
            minimal_file(&["soun", "vide"]),
        )
        .expect("inspection should not fail")
        .expect("mixed MP4 should be classified");

        assert_eq!(info.kind, CatalogMediaKind::Video);
        assert_eq!(info.audio_tracks, 1);
        assert_eq!(info.video_tracks, 1);
        assert_eq!(info.playback_mime_type.as_deref(), Some("video/mp4"));
    }

    #[test]
    fn skips_mdat_before_moov() {
        let mut bytes = ftyp_box();
        bytes.extend(full_box(*b"mdat", &[0; 128]));
        bytes.extend(moov_box(&["soun"]));

        let info = inspect_fixture("podcast.mp4", Some("video/mp4"), bytes)
            .expect("inspection should not fail")
            .expect("moov after mdat should be classified");

        assert_eq!(info.kind, CatalogMediaKind::Audio);
        assert_eq!(info.audio_tracks, 1);
        assert_eq!(info.video_tracks, 0);
    }

    #[test]
    fn returns_none_when_moov_is_too_large() {
        let mut bytes = ftyp_box();
        bytes.extend(box_header(
            *b"moov",
            MAX_ISO_BMFF_BOX_HEADER_SCAN.saturating_add(9),
        ));
        bytes.extend([0]);

        let info = inspect_fixture("too-large.mp4", Some("video/mp4"), bytes)
            .expect("inspection should not fail");

        assert!(info.is_none());
    }

    #[test]
    fn returns_none_for_invalid_box_size() {
        let mut bytes = ftyp_box();
        bytes.extend(4u32.to_be_bytes());
        bytes.extend(*b"moov");

        let info = inspect_fixture("invalid.mp4", Some("video/mp4"), bytes)
            .expect("inspection should not fail");

        assert!(info.is_none());
    }

    #[test]
    fn returns_none_for_non_candidates() {
        let info = inspect_fixture("notes.txt", Some("text/plain"), minimal_file(&["soun"]))
            .expect("inspection should not fail");

        assert!(info.is_none());
    }

    fn inspect_fixture(
        file_name: &str,
        mime_type: Option<&str>,
        bytes: Vec<u8>,
    ) -> Result<Option<CatalogMediaInfo>, MediaInspectionError> {
        inspect_media_info(MediaInspectionInput {
            file_name,
            mime_type,
            size: bytes.len() as u64,
            reader: FixtureReader { bytes },
        })
    }

    fn minimal_file<const N: usize>(handlers: &[&str; N]) -> Vec<u8> {
        let mut bytes = ftyp_box();
        bytes.extend(moov_box(handlers));
        bytes
    }

    fn ftyp_box() -> Vec<u8> {
        let mut payload = Vec::new();
        payload.extend(*b"isom");
        payload.extend(0u32.to_be_bytes());
        payload.extend(*b"isom");
        payload.extend(*b"mp42");
        full_box(*b"ftyp", &payload)
    }

    fn moov_box(handlers: &[&str]) -> Vec<u8> {
        let payload = handlers
            .iter()
            .flat_map(|handler| trak_box(handler).into_iter())
            .collect::<Vec<_>>();
        full_box(*b"moov", &payload)
    }

    fn trak_box(handler: &str) -> Vec<u8> {
        full_box(*b"trak", &full_box(*b"mdia", &hdlr_box(handler)))
    }

    fn hdlr_box(handler: &str) -> Vec<u8> {
        let mut payload = Vec::new();
        payload.extend(0u32.to_be_bytes());
        payload.extend(0u32.to_be_bytes());
        payload.extend(handler.as_bytes());
        payload.extend([0; 12]);
        full_box(*b"hdlr", &payload)
    }

    fn full_box(kind: [u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut bytes = box_header(kind, payload.len() as u64);
        bytes.extend(payload);
        bytes
    }

    fn box_header(kind: [u8; 4], payload_size: u64) -> Vec<u8> {
        let size = payload_size + 8;
        let mut bytes = Vec::new();
        bytes.extend((size as u32).to_be_bytes());
        bytes.extend(kind);
        bytes
    }
}
