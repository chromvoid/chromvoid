use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use tauri::async_runtime::JoinHandle;
use tauri::http::header::{
    ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE,
};
use tauri::http::{HeaderValue, Method, Request, Response, StatusCode};
use tauri::Manager;
use tauri::UriSchemeResponder;
use tokio::sync::Notify;

use crate::types::*;

use super::derivatives::{
    build_core_backed_image_derivative_stream_with_metadata_and_cancellation,
    is_display_derivative_candidate, load_stored_image_derivative_stream,
};
use super::rpc::{load_catalog_download_bytes, load_catalog_download_range_bytes};
#[cfg(test)]
use super::staging::opaque_staged_file_name;
use super::staging::{OPEN_EXTERNAL_STAGING_DIR, SHARE_FILES_STAGING_DIR};
use super::CatalogDownloadError;
use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::commands::catalog::source_metadata::load_catalog_source_metadata;
use crate::core_adapter::CoreAdapter;

pub(crate) const PREPARED_PREVIEW_SCHEME: &str = "chromvoid-preview";
pub(super) const PREVIEW_STAGING_DIR: &str = "chromvoid-preview";
const PREPARED_PREVIEW_PROTOCOL_RUNTIME_POISONED: &str =
    "Prepared preview protocol runtime mutex poisoned";
#[cfg(any(desktop, test))]
const PREPARED_PREVIEW_PROTOCOL_SHUTDOWN_TIMED_OUT: &str =
    "Prepared preview protocol runtime shutdown timed out";
const PREPARED_PREVIEW_BUILD_LOCK_IDLE_TTL: Duration = Duration::from_secs(10 * 60);

type PreparedPreviewSessionCache = HashMap<PreparedPreviewCacheKey, PreparedPreviewCacheEntry>;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct PreparedPreviewCacheKey {
    preview_root: std::path::PathBuf,
    node_id: u64,
    source_revision: u64,
    variant: PreviewFileVariant,
    storage_version: u32,
}

#[derive(Debug, Clone)]
struct PreparedPreviewCacheEntry {
    release_handle: String,
    name: String,
    mime_type: String,
    size: u64,
    variant: String,
    source: PreparedPreviewSource,
    preview_ids: HashSet<String>,
}

#[derive(Debug, Clone)]
pub(crate) enum PreparedPreviewSource {
    Raw {
        node_id: u64,
        source_revision: u64,
    },
    Derivative {
        node_id: u64,
        source_revision: u64,
        tier: crate::image_preview::ImageDerivativeTier,
    },
}

#[derive(Debug, Clone)]
pub(crate) struct PreparedPreviewRuntimeEntry {
    pub(crate) preview_id: String,
    pub(crate) mime_type: String,
    pub(crate) size: u64,
    pub(crate) source: PreparedPreviewSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum PreparedPreviewEntryRef {
    Cached(PreparedPreviewCacheKey),
    Direct(String),
}

#[derive(Debug, Default)]
struct PreparedPreviewRuntimeCache {
    session_cache: PreparedPreviewSessionCache,
    direct_entries: HashMap<String, PreparedPreviewCacheEntry>,
    preview_index: HashMap<String, PreparedPreviewEntryRef>,
    next_handle_id: u64,
}

pub(crate) struct PreparedPreviewRuntimeState {
    cache: Mutex<PreparedPreviewRuntimeCache>,
    build_locks: Mutex<HashMap<PreparedPreviewCacheKey, PreparedPreviewBuildLockEntry>>,
    protocol_lifecycle: Arc<PreparedPreviewProtocolLifecycle>,
}

struct PreparedPreviewBuildLockEntry {
    lock: Arc<Mutex<()>>,
    last_used: Instant,
}

#[derive(Default)]
struct PreparedPreviewProtocolLifecycleState {
    shutting_down: bool,
    active_requests: usize,
}

struct PreparedPreviewProtocolLifecycle {
    state: Mutex<PreparedPreviewProtocolLifecycleState>,
    tasks: Mutex<Vec<JoinHandle<()>>>,
    active_drained: Notify,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreparedPreviewProtocolRuntimeError {
    ShuttingDown,
}

struct PreparedPreviewProtocolRequestPermit {
    lifecycle: Arc<PreparedPreviewProtocolLifecycle>,
}

impl PreparedPreviewRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            cache: Mutex::new(PreparedPreviewRuntimeCache::default()),
            build_locks: Mutex::new(HashMap::new()),
            protocol_lifecycle: Arc::new(PreparedPreviewProtocolLifecycle {
                state: Mutex::new(PreparedPreviewProtocolLifecycleState::default()),
                tasks: Mutex::new(Vec::new()),
                active_drained: Notify::new(),
            }),
        }
    }

    fn try_begin_protocol_request(
        &self,
    ) -> Result<PreparedPreviewProtocolRequestPermit, PreparedPreviewProtocolRuntimeError> {
        let mut state = match self.protocol_lifecycle.state.lock() {
            Ok(state) => state,
            Err(_) => {
                tracing::warn!(
                    "prepared_preview: protocol runtime mutex poisoned during admission"
                );
                return Err(PreparedPreviewProtocolRuntimeError::ShuttingDown);
            }
        };
        if state.shutting_down {
            return Err(PreparedPreviewProtocolRuntimeError::ShuttingDown);
        }
        state.active_requests = state.active_requests.saturating_add(1);
        Ok(PreparedPreviewProtocolRequestPermit {
            lifecycle: self.protocol_lifecycle.clone(),
        })
    }

    fn protocol_tasks_for_spawn(&self) -> Result<MutexGuard<'_, Vec<JoinHandle<()>>>, String> {
        let mut tasks = self
            .protocol_lifecycle
            .tasks
            .lock()
            .map_err(|_| PREPARED_PREVIEW_PROTOCOL_RUNTIME_POISONED.to_string())?;
        prune_finished_protocol_tasks(&mut tasks);
        Ok(tasks)
    }

    #[cfg(any(desktop, test))]
    fn prune_protocol_tasks(&self) -> Result<(), String> {
        let mut tasks = self
            .protocol_lifecycle
            .tasks
            .lock()
            .map_err(|_| PREPARED_PREVIEW_PROTOCOL_RUNTIME_POISONED.to_string())?;
        prune_finished_protocol_tasks(&mut tasks);
        Ok(())
    }

    #[cfg(any(desktop, test))]
    fn abort_protocol_tasks(&self) -> Result<(), String> {
        let mut tasks = self
            .protocol_lifecycle
            .tasks
            .lock()
            .map_err(|_| PREPARED_PREVIEW_PROTOCOL_RUNTIME_POISONED.to_string())?;
        prune_finished_protocol_tasks(&mut tasks);
        for task in tasks.drain(..) {
            task.abort();
        }
        Ok(())
    }

    #[cfg(any(desktop, test))]
    pub(crate) async fn shutdown_protocol_with_grace(&self, grace: Duration) -> Result<(), String> {
        {
            let mut state = self
                .protocol_lifecycle
                .state
                .lock()
                .map_err(|_| PREPARED_PREVIEW_PROTOCOL_RUNTIME_POISONED.to_string())?;
            state.shutting_down = true;
            if state.active_requests == 0 {
                return self.prune_protocol_tasks();
            }
        }

        if grace.is_zero() {
            self.abort_protocol_tasks()?;
            return Err(PREPARED_PREVIEW_PROTOCOL_SHUTDOWN_TIMED_OUT.to_string());
        }

        let wait_for_drain = async {
            loop {
                let notified = self.protocol_lifecycle.active_drained.notified();
                {
                    let state = self
                        .protocol_lifecycle
                        .state
                        .lock()
                        .map_err(|_| PREPARED_PREVIEW_PROTOCOL_RUNTIME_POISONED.to_string())?;
                    if state.active_requests == 0 {
                        return Ok::<(), String>(());
                    }
                }
                notified.await;
            }
        };

        match tokio::time::timeout(grace, wait_for_drain).await {
            Ok(result) => {
                result?;
                self.prune_protocol_tasks()?;
                Ok(())
            }
            Err(_) => {
                self.abort_protocol_tasks()?;
                Err(PREPARED_PREVIEW_PROTOCOL_SHUTDOWN_TIMED_OUT.to_string())
            }
        }
    }

    fn next_release_handle_locked(
        cache: &mut PreparedPreviewRuntimeCache,
        preview_id: &str,
    ) -> String {
        cache.next_handle_id = cache.next_handle_id.saturating_add(1);
        format!(
            "prepared-preview:{}:{:x}",
            sanitize_preview_id_segment(preview_id),
            cache.next_handle_id
        )
    }

    fn build_lock(
        &self,
        key: &PreparedPreviewCacheKey,
    ) -> Result<Arc<Mutex<()>>, CatalogDownloadError> {
        let mut locks = self.build_locks.lock().map_err(|_| {
            (
                "Prepared preview build lock registry poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let now = Instant::now();
        prune_prepared_preview_build_locks_locked(&mut locks, now);
        if let Some(entry) = locks.get_mut(key) {
            entry.last_used = now;
            return Ok(entry.lock.clone());
        }
        let lock = Arc::new(Mutex::new(()));
        locks.insert(
            key.clone(),
            PreparedPreviewBuildLockEntry {
                lock: lock.clone(),
                last_used: now,
            },
        );
        Ok(lock)
    }

    #[cfg(test)]
    fn build_lock_count_for_tests(&self) -> usize {
        self.build_locks
            .lock()
            .map(|locks| locks.len())
            .unwrap_or_default()
    }

    #[cfg(test)]
    fn force_build_lock_idle_for_tests(&self, key: &PreparedPreviewCacheKey) {
        let Ok(mut locks) = self.build_locks.lock() else {
            return;
        };
        if let Some(entry) = locks.get_mut(key) {
            entry.last_used = Instant::now()
                .checked_sub(PREPARED_PREVIEW_BUILD_LOCK_IDLE_TTL + Duration::from_secs(1))
                .unwrap_or_else(Instant::now);
        }
    }

    #[cfg(test)]
    fn prune_build_locks_for_tests(&self) -> Result<usize, CatalogDownloadError> {
        let mut locks = self.build_locks.lock().map_err(|_| {
            (
                "Prepared preview build lock registry poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        Ok(prune_prepared_preview_build_locks_locked(
            &mut locks,
            Instant::now(),
        ))
    }

    fn retain_cache_hit(
        &self,
        key: &PreparedPreviewCacheKey,
        preview_id: &str,
    ) -> Result<Option<PreparedPreviewFileResult>, CatalogDownloadError> {
        let mut cache = self.cache.lock().map_err(|_| {
            (
                "Prepared preview cache lock poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        Ok(retain_prepared_preview_cache_hit_locked(
            &mut cache, key, preview_id,
        ))
    }

    #[cfg(test)]
    fn insert_cached_entry(
        &self,
        key: PreparedPreviewCacheKey,
        entry: PreparedPreviewCacheEntry,
    ) -> Result<(), CatalogDownloadError> {
        let mut cache = self.cache.lock().map_err(|_| {
            (
                "Prepared preview cache lock poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        for preview_id in &entry.preview_ids {
            cache.preview_index.insert(
                preview_id.clone(),
                PreparedPreviewEntryRef::Cached(key.clone()),
            );
        }
        cache.session_cache.insert(key, entry);
        Ok(())
    }

    fn insert_cached_preview(
        &self,
        key: PreparedPreviewCacheKey,
        preview_id: String,
        name: String,
        mime_type: String,
        size: u64,
        variant: String,
        source: PreparedPreviewSource,
    ) -> Result<PreparedPreviewFileResult, CatalogDownloadError> {
        let mut cache = self.cache.lock().map_err(|_| {
            (
                "Prepared preview cache lock poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        if let Some(previous) = cache.session_cache.remove(&key) {
            for previous_preview_id in previous.preview_ids {
                cache.preview_index.remove(&previous_preview_id);
            }
        }
        let release_handle = Self::next_release_handle_locked(&mut cache, &preview_id);
        let mut preview_ids = HashSet::new();
        preview_ids.insert(preview_id.clone());
        cache.preview_index.insert(
            preview_id.clone(),
            PreparedPreviewEntryRef::Cached(key.clone()),
        );
        cache.session_cache.insert(
            key,
            PreparedPreviewCacheEntry {
                release_handle: release_handle.clone(),
                name: name.clone(),
                mime_type: mime_type.clone(),
                size,
                variant: variant.clone(),
                source,
                preview_ids,
            },
        );
        Ok(PreparedPreviewFileResult {
            preview_id,
            path: release_handle,
            name,
            mime_type,
            size,
            variant,
        })
    }

    fn insert_direct_entry(
        &self,
        preview_id: String,
        name: String,
        mime_type: String,
        size: u64,
        variant: String,
        source: PreparedPreviewSource,
    ) -> Result<PreparedPreviewFileResult, CatalogDownloadError> {
        let mut cache = self.cache.lock().map_err(|_| {
            (
                "Prepared preview cache lock poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let release_handle = Self::next_release_handle_locked(&mut cache, &preview_id);
        let mut preview_ids = HashSet::new();
        preview_ids.insert(preview_id.clone());
        cache.preview_index.insert(
            preview_id.clone(),
            PreparedPreviewEntryRef::Direct(preview_id.clone()),
        );
        cache.direct_entries.insert(
            preview_id.clone(),
            PreparedPreviewCacheEntry {
                release_handle: release_handle.clone(),
                name: name.clone(),
                mime_type: mime_type.clone(),
                size,
                variant: variant.clone(),
                source,
                preview_ids,
            },
        );
        Ok(PreparedPreviewFileResult {
            preview_id,
            path: release_handle,
            name,
            mime_type,
            size,
            variant,
        })
    }

    pub(crate) fn entry_for_preview_id(
        &self,
        preview_id: &str,
    ) -> Result<Option<PreparedPreviewRuntimeEntry>, CatalogDownloadError> {
        let cache = self.cache.lock().map_err(|_| {
            (
                "Prepared preview cache lock poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        Ok(entry_for_preview_id_locked(&cache, preview_id))
    }

    fn release_handle(
        &self,
        preview_id: &str,
        release_handle: &str,
    ) -> Result<bool, CatalogDownloadError> {
        let mut cache = self.cache.lock().map_err(|_| {
            (
                "Prepared preview cache lock poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let Some(entry_ref) = cache.preview_index.get(preview_id).cloned() else {
            return Ok(false);
        };

        let stored_handle = match &entry_ref {
            PreparedPreviewEntryRef::Cached(key) => cache
                .session_cache
                .get(key)
                .map(|entry| entry.release_handle.as_str()),
            PreparedPreviewEntryRef::Direct(key) => cache
                .direct_entries
                .get(key)
                .map(|entry| entry.release_handle.as_str()),
        };
        if stored_handle != Some(release_handle) {
            return Err((
                "Preview release handle does not match the release request".to_string(),
                Some("INVALID".to_string()),
            ));
        }

        cache.preview_index.remove(preview_id);
        match entry_ref {
            PreparedPreviewEntryRef::Cached(key) => {
                if let Some(entry) = cache.session_cache.get_mut(&key) {
                    entry.preview_ids.remove(preview_id);
                    if entry.preview_ids.is_empty() {
                        cache.session_cache.remove(&key);
                    }
                }
            }
            PreparedPreviewEntryRef::Direct(key) => {
                cache.direct_entries.remove(&key);
            }
        }
        Ok(true)
    }

    pub(crate) fn clear_all(&self) -> Result<(), CatalogDownloadError> {
        let mut cache = self.cache.lock().map_err(|_| {
            (
                "Prepared preview cache lock poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        cache.session_cache.clear();
        cache.direct_entries.clear();
        cache.preview_index.clear();
        drop(cache);
        let mut locks = self.build_locks.lock().map_err(|_| {
            (
                "Prepared preview build lock registry poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        locks.clear();
        Ok(())
    }
}

fn prune_prepared_preview_build_locks_locked(
    locks: &mut HashMap<PreparedPreviewCacheKey, PreparedPreviewBuildLockEntry>,
    now: Instant,
) -> usize {
    let before = locks.len();
    locks.retain(|_, entry| {
        Arc::strong_count(&entry.lock) > 1
            || now
                .checked_duration_since(entry.last_used)
                .unwrap_or_default()
                < PREPARED_PREVIEW_BUILD_LOCK_IDLE_TTL
    });
    before.saturating_sub(locks.len())
}

fn prune_finished_protocol_tasks(tasks: &mut Vec<JoinHandle<()>>) {
    tasks.retain(|task| !task.inner().is_finished());
}

impl Default for PreparedPreviewRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for PreparedPreviewProtocolRequestPermit {
    fn drop(&mut self) {
        let Ok(mut state) = self.lifecycle.state.lock() else {
            tracing::warn!("prepared_preview: protocol runtime mutex poisoned during release");
            return;
        };
        state.active_requests = state.active_requests.saturating_sub(1);
        if state.active_requests == 0 {
            self.lifecycle.active_drained.notify_waiters();
            self.lifecycle.active_drained.notify_one();
        }
    }
}

fn preview_variant_label(variant: PreviewFileVariant) -> &'static str {
    match variant {
        PreviewFileVariant::Raw => "raw",
        PreviewFileVariant::PreviewImage => "preview-image",
        PreviewFileVariant::ThumbnailImage => "thumbnail-image",
    }
}

fn preview_variant_tier(
    variant: PreviewFileVariant,
) -> Option<crate::image_preview::ImageDerivativeTier> {
    match variant {
        PreviewFileVariant::Raw => None,
        PreviewFileVariant::PreviewImage => {
            Some(crate::image_preview::ImageDerivativeTier::DisplayPreview)
        }
        PreviewFileVariant::ThumbnailImage => {
            Some(crate::image_preview::ImageDerivativeTier::Thumbnail)
        }
    }
}

pub(super) fn sanitize_preview_id_segment(preview_id: &str) -> String {
    let mut out = String::with_capacity(preview_id.len());
    for ch in preview_id.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' {
            out.push(ch);
        } else {
            out.push('-');
        }
    }

    if out.trim_matches('-').is_empty() {
        "preview".to_string()
    } else {
        out
    }
}

fn resolve_preview_output_name(stream_name: &str, display_name_hint: &str) -> String {
    let requested = display_name_hint.trim();
    if !requested.is_empty() {
        return requested.to_string();
    }

    let stream = stream_name.trim();
    if !stream.is_empty() {
        return stream.to_string();
    }

    "file".to_string()
}

fn resolve_preview_mime_type(stream_mime_type: &str, requested_mime_type: Option<&str>) -> String {
    let stream = stream_mime_type.trim();
    if !stream.is_empty() {
        return stream.to_string();
    }

    requested_mime_type
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("application/octet-stream")
        .to_string()
}

#[cfg(test)]
pub(super) fn opaque_preview_staged_file_name(
    ts: u64,
    preview_id: &str,
    mime_type: &str,
) -> String {
    opaque_staged_file_name(ts, preview_id, mime_type)
}

pub(super) fn staged_preview_file_preview_id(name: &str) -> Option<&str> {
    let (timestamp, rest) = name.split_once('_')?;
    let (preview_id, extension) = rest.rsplit_once('.')?;

    if timestamp.parse::<u64>().is_err() || preview_id.is_empty() || extension.is_empty() {
        return None;
    }

    Some(preview_id)
}

fn prepared_preview_cache_result(
    preview_id: &str,
    entry: &PreparedPreviewCacheEntry,
) -> PreparedPreviewFileResult {
    PreparedPreviewFileResult {
        preview_id: preview_id.to_string(),
        path: entry.release_handle.clone(),
        name: entry.name.clone(),
        mime_type: entry.mime_type.clone(),
        size: entry.size,
        variant: entry.variant.clone(),
    }
}

fn prepared_preview_runtime_entry(
    preview_id: &str,
    entry: &PreparedPreviewCacheEntry,
) -> PreparedPreviewRuntimeEntry {
    PreparedPreviewRuntimeEntry {
        preview_id: preview_id.to_string(),
        mime_type: entry.mime_type.clone(),
        size: entry.size,
        source: entry.source.clone(),
    }
}

fn entry_for_preview_id_locked(
    cache: &PreparedPreviewRuntimeCache,
    preview_id: &str,
) -> Option<PreparedPreviewRuntimeEntry> {
    match cache.preview_index.get(preview_id)? {
        PreparedPreviewEntryRef::Cached(key) => cache
            .session_cache
            .get(key)
            .map(|entry| prepared_preview_runtime_entry(preview_id, entry)),
        PreparedPreviewEntryRef::Direct(key) => cache
            .direct_entries
            .get(key)
            .map(|entry| prepared_preview_runtime_entry(preview_id, entry)),
    }
}

fn retain_prepared_preview_cache_hit_locked(
    cache: &mut PreparedPreviewRuntimeCache,
    key: &PreparedPreviewCacheKey,
    preview_id: &str,
) -> Option<PreparedPreviewFileResult> {
    let entry = cache.session_cache.get_mut(key)?;
    entry.preview_ids.insert(preview_id.to_string());
    cache.preview_index.insert(
        preview_id.to_string(),
        PreparedPreviewEntryRef::Cached(key.clone()),
    );
    Some(prepared_preview_cache_result(preview_id, entry))
}

#[cfg(test)]
pub(super) fn prepare_catalog_preview_file_in_root(
    preview_root: &std::path::Path,
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    args: PreparePreviewFileArgs,
) -> Result<PreparedPreviewFileResult, CatalogDownloadError> {
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();
    prepare_catalog_preview_file_in_root_with_runtime(
        preview_root,
        adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        args,
        None,
    )
}

#[cfg(test)]
pub(super) fn prepare_catalog_preview_file_in_root_with_runtime(
    preview_root: &std::path::Path,
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    image_preview_runtime: &crate::image_preview::ImagePreviewRuntimeState,
    prepared_preview_runtime: &PreparedPreviewRuntimeState,
    args: PreparePreviewFileArgs,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
) -> Result<PreparedPreviewFileResult, CatalogDownloadError> {
    prepare_catalog_preview_file_in_root_with_cancellation(
        preview_root,
        adapter,
        image_preview_runtime,
        prepared_preview_runtime,
        args,
        cancellation_epoch,
    )
}

pub(super) fn prepare_catalog_preview_file_in_root_cancellable(
    preview_root: &std::path::Path,
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    image_preview_runtime: &crate::image_preview::ImagePreviewRuntimeState,
    prepared_preview_runtime: &PreparedPreviewRuntimeState,
    args: PreparePreviewFileArgs,
    cancellation_epoch: Arc<AtomicU64>,
) -> Result<PreparedPreviewFileResult, CatalogDownloadError> {
    prepare_catalog_preview_file_in_root_with_cancellation(
        preview_root,
        adapter,
        image_preview_runtime,
        prepared_preview_runtime,
        args,
        Some(&cancellation_epoch),
    )
}

fn prepare_catalog_preview_file_in_root_with_cancellation(
    preview_root: &std::path::Path,
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    image_preview_runtime: &crate::image_preview::ImagePreviewRuntimeState,
    prepared_preview_runtime: &PreparedPreviewRuntimeState,
    args: PreparePreviewFileArgs,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
) -> Result<PreparedPreviewFileResult, CatalogDownloadError> {
    let variant = args.variant;
    let variant_label = preview_variant_label(variant).to_string();

    match preview_variant_tier(variant) {
        Some(tier) => {
            if !is_display_derivative_candidate(&args.file_name, args.mime_type.as_deref()) {
                return Err((
                    "Preview conversion is only available for image files or embedded audio artwork"
                        .to_string(),
                    Some("UNSUPPORTED".to_string()),
                ));
            }

            let source_metadata = load_catalog_source_metadata(adapter, args.node_id)?;
            let cache_key = PreparedPreviewCacheKey {
                preview_root: preview_root.to_path_buf(),
                node_id: args.node_id,
                source_revision: source_metadata.source_revision,
                variant,
                storage_version: crate::image_preview::DERIVATIVE_STORAGE_VERSION,
            };

            let cache_started = Instant::now();
            if !args.refresh_derivative_cache {
                if let Some(cached) =
                    prepared_preview_runtime.retain_cache_hit(&cache_key, &args.preview_id)?
                {
                    tracing::info!(
                        "perf:prepared_source event=cache_hit prepared-source:cache_ms={} node_id={} source_revision={} variant={} storage_version={}",
                        cache_started.elapsed().as_millis(),
                        args.node_id,
                        source_metadata.source_revision,
                        variant_label,
                        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                    );
                    return Ok(cached);
                }
            }

            let build_lock = prepared_preview_runtime.build_lock(&cache_key)?;
            let build_wait_started = Instant::now();
            let _build_guard = build_lock.lock().map_err(|_| {
                (
                    "Prepared preview build lock poisoned".to_string(),
                    Some("INTERNAL".to_string()),
                )
            })?;
            tracing::info!(
                "perf:prepared_source event=build_lock prepared-source:cache_ms={} node_id={} source_revision={} variant={} storage_version={}",
                build_wait_started.elapsed().as_millis(),
                args.node_id,
                source_metadata.source_revision,
                variant_label,
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
            );
            let cache_started = Instant::now();
            if !args.refresh_derivative_cache {
                if let Some(cached) =
                    prepared_preview_runtime.retain_cache_hit(&cache_key, &args.preview_id)?
                {
                    tracing::info!(
                        "perf:prepared_source event=cache_hit_after_wait prepared-source:cache_ms={} node_id={} source_revision={} variant={} storage_version={}",
                        cache_started.elapsed().as_millis(),
                        args.node_id,
                        source_metadata.source_revision,
                        variant_label,
                        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                    );
                    return Ok(cached);
                }
            }

            let build_started = Instant::now();
            let (derivative, source_revision) =
                build_core_backed_image_derivative_stream_with_metadata_and_cancellation(
                    adapter,
                    image_preview_runtime,
                    args.node_id,
                    &args.file_name,
                    args.mime_type.as_deref(),
                    tier,
                    source_metadata,
                    cancellation_epoch,
                    args.refresh_derivative_cache,
                )?;
            tracing::info!(
                "perf:prepared_source event=build prepared-source:build_ms={} node_id={} variant={} storage_version={}",
                build_started.elapsed().as_millis(),
                args.node_id,
                variant_label,
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
            );
            let name = resolve_preview_output_name(&derivative.meta.name, "");
            let mime_type = resolve_preview_mime_type(&derivative.meta.mime_type, None);
            if !args.refresh_derivative_cache {
                if let Some(cached) =
                    prepared_preview_runtime.retain_cache_hit(&cache_key, &args.preview_id)?
                {
                    return Ok(cached);
                }
            }
            tracing::info!(
                "perf:prepared_source event=register node_id={} variant={} output_bytes={}",
                args.node_id,
                variant_label,
                derivative.meta.size,
            );
            return prepared_preview_runtime.insert_cached_preview(
                cache_key,
                args.preview_id,
                name,
                mime_type,
                derivative.meta.size,
                variant_label,
                PreparedPreviewSource::Derivative {
                    node_id: args.node_id,
                    source_revision,
                    tier,
                },
            );
        }
        None => {
            let source_metadata = load_catalog_source_metadata(adapter, args.node_id)?;
            let name = resolve_preview_output_name(&source_metadata.name, &args.file_name);
            let mime_type = resolve_preview_mime_type(
                source_metadata.mime_type.as_deref().unwrap_or(""),
                args.mime_type.as_deref(),
            );
            tracing::info!(
                "perf:prepared_source event=register node_id={} source_revision={} variant={} output_bytes={}",
                args.node_id,
                source_metadata.source_revision,
                variant_label,
                source_metadata.size,
            );
            prepared_preview_runtime.insert_direct_entry(
                args.preview_id,
                name,
                mime_type,
                source_metadata.size,
                variant_label,
                PreparedPreviewSource::Raw {
                    node_id: args.node_id,
                    source_revision: source_metadata.source_revision,
                },
            )
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NormalizedPreviewRange {
    start: u64,
    end: u64,
}

impl NormalizedPreviewRange {
    fn len(self) -> u64 {
        self.end.saturating_sub(self.start).saturating_add(1)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreviewRangeError {
    Invalid,
    Unsatisfiable,
}

enum PreviewProtocolLoadError {
    Missing,
    Failed(String),
}

pub(crate) fn handle_prepared_preview_protocol_request(
    app: tauri::AppHandle,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let Some((adapter, prepared_preview_runtime, catalog_blocking_io_runtime)) =
        app.try_state::<AppState>().map(|state| {
            (
                state.adapter.clone(),
                state.prepared_preview_runtime.clone(),
                state.catalog_blocking_io_runtime.clone(),
            )
        })
    else {
        responder.respond(response(StatusCode::SERVICE_UNAVAILABLE, Vec::new()));
        return;
    };

    let request_permit = match prepared_preview_runtime.try_begin_protocol_request() {
        Ok(permit) => permit,
        Err(PreparedPreviewProtocolRuntimeError::ShuttingDown) => {
            responder.respond(response(StatusCode::SERVICE_UNAVAILABLE, Vec::new()));
            return;
        }
    };

    let request_runtime = prepared_preview_runtime.clone();
    let mut protocol_tasks = match prepared_preview_runtime.protocol_tasks_for_spawn() {
        Ok(tasks) => tasks,
        Err(error) => {
            tracing::warn!("prepared_preview_protocol: task tracking unavailable: {error}");
            responder.respond(response(StatusCode::SERVICE_UNAVAILABLE, Vec::new()));
            return;
        }
    };

    let protocol_task = tauri::async_runtime::spawn(async move {
        let _request_permit = request_permit;
        let response = match catalog_blocking_io_runtime
            .spawn_blocking(move || {
                handle_prepared_preview_request_with_parts(&adapter, &request_runtime, request)
            })
            .await
        {
            Ok(response) => response,
            Err(error) => catalog_blocking_io_error_response(error),
        };
        responder.respond(response);
    });
    protocol_tasks.push(protocol_task);
}

fn catalog_blocking_io_error_response(error: CatalogBlockingIoError) -> Response<Vec<u8>> {
    match error {
        CatalogBlockingIoError::Busy | CatalogBlockingIoError::ShuttingDown => {
            response(StatusCode::SERVICE_UNAVAILABLE, Vec::new())
        }
        CatalogBlockingIoError::TaskFailed(error) => {
            tracing::warn!("prepared_preview_protocol: blocking task failed: {error}");
            response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new())
        }
    }
}

pub(super) fn handle_prepared_preview_request_with_parts(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    prepared_preview_runtime: &PreparedPreviewRuntimeState,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let Some(preview_id) = preview_id_from_request(&request) else {
        return response(StatusCode::NOT_FOUND, Vec::new());
    };
    let entry = match prepared_preview_runtime.entry_for_preview_id(&preview_id) {
        Ok(Some(entry)) => entry,
        Ok(None) => return response(StatusCode::NOT_FOUND, Vec::new()),
        Err(_) => return response(StatusCode::SERVICE_UNAVAILABLE, Vec::new()),
    };

    match *request.method() {
        Method::HEAD => metadata_response(&entry),
        Method::GET => serve_prepared_preview_get(adapter, &entry, &request),
        _ => response(StatusCode::METHOD_NOT_ALLOWED, Vec::new()),
    }
}

fn serve_prepared_preview_get(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    entry: &PreparedPreviewRuntimeEntry,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let range_header = request
        .headers()
        .get(tauri::http::header::RANGE)
        .and_then(|value| value.to_str().ok());
    let range = match normalize_preview_range(range_header, entry.size) {
        Ok(range) => range,
        Err(PreviewRangeError::Invalid) => {
            return range_error_response(StatusCode::RANGE_NOT_SATISFIABLE, entry.size);
        }
        Err(PreviewRangeError::Unsatisfiable) => {
            return range_error_response(StatusCode::RANGE_NOT_SATISFIABLE, entry.size);
        }
    };

    let bytes = match load_prepared_preview_bytes(adapter, entry, range) {
        Ok(bytes) => bytes,
        Err(PreviewProtocolLoadError::Missing) => {
            return response(StatusCode::NOT_FOUND, Vec::new())
        }
        Err(PreviewProtocolLoadError::Failed(error)) => {
            tracing::warn!(
                "prepared_preview_protocol: failed to load preview_id={} error={}",
                entry.preview_id,
                error
            );
            return response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new());
        }
    };

    match range {
        Some(range) => partial_content_response(entry, range, bytes),
        None => full_content_response(entry, bytes),
    }
}

fn load_prepared_preview_bytes(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    entry: &PreparedPreviewRuntimeEntry,
    range: Option<NormalizedPreviewRange>,
) -> Result<Vec<u8>, PreviewProtocolLoadError> {
    match &entry.source {
        PreparedPreviewSource::Raw {
            node_id,
            source_revision,
        } => {
            if let Some(range) = range {
                return load_catalog_download_range_bytes(
                    adapter,
                    *node_id,
                    range.start,
                    range.len(),
                    *source_revision,
                )
                .map_err(|(error, _)| PreviewProtocolLoadError::Failed(error));
            }
            let out = load_catalog_download_bytes(adapter, *node_id)
                .map_err(|(error, _)| PreviewProtocolLoadError::Failed(error))?;
            Ok(out.bytes)
        }
        PreparedPreviewSource::Derivative {
            node_id,
            source_revision,
            tier,
        } => {
            let out =
                load_stored_image_derivative_stream(adapter, *node_id, *source_revision, *tier)
                    .map_err(|(error, _)| PreviewProtocolLoadError::Failed(error))?
                    .ok_or(PreviewProtocolLoadError::Missing)?;
            if let Some(range) = range {
                let start = range.start as usize;
                let end = range.end as usize + 1;
                if end > out.bytes.len() {
                    return Err(PreviewProtocolLoadError::Failed(
                        "Stored preview derivative is shorter than prepared metadata".to_string(),
                    ));
                }
                return Ok(out.bytes[start..end].to_vec());
            }
            Ok(out.bytes)
        }
    }
}

fn preview_id_from_request(request: &Request<Vec<u8>>) -> Option<String> {
    let id = request.uri().path().trim_start_matches('/').trim();
    if id.is_empty() || id.contains('/') {
        return None;
    }
    Some(id.to_string())
}

fn normalize_preview_range(
    header: Option<&str>,
    file_size: u64,
) -> Result<Option<NormalizedPreviewRange>, PreviewRangeError> {
    let Some(header) = header else {
        return Ok(None);
    };
    if file_size == 0 {
        return Err(PreviewRangeError::Unsatisfiable);
    }

    let spec = header
        .trim()
        .strip_prefix("bytes=")
        .ok_or(PreviewRangeError::Invalid)?;
    if spec.contains(',') {
        return Err(PreviewRangeError::Invalid);
    }

    let (start_raw, end_raw) = spec.split_once('-').ok_or(PreviewRangeError::Invalid)?;
    if start_raw.is_empty() {
        let suffix = end_raw
            .parse::<u64>()
            .map_err(|_| PreviewRangeError::Invalid)?;
        if suffix == 0 {
            return Err(PreviewRangeError::Unsatisfiable);
        }
        let response_len = suffix.min(file_size);
        let start = file_size.saturating_sub(response_len);
        return Ok(Some(NormalizedPreviewRange {
            start,
            end: file_size - 1,
        }));
    }

    let start = start_raw
        .parse::<u64>()
        .map_err(|_| PreviewRangeError::Invalid)?;
    if start >= file_size {
        return Err(PreviewRangeError::Unsatisfiable);
    }
    let end = if end_raw.is_empty() {
        file_size - 1
    } else {
        let end = end_raw
            .parse::<u64>()
            .map_err(|_| PreviewRangeError::Invalid)?;
        if end < start {
            return Err(PreviewRangeError::Invalid);
        }
        end.min(file_size - 1)
    };
    Ok(Some(NormalizedPreviewRange { start, end }))
}

fn metadata_response(entry: &PreparedPreviewRuntimeEntry) -> Response<Vec<u8>> {
    response_builder(StatusCode::OK)
        .header(CONTENT_TYPE, entry.mime_type.as_str())
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_LENGTH, entry.size.to_string())
        .body(Vec::new())
        .unwrap_or_else(|_| response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()))
}

fn full_content_response(entry: &PreparedPreviewRuntimeEntry, bytes: Vec<u8>) -> Response<Vec<u8>> {
    response_builder(StatusCode::OK)
        .header(CONTENT_TYPE, entry.mime_type.as_str())
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_LENGTH, bytes.len().to_string())
        .body(bytes)
        .unwrap_or_else(|_| response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()))
}

fn partial_content_response(
    entry: &PreparedPreviewRuntimeEntry,
    range: NormalizedPreviewRange,
    bytes: Vec<u8>,
) -> Response<Vec<u8>> {
    response_builder(StatusCode::PARTIAL_CONTENT)
        .header(CONTENT_TYPE, entry.mime_type.as_str())
        .header(ACCEPT_RANGES, "bytes")
        .header(
            CONTENT_RANGE,
            format!("bytes {}-{}/{}", range.start, range.end, entry.size),
        )
        .header(CONTENT_LENGTH, bytes.len().to_string())
        .body(bytes)
        .unwrap_or_else(|_| response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()))
}

fn range_error_response(status: StatusCode, file_size: u64) -> Response<Vec<u8>> {
    response_builder(status)
        .header(CONTENT_RANGE, format!("bytes */{file_size}"))
        .body(Vec::new())
        .unwrap_or_else(|_| response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()))
}

fn response(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    response_builder(status)
        .header(CONTENT_LENGTH, body.len().to_string())
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn response_builder(status: StatusCode) -> tauri::http::response::Builder {
    let mut builder = Response::builder().status(status);
    if let Some(headers) = builder.headers_mut() {
        headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
        headers.insert(
            tauri::http::header::HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        );
    } else {
        tracing::warn!("prepared_preview: response builder headers unavailable");
    }
    builder
}

fn ensure_release_target_in_preview_root(
    preview_root: &std::path::Path,
    target: &std::path::Path,
) -> Result<(), CatalogDownloadError> {
    std::fs::create_dir_all(preview_root).map_err(|e| {
        (
            format!("Failed to create preview cache dir: {e}"),
            Some("IO".to_string()),
        )
    })?;
    let root = preview_root.canonicalize().map_err(|e| {
        (
            format!("Failed to resolve preview cache dir: {e}"),
            Some("IO".to_string()),
        )
    })?;

    let Some(parent) = target.parent() else {
        return Err((
            "Preview file path is invalid".to_string(),
            Some("INVALID".to_string()),
        ));
    };
    let resolved_parent = parent.canonicalize().map_err(|e| {
        (
            format!("Failed to resolve preview file parent: {e}"),
            Some("IO".to_string()),
        )
    })?;
    if resolved_parent != root {
        return Err((
            "Preview file path is outside the preview cache".to_string(),
            Some("INVALID".to_string()),
        ));
    }

    if target.exists() {
        let resolved = target.canonicalize().map_err(|e| {
            (
                format!("Failed to resolve preview file: {e}"),
                Some("IO".to_string()),
            )
        })?;
        if !resolved.starts_with(&root) {
            return Err((
                "Preview file path is outside the preview cache".to_string(),
                Some("INVALID".to_string()),
            ));
        }
    }

    Ok(())
}

pub(super) fn release_catalog_preview_file_in_root(
    preview_root: &std::path::Path,
    prepared_preview_runtime: Option<&PreparedPreviewRuntimeState>,
    args: ReleasePreviewFileArgs,
) -> Result<(), CatalogDownloadError> {
    if let Some(runtime) = prepared_preview_runtime {
        if runtime.release_handle(&args.preview_id, &args.path)? {
            return Ok(());
        }
        if args.path.starts_with("prepared-preview:") {
            return Ok(());
        }
    }

    let target = std::path::PathBuf::from(&args.path);
    ensure_release_target_in_preview_root(preview_root, &target)?;
    if !target.exists() {
        return Ok(());
    }

    let Some(file_name) = target.file_name().and_then(|value| value.to_str()) else {
        return Err((
            "Preview file path is invalid".to_string(),
            Some("INVALID".to_string()),
        ));
    };
    let expected_preview_id = sanitize_preview_id_segment(&args.preview_id);
    if staged_preview_file_preview_id(file_name) != Some(expected_preview_id.as_str()) {
        return Err((
            "Preview file id does not match the release request".to_string(),
            Some("INVALID".to_string()),
        ));
    }

    match std::fs::remove_file(&target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err((
            format!("Failed to remove preview file: {error}"),
            Some("IO".to_string()),
        )),
    }
}

fn purge_catalog_preview_cache_entry(
    root: &std::path::Path,
    path: &std::path::Path,
    result: &mut PurgePreviewCacheResult,
) {
    if !path.starts_with(root) {
        result.skipped_entries = result.skipped_entries.saturating_add(1);
        return;
    }

    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => {
            result.skipped_entries = result.skipped_entries.saturating_add(1);
            return;
        }
    };

    if metadata.is_dir() {
        let entries = match std::fs::read_dir(path) {
            Ok(entries) => entries,
            Err(_) => {
                result.skipped_entries = result.skipped_entries.saturating_add(1);
                return;
            }
        };

        for entry in entries {
            match entry {
                Ok(entry) => purge_catalog_preview_cache_entry(root, &entry.path(), result),
                Err(_) => {
                    result.skipped_entries = result.skipped_entries.saturating_add(1);
                }
            }
        }

        match std::fs::remove_dir(path) {
            Ok(()) => {
                result.directories_removed = result.directories_removed.saturating_add(1);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                result.skipped_entries = result.skipped_entries.saturating_add(1);
            }
        }
        return;
    }

    let bytes = metadata.len();
    match std::fs::remove_file(path) {
        Ok(()) => {
            result.files_removed = result.files_removed.saturating_add(1);
            result.bytes_removed = result.bytes_removed.saturating_add(bytes);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {
            result.skipped_entries = result.skipped_entries.saturating_add(1);
        }
    }
}

pub(super) fn purge_catalog_preview_cache_in_root(
    preview_root: &std::path::Path,
) -> Result<PurgePreviewCacheResult, CatalogDownloadError> {
    let root_metadata = match std::fs::symlink_metadata(preview_root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PurgePreviewCacheResult::default());
        }
        Err(error) => {
            return Err((
                format!("Failed to inspect preview cache dir: {error}"),
                Some("IO".to_string()),
            ));
        }
    };

    if !root_metadata.is_dir() {
        let mut result = PurgePreviewCacheResult::default();
        let bytes = root_metadata.len();
        match std::fs::remove_file(preview_root) {
            Ok(()) => {
                result.files_removed = 1;
                result.bytes_removed = bytes;
                return Ok(result);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(result);
            }
            Err(error) => {
                return Err((
                    format!("Failed to remove preview cache placeholder: {error}"),
                    Some("IO".to_string()),
                ));
            }
        }
    }

    let root = preview_root.canonicalize().map_err(|error| {
        (
            format!("Failed to resolve preview cache dir: {error}"),
            Some("IO".to_string()),
        )
    })?;
    let entries = std::fs::read_dir(&root).map_err(|error| {
        (
            format!("Failed to read preview cache dir: {error}"),
            Some("IO".to_string()),
        )
    })?;
    let mut result = PurgePreviewCacheResult::default();

    for entry in entries {
        match entry {
            Ok(entry) => purge_catalog_preview_cache_entry(&root, &entry.path(), &mut result),
            Err(_) => {
                result.skipped_entries = result.skipped_entries.saturating_add(1);
            }
        }
    }

    Ok(result)
}

fn merge_purge_preview_cache_result(
    total: &mut PurgePreviewCacheResult,
    next: PurgePreviewCacheResult,
) {
    total.files_removed = total.files_removed.saturating_add(next.files_removed);
    total.directories_removed = total
        .directories_removed
        .saturating_add(next.directories_removed);
    total.bytes_removed = total.bytes_removed.saturating_add(next.bytes_removed);
    total.skipped_entries = total.skipped_entries.saturating_add(next.skipped_entries);
}

pub(super) fn purge_catalog_staging_cache_roots(
    roots: &[std::path::PathBuf],
) -> Result<PurgePreviewCacheResult, CatalogDownloadError> {
    let mut result = PurgePreviewCacheResult::default();
    for root in roots {
        let next = purge_catalog_preview_cache_in_root(root)?;
        merge_purge_preview_cache_result(&mut result, next);
    }
    Ok(result)
}

pub(crate) fn purge_catalog_preview_cache_for_app(
    app: &tauri::AppHandle,
    reason: &str,
) -> Result<PurgePreviewCacheResult, String> {
    if let Some(state) = app.try_state::<AppState>() {
        state
            .prepared_preview_runtime
            .clear_all()
            .map_err(|(error, _)| error)?;
    }
    let preview_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Failed to resolve app cache dir: {error}"))?
        .join(PREVIEW_STAGING_DIR);
    let cache_dir = app
        .path()
        .cache_dir()
        .map_err(|error| format!("Failed to resolve cache dir: {error}"))?;

    let roots = [
        preview_root,
        cache_dir.join(OPEN_EXTERNAL_STAGING_DIR),
        cache_dir.join(SHARE_FILES_STAGING_DIR),
    ];
    let result = purge_catalog_staging_cache_roots(&roots).map_err(|(error, _)| error)?;
    tracing::info!(
        "preview_cache purged reason={} files_removed={} directories_removed={} bytes_removed={} skipped_entries={}",
        reason,
        result.files_removed,
        result.directories_removed,
        result.bytes_removed,
        result.skipped_entries
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_cache_key() -> PreparedPreviewCacheKey {
        PreparedPreviewCacheKey {
            preview_root: std::path::PathBuf::from("/tmp/chromvoid-preview-test"),
            node_id: 42,
            source_revision: 7,
            variant: PreviewFileVariant::PreviewImage,
            storage_version: crate::image_preview::DERIVATIVE_STORAGE_VERSION,
        }
    }

    fn test_cache_entry(release_handle: &str, preview_id: &str) -> PreparedPreviewCacheEntry {
        let mut preview_ids = HashSet::new();
        preview_ids.insert(preview_id.to_string());
        PreparedPreviewCacheEntry {
            release_handle: release_handle.to_string(),
            name: "preview.png".to_string(),
            mime_type: "image/png".to_string(),
            size: 12,
            variant: "preview-image".to_string(),
            source: PreparedPreviewSource::Raw {
                node_id: 42,
                source_revision: 7,
            },
            preview_ids,
        }
    }

    #[test]
    fn runtime_build_locks_are_instance_scoped() {
        let key = test_cache_key();
        let first_runtime = PreparedPreviewRuntimeState::new();
        let second_runtime = PreparedPreviewRuntimeState::new();

        let first_lock = first_runtime
            .build_lock(&key)
            .expect("first runtime lock should be created");
        let first_lock_again = first_runtime
            .build_lock(&key)
            .expect("same runtime lock should be reused");
        let second_lock = second_runtime
            .build_lock(&key)
            .expect("second runtime lock should be created");

        assert!(Arc::ptr_eq(&first_lock, &first_lock_again));
        assert!(!Arc::ptr_eq(&first_lock, &second_lock));
    }

    #[test]
    fn runtime_prunes_idle_unshared_build_locks() {
        let key = test_cache_key();
        let runtime = PreparedPreviewRuntimeState::new();
        let first_lock = runtime
            .build_lock(&key)
            .expect("build lock should be created");

        runtime.force_build_lock_idle_for_tests(&key);
        assert_eq!(
            runtime
                .prune_build_locks_for_tests()
                .expect("in-use build lock prune should succeed"),
            0
        );
        assert_eq!(runtime.build_lock_count_for_tests(), 1);

        drop(first_lock);
        assert_eq!(
            runtime
                .prune_build_locks_for_tests()
                .expect("idle build lock prune should succeed"),
            1
        );
        assert_eq!(runtime.build_lock_count_for_tests(), 0);
    }

    #[tokio::test]
    async fn protocol_shutdown_rejects_future_requests() {
        let runtime = PreparedPreviewRuntimeState::new();

        runtime
            .shutdown_protocol_with_grace(Duration::ZERO)
            .await
            .expect("shutdown without active requests should succeed");

        assert!(matches!(
            runtime.try_begin_protocol_request(),
            Err(PreparedPreviewProtocolRuntimeError::ShuttingDown)
        ));
    }

    #[tokio::test]
    async fn protocol_shutdown_waits_until_active_request_finishes() {
        let runtime = Arc::new(PreparedPreviewRuntimeState::new());
        let permit = runtime
            .try_begin_protocol_request()
            .expect("request permit should be available");
        let runtime_clone = runtime.clone();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();

        let shutdown_task = tokio::spawn(async move {
            let _ = started_tx.send(());
            runtime_clone
                .shutdown_protocol_with_grace(Duration::from_secs(1))
                .await
        });

        started_rx.await.expect("shutdown task should start");
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!shutdown_task.is_finished());

        drop(permit);
        shutdown_task
            .await
            .expect("shutdown task should join")
            .expect("shutdown should succeed after request drops");
    }

    #[tokio::test]
    async fn protocol_shutdown_times_out_while_request_is_active() {
        let runtime = PreparedPreviewRuntimeState::new();
        let _permit = runtime
            .try_begin_protocol_request()
            .expect("request permit should be available");

        assert_eq!(
            runtime
                .shutdown_protocol_with_grace(Duration::from_millis(1))
                .await
                .expect_err("active request should time out"),
            PREPARED_PREVIEW_PROTOCOL_SHUTDOWN_TIMED_OUT
        );
        assert!(matches!(
            runtime.try_begin_protocol_request(),
            Err(PreparedPreviewProtocolRuntimeError::ShuttingDown)
        ));
    }

    #[tokio::test]
    async fn protocol_shutdown_timeout_aborts_tracked_task() {
        struct DropSignal(Option<tokio::sync::oneshot::Sender<()>>);

        impl Drop for DropSignal {
            fn drop(&mut self) {
                if let Some(sender) = self.0.take() {
                    let _ = sender.send(());
                }
            }
        }

        let runtime = Arc::new(PreparedPreviewRuntimeState::new());
        let permit = runtime
            .try_begin_protocol_request()
            .expect("request permit should be available");
        let (drop_tx, drop_rx) = tokio::sync::oneshot::channel();

        {
            let mut tasks = runtime
                .protocol_tasks_for_spawn()
                .expect("protocol task tracking should be available");
            tasks.push(tauri::async_runtime::spawn(async move {
                let _permit = permit;
                let _drop_signal = DropSignal(Some(drop_tx));
                std::future::pending::<()>().await;
            }));
        }

        assert_eq!(
            runtime
                .shutdown_protocol_with_grace(Duration::from_millis(1))
                .await
                .expect_err("active request should time out"),
            PREPARED_PREVIEW_PROTOCOL_SHUTDOWN_TIMED_OUT
        );
        tokio::time::timeout(Duration::from_secs(1), drop_rx)
            .await
            .expect("tracked protocol task should be aborted")
            .expect("drop signal should be sent");
        assert!(runtime
            .protocol_lifecycle
            .tasks
            .lock()
            .expect("protocol tasks")
            .is_empty());
    }

    #[tokio::test]
    async fn protocol_lifecycle_poison_returns_controlled_error() {
        let runtime = Arc::new(PreparedPreviewRuntimeState::new());
        let poison_runtime = runtime.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poison_runtime
                .protocol_lifecycle
                .state
                .lock()
                .expect("protocol lifecycle lock");
            panic!("poison prepared preview protocol lifecycle");
        })
        .join();

        assert_eq!(
            runtime
                .shutdown_protocol_with_grace(Duration::ZERO)
                .await
                .expect_err("poisoned lifecycle should fail shutdown"),
            PREPARED_PREVIEW_PROTOCOL_RUNTIME_POISONED
        );
    }

    #[test]
    fn catalog_blocking_io_errors_map_to_protocol_responses() {
        assert_eq!(
            catalog_blocking_io_error_response(CatalogBlockingIoError::Busy).status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            catalog_blocking_io_error_response(CatalogBlockingIoError::ShuttingDown).status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            catalog_blocking_io_error_response(CatalogBlockingIoError::TaskFailed(
                "join failed".to_string()
            ))
            .status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn runtime_release_removes_only_last_retained_handle() {
        let key = test_cache_key();
        let runtime = PreparedPreviewRuntimeState::new();

        runtime
            .insert_cached_entry(key.clone(), test_cache_entry("prepared-preview:a:1", "a"))
            .expect("cached entry should be inserted");
        let retained = runtime
            .retain_cache_hit(&key, "b")
            .expect("cache hit should not fail")
            .expect("cache hit should retain b");

        assert_eq!(retained.path, "prepared-preview:a:1");
        assert!(runtime
            .entry_for_preview_id("a")
            .expect("lookup should succeed")
            .is_some());
        assert!(runtime
            .entry_for_preview_id("b")
            .expect("lookup should succeed")
            .is_some());

        assert!(runtime
            .release_handle("a", "prepared-preview:a:1")
            .expect("first release should succeed"));
        assert!(runtime
            .entry_for_preview_id("b")
            .expect("lookup should succeed")
            .is_some());

        assert!(runtime
            .release_handle("b", "prepared-preview:a:1")
            .expect("last release should succeed"));
        assert!(runtime
            .entry_for_preview_id("b")
            .expect("lookup should succeed")
            .is_none());
    }

    #[test]
    fn runtime_cache_poison_returns_controlled_error() {
        let runtime = Arc::new(PreparedPreviewRuntimeState::new());
        let poison_runtime = runtime.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poison_runtime.cache.lock().expect("cache lock");
            panic!("poison prepared preview cache lock");
        })
        .join();

        let error = runtime
            .entry_for_preview_id("missing")
            .expect_err("poisoned cache lock should return error");

        assert_eq!(error.0, "Prepared preview cache lock poisoned");
        assert_eq!(error.1.as_deref(), Some("INTERNAL"));
    }

    #[test]
    fn runtime_build_lock_registry_poison_returns_controlled_error() {
        let runtime = Arc::new(PreparedPreviewRuntimeState::new());
        let poison_runtime = runtime.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poison_runtime
                .build_locks
                .lock()
                .expect("build lock registry");
            panic!("poison prepared preview build lock registry");
        })
        .join();

        let error = runtime
            .build_lock(&test_cache_key())
            .expect_err("poisoned build lock registry should return error");

        assert_eq!(error.0, "Prepared preview build lock registry poisoned");
        assert_eq!(error.1.as_deref(), Some("INTERNAL"));
    }
}
