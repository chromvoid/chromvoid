use crate::catalog::{CatalogMediaInfo, CatalogMediaKind};

use super::{
    MediaByteReader, MediaInspectionError, MAX_ISO_BMFF_BOX_DEPTH, MAX_ISO_BMFF_BOX_HEADER_SCAN,
};

pub(super) fn inspect_iso_bmff<R: MediaByteReader>(
    size: u64,
    reader: &mut R,
) -> Result<Option<CatalogMediaInfo>, MediaInspectionError> {
    if size < 8 {
        return Ok(None);
    }

    let mut stats = TrackStats::default();
    let mut scanner = ScannerState::default();
    if scan_boxes(reader, 0, size, 0, &mut stats, &mut scanner).is_err() {
        return Ok(None);
    }

    if stats.video_tracks > 0 {
        return Ok(Some(CatalogMediaInfo {
            kind: CatalogMediaKind::Video,
            audio_tracks: stats.audio_tracks,
            video_tracks: stats.video_tracks,
            playback_mime_type: Some("video/mp4".to_string()),
        }));
    }

    if stats.audio_tracks > 0 {
        return Ok(Some(CatalogMediaInfo {
            kind: CatalogMediaKind::Audio,
            audio_tracks: stats.audio_tracks,
            video_tracks: 0,
            playback_mime_type: Some("audio/mp4".to_string()),
        }));
    }

    Ok(None)
}

fn scan_boxes<R: MediaByteReader>(
    reader: &mut R,
    start: u64,
    end: u64,
    depth: usize,
    stats: &mut TrackStats,
    scanner: &mut ScannerState,
) -> Result<(), MediaInspectionError> {
    if depth > MAX_ISO_BMFF_BOX_DEPTH || start > end {
        return Err(MediaInspectionError::InvalidRange);
    }

    let mut offset = start;
    while offset < end {
        let remaining = end - offset;
        if remaining < 8 {
            return Err(MediaInspectionError::InvalidRange);
        }

        let header = read_box_header(reader, offset, end, scanner)?;
        if header.end > end || header.size < header.header_size {
            return Err(MediaInspectionError::InvalidRange);
        }

        match &header.kind {
            b"moov" => {
                let payload_size = header.payload_size();
                if payload_size > MAX_ISO_BMFF_BOX_HEADER_SCAN {
                    return Err(MediaInspectionError::ReadLimitExceeded);
                }
                scan_boxes(
                    reader,
                    header.payload_offset,
                    header.end,
                    depth + 1,
                    stats,
                    scanner,
                )?;
            }
            b"trak" | b"mdia" => {
                scan_boxes(
                    reader,
                    header.payload_offset,
                    header.end,
                    depth + 1,
                    stats,
                    scanner,
                )?;
            }
            b"hdlr" => {
                scan_handler(reader, &header, stats)?;
            }
            b"mdat" => {}
            _ => {}
        }

        if header.end <= offset {
            return Err(MediaInspectionError::InvalidRange);
        }
        offset = header.end;
    }

    Ok(())
}

fn read_box_header<R: MediaByteReader>(
    reader: &mut R,
    offset: u64,
    parent_end: u64,
    scanner: &mut ScannerState,
) -> Result<BoxHeader, MediaInspectionError> {
    scanner.add_header_bytes(8)?;
    let bytes = reader.read_range(offset, 8)?;
    let size32 = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as u64;
    let kind = [bytes[4], bytes[5], bytes[6], bytes[7]];

    let (size, header_size) = match size32 {
        0 => (parent_end - offset, 8),
        1 => {
            scanner.add_header_bytes(8)?;
            let extended = reader.read_range(offset + 8, 8)?;
            (
                u64::from_be_bytes([
                    extended[0],
                    extended[1],
                    extended[2],
                    extended[3],
                    extended[4],
                    extended[5],
                    extended[6],
                    extended[7],
                ]),
                16,
            )
        }
        size => (size, 8),
    };

    let end = offset
        .checked_add(size)
        .ok_or(MediaInspectionError::InvalidRange)?;
    let payload_offset = offset
        .checked_add(header_size)
        .ok_or(MediaInspectionError::InvalidRange)?;

    Ok(BoxHeader {
        kind,
        size,
        header_size,
        payload_offset,
        end,
    })
}

fn scan_handler<R: MediaByteReader>(
    reader: &mut R,
    header: &BoxHeader,
    stats: &mut TrackStats,
) -> Result<(), MediaInspectionError> {
    if header.payload_size() < 12 {
        return Err(MediaInspectionError::InvalidRange);
    }

    let bytes = reader.read_range(header.payload_offset + 8, 4)?;
    match bytes.as_slice() {
        b"soun" => stats.audio_tracks = stats.audio_tracks.saturating_add(1),
        b"vide" => stats.video_tracks = stats.video_tracks.saturating_add(1),
        _ => {}
    }

    Ok(())
}

#[derive(Debug)]
struct BoxHeader {
    kind: [u8; 4],
    size: u64,
    header_size: u64,
    payload_offset: u64,
    end: u64,
}

impl BoxHeader {
    fn payload_size(&self) -> u64 {
        self.size - self.header_size
    }
}

#[derive(Default)]
struct TrackStats {
    audio_tracks: u16,
    video_tracks: u16,
}

#[derive(Default)]
struct ScannerState {
    header_bytes: u64,
}

impl ScannerState {
    fn add_header_bytes(&mut self, bytes: u64) -> Result<(), MediaInspectionError> {
        self.header_bytes = self
            .header_bytes
            .checked_add(bytes)
            .ok_or(MediaInspectionError::ReadLimitExceeded)?;
        if self.header_bytes > MAX_ISO_BMFF_BOX_HEADER_SCAN {
            return Err(MediaInspectionError::ReadLimitExceeded);
        }
        Ok(())
    }
}
