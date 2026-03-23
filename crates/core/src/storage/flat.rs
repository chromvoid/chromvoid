//! Flat storage structure

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use getrandom::getrandom;

use crate::error::{Error, Result};
use crate::storage::FormatVersionFile;
use crate::types::SALT_SIZE;

/// Flat chunk-based storage
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
#[derive(Debug, Clone)]
pub struct Storage {
    base_path: PathBuf,
}

impl Storage {
    /// Create a new storage instance
    ///
    /// Creates the directory structure if it doesn't exist
    pub fn new(base_path: impl AsRef<Path>) -> Result<Self> {
        let base_path = base_path.as_ref().to_path_buf();

        // Create base directory and chunks directory
        fs::create_dir_all(base_path.join("chunks"))?;

        // ADR-003: format version file.
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
            let mut file = File::create(&format_path)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }

        Ok(Self { base_path })
    }

    pub fn read_format_version(&self) -> Result<FormatVersionFile> {
        let format_path = self.base_path.join("format.version");
        let bytes = match fs::read(&format_path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // Treat a missing format.version as a blank/new storage state.
                // This can happen after an erase (ADR-012) or manual deletion.
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
                let mut file = File::create(&format_path)?;
                file.write_all(&out)?;
                file.sync_all()?;
                return Ok(v);
            }
            Err(e) => return Err(Error::StorageIo(e)),
        };
        let v: FormatVersionFile = serde_json::from_slice(&bytes)
            .map_err(|e| Error::InvalidDataFormat(format!("invalid format.version: {e}")))?;
        Ok(v)
    }

    pub fn format_version(&self) -> Result<u64> {
        Ok(self.read_format_version()?.v)
    }

    /// Get or create the salt
    ///
    /// If salt file exists, read it. Otherwise, generate a new one and save it.
    pub fn get_or_create_salt(&self) -> Result<[u8; SALT_SIZE]> {
        let salt_path = self.base_path.join("salt");

        if salt_path.exists() {
            // Read existing salt
            let mut file = File::open(&salt_path)?;
            let mut salt = [0u8; SALT_SIZE];
            file.read_exact(&mut salt)?;
            Ok(salt)
        } else {
            // Generate new salt
            let mut salt = [0u8; SALT_SIZE];
            getrandom(&mut salt).map_err(|e| {
                Error::StorageIo(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ))
            })?;

            // Save salt
            let mut file = File::create(&salt_path)?;
            file.write_all(&salt)?;
            file.sync_all()?;

            Ok(salt)
        }
    }

    /// Get or create the master salt (ADR-017)
    ///
    /// If `master.salt` exists, read it. Otherwise, generate a new one and save it.
    pub fn get_or_create_master_salt(&self) -> Result<[u8; SALT_SIZE]> {
        let salt_path = self.base_path.join("master.salt");

        if salt_path.exists() {
            let mut file = File::open(&salt_path)?;
            let mut salt = [0u8; SALT_SIZE];
            file.read_exact(&mut salt)?;
            Ok(salt)
        } else {
            let mut salt = [0u8; SALT_SIZE];
            getrandom(&mut salt).map_err(|e| {
                Error::StorageIo(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ))
            })?;

            let mut file = File::create(&salt_path)?;
            file.write_all(&salt)?;
            file.sync_all()?;

            Ok(salt)
        }
    }

    /// Check if salt exists
    pub fn salt_exists(&self) -> bool {
        self.base_path.join("salt").exists()
    }

    /// Get the path for a chunk
    ///
    /// Structure: `chunks/{name[0]}/{name[1:3]}/{name}`
    fn chunk_path(&self, name: &str) -> Result<PathBuf> {
        if name.len() < 3 {
            return Err(Error::InvalidChunkName(format!(
                "chunk name too short: {}",
                name
            )));
        }

        // Validate hex characters
        if !name.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(Error::InvalidChunkName(format!(
                "chunk name must be hex: {}",
                name
            )));
        }

        let first = &name[0..1];
        let next_two = &name[1..3];

        Ok(self
            .base_path
            .join("chunks")
            .join(first)
            .join(next_two)
            .join(name))
    }

    /// Read a chunk by name
    pub fn read_chunk(&self, name: &str) -> Result<Vec<u8>> {
        let path = self.chunk_path(name)?;

        if !path.exists() {
            return Err(Error::ChunkNotFound(name.to_string()));
        }

        let mut file = File::open(&path)?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)?;

        Ok(data)
    }

    /// Get a chunk size in bytes without reading it.
    pub fn chunk_len(&self, name: &str) -> Result<u64> {
        let path = self.chunk_path(name)?;

        if !path.exists() {
            return Err(Error::ChunkNotFound(name.to_string()));
        }

        let meta = fs::metadata(&path)?;
        Ok(meta.len())
    }

    /// Write a chunk
    pub fn write_chunk(&self, name: &str, data: &[u8]) -> Result<()> {
        let path = self.chunk_path(name)?;

        // Create parent directories
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut file = File::create(&path)?;
        file.write_all(data)?;
        file.sync_all()?;

        Ok(())
    }

    /// Write a chunk without forcing fsync.
    ///
    /// This is significantly faster for bulk writes (e.g. file uploads) because
    /// `sync_all()` on every chunk can dominate throughput.
    pub fn write_chunk_no_sync(&self, name: &str, data: &[u8]) -> Result<()> {
        let path = self.chunk_path(name)?;

        let mut file = match File::create(&path) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)?;
                }
                File::create(&path)?
            }
            Err(e) => return Err(Error::StorageIo(e)),
        };
        file.write_all(data)?;
        Ok(())
    }

    pub fn sync(&self) -> Result<()> {
        let dir = File::open(&self.base_path)?;
        dir.sync_all()?;
        Ok(())
    }

    /// Write a chunk atomically (best-effort): write temp file then rename.
    pub fn write_chunk_atomic(&self, name: &str, data: &[u8]) -> Result<()> {
        let path = self.chunk_path(name)?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp_path = path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(format!(".tmp.{}.{}", name, nonce));

        let mut file = File::create(&tmp_path)?;
        file.write_all(data)?;
        file.sync_all()?;

        fs::rename(&tmp_path, &path)?;
        Ok(())
    }

    /// Delete a chunk
    pub fn delete_chunk(&self, name: &str) -> Result<()> {
        let path = self.chunk_path(name)?;

        if path.exists() {
            fs::remove_file(&path)?;
        }

        Ok(())
    }

    /// Check if a chunk exists
    pub fn chunk_exists(&self, name: &str) -> Result<bool> {
        let path = self.chunk_path(name)?;
        Ok(path.exists())
    }

    /// List all chunk names (for debugging/backup)
    pub fn list_chunks(&self) -> Result<Vec<String>> {
        let chunks_dir = self.base_path.join("chunks");
        let mut names = Vec::new();

        if !chunks_dir.exists() {
            return Ok(names);
        }

        // Iterate through first level (0-f)
        for entry1 in fs::read_dir(&chunks_dir)? {
            let entry1 = entry1?;
            if !entry1.file_type()?.is_dir() {
                continue;
            }

            // Iterate through second level (00-ff)
            for entry2 in fs::read_dir(entry1.path())? {
                let entry2 = entry2?;
                if !entry2.file_type()?.is_dir() {
                    continue;
                }

                // Iterate through chunk files
                for entry3 in fs::read_dir(entry2.path())? {
                    let entry3 = entry3?;
                    if entry3.file_type()?.is_file() {
                        if let Some(name) = entry3.file_name().to_str() {
                            names.push(name.to_string());
                        }
                    }
                }
            }
        }

        Ok(names)
    }

    /// Check whether any chunk exists without enumerating all names.
    pub fn has_any_chunk(&self) -> Result<bool> {
        let chunks_dir = self.base_path.join("chunks");
        if !chunks_dir.exists() {
            return Ok(false);
        }

        for entry1 in fs::read_dir(&chunks_dir)? {
            let entry1 = entry1?;
            if !entry1.file_type()?.is_dir() {
                continue;
            }

            for entry2 in fs::read_dir(entry1.path())? {
                let entry2 = entry2?;
                if !entry2.file_type()?.is_dir() {
                    continue;
                }

                for entry3 in fs::read_dir(entry2.path())? {
                    let entry3 = entry3?;
                    if entry3.file_type()?.is_file() {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(false)
    }

    /// Get the base path
    pub fn base_path(&self) -> &Path {
        &self.base_path
    }

    pub fn erase_all(&self) -> Result<()> {
        let chunks_dir = self.base_path.join("chunks");
        if chunks_dir.exists() {
            fs::remove_dir_all(&chunks_dir)?;
        }
        fs::create_dir_all(&chunks_dir)?;

        // Erase must return storage to a BLANK state (ADR-012).
        // Keep directories, but remove all top-level files so a fresh init starts clean.
        let format_path = self.base_path.join("format.version");
        if format_path.exists() {
            fs::remove_file(&format_path)?;
        }

        let salt_path = self.base_path.join("salt");
        if salt_path.exists() {
            fs::remove_file(&salt_path)?;
        }

        Ok(())
    }
}

#[cfg(test)]
#[path = "flat_tests.rs"]
mod tests;
