//! Shared local backup pack manifest contracts.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

pub(in crate::rpc::router) const BACKUP_PACK_FORMAT_VERSION: u64 = 2;
pub(in crate::rpc::router) const BACKUP_PACK_FILE_NAME: &str = "chunks.pack";
pub(in crate::rpc::router) const BACKUP_PACK_STREAM_CHUNK_SIZE: u32 = 1024 * 1024;

/// Upper bound on a single declared chunk size in a restore manifest.
///
/// A restore client controls `chunk.size`, and the upload path allocates a
/// buffer of that size up front (`buffer.resize(size, 0)`). Without a bound a
/// manifest declaring e.g. `u64::MAX` forces an immediate huge allocation that
/// aborts the process. Real encrypted chunks are at most a few MiB; 512 MiB is
/// generous headroom while still preventing the DoS.
pub(in crate::rpc::router) const MAX_MANIFEST_CHUNK_BYTES: u64 = 512 * 1024 * 1024;

/// Upper bound on the total declared pack size in a restore manifest, to reject
/// absurd manifests before any chunk is read or written.
pub(in crate::rpc::router) const MAX_MANIFEST_TOTAL_BYTES: u64 = 64 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(in crate::rpc::router) struct BackupChunkManifest {
    pub v: u64,
    pub chunk_count: u64,
    pub total_size: u64,
    pub chunks: Vec<BackupChunkManifestEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(in crate::rpc::router) struct BackupChunkManifestEntry {
    pub name: String,
    pub size: u64,
}

impl BackupChunkManifest {
    pub fn new(chunks: Vec<BackupChunkManifestEntry>) -> Self {
        let total_size = chunks
            .iter()
            .fold(0_u64, |total, chunk| total.saturating_add(chunk.size));
        Self {
            v: BACKUP_PACK_FORMAT_VERSION,
            chunk_count: chunks.len() as u64,
            total_size,
            chunks,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.v != BACKUP_PACK_FORMAT_VERSION {
            return Err("Unsupported chunks.manifest.json version".to_string());
        }
        if self.chunk_count != self.chunks.len() as u64 {
            return Err("chunks.manifest.json chunk_count mismatch".to_string());
        }

        let mut total_size = 0_u64;
        let mut seen = HashSet::new();
        for chunk in &self.chunks {
            if !is_valid_chunk_name(&chunk.name) {
                return Err(format!("Invalid chunk name in manifest: {}", chunk.name));
            }
            if !seen.insert(chunk.name.clone()) {
                return Err(format!("Duplicate chunk name in manifest: {}", chunk.name));
            }
            if chunk.size > MAX_MANIFEST_CHUNK_BYTES {
                return Err(format!(
                    "chunks.manifest.json chunk size exceeds limit: {} > {}",
                    chunk.size, MAX_MANIFEST_CHUNK_BYTES
                ));
            }
            total_size = total_size.saturating_add(chunk.size);
        }
        if self.total_size != total_size {
            return Err("chunks.manifest.json total_size mismatch".to_string());
        }
        if self.total_size > MAX_MANIFEST_TOTAL_BYTES {
            return Err(format!(
                "chunks.manifest.json total_size exceeds limit: {} > {}",
                self.total_size, MAX_MANIFEST_TOTAL_BYTES
            ));
        }

        Ok(())
    }
}

pub(in crate::rpc::router) fn is_valid_chunk_name(name: &str) -> bool {
    name.len() == 64 && name.bytes().all(|byte| byte.is_ascii_hexdigit())
}
