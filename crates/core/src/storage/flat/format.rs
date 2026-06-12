use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use getrandom::getrandom;

use crate::error::{Error, Result};
use crate::storage::backend::StorageArtifact;
use crate::storage::FormatVersionFile;
use crate::types::SALT_SIZE;

use super::FlatStorageBackend;

impl FlatStorageBackend {
    /// Create a new storage instance.
    ///
    /// Creates the directory structure if it doesn't exist.
    pub fn new(base_path: impl AsRef<Path>) -> Result<Self> {
        let base_path = base_path.as_ref().to_path_buf();

        fs::create_dir_all(base_path.join("chunks"))?;

        let format_path = base_path.join("format.version");
        if !format_path.exists() {
            let created_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            let v = FormatVersionFile::new_default(created_at);
            let bytes = serde_json::to_vec(&v).map_err(|e| {
                Error::StorageIo(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ))
            })?;
            let backend = Self {
                base_path: base_path.clone(),
            };
            backend.write_artifact_atomic_durable(StorageArtifact::FormatVersion, &bytes)?;
        }

        let backend = Self { base_path };
        // Best-effort: reclaim any chunk temp files left by a prior crash so
        // they cannot accumulate (they are already excluded from list_chunks).
        let _ = backend.sweep_chunk_temp_files();
        Ok(backend)
    }

    pub fn read_format_version(&self) -> Result<FormatVersionFile> {
        let format_path = self.base_path.join("format.version");
        let bytes = match fs::read(&format_path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let created_at = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                let v = FormatVersionFile::new_default(created_at);
                let out = serde_json::to_vec(&v).map_err(|e| {
                    Error::StorageIo(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        e.to_string(),
                    ))
                })?;
                self.write_artifact_atomic_durable(StorageArtifact::FormatVersion, &out)?;
                return Ok(v);
            }
            Err(error) => return Err(Error::StorageIo(error)),
        };
        serde_json::from_slice(&bytes)
            .map_err(|e| Error::InvalidDataFormat(format!("invalid format.version: {e}")))
    }

    pub fn format_version(&self) -> Result<u64> {
        Ok(self.read_format_version()?.v)
    }

    pub fn get_or_create_salt(&self) -> Result<[u8; SALT_SIZE]> {
        self.get_or_create_top_level_salt(StorageArtifact::Salt)
    }

    pub fn get_or_create_master_salt(&self) -> Result<[u8; SALT_SIZE]> {
        self.get_or_create_top_level_salt(StorageArtifact::MasterSalt)
    }

    pub fn salt_exists(&self) -> bool {
        self.base_path.join("salt").exists()
    }

    fn get_or_create_top_level_salt(&self, artifact: StorageArtifact) -> Result<[u8; SALT_SIZE]> {
        let salt_path = self.base_path.join(artifact.file_name());

        if salt_path.exists() {
            let mut file = File::open(&salt_path)?;
            let mut salt = [0u8; SALT_SIZE];
            file.read_exact(&mut salt)?;
            return Ok(salt);
        }

        let mut salt = [0u8; SALT_SIZE];
        getrandom(&mut salt).map_err(|e| {
            Error::StorageIo(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ))
        })?;

        // Atomic + durable: a torn salt write would make the vault permanently
        // unopenable (salt_exists() stays true but read_exact fails) (M3).
        self.write_artifact_atomic_durable(artifact, &salt)?;

        Ok(salt)
    }
}
