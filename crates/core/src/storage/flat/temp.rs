use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::error::{Error, Result};
use crate::storage::backend::StorageBackend;
use crate::storage::StorageTempNamespace;

use super::FlatStorageBackend;

const STORAGE_TEMP_ROOT: &str = ".storage-tmp";
const LEGACY_BACKUP_LOCAL_PREFIX: &str = ".backup-local-";
const LEGACY_BACKUP_LOCAL_SUFFIX: &str = ".pack";
const LEGACY_VAULT_EXPORT_DIR: &str = ".vault-export-tmp";
const LEGACY_VAULT_EXPORT_PREFIX: &str = "chromvoid-export-";

pub(crate) struct StorageTempFile {
    backend: Arc<dyn StorageBackend>,
    namespace: StorageTempNamespace,
    file: tempfile::NamedTempFile,
}

#[derive(Debug)]
pub(crate) struct StorageTempArtifact {
    path: tempfile::TempPath,
}

impl StorageTempFile {
    pub(super) fn new(
        backend: Arc<dyn StorageBackend>,
        namespace: StorageTempNamespace,
        file: tempfile::NamedTempFile,
    ) -> Self {
        Self {
            backend,
            namespace,
            file,
        }
    }

    #[cfg(test)]
    pub(crate) fn path(&self) -> &Path {
        self.file.path()
    }

    pub(crate) fn as_file(&self) -> &File {
        self.file.as_file()
    }

    pub(crate) fn as_file_mut(&mut self) -> &mut File {
        self.file.as_file_mut()
    }

    pub(crate) fn reopen(&self) -> Result<File> {
        self.file.reopen().map_err(Error::StorageIo)
    }

    pub(crate) fn sync_file_and_parent(&mut self) -> Result<()> {
        self.backend.sync_temp_file(self.file.as_file_mut())?;
        self.backend.sync_temp_namespace(self.namespace)
    }

    pub(crate) fn into_artifact(self) -> StorageTempArtifact {
        StorageTempArtifact {
            path: self.file.into_temp_path(),
        }
    }
}

impl StorageTempArtifact {
    pub(crate) fn path(&self) -> &Path {
        self.path.as_ref()
    }

    pub(crate) fn open(&self) -> Result<File> {
        File::open(self.path()).map_err(Error::StorageIo)
    }
}

impl FlatStorageBackend {
    fn temp_namespace_path(&self, namespace: StorageTempNamespace) -> PathBuf {
        self.base_path
            .join(STORAGE_TEMP_ROOT)
            .join(namespace.dir_name())
    }

    pub(crate) fn create_temp_file(
        &self,
        namespace: StorageTempNamespace,
        prefix: &str,
        suffix: &str,
    ) -> Result<tempfile::NamedTempFile> {
        let dir = self.temp_namespace_path(namespace);
        fs::create_dir_all(&dir)?;
        let file = tempfile::Builder::new()
            .prefix(prefix)
            .suffix(suffix)
            .tempfile_in(&dir)
            .map_err(Error::StorageIo)?;
        set_private_temp_permissions(file.path())?;
        Ok(file)
    }

    pub(crate) fn sync_temp_file(&self, file: &mut File) -> Result<()> {
        file.flush()?;
        file.sync_all()?;
        Ok(())
    }

    pub(crate) fn sync_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<()> {
        let dir = self.temp_namespace_path(namespace);
        fs::create_dir_all(&dir)?;
        File::open(dir)?.sync_all()?;
        Ok(())
    }

    pub(crate) fn cleanup_temp_namespace(&self, namespace: StorageTempNamespace) -> Result<usize> {
        let dir = self.temp_namespace_path(namespace);
        let removed = remove_files_in_dir(&dir, |_| true)?;
        if dir.exists() {
            File::open(&dir)?.sync_all()?;
        }
        Ok(removed)
    }

    pub(crate) fn cleanup_legacy_temp_files(
        &self,
        namespace: StorageTempNamespace,
    ) -> Result<usize> {
        match namespace {
            StorageTempNamespace::BackupLocal => {
                let removed = remove_files_in_dir(&self.base_path, |name| {
                    name.starts_with(LEGACY_BACKUP_LOCAL_PREFIX)
                        && name.ends_with(LEGACY_BACKUP_LOCAL_SUFFIX)
                })?;
                if removed > 0 {
                    self.sync()?;
                }
                Ok(removed)
            }
            StorageTempNamespace::VaultExport => {
                let legacy_dir = self.base_path.join(LEGACY_VAULT_EXPORT_DIR);
                let removed = remove_files_in_dir(&legacy_dir, |name| {
                    name.starts_with(LEGACY_VAULT_EXPORT_PREFIX)
                })?;
                if legacy_dir.exists() {
                    File::open(&legacy_dir)?.sync_all()?;
                }
                Ok(removed)
            }
        }
    }
}

#[cfg(unix)]
pub(super) fn set_private_temp_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
pub(super) fn set_private_temp_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

fn remove_files_in_dir<F>(dir: &Path, mut should_remove: F) -> Result<usize>
where
    F: FnMut(&str) -> bool,
{
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(Error::StorageIo(error)),
    };

    let mut removed = 0;
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if !should_remove(name) {
            continue;
        }
        match fs::remove_file(entry.path()) {
            Ok(()) => removed += 1,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(Error::StorageIo(error)),
        }
    }
    Ok(removed)
}
