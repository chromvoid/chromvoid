use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tauri::Emitter;
use tokio::sync::oneshot;

use crate::core_adapter::CoreAdapter;

pub(crate) struct AndroidNativeUploadRuntimeState {
    pending_uploads: Mutex<HashMap<String, PendingNativeUpload>>,
    shutdown_requested: AtomicBool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeUploadCloseMode {
    Cancel,
    Shutdown,
}

impl NativeUploadCloseMode {
    fn closes_runtime(self) -> bool {
        matches!(self, Self::Shutdown)
    }
}

impl AndroidNativeUploadRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            pending_uploads: Mutex::new(HashMap::new()),
            shutdown_requested: AtomicBool::new(false),
        }
    }

    pub(crate) fn shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::Acquire)
    }

    pub(crate) fn pending(
        &self,
    ) -> Result<MutexGuard<'_, HashMap<String, PendingNativeUpload>>, String> {
        self.pending_uploads
            .lock()
            .map_err(|_| "Native upload state is unavailable".to_string())
    }

    pub(crate) fn remove(&self, upload_id: &str) -> Option<PendingNativeUpload> {
        self.pending_uploads
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(upload_id))
    }

    pub(crate) fn app(&self, upload_id: &str) -> Option<tauri::AppHandle> {
        self.pending_uploads
            .lock()
            .ok()
            .and_then(|pending| pending.get(upload_id).map(|session| session.app.clone()))
    }

    pub(crate) fn insert_pending_upload(
        &self,
        upload_id: String,
        session: PendingNativeUpload,
    ) -> Result<(), String> {
        let mut pending = self.pending()?;
        if self.shutdown_requested() {
            return Err("Native upload runtime shutdown requested".to_string());
        }
        if pending.contains_key(&upload_id) {
            return Err("Native upload with this id is already running".to_string());
        }
        pending.insert(upload_id, session);
        Ok(())
    }

    pub(crate) fn fail_all_pending(
        &self,
        message: &str,
        code: Option<&str>,
        mode: NativeUploadCloseMode,
    ) -> Result<usize, String> {
        if mode.closes_runtime() {
            self.shutdown_requested.store(true, Ordering::Release);
        }

        let sessions = {
            let mut pending = self.pending()?;
            pending.drain().collect::<Vec<_>>()
        };
        let count = sessions.len();
        for (upload_id, mut session) in sessions {
            let _ = session.app.emit(
                "upload:native-failed",
                json!({
                    "uploadId": upload_id,
                    "message": message,
                    "code": code,
                }),
            );
            if let Some(tx) = session.tx.take() {
                let _ = tx.send(Err(message.to_string()));
            }
        }
        Ok(count)
    }
}

impl Default for AndroidNativeUploadRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct NativeUploadFileState {
    pub(crate) file_id: String,
    pub(crate) name: String,
    pub(crate) mime_type: Option<String>,
    pub(crate) node_id: Option<u64>,
    pub(crate) total_bytes: u64,
    pub(crate) loaded_bytes: u64,
    pub(crate) chunk_count: u64,
    pub(crate) first_chunk_at: Option<Instant>,
    pub(crate) last_perf_log_at: Option<Instant>,
    pub(crate) last_perf_log_bytes: u64,
    pub(crate) total_adapter_elapsed: Duration,
    pub(crate) slowest_adapter_elapsed: Duration,
    pub(crate) total_adapter_wait_elapsed: Duration,
    pub(crate) slowest_adapter_wait_elapsed: Duration,
    pub(crate) total_jni_convert_elapsed: Duration,
    pub(crate) slowest_jni_convert_elapsed: Duration,
    pub(crate) import_provenance: Option<PendingNativeUploadImportProvenance>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingNativeUploadImportProvenance {
    pub(crate) image_candidate: bool,
    pub(crate) permission_status: String,
    pub(crate) require_original_status: String,
    pub(crate) original_stream_used: bool,
    pub(crate) regular_stream_fallback: bool,
    pub(crate) uri_scheme: Option<String>,
    pub(crate) uri_authority: Option<String>,
    pub(crate) captured_at_ms: Option<u64>,
}

pub(crate) struct PendingNativeUpload {
    pub(crate) app: tauri::AppHandle,
    pub(crate) adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    pub(crate) parent_path: String,
    pub(crate) read_chunk_size: u64,
    pub(crate) files: HashMap<String, NativeUploadFileState>,
    pub(crate) tx: Option<oneshot::Sender<Result<(), String>>>,
    pub(crate) cancelled: bool,
    pub(crate) started_at: Instant,
    pub(crate) last_emit: Instant,
}

pub(crate) struct NativeUploadPerfSnapshot {
    pub(crate) loaded_bytes: u64,
    pub(crate) total_bytes: u64,
    pub(crate) chunk_count: u64,
    pub(crate) elapsed: Duration,
    pub(crate) total_adapter_elapsed: Duration,
    pub(crate) slowest_adapter_elapsed: Duration,
    pub(crate) total_adapter_wait_elapsed: Duration,
    pub(crate) slowest_adapter_wait_elapsed: Duration,
    pub(crate) total_jni_convert_elapsed: Duration,
    pub(crate) slowest_jni_convert_elapsed: Duration,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fail_all_pending_without_shutdown_keeps_runtime_open() {
        let runtime = AndroidNativeUploadRuntimeState::new();

        assert_eq!(
            runtime
                .fail_all_pending(
                    "Native upload cancelled",
                    None,
                    NativeUploadCloseMode::Cancel
                )
                .expect("cancel pending uploads"),
            0
        );

        assert!(!runtime.shutdown_requested());
    }

    #[test]
    fn fail_all_pending_with_shutdown_closes_runtime() {
        let runtime = AndroidNativeUploadRuntimeState::new();

        assert_eq!(
            runtime
                .fail_all_pending(
                    "Native upload cancelled",
                    None,
                    NativeUploadCloseMode::Shutdown
                )
                .expect("shutdown pending uploads"),
            0
        );

        assert!(runtime.shutdown_requested());
    }
}
