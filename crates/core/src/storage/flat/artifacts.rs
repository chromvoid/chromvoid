use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::storage::backend::StorageArtifactWriteTemp;
use crate::storage::StorageArtifact;

use super::FlatStorageBackend;

impl FlatStorageBackend {
    fn artifact_path(&self, artifact: StorageArtifact) -> PathBuf {
        self.base_path.join(artifact.file_name())
    }

    pub(crate) fn read_artifact(&self, artifact: StorageArtifact) -> Result<Option<Vec<u8>>> {
        match fs::read(self.artifact_path(artifact)) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(Error::StorageIo(error)),
        }
    }

    pub(crate) fn write_artifact_temp(
        &self,
        artifact: StorageArtifact,
        bytes: &[u8],
    ) -> Result<StorageArtifactWriteTemp> {
        let final_path = self.artifact_path(artifact);
        let parent_path = final_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        fs::create_dir_all(&parent_path)?;
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let temp_path = parent_path.join(format!(
            ".artifact.{}.{}.tmp",
            artifact_temp_stem(artifact),
            nonce
        ));

        let mut file = File::create(&temp_path)?;
        // Restrict to owner-only before writing sensitive material (salt,
        // master.verify, etc.); the rename preserves these permissions (M5).
        super::temp::set_private_temp_permissions(&temp_path)?;
        file.write_all(bytes)?;
        Ok(StorageArtifactWriteTemp {
            artifact,
            temp_path,
            final_path,
            parent_path,
        })
    }

    pub(crate) fn sync_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
        File::open(&temp.temp_path)?.sync_all()?;
        Ok(())
    }

    pub(crate) fn rename_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
        fs::rename(&temp.temp_path, &temp.final_path)?;
        Ok(())
    }

    pub(crate) fn sync_artifact_parent(&self, parent: &Path) -> Result<()> {
        File::open(parent)?.sync_all()?;
        Ok(())
    }

    pub(crate) fn remove_artifact_temp(&self, temp: &StorageArtifactWriteTemp) -> Result<()> {
        match fs::remove_file(&temp.temp_path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(Error::StorageIo(error)),
        }
    }

    /// Atomically and durably write an artifact: temp file → fsync temp →
    /// rename into place → fsync parent dir. A crash or torn write can never
    /// leave a half-written artifact at the final path, which for salt /
    /// format.version would otherwise brick vault open permanently (M3). The
    /// temp file is cleaned up on any failure before the rename.
    pub(crate) fn write_artifact_atomic_durable(
        &self,
        artifact: StorageArtifact,
        bytes: &[u8],
    ) -> Result<()> {
        let temp = self.write_artifact_temp(artifact, bytes)?;
        if let Err(error) = self.sync_artifact_temp(&temp) {
            let _ = self.remove_artifact_temp(&temp);
            return Err(error);
        }
        if let Err(error) = self.rename_artifact_temp(&temp) {
            let _ = self.remove_artifact_temp(&temp);
            return Err(error);
        }
        self.sync_artifact_parent(&temp.parent_path)?;
        Ok(())
    }

    pub(crate) fn remove_artifact(&self, artifact: StorageArtifact) -> Result<()> {
        let path = self.artifact_path(artifact);
        let parent_path = path.parent().map(Path::to_path_buf);
        if path.exists() {
            fs::remove_file(path)?;
        }
        if let Some(parent) = parent_path {
            File::open(parent)?.sync_all()?;
        }
        self.sync()
    }

    pub(crate) fn artifact_exists(&self, artifact: StorageArtifact) -> Result<bool> {
        Ok(self.artifact_path(artifact).exists())
    }
}

fn artifact_temp_stem(artifact: StorageArtifact) -> String {
    artifact
        .file_name()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}
