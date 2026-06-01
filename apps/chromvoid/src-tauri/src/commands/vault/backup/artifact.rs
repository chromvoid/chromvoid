#[cfg(not(target_os = "android"))]
use std::path::PathBuf;

use std::io::Read;
#[cfg(not(target_os = "android"))]
use std::io::Write;
use std::sync::atomic::AtomicBool;

#[cfg(not(target_os = "android"))]
use tauri::Manager;

#[derive(Debug, Clone)]
pub(super) enum BackupTarget {
    #[cfg(not(target_os = "android"))]
    Path(PathBuf),
    #[cfg(target_os = "android")]
    AndroidSaf,
}

#[derive(Debug, Clone)]
pub(super) enum RestoreSourceTarget {
    #[cfg(not(target_os = "android"))]
    Path(PathBuf),
    #[cfg(target_os = "android")]
    AndroidSaf {
        backup_uri: Option<String>,
        display_path: Option<String>,
    },
}

pub(super) const BACKUP_PACK_FILE_NAME: &str = "chunks.pack";
pub(super) const BACKUP_PACK_MANIFEST_FILE_NAME: &str = "chunks.manifest.json";
#[cfg(not(target_os = "android"))]
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
    #[cfg_attr(target_os = "android", allow(unused_variables))] app: &tauri::AppHandle,
    #[cfg_attr(target_os = "android", allow(unused_variables))] target_dir: Option<String>,
) -> Result<BackupTarget, String> {
    #[cfg(target_os = "android")]
    {
        return Ok(BackupTarget::AndroidSaf);
    }

    #[cfg(not(target_os = "android"))]
    {
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
}

pub(super) fn default_restore_source(
    #[cfg_attr(target_os = "android", allow(unused_variables))] backup_path: Option<String>,
) -> Result<RestoreSourceTarget, String> {
    #[cfg(target_os = "android")]
    {
        let backup_uri = backup_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        return Ok(RestoreSourceTarget::AndroidSaf {
            backup_uri,
            display_path: None,
        });
    }

    #[cfg(not(target_os = "android"))]
    {
        if let Some(backup_path) = backup_path {
            let backup_path = backup_path.trim();
            if !backup_path.is_empty() {
                return Ok(RestoreSourceTarget::Path(PathBuf::from(backup_path)));
            }
        }

        Err("backup_path is required".to_string())
    }
}

pub(super) fn create_backup_sink(
    target: BackupTarget,
    backup_id: &str,
    #[cfg_attr(not(target_os = "android"), allow(unused_variables))]
    android_saf_picker_runtime: &crate::mobile::android::AndroidSafPickerRuntimeState,
) -> Result<Box<dyn BackupSink + Send>, String> {
    match target {
        #[cfg(not(target_os = "android"))]
        BackupTarget::Path(parent_dir) => {
            let backup_dir = parent_dir.join(backup_id);
            std::fs::create_dir_all(&backup_dir)
                .map_err(|e| format!("Failed to create backup directory: {e}"))?;
            Ok(Box::new(PathBackupSink { backup_dir }))
        }
        #[cfg(target_os = "android")]
        BackupTarget::AndroidSaf => {
            let tree = crate::mobile::android::pick_saf_backup_tree(
                android_saf_picker_runtime,
                backup_id,
            )?;
            let backup_uri = crate::mobile::android::saf_create_directory(&tree.uri, backup_id)?;
            Ok(Box::new(AndroidSafBackupSink {
                backup_uri,
                display_path: format!("{}/{}", tree.display_name, backup_id),
            }))
        }
    }
}

pub(super) fn create_backup_source(
    target: RestoreSourceTarget,
    #[cfg_attr(not(target_os = "android"), allow(unused_variables))]
    android_saf_picker_runtime: &crate::mobile::android::AndroidSafPickerRuntimeState,
) -> Result<Box<dyn BackupSource + Send>, String> {
    match target {
        #[cfg(not(target_os = "android"))]
        RestoreSourceTarget::Path(path) => {
            if !path.exists() {
                return Err("Backup path does not exist".to_string());
            }
            Ok(Box::new(PathBackupSource { backup_dir: path }))
        }
        #[cfg(target_os = "android")]
        RestoreSourceTarget::AndroidSaf {
            backup_uri,
            display_path,
        } => {
            let (backup_uri, display_path) = match backup_uri {
                Some(uri) => {
                    let display_path = display_path.unwrap_or_else(|| uri.clone());
                    (uri, display_path)
                }
                None => {
                    let tree = crate::mobile::android::pick_saf_restore_tree(
                        android_saf_picker_runtime,
                        "restore-local",
                    )?;
                    (tree.uri, tree.display_name)
                }
            };
            Ok(Box::new(AndroidSafBackupSource {
                backup_uri,
                display_path,
            }))
        }
    }
}

#[cfg(not(target_os = "android"))]
struct PathBackupSink {
    backup_dir: PathBuf,
}

#[cfg(not(target_os = "android"))]
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
        Ok(written)
    }

    fn abort(&mut self) {
        let _ = std::fs::remove_dir_all(&self.backup_dir);
    }
}

#[cfg(not(target_os = "android"))]
struct PathBackupSource {
    backup_dir: PathBuf,
}

#[cfg(not(target_os = "android"))]
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

#[cfg(not(target_os = "android"))]
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

#[cfg(target_os = "android")]
struct AndroidSafBackupSink {
    backup_uri: String,
    display_path: String,
}

#[cfg(target_os = "android")]
impl BackupSink for AndroidSafBackupSink {
    fn display_path(&self) -> String {
        self.display_path.clone()
    }

    fn write_file(&mut self, name: &str, bytes: &[u8]) -> Result<(), String> {
        crate::mobile::android::saf_write_file(&self.backup_uri, name, bytes).map(|_| ())
    }

    fn write_stream_file(
        &mut self,
        name: &str,
        reader: &mut dyn Read,
        cancel_requested: &AtomicBool,
        on_progress: &mut dyn FnMut(u64),
    ) -> Result<u64, String> {
        crate::mobile::android::saf_write_stream_file(
            &self.backup_uri,
            name,
            reader,
            cancel_requested,
            on_progress,
        )
    }

    fn abort(&mut self) {
        let _ = crate::mobile::android::saf_delete_document(&self.backup_uri);
    }
}

#[cfg(target_os = "android")]
struct AndroidSafBackupSource {
    backup_uri: String,
    display_path: String,
}

#[cfg(target_os = "android")]
impl BackupSource for AndroidSafBackupSource {
    fn display_path(&self) -> String {
        self.display_path.clone()
    }

    fn read_required_file(&self, name: &str) -> Result<Vec<u8>, String> {
        crate::mobile::android::saf_read_named_file(&self.backup_uri, name)?
            .ok_or_else(|| format!("{name} not found"))
    }

    fn read_optional_file(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        crate::mobile::android::saf_read_named_file(&self.backup_uri, name)
    }

    fn read_stream_file(&self, name: &str) -> Result<Box<dyn Read + Send>, String> {
        crate::mobile::android::saf_open_read_named_file_stream(&self.backup_uri, name)
    }
}

#[cfg(not(target_os = "android"))]
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

#[cfg(all(test, not(target_os = "android")))]
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
}
