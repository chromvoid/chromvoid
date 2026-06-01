use crate::error::Error;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::error::StorageGcResult;
use super::types::{StorageGcCandidate, StorageGcDeleteManifest, StorageGcDeleteManifestRead};

pub(super) const STORAGE_GC_MANIFEST_CONTEXT: &[u8] = b"admin-storage-gc-delete-manifest:v1";

pub(super) fn read_delete_manifest(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> StorageGcResult<StorageGcDeleteManifestRead> {
    let name = storage_gc_manifest_chunk_name(vault_key);
    if !storage.chunk_exists(&name)? {
        return Ok(StorageGcDeleteManifestRead::Missing);
    }
    let encrypted = match storage.read_chunk(&name) {
        Ok(encrypted) => encrypted,
        Err(Error::ChunkNotFound(_)) => return Ok(StorageGcDeleteManifestRead::Missing),
        Err(error) => return Err(error.into()),
    };
    let Ok(plain) = crate::crypto::decrypt(&encrypted, vault_key, name.as_bytes()) else {
        return Ok(StorageGcDeleteManifestRead::Corrupt);
    };
    let Ok(manifest) = serde_json::from_slice::<StorageGcDeleteManifest>(&plain) else {
        return Ok(StorageGcDeleteManifestRead::Corrupt);
    };
    if manifest.version != 1 || manifest.gc_id.is_empty() {
        return Ok(StorageGcDeleteManifestRead::Corrupt);
    }
    Ok(StorageGcDeleteManifestRead::Valid(manifest))
}

pub(super) fn write_delete_manifest(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    gc_id: &str,
    candidates: &[StorageGcCandidate],
) -> StorageGcResult<()> {
    let manifest = StorageGcDeleteManifest {
        version: 1,
        gc_id: gc_id.to_string(),
        candidates: candidates.to_vec(),
    };
    let plain = serde_json::to_vec(&manifest)?;
    let name = storage_gc_manifest_chunk_name(vault_key);
    let encrypted = crate::crypto::encrypt(&plain, vault_key, name.as_bytes())?;
    let mut batch = storage.begin_chunk_write_batch("storage-gc-manifest");
    batch.write_chunk(name, &encrypted)?;
    match batch.commit() {
        Ok(_) => Ok(()),
        Err(error) => {
            batch.rollback_temps();
            Err(error.into())
        }
    }
}

pub(super) fn delete_storage_gc_manifest(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> StorageGcResult<()> {
    let manifest_name = storage_gc_manifest_chunk_name(vault_key);
    if storage.chunk_exists(&manifest_name)? {
        storage.delete_chunk(&manifest_name)?;
        storage.sync()?;
    }
    Ok(())
}

fn storage_gc_manifest_chunk_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::chunk_name_u64(vault_key, STORAGE_GC_MANIFEST_CONTEXT, 0)
}
