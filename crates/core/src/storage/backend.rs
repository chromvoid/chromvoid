use std::fs::File;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum StorageArtifact {
    FormatVersion,
    Salt,
    MasterSalt,
    MasterVerify,
    MasterVerifyRekeyTemp,
    RekeyTransaction,
    MasterRekeyTransaction,
    RestoreTransaction,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct StorageResetOutcome {
    pub(crate) removed_chunks: usize,
    pub(crate) removed_artifacts: Vec<StorageArtifact>,
    pub(crate) cleaned_temp_files: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct StorageErasePreview {
    pub(crate) storage_paths: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum StorageTempNamespace {
    BackupLocal,
    VaultExport,
}

impl StorageTempNamespace {
    pub(crate) fn dir_name(self) -> &'static str {
        match self {
            StorageTempNamespace::BackupLocal => "backup-local",
            StorageTempNamespace::VaultExport => "vault-export",
        }
    }
}

impl StorageArtifact {
    pub(crate) fn file_name(self) -> &'static str {
        match self {
            StorageArtifact::FormatVersion => "format.version",
            StorageArtifact::Salt => "salt",
            StorageArtifact::MasterSalt => "master.salt",
            StorageArtifact::MasterVerify => "master.verify",
            StorageArtifact::MasterVerifyRekeyTemp => ".master.verify.master-rekey.tmp",
            StorageArtifact::RekeyTransaction => "rekey.transaction.json",
            StorageArtifact::MasterRekeyTransaction => "master.rekey.transaction.json",
            StorageArtifact::RestoreTransaction => "restore.transaction.json",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct ChunkWriteBatchTemp {
    pub(crate) name: String,
    pub(crate) temp_path: PathBuf,
    pub(crate) final_path: PathBuf,
    pub(crate) parent_path: PathBuf,
}

#[derive(Debug, Clone)]
pub(crate) struct StorageArtifactWriteTemp {
    pub(crate) artifact: StorageArtifact,
    pub(crate) temp_path: PathBuf,
    pub(crate) final_path: PathBuf,
    pub(crate) parent_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct StorageArtifactWriteOutcome {
    pub(crate) artifact: StorageArtifact,
}

#[derive(Debug)]
pub(crate) struct StorageArtifactWriteError {
    pub(crate) error: Error,
    pub(crate) committed: bool,
}

impl StorageArtifactWriteError {
    pub(crate) fn new(error: Error, committed: bool) -> Self {
        Self { error, committed }
    }
}

pub(crate) trait StorageBackend: Send + Sync {
    fn base_path(&self) -> &Path;

    fn read_format_version(&self) -> Result<super::FormatVersionFile>;
    fn format_version(&self) -> Result<u64>;
    fn get_or_create_salt(&self) -> Result<[u8; crate::types::SALT_SIZE]>;
    fn get_or_create_master_salt(&self) -> Result<[u8; crate::types::SALT_SIZE]>;
    fn salt_exists(&self) -> bool;

    fn read_chunk(&self, name: &str) -> Result<Vec<u8>>;
    fn chunk_len(&self, name: &str) -> Result<u64>;
    fn write_chunk(&self, name: &str, data: &[u8]) -> Result<()>;
    fn write_chunk_no_sync(&self, name: &str, data: &[u8]) -> Result<()>;
    fn write_chunk_atomic(&self, name: &str, data: &[u8]) -> Result<()>;
    fn write_chunk_batch_temp(
        &self,
        tx_id_hint: &str,
        sequence: usize,
        name: &str,
        data: &[u8],
    ) -> Result<ChunkWriteBatchTemp>;
    fn sync_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()>;
    fn rename_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()>;
    fn sync_chunk_batch_parent(&self, parent: &Path) -> Result<()>;
    fn remove_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()>;
    fn delete_chunk(&self, name: &str) -> Result<()>;
    fn chunk_exists(&self, name: &str) -> Result<bool>;
    fn list_chunks(&self) -> Result<Vec<String>>;
    fn has_any_chunk(&self) -> Result<bool>;
    fn sync(&self) -> Result<()>;
    fn reset_vault_contents(&self) -> Result<StorageResetOutcome> {
        let chunk_names = self.list_chunks()?;
        let mut removed_chunks = 0usize;
        for name in chunk_names {
            self.delete_chunk(&name)?;
            removed_chunks = removed_chunks.saturating_add(1);
        }
        self.sync()?;

        let mut removed_artifacts = Vec::new();
        for artifact in StorageArtifact::reset_artifacts() {
            if self.artifact_exists(*artifact)? {
                self.remove_artifact(*artifact)?;
                removed_artifacts.push(*artifact);
            }
        }

        let mut cleaned_temp_files = 0usize;
        for namespace in [
            StorageTempNamespace::BackupLocal,
            StorageTempNamespace::VaultExport,
        ] {
            cleaned_temp_files =
                cleaned_temp_files.saturating_add(self.cleanup_temp_namespace(namespace)?);
            cleaned_temp_files =
                cleaned_temp_files.saturating_add(self.cleanup_legacy_temp_files(namespace)?);
        }

        Ok(StorageResetOutcome {
            removed_chunks,
            removed_artifacts,
            cleaned_temp_files,
        })
    }

    fn read_artifact(&self, artifact: StorageArtifact) -> Result<Option<Vec<u8>>>;
    fn write_artifact_temp(
        &self,
        artifact: StorageArtifact,
        bytes: &[u8],
    ) -> Result<StorageArtifactWriteTemp>;
    fn sync_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()>;
    fn rename_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()>;
    fn sync_artifact_parent(&self, parent: &Path) -> Result<()>;
    fn remove_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()>;
    fn remove_artifact(&self, artifact: StorageArtifact) -> Result<()>;
    fn artifact_exists(&self, artifact: StorageArtifact) -> Result<bool>;

    fn create_temp_file(
        &self,
        namespace: StorageTempNamespace,
        prefix: &str,
        suffix: &str,
    ) -> Result<tempfile::NamedTempFile>;
    fn sync_temp_file(&self, file: &mut File) -> Result<()>;
    fn sync_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<()>;
    fn cleanup_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<usize>;
    fn cleanup_legacy_temp_files(&self, namespace: StorageTempNamespace) -> Result<usize>;
}

#[cfg(any(test, debug_assertions))]
pub(crate) mod fault {
    use std::sync::{Arc, Mutex};

    use crate::error::{Error, Result};

    use super::{
        ChunkWriteBatchTemp, StorageArtifact, StorageArtifactWriteTemp, StorageBackend,
        StorageTempNamespace,
    };

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub enum StorageOperation {
        ReadChunk,
        ChunkLen,
        WriteChunk,
        WriteChunkNoSync,
        WriteChunkAtomic,
        WriteChunkBatchTemp,
        SyncChunkBatchTemp,
        RenameChunkBatchTemp,
        SyncChunkBatchParent,
        DeleteChunk,
        ChunkExists,
        ListChunks,
        HasAnyChunk,
        Sync,
        ReadArtifact,
        WriteArtifactAtomic,
        WriteArtifactTemp,
        SyncArtifactTemp,
        RenameArtifactTemp,
        SyncArtifactParent,
        RemoveArtifact,
        ArtifactExists,
        CreateTempFile,
        SyncTempFile,
        SyncTempNamespace,
        CleanupTempNamespace,
    }

    #[derive(Debug, Clone, Copy)]
    pub struct FaultRule {
        pub operation: StorageOperation,
        pub fail_on: usize,
    }

    #[derive(Debug, Default)]
    struct FaultState {
        rule: Option<FaultRule>,
        matching_seen: usize,
        log: Vec<StorageOperation>,
    }

    #[derive(Clone, Debug)]
    pub struct FaultHandle {
        state: Arc<Mutex<FaultState>>,
    }

    impl FaultHandle {
        pub fn operations(&self) -> Vec<StorageOperation> {
            self.state.lock().expect("fault state").log.clone()
        }
    }

    pub(crate) struct FaultInjectingStorageBackend {
        inner: Arc<dyn StorageBackend>,
        state: Arc<Mutex<FaultState>>,
    }

    impl FaultInjectingStorageBackend {
        pub(crate) fn wrap(
            inner: Arc<dyn StorageBackend>,
            rule: Option<FaultRule>,
        ) -> (Self, FaultHandle) {
            let state = Arc::new(Mutex::new(FaultState {
                rule,
                matching_seen: 0,
                log: Vec::new(),
            }));
            (
                Self {
                    inner,
                    state: Arc::clone(&state),
                },
                FaultHandle { state },
            )
        }

        fn check(&self, operation: StorageOperation) -> Result<()> {
            let mut state = self.state.lock().expect("fault state");
            state.log.push(operation);
            if let Some(rule) = state.rule {
                if rule.operation == operation {
                    state.matching_seen = state.matching_seen.saturating_add(1);
                    if state.matching_seen == rule.fail_on {
                        return Err(Error::StorageIo(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("injected storage fault: {operation:?}"),
                        )));
                    }
                }
            }
            Ok(())
        }
    }

    impl StorageBackend for FaultInjectingStorageBackend {
        fn base_path(&self) -> &std::path::Path {
            self.inner.base_path()
        }

        fn read_format_version(&self) -> Result<super::super::FormatVersionFile> {
            self.inner.read_format_version()
        }

        fn format_version(&self) -> Result<u64> {
            self.inner.format_version()
        }

        fn get_or_create_salt(&self) -> Result<[u8; crate::types::SALT_SIZE]> {
            self.inner.get_or_create_salt()
        }

        fn get_or_create_master_salt(&self) -> Result<[u8; crate::types::SALT_SIZE]> {
            self.inner.get_or_create_master_salt()
        }

        fn salt_exists(&self) -> bool {
            self.inner.salt_exists()
        }

        fn read_chunk(&self, name: &str) -> Result<Vec<u8>> {
            self.check(StorageOperation::ReadChunk)?;
            self.inner.read_chunk(name)
        }

        fn chunk_len(&self, name: &str) -> Result<u64> {
            self.check(StorageOperation::ChunkLen)?;
            self.inner.chunk_len(name)
        }

        fn write_chunk(&self, name: &str, data: &[u8]) -> Result<()> {
            self.check(StorageOperation::WriteChunk)?;
            self.inner.write_chunk(name, data)
        }

        fn write_chunk_no_sync(&self, name: &str, data: &[u8]) -> Result<()> {
            self.check(StorageOperation::WriteChunkNoSync)?;
            self.inner.write_chunk_no_sync(name, data)
        }

        fn write_chunk_atomic(&self, name: &str, data: &[u8]) -> Result<()> {
            self.check(StorageOperation::WriteChunkAtomic)?;
            self.inner.write_chunk_atomic(name, data)
        }

        fn write_chunk_batch_temp(
            &self,
            tx_id_hint: &str,
            sequence: usize,
            name: &str,
            data: &[u8],
        ) -> Result<ChunkWriteBatchTemp> {
            self.check(StorageOperation::WriteChunkBatchTemp)?;
            self.inner
                .write_chunk_batch_temp(tx_id_hint, sequence, name, data)
        }

        fn sync_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
            self.check(StorageOperation::SyncChunkBatchTemp)?;
            self.inner.sync_chunk_batch_temp(temp)
        }

        fn rename_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
            self.check(StorageOperation::RenameChunkBatchTemp)?;
            self.inner.rename_chunk_batch_temp(temp)
        }

        fn sync_chunk_batch_parent(&self, parent: &std::path::Path) -> Result<()> {
            self.check(StorageOperation::SyncChunkBatchParent)?;
            self.inner.sync_chunk_batch_parent(parent)
        }

        fn remove_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
            self.inner.remove_chunk_batch_temp(temp)
        }

        fn delete_chunk(&self, name: &str) -> Result<()> {
            self.check(StorageOperation::DeleteChunk)?;
            self.inner.delete_chunk(name)
        }

        fn chunk_exists(&self, name: &str) -> Result<bool> {
            self.check(StorageOperation::ChunkExists)?;
            self.inner.chunk_exists(name)
        }

        fn list_chunks(&self) -> Result<Vec<String>> {
            self.check(StorageOperation::ListChunks)?;
            self.inner.list_chunks()
        }

        fn has_any_chunk(&self) -> Result<bool> {
            self.check(StorageOperation::HasAnyChunk)?;
            self.inner.has_any_chunk()
        }

        fn sync(&self) -> Result<()> {
            self.check(StorageOperation::Sync)?;
            self.inner.sync()
        }

        fn read_artifact(&self, artifact: StorageArtifact) -> Result<Option<Vec<u8>>> {
            self.check(StorageOperation::ReadArtifact)?;
            self.inner.read_artifact(artifact)
        }

        fn write_artifact_temp(
            &self,
            artifact: StorageArtifact,
            bytes: &[u8],
        ) -> Result<StorageArtifactWriteTemp> {
            self.check(StorageOperation::WriteArtifactAtomic)?;
            self.check(StorageOperation::WriteArtifactTemp)?;
            self.inner.write_artifact_temp(artifact, bytes)
        }

        fn sync_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
            self.check(StorageOperation::SyncArtifactTemp)?;
            self.inner.sync_artifact_temp(temp)
        }

        fn rename_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
            self.check(StorageOperation::RenameArtifactTemp)?;
            self.inner.rename_artifact_temp(temp)
        }

        fn sync_artifact_parent(&self, parent: &std::path::Path) -> Result<()> {
            self.check(StorageOperation::SyncArtifactParent)?;
            self.inner.sync_artifact_parent(parent)
        }

        fn remove_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
            self.inner.remove_artifact_temp(temp)
        }

        fn remove_artifact(&self, artifact: StorageArtifact) -> Result<()> {
            self.check(StorageOperation::RemoveArtifact)?;
            self.inner.remove_artifact(artifact)
        }

        fn artifact_exists(&self, artifact: StorageArtifact) -> Result<bool> {
            self.check(StorageOperation::ArtifactExists)?;
            self.inner.artifact_exists(artifact)
        }

        fn create_temp_file(
            &self,
            namespace: StorageTempNamespace,
            prefix: &str,
            suffix: &str,
        ) -> Result<tempfile::NamedTempFile> {
            self.check(StorageOperation::CreateTempFile)?;
            self.inner.create_temp_file(namespace, prefix, suffix)
        }

        fn sync_temp_file(&self, file: &mut std::fs::File) -> Result<()> {
            self.check(StorageOperation::SyncTempFile)?;
            self.inner.sync_temp_file(file)
        }

        fn sync_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<()> {
            self.check(StorageOperation::SyncTempNamespace)?;
            self.inner.sync_temp_namespace(namespace)
        }

        fn cleanup_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<usize> {
            self.check(StorageOperation::CleanupTempNamespace)?;
            self.inner.cleanup_temp_namespace(namespace)
        }

        fn cleanup_legacy_temp_files(&self, namespace: StorageTempNamespace) -> Result<usize> {
            self.check(StorageOperation::CleanupTempNamespace)?;
            self.inner.cleanup_legacy_temp_files(namespace)
        }
    }
}
