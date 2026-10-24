//! One metadata merge policy for ordinary uploads and reviewed imports.
use super::{
    normalize::NormalizedIconPayload,
    types::{IconIndexFile, IconIndexRecord},
};

pub(super) fn upsert(
    index: &mut IconIndexFile,
    normalized: &NormalizedIconPayload,
    background_color: Option<String>,
) -> (IconIndexRecord, bool) {
    let digest = crate::crypto::sha256_hex(&normalized.bytes);
    let now = super::super::path::now_unix_ms();
    if let Some(record) = index
        .icons
        .iter_mut()
        .find(|record| record.sha256 == digest)
    {
        record.updated_at = now;
        if record.mime_type.is_empty() {
            record.mime_type = normalized.mime_type.clone();
        }
        if record.ext.is_empty() {
            record.ext = normalized.ext.clone();
        }
        if record.width == 0 {
            record.width = normalized.width;
        }
        if record.height == 0 {
            record.height = normalized.height;
        }
        if record.bytes == 0 {
            record.bytes = normalized.bytes.len() as u64;
        }
        if background_color.is_some() {
            record.background_color = background_color;
        }
        return (record.clone(), false);
    }
    let record = IconIndexRecord {
        sha256: digest,
        mime_type: normalized.mime_type.clone(),
        ext: normalized.ext.clone(),
        width: normalized.width,
        height: normalized.height,
        bytes: normalized.bytes.len() as u64,
        background_color,
        created_at: now,
        updated_at: now,
    };
    index.icons.push(record.clone());
    (record, true)
}
