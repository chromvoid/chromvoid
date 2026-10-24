use std::path::{Path, PathBuf};

use std::io::Read;
use std::io::Write;
use std::sync::atomic::AtomicBool;

use tauri::Manager;

#[derive(Debug, Clone)]
pub(super) enum BackupTarget {
    Path(PathBuf),
}

#[derive(Debug, Clone)]
pub(super) enum RestoreSourceTarget {
    Path(PathBuf),
}

pub(super) const BACKUP_PACK_FILE_NAME: &str = "chunks.pack";
pub(super) const BACKUP_PACK_MANIFEST_FILE_NAME: &str = "chunks.manifest.json";
const BACKUP_PACK_COPY_BUFFER_SIZE: usize = 1024 * 1024;

pub(super) trait BackupSink {
    fn display_path(&self) -> String;
    fn write_file(&mut self, name: &str, bytes: &[u8]) -> Result<(), String>;
    fn write_stream_file(
        &mut self,
        name: &str,
        reader: &mut dyn Read,
        cancel_requested: &AtomicBool,
        on_progress: &mut dyn FnMut(u64),
    ) -> Result<u64, String>;
    fn abort(&mut self);
}

pub(super) trait BackupSource {
    fn display_path(&self) -> String;
    fn read_required_file(&self, name: &str) -> Result<Vec<u8>, String>;
    fn read_optional_file(&self, name: &str) -> Result<Option<Vec<u8>>, String>;
    fn read_stream_file(&self, name: &str) -> Result<Box<dyn Read + Send>, String>;
}

pub(super) fn default_backup_target(
    app: &tauri::AppHandle,
    target_dir: Option<String>,
) -> Result<BackupTarget, String> {
    if let Some(target_dir) = target_dir {
        let target_dir = target_dir.trim();
        if !target_dir.is_empty() {
            return Ok(BackupTarget::Path(PathBuf::from(target_dir)));
        }
    }

    app.path()
        .app_data_dir()
        .map(|p| BackupTarget::Path(p.join("backups")))
        .map_err(|e| format!("app_data_dir: {e}"))
}

pub(super) fn default_restore_source(
    backup_path: Option<String>,
) -> Result<RestoreSourceTarget, String> {
    if let Some(backup_path) = backup_path {
        let backup_path = backup_path.trim();
        if !backup_path.is_empty() {
            return Ok(RestoreSourceTarget::Path(PathBuf::from(backup_path)));
        }
    }

    Err("backup_path is required".to_string())
}

pub(super) fn create_backup_sink(
    target: BackupTarget,
    backup_id: &str,
) -> Result<Box<dyn BackupSink + Send>, String> {
    match target {
        BackupTarget::Path(parent_dir) => {
            let backup_dir = parent_dir.join(backup_id);
            std::fs::create_dir_all(&backup_dir)
                .map_err(|e| format!("Failed to create backup directory: {e}"))?;
            Ok(Box::new(PathBackupSink { backup_dir }))
        }
    }
}

pub(super) fn create_backup_source(
    target: RestoreSourceTarget,
) -> Result<Box<dyn BackupSource + Send>, String> {
    match target {
        RestoreSourceTarget::Path(path) => {
            if !path.exists() {
                return Err("Backup path does not exist".to_string());
            }
            Ok(Box::new(PathBackupSource { backup_dir: path }))
        }
    }
}

struct PathBackupSink {
    backup_dir: PathBuf,
}

impl BackupSink for PathBackupSink {
    fn display_path(&self) -> String {
        self.backup_dir.to_string_lossy().to_string()
    }

    fn write_file(&mut self, name: &str, bytes: &[u8]) -> Result<(), String> {
        crate::helpers::storage::write_bytes_atomic(&self.backup_dir.join(name), bytes)
            .map_err(|e| format!("Failed to write {name}: {e}"))
    }

    fn write_stream_file(
        &mut self,
        name: &str,
        reader: &mut dyn Read,
        cancel_requested: &AtomicBool,
        on_progress: &mut dyn FnMut(u64),
    ) -> Result<u64, String> {
        let path = self.backup_dir.join(name);
        let mut temp = tempfile::Builder::new()
            .prefix(".chromvoid-backup-")
            .suffix(".tmp")
            .tempfile_in(&self.backup_dir)
            .map_err(|e| format!("Failed to write {name}: create temp file: {e}"))?;
        let written =
            copy_stream_to_writer(reader, temp.as_file_mut(), cancel_requested, on_progress)
                .map_err(|e| format!("Failed to write {name}: {e}"))?;
        temp.as_file_mut()
            .sync_all()
            .map_err(|e| format!("Failed to write {name}: sync temp file: {e}"))?;
        temp.persist(&path)
            .map_err(|e| format!("Failed to write {name}: replace target: {}", e.error))?;
        sync_backup_directory(&self.backup_dir)
            .map_err(|e| format!("Failed to write {name}: sync backup directory: {e}"))?;
        Ok(written)
    }

    fn abort(&mut self) {
        let _ = std::fs::remove_dir_all(&self.backup_dir);
    }
}

#[cfg(unix)]
fn sync_backup_directory(path: &Path) -> std::io::Result<()> {
    std::fs::File::open(path)?.sync_all()
}

#[cfg(not(unix))]
fn sync_backup_directory(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

struct PathBackupSource {
    backup_dir: PathBuf,
}

impl PathBackupSource {
    fn read_file_at(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        let path = self.backup_dir.join(name);
        if !path.exists() {
            return Ok(None);
        }
        std::fs::read(path)
            .map(Some)
            .map_err(|e| format!("Failed to read {name}: {e}"))
    }
}

impl BackupSource for PathBackupSource {
    fn display_path(&self) -> String {
        self.backup_dir.to_string_lossy().to_string()
    }

    fn read_required_file(&self, name: &str) -> Result<Vec<u8>, String> {
        self.read_file_at(name)?
            .ok_or_else(|| format!("{name} not found"))
    }

    fn read_optional_file(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        self.read_file_at(name)
    }

    fn read_stream_file(&self, name: &str) -> Result<Box<dyn Read + Send>, String> {
        let path = self.backup_dir.join(name);
        let file = std::fs::File::open(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                format!("{name} not found")
            } else {
                format!("Failed to read {name}: {e}")
            }
        })?;
        Ok(Box::new(file))
    }
}

fn copy_stream_to_writer(
    reader: &mut dyn Read,
    writer: &mut dyn Write,
    cancel_requested: &AtomicBool,
    on_progress: &mut dyn FnMut(u64),
) -> Result<u64, String> {
    let mut buffer = vec![0_u8; BACKUP_PACK_COPY_BUFFER_SIZE];
    let mut written = 0_u64;
    loop {
        if cancel_requested.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("Backup cancelled by user".to_string());
        }
        let read = reader
            .read(&mut buffer)
            .map_err(|e| format!("read stream: {e}"))?;
        if read == 0 {
            writer.flush().map_err(|e| format!("flush stream: {e}"))?;
            return Ok(written);
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|e| format!("write stream: {e}"))?;
        written = written.saturating_add(read as u64);
        on_progress(written);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    struct FailingAfterFirstChunk {
        emitted: bool,
    }

    impl Read for FailingAfterFirstChunk {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            if self.emitted {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "stream failed",
                ));
            }
            self.emitted = true;
            buf[..3].copy_from_slice(b"abc");
            Ok(3)
        }
    }

    #[test]
    fn path_backup_sink_stream_write_does_not_leave_partial_target_on_error() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let mut sink = PathBackupSink {
            backup_dir: tempdir.path().to_path_buf(),
        };
        let mut reader = FailingAfterFirstChunk { emitted: false };
        let cancel = AtomicBool::new(false);
        let mut progress = |_written: u64| {};

        let error = sink
            .write_stream_file("chunks.pack", &mut reader, &cancel, &mut progress)
            .expect_err("stream write should fail");

        assert!(error.contains("stream failed"));
        assert!(!tempdir.path().join("chunks.pack").exists());
    }

    #[test]
    fn path_backup_sink_write_file_replaces_target() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let mut sink = PathBackupSink {
            backup_dir: tempdir.path().to_path_buf(),
        };

        sink.write_file("manifest.json", b"first")
            .expect("first write");
        sink.write_file("manifest.json", b"second")
            .expect("second write");

        assert_eq!(
            std::fs::read(tempdir.path().join("manifest.json")).expect("read manifest"),
            b"second"
        );
    }

    #[test]
    fn path_backup_directory_sync_helper_requires_existing_directory() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        sync_backup_directory(tempdir.path()).expect("sync existing directory");

        #[cfg(unix)]
        {
            let missing = tempdir.path().join("missing");
            let error = sync_backup_directory(&missing).expect_err("missing directory");
            assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
        }
    }
}
