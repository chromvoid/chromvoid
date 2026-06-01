use std::collections::HashSet;

use crate::error::Error;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::error::{StorageGcError, StorageGcResult};
use super::live_set::StorageGcLiveSetService;
use super::manifest::{delete_storage_gc_manifest, read_delete_manifest, write_delete_manifest};
use super::types::{
    StorageGcCandidate, StorageGcDeleteManifestRead, StorageGcDeleteResult, StorageGcScanSession,
};

pub(super) struct StorageGcDeleteService;

impl StorageGcDeleteService {
    pub(super) fn delete_scan(
        storage: &Storage,
        session: &VaultSession,
        scan: StorageGcScanSession,
    ) -> StorageGcResult<StorageGcDeleteResult> {
        let live = StorageGcLiveSetService::collect(storage, session)?;
        let mut delete_candidates = Vec::new();
        let mut skipped_chunks = Vec::<String>::new();
        for candidate in &scan.candidates {
            let verified = candidate_matches_for_delete(
                storage,
                &live,
                candidate,
                CandidateReadFailure::Skip,
            )?;
            if verified {
                delete_candidates.push(candidate.clone());
            } else {
                skipped_chunks.push(candidate.name.clone());
            }
        }

        write_delete_manifest(
            storage,
            session.vault_key(),
            &scan.gc_id,
            &delete_candidates,
        )?;

        let mut deleted_chunks = Vec::<String>::new();
        let mut deleted_bytes = 0u64;
        for candidate in delete_candidates {
            if live.contains(&candidate.name) {
                skipped_chunks.push(candidate.name);
                continue;
            }
            storage.delete_chunk(&candidate.name)?;
            deleted_bytes = deleted_bytes.saturating_add(candidate.bytes);
            deleted_chunks.push(candidate.name);
        }
        storage.sync()?;
        delete_storage_gc_manifest(storage, session.vault_key())?;

        Ok(StorageGcDeleteResult {
            gc_id: scan.gc_id,
            deleted_chunks,
            deleted_bytes,
            skipped_chunks,
        })
    }

    pub(super) fn recover_manifest(
        storage: &Storage,
        session: &VaultSession,
    ) -> StorageGcResult<()> {
        match read_delete_manifest(storage, session.vault_key())? {
            StorageGcDeleteManifestRead::Missing => Ok(()),
            StorageGcDeleteManifestRead::Corrupt => {
                delete_storage_gc_manifest(storage, session.vault_key())
            }
            StorageGcDeleteManifestRead::Valid(manifest) => {
                let live = StorageGcLiveSetService::collect(storage, session)?;
                for candidate in &manifest.candidates {
                    if !candidate_matches_for_delete(
                        storage,
                        &live,
                        candidate,
                        CandidateReadFailure::ReturnError,
                    )? {
                        continue;
                    }
                    storage.delete_chunk(&candidate.name)?;
                }
                storage.sync()?;
                delete_storage_gc_manifest(storage, session.vault_key())
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum CandidateReadFailure {
    Skip,
    ReturnError,
}

fn candidate_matches_for_delete(
    storage: &Storage,
    live: &HashSet<String>,
    candidate: &StorageGcCandidate,
    read_failure: CandidateReadFailure,
) -> StorageGcResult<bool> {
    if live.contains(&candidate.name) {
        return Ok(false);
    }
    let data = match storage.read_chunk(&candidate.name) {
        Ok(data) => data,
        Err(Error::ChunkNotFound(_)) => return Ok(false),
        Err(error) => match read_failure {
            CandidateReadFailure::Skip => return Ok(false),
            CandidateReadFailure::ReturnError => return Err(StorageGcError::from(error)),
        },
    };
    Ok(
        data.len() as u64 == candidate.bytes
            && crate::crypto::sha256_hex(&data) == candidate.sha256,
    )
}
