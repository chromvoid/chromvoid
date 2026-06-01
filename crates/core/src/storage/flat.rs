//! Flat storage handle and backend entry point.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::Result;
use crate::storage::backend::{
    ChunkWriteBatchTemp, StorageArtifactWriteError, StorageArtifactWriteOutcome,
    StorageArtifactWriteTemp, StorageBackend,
};
use crate::storage::{
    FormatVersionFile, StorageArtifact, StorageErasePreview, StorageTempNamespace,
};
use crate::types::SALT_SIZE;

mod artifacts;
mod batch;
mod chunks;
mod format;
mod reset;
mod temp;

pub(crate) use batch::ChunkWriteBatch;
pub(crate) use temp::{StorageTempArtifact, StorageTempFile};

pub(super) const STORAGE_PERF_SLOW_IO: Duration = Duration::from_millis(50);

pub(super) fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

/// Flat chunk-based storage.
///
/// Directory structure:
/// ```text
/// {base_path}/
/// ├── salt           # 16 bytes random salt
/// └── chunks/        # All chunks (flat structure with 2-level prefix)
///     ├── 0/
///     │   └── 1a/
///     │       └── 01a2b3...
///     └── ...
/// ```
pub struct Storage {
    backend: std::sync::Arc<dyn super::backend::StorageBackend>,
}

#[derive(Debug)]
pub(crate) struct FlatStorageBackend {
    base_path: PathBuf,
}

impl Clone for Storage {
    fn clone(&self) -> Self {
        Self {
            backend: self.backend.clone(),
        }
    }
}

impl std::fmt::Debug for Storage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Storage")
            .field("base_path", &self.base_path())
            .finish()
    }
}

impl Storage {
    /// Create a new storage instance.
    pub fn new(base_path: impl AsRef<Path>) -> Result<Self> {
        Ok(Self {
            backend: std::sync::Arc::new(FlatStorageBackend::new(base_path)?),
        })
    }

    #[cfg(any(test, debug_assertions))]
    pub(crate) fn from_backend(backend: std::sync::Arc<dyn StorageBackend>) -> Self {
        Self { backend }
    }

    #[cfg(any(test, debug_assertions))]
    pub(crate) fn fault_injecting_for_tests(
        base_path: impl AsRef<Path>,
        rule: Option<crate::storage::backend::fault::FaultRule>,
    ) -> Result<(Self, crate::storage::backend::fault::FaultHandle)> {
        let inner = std::sync::Arc::new(FlatStorageBackend::new(base_path)?);
        let (backend, handle) =
            crate::storage::backend::fault::FaultInjectingStorageBackend::wrap(inner, rule);
        Ok((Self::from_backend(std::sync::Arc::new(backend)), handle))
    }

    pub fn read_format_version(&self) -> Result<FormatVersionFile> {
        self.backend.read_format_version()
    }

    pub fn format_version(&self) -> Result<u64> {
        self.backend.format_version()
    }

    pub fn get_or_create_salt(&self) -> Result<[u8; SALT_SIZE]> {
        self.backend.get_or_create_salt()
    }

    pub fn get_or_create_master_salt(&self) -> Result<[u8; SALT_SIZE]> {
        self.backend.get_or_create_master_salt()
    }

    pub fn salt_exists(&self) -> bool {
        self.backend.salt_exists()
    }

    pub fn read_chunk(&self, name: &str) -> Result<Vec<u8>> {
        self.backend.read_chunk(name)
    }

    pub fn chunk_len(&self, name: &str) -> Result<u64> {
        self.backend.chunk_len(name)
    }

    pub fn write_chunk(&self, name: &str, data: &[u8]) -> Result<()> {
        self.backend.write_chunk(name, data)
    }

    pub fn write_chunk_no_sync(&self, name: &str, data: &[u8]) -> Result<()> {
        self.backend.write_chunk_no_sync(name, data)
    }

    pub(crate) fn begin_chunk_write_batch(&self, tx_id_hint: &str) -> ChunkWriteBatch {
        ChunkWriteBatch::new(self.backend.clone(), tx_id_hint)
    }

    pub(crate) fn create_temp_file(
        &self,
        namespace: StorageTempNamespace,
        prefix: &str,
        suffix: &str,
    ) -> Result<StorageTempFile> {
        let file = self.backend.create_temp_file(namespace, prefix, suffix)?;
        Ok(StorageTempFile::new(self.backend.clone(), namespace, file))
    }

    pub(crate) fn cleanup_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<usize> {
        self.backend.cleanup_temp_namespace(namespace)
    }

    pub(crate) fn cleanup_legacy_temp_files(
        &self,
        namespace: StorageTempNamespace,
    ) -> Result<usize> {
        self.backend.cleanup_legacy_temp_files(namespace)
    }

    pub fn sync(&self) -> Result<()> {
        self.backend.sync()
    }

    pub fn write_chunk_atomic(&self, name: &str, data: &[u8]) -> Result<()> {
        self.backend.write_chunk_atomic(name, data)
    }

    pub fn delete_chunk(&self, name: &str) -> Result<()> {
        self.backend.delete_chunk(name)
    }

    pub fn chunk_exists(&self, name: &str) -> Result<bool> {
        self.backend.chunk_exists(name)
    }

    pub fn list_chunks(&self) -> Result<Vec<String>> {
        self.backend.list_chunks()
    }

    pub fn has_any_chunk(&self) -> Result<bool> {
        self.backend.has_any_chunk()
    }

    pub fn base_path(&self) -> &Path {
        self.backend.base_path()
    }

    pub(crate) fn erase_preview(&self) -> StorageErasePreview {
        StorageErasePreview {
            storage_paths: vec![self.backend.base_path().to_string_lossy().to_string()],
        }
    }

    pub fn erase_all(&self) -> Result<()> {
        self.reset_vault_contents().map(|_| ())
    }

    pub(crate) fn read_artifact(&self, artifact: StorageArtifact) -> Result<Option<Vec<u8>>> {
        self.backend.read_artifact(artifact)
    }

    pub(crate) fn write_artifact_atomic(
        &self,
        artifact: StorageArtifact,
        bytes: &[u8],
    ) -> Result<()> {
        self.write_artifact_durable(artifact, bytes)
            .map(|_| ())
            .map_err(|error| error.error)
    }

    pub(crate) fn write_artifact_durable(
        &self,
        artifact: StorageArtifact,
        bytes: &[u8],
    ) -> std::result::Result<StorageArtifactWriteOutcome, StorageArtifactWriteError> {
        let temp = self
            .backend
            .write_artifact_temp(artifact, bytes)
            .map_err(|error| StorageArtifactWriteError::new(error, false))?;

        if let Err(error) = self.backend.sync_artifact_temp(&temp) {
            let _ = self.backend.remove_artifact_temp(&temp);
            return Err(StorageArtifactWriteError::new(error, false));
        }

        if let Err(error) = self.backend.rename_artifact_temp(&temp) {
            let _ = self.backend.remove_artifact_temp(&temp);
            return Err(StorageArtifactWriteError::new(error, false));
        }

        if let Err(error) = self.backend.sync_artifact_parent(&temp.parent_path) {
            return Err(StorageArtifactWriteError::new(error, true));
        }

        if let Err(error) = self.backend.sync() {
            return Err(StorageArtifactWriteError::new(error, true));
        }

        Ok(StorageArtifactWriteOutcome {
            artifact: temp.artifact,
        })
    }

    pub(crate) fn remove_artifact(&self, artifact: StorageArtifact) -> Result<()> {
        self.backend.remove_artifact(artifact)
    }

    pub(crate) fn artifact_exists(&self, artifact: StorageArtifact) -> Result<bool> {
        self.backend.artifact_exists(artifact)
    }
}

impl StorageBackend for FlatStorageBackend {
    fn base_path(&self) -> &Path {
        FlatStorageBackend::base_path(self)
    }

    fn read_format_version(&self) -> Result<FormatVersionFile> {
        FlatStorageBackend::read_format_version(self)
    }

    fn format_version(&self) -> Result<u64> {
        FlatStorageBackend::format_version(self)
    }

    fn get_or_create_salt(&self) -> Result<[u8; SALT_SIZE]> {
        FlatStorageBackend::get_or_create_salt(self)
    }

    fn get_or_create_master_salt(&self) -> Result<[u8; SALT_SIZE]> {
        FlatStorageBackend::get_or_create_master_salt(self)
    }

    fn salt_exists(&self) -> bool {
        FlatStorageBackend::salt_exists(self)
    }

    fn read_chunk(&self, name: &str) -> Result<Vec<u8>> {
        FlatStorageBackend::read_chunk(self, name)
    }

    fn chunk_len(&self, name: &str) -> Result<u64> {
        FlatStorageBackend::chunk_len(self, name)
    }

    fn write_chunk(&self, name: &str, data: &[u8]) -> Result<()> {
        FlatStorageBackend::write_chunk(self, name, data)
    }

    fn write_chunk_no_sync(&self, name: &str, data: &[u8]) -> Result<()> {
        FlatStorageBackend::write_chunk_no_sync(self, name, data)
    }

    fn write_chunk_atomic(&self, name: &str, data: &[u8]) -> Result<()> {
        FlatStorageBackend::write_chunk_atomic(self, name, data)
    }

    fn write_chunk_batch_temp(
        &self,
        tx_id_hint: &str,
        sequence: usize,
        name: &str,
        data: &[u8],
    ) -> Result<ChunkWriteBatchTemp> {
        FlatStorageBackend::write_chunk_batch_temp(self, tx_id_hint, sequence, name, data)
    }

    fn sync_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
        FlatStorageBackend::sync_chunk_batch_temp(self, temp)
    }

    fn rename_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
        FlatStorageBackend::rename_chunk_batch_temp(self, temp)
    }

    fn sync_chunk_batch_parent(&self, parent: &Path) -> Result<()> {
        FlatStorageBackend::sync_chunk_batch_parent(self, parent)
    }

    fn remove_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
        FlatStorageBackend::remove_chunk_batch_temp(self, temp)
    }

    fn delete_chunk(&self, name: &str) -> Result<()> {
        FlatStorageBackend::delete_chunk(self, name)
    }

    fn chunk_exists(&self, name: &str) -> Result<bool> {
        FlatStorageBackend::chunk_exists(self, name)
    }

    fn list_chunks(&self) -> Result<Vec<String>> {
        FlatStorageBackend::list_chunks(self)
    }

    fn has_any_chunk(&self) -> Result<bool> {
        FlatStorageBackend::has_any_chunk(self)
    }

    fn sync(&self) -> Result<()> {
        FlatStorageBackend::sync(self)
    }

    fn read_artifact(&self, artifact: StorageArtifact) -> Result<Option<Vec<u8>>> {
        FlatStorageBackend::read_artifact(self, artifact)
    }

    fn write_artifact_temp(
        &self,
        artifact: StorageArtifact,
        bytes: &[u8],
    ) -> Result<StorageArtifactWriteTemp> {
        FlatStorageBackend::write_artifact_temp(self, artifact, bytes)
    }

    fn sync_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
        FlatStorageBackend::sync_artifact_temp(self, temp)
    }

    fn rename_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
        FlatStorageBackend::rename_artifact_temp(self, temp)
    }

    fn sync_artifact_parent(&self, parent: &Path) -> Result<()> {
        FlatStorageBackend::sync_artifact_parent(self, parent)
    }

    fn remove_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
        FlatStorageBackend::remove_artifact_temp(self, temp)
    }

    fn remove_artifact(&self, artifact: StorageArtifact) -> Result<()> {
        FlatStorageBackend::remove_artifact(self, artifact)
    }

    fn artifact_exists(&self, artifact: StorageArtifact) -> Result<bool> {
        FlatStorageBackend::artifact_exists(self, artifact)
    }

    fn create_temp_file(
        &self,
        namespace: StorageTempNamespace,
        prefix: &str,
        suffix: &str,
    ) -> Result<tempfile::NamedTempFile> {
        FlatStorageBackend::create_temp_file(self, namespace, prefix, suffix)
    }

    fn sync_temp_file(&self, file: &mut File) -> Result<()> {
        FlatStorageBackend::sync_temp_file(self, file)
    }

    fn sync_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<()> {
        FlatStorageBackend::sync_temp_namespace(self, namespace)
    }

    fn cleanup_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<usize> {
        FlatStorageBackend::cleanup_temp_namespace(self, namespace)
    }

    fn cleanup_legacy_temp_files(&self, namespace: StorageTempNamespace) -> Result<usize> {
        FlatStorageBackend::cleanup_legacy_temp_files(self, namespace)
    }
}

#[cfg(test)]
#[path = "flat_tests.rs"]
mod tests;
