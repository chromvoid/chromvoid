use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::error::{Error, Result};

use super::{duration_ms, FlatStorageBackend, STORAGE_PERF_SLOW_IO};

impl FlatStorageBackend {
    pub(super) fn chunk_path(&self, name: &str) -> Result<PathBuf> {
        validate_chunk_name(name)?;

        let first = &name[0..1];
        let next_two = &name[1..3];

        Ok(self
            .base_path
            .join("chunks")
            .join(first)
            .join(next_two)
            .join(name))
    }

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

    pub fn chunk_len(&self, name: &str) -> Result<u64> {
        let path = self.chunk_path(name)?;

        if !path.exists() {
            return Err(Error::ChunkNotFound(name.to_string()));
        }

        Ok(fs::metadata(&path)?.len())
    }

    pub fn write_chunk(&self, name: &str, data: &[u8]) -> Result<()> {
        let path = self.chunk_path(name)?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut file = File::create(&path)?;
        file.write_all(data)?;
        file.sync_all()?;

        Ok(())
    }

    /// Write a chunk without forcing fsync.
    pub fn write_chunk_no_sync(&self, name: &str, data: &[u8]) -> Result<()> {
        let total_started = Instant::now();
        let path_started = Instant::now();
        let path = self.chunk_path(name)?;
        let path_elapsed = path_started.elapsed();

        let mut create_elapsed = Duration::default();
        let mut mkdir_elapsed = Duration::default();

        let create_started = Instant::now();
        let mut file = match File::create(&path) {
            Ok(file) => {
                create_elapsed += create_started.elapsed();
                file
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                create_elapsed += create_started.elapsed();
                if let Some(parent) = path.parent() {
                    let mkdir_started = Instant::now();
                    fs::create_dir_all(parent)?;
                    mkdir_elapsed = mkdir_started.elapsed();
                }
                let recreate_started = Instant::now();
                let file = File::create(&path)?;
                create_elapsed += recreate_started.elapsed();
                file
            }
            Err(error) => return Err(Error::StorageIo(error)),
        };
        let write_started = Instant::now();
        file.write_all(data)?;
        let write_elapsed = write_started.elapsed();
        let total_elapsed = total_started.elapsed();
        if total_elapsed >= STORAGE_PERF_SLOW_IO {
            tracing::info!(
                "storage_perf: write_chunk_no_sync bytes={} total_ms={:.2} path_ms={:.2} create_ms={:.2} mkdir_ms={:.2} write_all_ms={:.2}",
                data.len(),
                duration_ms(total_elapsed),
                duration_ms(path_elapsed),
                duration_ms(create_elapsed),
                duration_ms(mkdir_elapsed),
                duration_ms(write_elapsed),
            );
        }
        Ok(())
    }

    pub fn sync(&self) -> Result<()> {
        let total_started = Instant::now();
        let open_started = Instant::now();
        let dir = File::open(&self.base_path)?;
        let open_elapsed = open_started.elapsed();
        let sync_started = Instant::now();
        dir.sync_all()?;
        let sync_elapsed = sync_started.elapsed();
        let total_elapsed = total_started.elapsed();
        if total_elapsed >= STORAGE_PERF_SLOW_IO {
            tracing::info!(
                "storage_perf: sync total_ms={:.2} open_ms={:.2} sync_all_ms={:.2}",
                duration_ms(total_elapsed),
                duration_ms(open_elapsed),
                duration_ms(sync_elapsed),
            );
        }
        Ok(())
    }

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

        // Clean up the temp file on any failure before the rename publishes it,
        // so a failed write can never leave a `.tmp.*` file behind that would
        // later make list_chunks/GC/erase choke (H1).
        let write_result = (|| -> Result<()> {
            let mut file = File::create(&tmp_path)?;
            super::temp::set_private_temp_permissions(&tmp_path)?;
            file.write_all(data)?;
            file.sync_all()?;
            fs::rename(&tmp_path, &path)?;
            Ok(())
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(&tmp_path);
            return Err(error);
        }
        if let Some(parent) = path.parent() {
            File::open(parent)?.sync_all()?;
        }
        Ok(())
    }

    pub fn delete_chunk(&self, name: &str) -> Result<()> {
        let path = self.chunk_path(name)?;

        if path.exists() {
            fs::remove_file(&path)?;
            // Make the unlink durable: fsync the leaf directory so a crash
            // cannot resurrect a "deleted" chunk (M2). Callers pair delete with
            // storage.sync(), which only fsyncs base_path, not the leaf dir.
            if let Some(parent) = path.parent() {
                File::open(parent)?.sync_all()?;
            }
        }

        Ok(())
    }

    pub fn chunk_exists(&self, name: &str) -> Result<bool> {
        Ok(self.chunk_path(name)?.exists())
    }

    pub fn list_chunks(&self) -> Result<Vec<String>> {
        let chunks_dir = self.base_path.join("chunks");
        let mut names = Vec::new();

        if !chunks_dir.exists() {
            return Ok(names);
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
                        if let Some(name) = entry3.file_name().to_str() {
                            // Only return real chunk files. Leftover write/batch
                            // temp files (e.g. `.tmp.<name>.<nonce>`) are not
                            // valid chunk names; including them made GC, erase
                            // and backup choke on the first stale temp (H1).
                            if validate_chunk_name(name).is_ok() {
                                names.push(name.to_string());
                            }
                        }
                    }
                }
            }
        }

        Ok(names)
    }

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
                        if let Some(name) = entry3.file_name().to_str() {
                            if validate_chunk_name(name).is_ok() {
                                return Ok(true);
                            }
                        }
                    }
                }
            }
        }

        Ok(false)
    }

    /// Remove leftover chunk write/batch temp files (`.tmp.*`, `.batch.*`) from
    /// the chunk tree. These can be left behind by a crash mid-write; sweeping
    /// them reclaims space and stale ciphertext. Best-effort: I/O errors on
    /// individual entries are ignored. Returns the number of files removed.
    pub fn sweep_chunk_temp_files(&self) -> Result<usize> {
        let chunks_dir = self.base_path.join("chunks");
        if !chunks_dir.exists() {
            return Ok(0);
        }
        let mut removed = 0usize;
        for entry1 in fs::read_dir(&chunks_dir)? {
            let Ok(entry1) = entry1 else { continue };
            if !entry1.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            for entry2 in fs::read_dir(entry1.path())? {
                let Ok(entry2) = entry2 else { continue };
                if !entry2.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                for entry3 in fs::read_dir(entry2.path())? {
                    let Ok(entry3) = entry3 else { continue };
                    if !entry3.file_type().map(|t| t.is_file()).unwrap_or(false) {
                        continue;
                    }
                    if let Some(name) = entry3.file_name().to_str() {
                        if is_chunk_temp_file_name(name) && fs::remove_file(entry3.path()).is_ok() {
                            removed += 1;
                        }
                    }
                }
            }
        }
        Ok(removed)
    }

    pub fn base_path(&self) -> &Path {
        &self.base_path
    }
}

/// A real chunk file name: exactly 64 lowercase ASCII hex digits. This mirrors
/// the BLAKE3-derived names produced by the crypto naming helpers and excludes
/// dot-prefixed temp/batch files from chunk enumeration.
pub(super) fn validate_chunk_name(name: &str) -> Result<()> {
    if name.len() != 64 {
        return Err(Error::InvalidChunkName(format!(
            "chunk name must be 64 lowercase hex characters: {name}"
        )));
    }

    if !name
        .bytes()
        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Error::InvalidChunkName(format!(
            "chunk name must be 64 lowercase hex characters: {name}"
        )));
    }

    Ok(())
}

/// A leftover chunk write/batch temp file produced by an interrupted write.
fn is_chunk_temp_file_name(name: &str) -> bool {
    name.starts_with(".tmp.") || name.starts_with(".batch.")
}
