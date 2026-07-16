use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use uuid::Uuid;

use super::scheduler::{MediaRangeClass, MediaSourceScheduler};

pub const MAX_MEDIA_RANGE_BYTES: u64 = 2 * 1024 * 1024;
/// Per-response HTTP delivery cap over USB (SPEC-231.2). Source read windows
/// are governed by the read-ahead policy below, not by this cap.
pub const USB_MOBILE_MEDIA_RANGE_BYTES: u64 = 256 * 1024;
/// SPEC-231: USB read-ahead grows from 1 MB initially up to 8 MB.
pub(crate) const USB_MOBILE_MEDIA_INITIAL_READ_AHEAD_BYTES: u64 = 1024 * 1024;
pub(crate) const USB_MOBILE_MEDIA_MAX_READ_AHEAD_BYTES: u64 = 8 * 1024 * 1024;
pub(crate) const MEDIA_GLOBAL_READ_AHEAD_CACHE_BYTES: u64 = 96 * 1024 * 1024;
pub const MEDIA_STREAM_IDLE_TTL_MS: u64 = 5 * 60 * 1000;
const LOCAL_MEDIA_SOURCE_MANAGER_POISONED: &str = "Local media source manager mutex poisoned";
const DESKTOP_LOCAL_VIDEO_INITIAL_READ_AHEAD_BYTES: u64 = 4 * 1024 * 1024;
const DESKTOP_LOCAL_VIDEO_MAX_READ_AHEAD_BYTES: u64 = 32 * 1024 * 1024;
const DESKTOP_LOCAL_VIDEO_READ_AHEAD_CACHE_BYTES: u64 = 64 * 1024 * 1024;
const DESKTOP_LOCAL_VIDEO_PREFETCH_MIN_REQUEST_BYTES: u64 = 256 * 1024;
const MOBILE_LOCAL_VIDEO_INITIAL_READ_AHEAD_BYTES: u64 = 2 * 1024 * 1024;
const MOBILE_LOCAL_VIDEO_MAX_READ_AHEAD_BYTES: u64 = 16 * 1024 * 1024;
const MOBILE_LOCAL_VIDEO_READ_AHEAD_CACHE_BYTES: u64 = 32 * 1024 * 1024;
const MOBILE_LOCAL_VIDEO_PREFETCH_MIN_REQUEST_BYTES: u64 = 128 * 1024;
const USB_MOBILE_MEDIA_READ_AHEAD_CACHE_BYTES: u64 = 3 * USB_MOBILE_MEDIA_MAX_READ_AHEAD_BYTES;
const USB_MOBILE_MEDIA_PREFETCH_MIN_REQUEST_BYTES: u64 = 32 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LocalMediaKind {
    Audio,
    Video,
}

#[derive(Debug, Clone)]
pub(crate) struct LocalMediaSourceSession {
    pub(crate) token: String,
    pub(crate) node_id: u64,
    pub(crate) kind: LocalMediaKind,
    pub(crate) mime_type: String,
    pub(crate) size: u64,
    pub(crate) source_revision: u64,
    pub(crate) expires_at: u64,
    pub(crate) generation: u64,
    pinned: bool,
    pub(crate) read_lock: Arc<Mutex<()>>,
    scheduler: Arc<MediaSourceScheduler>,
    active_requests: Arc<AtomicUsize>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct LocalMediaReadAheadPolicy {
    pub(crate) initial_window_bytes: u64,
    pub(crate) max_window_bytes: u64,
    pub(crate) cache_limit_bytes: u64,
    pub(crate) global_cache_limit_bytes: u64,
    pub(crate) prefetch_min_request_bytes: u64,
    pub(crate) max_buffer_ahead_bytes: u64,
    pub(crate) background_prefetch: bool,
}

impl LocalMediaReadAheadPolicy {
    pub(crate) fn desktop_local_video() -> Self {
        Self {
            initial_window_bytes: DESKTOP_LOCAL_VIDEO_INITIAL_READ_AHEAD_BYTES,
            max_window_bytes: DESKTOP_LOCAL_VIDEO_MAX_READ_AHEAD_BYTES,
            cache_limit_bytes: DESKTOP_LOCAL_VIDEO_READ_AHEAD_CACHE_BYTES,
            global_cache_limit_bytes: MEDIA_GLOBAL_READ_AHEAD_CACHE_BYTES,
            prefetch_min_request_bytes: DESKTOP_LOCAL_VIDEO_PREFETCH_MIN_REQUEST_BYTES,
            max_buffer_ahead_bytes: DESKTOP_LOCAL_VIDEO_MAX_READ_AHEAD_BYTES,
            background_prefetch: true,
        }
    }

    pub(crate) fn mobile_local_video() -> Self {
        Self {
            initial_window_bytes: MOBILE_LOCAL_VIDEO_INITIAL_READ_AHEAD_BYTES,
            max_window_bytes: MOBILE_LOCAL_VIDEO_MAX_READ_AHEAD_BYTES,
            cache_limit_bytes: MOBILE_LOCAL_VIDEO_READ_AHEAD_CACHE_BYTES,
            global_cache_limit_bytes: MEDIA_GLOBAL_READ_AHEAD_CACHE_BYTES,
            prefetch_min_request_bytes: MOBILE_LOCAL_VIDEO_PREFETCH_MIN_REQUEST_BYTES,
            max_buffer_ahead_bytes: MOBILE_LOCAL_VIDEO_READ_AHEAD_CACHE_BYTES,
            background_prefetch: true,
        }
    }

    pub(crate) fn usb_mobile(kind: LocalMediaKind) -> Self {
        Self {
            initial_window_bytes: USB_MOBILE_MEDIA_INITIAL_READ_AHEAD_BYTES,
            max_window_bytes: USB_MOBILE_MEDIA_MAX_READ_AHEAD_BYTES,
            cache_limit_bytes: USB_MOBILE_MEDIA_READ_AHEAD_CACHE_BYTES,
            global_cache_limit_bytes: MEDIA_GLOBAL_READ_AHEAD_CACHE_BYTES,
            prefetch_min_request_bytes: USB_MOBILE_MEDIA_PREFETCH_MIN_REQUEST_BYTES,
            max_buffer_ahead_bytes: USB_MOBILE_MEDIA_MAX_READ_AHEAD_BYTES,
            background_prefetch: matches!(kind, LocalMediaKind::Video),
        }
    }

    pub(crate) fn use_foreground_read_ahead(self, requested_length: u64) -> bool {
        !self.background_prefetch || requested_length < self.prefetch_min_request_bytes
    }
}

#[derive(Debug)]
pub(crate) struct LocalMediaPrefetchPlan {
    pub(crate) offset: u64,
    pub(crate) length: u64,
    /// Set by the scheduler when the prefetch becomes doomed (seek reset,
    /// foreground overlap, or session clear) so the transfer can stop early.
    pub(crate) cancelled: Arc<AtomicBool>,
}

impl LocalMediaPrefetchPlan {
    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Default)]
pub struct LocalMediaSourceManager {
    inner: Mutex<LocalMediaSourceManagerInner>,
}

#[derive(Debug, Default)]
struct LocalMediaSourceManagerInner {
    sessions: HashMap<String, LocalMediaSourceSession>,
}

fn prune_expired_sessions(inner: &mut LocalMediaSourceManagerInner, now: u64) -> usize {
    let before = inner.sessions.len();
    let mut removed = Vec::new();
    inner.sessions.retain(|_, session| {
        let keep = session.pinned
            || session.expires_at > now
            || session.active_requests.load(Ordering::SeqCst) > 0;
        if !keep {
            removed.push(session.clone());
        }
        keep
    });
    for session in removed {
        session.cancel();
    }
    before.saturating_sub(inner.sessions.len())
}

pub(crate) struct LocalMediaSourceRequestLease {
    active_requests: Arc<AtomicUsize>,
}

impl Drop for LocalMediaSourceRequestLease {
    fn drop(&mut self) {
        self.active_requests.fetch_sub(1, Ordering::SeqCst);
    }
}

impl LocalMediaSourceManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock_inner(&self, context: &str) -> Option<MutexGuard<'_, LocalMediaSourceManagerInner>> {
        match self.inner.lock() {
            Ok(inner) => Some(inner),
            Err(_) => {
                tracing::warn!("media_source: {context}: {LOCAL_MEDIA_SOURCE_MANAGER_POISONED}");
                None
            }
        }
    }

    pub(crate) fn register(
        &self,
        node_id: u64,
        kind: LocalMediaKind,
        mime_type: String,
        size: u64,
        source_revision: u64,
    ) -> Result<LocalMediaSourceSession, String> {
        let token = Uuid::new_v4().to_string();
        let now = now_ms();
        let expires_at = now.saturating_add(MEDIA_STREAM_IDLE_TTL_MS);
        let session = LocalMediaSourceSession {
            token: token.clone(),
            node_id,
            kind,
            mime_type,
            size,
            source_revision,
            expires_at,
            generation: 1,
            pinned: false,
            read_lock: Arc::new(Mutex::new(())),
            scheduler: Arc::new(MediaSourceScheduler::new()),
            active_requests: Arc::new(AtomicUsize::new(0)),
            cancelled: Arc::new(AtomicBool::new(false)),
        };

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| LOCAL_MEDIA_SOURCE_MANAGER_POISONED.to_string())?;
        prune_expired_sessions(&mut inner, now);
        inner.sessions.insert(token, session.clone());
        Ok(session)
    }

    pub(crate) fn get(&self, token: &str) -> Option<LocalMediaSourceSession> {
        let now = now_ms();
        let mut inner = self.lock_inner("get session")?;
        prune_expired_sessions(&mut inner, now);
        inner.sessions.get(token).cloned()
    }

    pub(crate) fn begin_request(
        &self,
        token: &str,
        generation: u64,
    ) -> Option<LocalMediaSourceRequestLease> {
        let mut inner = self.lock_inner("begin request")?;
        prune_expired_sessions(&mut inner, now_ms());
        let session = inner.sessions.get(token)?;
        if session.generation != generation {
            return None;
        }
        session.active_requests.fetch_add(1, Ordering::SeqCst);
        Some(LocalMediaSourceRequestLease {
            active_requests: session.active_requests.clone(),
        })
    }

    pub(crate) fn is_current(&self, token: &str, generation: u64) -> bool {
        self.lock_inner("check current session")
            .and_then(|mut inner| {
                prune_expired_sessions(&mut inner, now_ms());
                inner
                    .sessions
                    .get(token)
                    .map(|session| session.generation == generation)
            })
            .unwrap_or(false)
    }

    pub(crate) fn refresh(&self, token: &str, generation: u64) -> Option<u64> {
        let mut inner = self.lock_inner("refresh session")?;
        prune_expired_sessions(&mut inner, now_ms());
        let session = inner.sessions.get_mut(token)?;
        if session.generation != generation {
            return None;
        }
        session.expires_at = now_ms().saturating_add(MEDIA_STREAM_IDLE_TTL_MS);
        Some(session.expires_at)
    }

    pub(crate) fn pin(&self, token: &str, generation: u64) -> bool {
        let Some(mut inner) = self.lock_inner("pin session") else {
            return false;
        };
        prune_expired_sessions(&mut inner, now_ms());
        let Some(session) = inner.sessions.get_mut(token) else {
            return false;
        };
        if session.generation != generation {
            return false;
        }
        session.pinned = true;
        session.expires_at = u64::MAX;
        true
    }

    pub(crate) fn release(&self, token: &str) -> bool {
        self.lock_inner("release session")
            .map(|mut inner| {
                inner
                    .sessions
                    .remove(token)
                    .map(|session| {
                        session.cancel();
                        true
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    pub(crate) fn clear(&self) {
        if let Some(mut inner) = self.lock_inner("clear sessions") {
            for (_, session) in inner.sessions.drain() {
                session.cancel();
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn count(&self) -> usize {
        self.inner
            .lock()
            .map(|mut inner| {
                prune_expired_sessions(&mut inner, now_ms());
                inner.sessions.len()
            })
            .unwrap_or_default()
    }

    #[cfg(test)]
    pub(crate) fn expire_for_tests(&self, token: &str) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        if let Some(session) = inner.sessions.get_mut(token) {
            session.expires_at = now_ms().saturating_sub(1);
        }
    }
}

impl LocalMediaSourceSession {
    pub(crate) fn scheduler(&self) -> &MediaSourceScheduler {
        &self.scheduler
    }

    pub(crate) fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.scheduler.clear();
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    #[cfg(test)]
    pub(crate) fn prepare_read_ahead_request(
        &self,
        offset: u64,
        length: u64,
        policy: LocalMediaReadAheadPolicy,
    ) {
        if self.is_cancelled() {
            return;
        }
        self.scheduler.prepare_request(offset, length, policy);
    }

    pub(crate) fn prepare_classified_read_ahead_request(
        &self,
        offset: u64,
        length: u64,
        policy: LocalMediaReadAheadPolicy,
        range_class: MediaRangeClass,
    ) {
        if self.is_cancelled() {
            return;
        }
        self.scheduler
            .prepare_classified_request(offset, length, policy, range_class);
    }

    pub(crate) fn read_ahead_fetch_length(
        &self,
        offset: u64,
        requested_length: u64,
        policy: LocalMediaReadAheadPolicy,
    ) -> u64 {
        if self.is_cancelled() {
            return 0;
        }
        self.scheduler
            .fetch_length(self.size, offset, requested_length, policy)
    }

    pub(crate) fn cached_read_ahead_range(&self, offset: u64, length: u64) -> Option<Vec<u8>> {
        if self.is_cancelled() {
            return None;
        }
        self.scheduler.cached_range(offset, length)
    }

    pub(crate) fn store_read_ahead_range(
        &self,
        offset: u64,
        bytes: Vec<u8>,
        policy: LocalMediaReadAheadPolicy,
    ) {
        if self.is_cancelled() || bytes.is_empty() {
            return;
        }
        self.scheduler.store_range(offset, bytes, policy);
    }

    pub(crate) fn begin_next_prefetch(
        &self,
        policy: LocalMediaReadAheadPolicy,
        requested_length: u64,
    ) -> Option<LocalMediaPrefetchPlan> {
        if self.is_cancelled() {
            return None;
        }
        self.scheduler
            .begin_next_prefetch(self.size, policy, requested_length)
    }

    pub(crate) fn set_read_ahead_prefetch_pressure(&self, active: bool) {
        self.scheduler.set_prefetch_pressure(active);
    }

    pub(crate) fn complete_prefetch(
        &self,
        offset: u64,
        length: u64,
        bytes: Vec<u8>,
        policy: LocalMediaReadAheadPolicy,
    ) {
        self.scheduler
            .complete_prefetch(offset, length, bytes, policy, self.is_cancelled());
    }
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_returns_opaque_token_without_name() {
        let manager = LocalMediaSourceManager::new();

        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1024, 42)
            .expect("register media source");

        assert!(!session.token.contains("private-track"));
        assert!(!session.token.contains("audio"));
        assert!(!session.token.contains("mpeg"));
        assert_eq!(session.node_id, 7);
        assert_eq!(session.kind, LocalMediaKind::Audio);
        assert_eq!(manager.count(), 1);
    }

    #[test]
    fn release_is_idempotent() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register media source");

        assert!(manager.release(&session.token));
        assert!(session.is_cancelled());
        assert!(!manager.release(&session.token));
        assert_eq!(manager.count(), 0);
    }

    #[test]
    fn release_invalidates_later_reads() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Video, "video/mp4".to_string(), 1, 1)
            .expect("register media source");

        assert!(manager
            .begin_request(&session.token, session.generation)
            .is_some());
        assert!(manager.release(&session.token));
        assert!(session.is_cancelled());
        assert!(!manager.is_current(&session.token, session.generation));
        assert!(manager
            .begin_request(&session.token, session.generation)
            .is_none());
    }

    #[test]
    fn release_clears_read_ahead_cache_for_existing_session_clones() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Video, "video/mp4".to_string(), 1024, 1)
            .expect("register media source");
        let policy = LocalMediaReadAheadPolicy::usb_mobile(LocalMediaKind::Video);

        session.prepare_read_ahead_request(0, 4, policy);
        session.store_read_ahead_range(0, vec![1, 2, 3, 4], policy);
        assert_eq!(
            session
                .cached_read_ahead_range(0, 4)
                .expect("range should be cached"),
            vec![1, 2, 3, 4]
        );

        assert!(manager.release(&session.token));

        assert!(session.cached_read_ahead_range(0, 4).is_none());
        assert!(session
            .begin_next_prefetch(policy, USB_MOBILE_MEDIA_PREFETCH_MIN_REQUEST_BYTES)
            .is_none());
    }

    #[test]
    fn get_expires_idle_session_after_ttl() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register media source");

        manager.expire_for_tests(&session.token);

        assert!(manager.get(&session.token).is_none());
        assert_eq!(manager.count(), 0);
    }

    #[test]
    fn pinned_session_ignores_idle_expiry_until_release() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register media source");

        assert!(manager.pin(&session.token, session.generation));
        manager.expire_for_tests(&session.token);

        assert!(manager.get(&session.token).is_some());
        assert!(manager.release(&session.token));
        assert!(manager.get(&session.token).is_none());
    }

    #[test]
    fn register_prunes_other_expired_idle_sessions() {
        let manager = LocalMediaSourceManager::new();
        let expired = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register expired media source");
        manager.expire_for_tests(&expired.token);

        let current = manager
            .register(8, LocalMediaKind::Video, "video/mp4".to_string(), 1, 1)
            .expect("register current media source");

        assert!(manager.get(&expired.token).is_none());
        assert!(manager.get(&current.token).is_some());
        assert_eq!(manager.count(), 1);
    }

    #[test]
    fn begin_request_rejects_and_prunes_expired_idle_session() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register media source");
        manager.expire_for_tests(&session.token);

        assert!(manager
            .begin_request(&session.token, session.generation)
            .is_none());
        assert_eq!(manager.count(), 0);
    }

    #[test]
    fn active_request_prevents_prune_until_lease_drops() {
        let manager = LocalMediaSourceManager::new();
        let active = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register active media source");
        let lease = manager
            .begin_request(&active.token, active.generation)
            .expect("active session should lease");
        manager.expire_for_tests(&active.token);

        let second = manager
            .register(8, LocalMediaKind::Video, "video/mp4".to_string(), 1, 1)
            .expect("register second media source");
        assert!(manager.get(&active.token).is_some());
        assert_eq!(manager.count(), 2);

        drop(lease);
        let third = manager
            .register(9, LocalMediaKind::Audio, "audio/aac".to_string(), 1, 1)
            .expect("register third media source");

        assert!(manager.get(&active.token).is_none());
        assert!(manager.get(&second.token).is_some());
        assert!(manager.get(&third.token).is_some());
        assert_eq!(manager.count(), 2);
    }

    #[test]
    fn clear_releases_all_sessions() {
        let manager = LocalMediaSourceManager::new();
        manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect("register audio source");
        manager
            .register(8, LocalMediaKind::Video, "video/mp4".to_string(), 1, 1)
            .expect("register video source");

        manager.clear();

        assert_eq!(manager.count(), 0);
    }

    #[test]
    fn prefetch_completion_does_not_replace_larger_foreground_segment() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(
                7,
                LocalMediaKind::Video,
                "video/mp4".to_string(),
                2 * 1024 * 1024,
                1,
            )
            .expect("register media source");
        let policy = LocalMediaReadAheadPolicy::usb_mobile(LocalMediaKind::Video);

        session.prepare_read_ahead_request(0, USB_MOBILE_MEDIA_PREFETCH_MIN_REQUEST_BYTES, policy);
        session.store_read_ahead_range(
            0,
            vec![1_u8; USB_MOBILE_MEDIA_RANGE_BYTES as usize],
            policy,
        );
        let prefetch = session
            .begin_next_prefetch(policy, USB_MOBILE_MEDIA_PREFETCH_MIN_REQUEST_BYTES)
            .expect("prefetch plan");
        assert_eq!(prefetch.offset, USB_MOBILE_MEDIA_RANGE_BYTES);
        assert_eq!(prefetch.length, USB_MOBILE_MEDIA_INITIAL_READ_AHEAD_BYTES);

        session.store_read_ahead_range(
            USB_MOBILE_MEDIA_RANGE_BYTES,
            vec![2_u8; USB_MOBILE_MEDIA_MAX_READ_AHEAD_BYTES as usize],
            policy,
        );
        session.complete_prefetch(
            prefetch.offset,
            prefetch.length,
            vec![3_u8; prefetch.length as usize],
            policy,
        );

        let bytes = session
            .cached_read_ahead_range(
                USB_MOBILE_MEDIA_RANGE_BYTES + USB_MOBILE_MEDIA_RANGE_BYTES,
                16,
            )
            .expect("larger foreground segment should remain cached");

        assert_eq!(bytes, vec![2_u8; 16]);
    }

    #[test]
    fn cached_range_can_span_adjacent_segments() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Video, "video/mp4".to_string(), 1024, 1)
            .expect("register media source");
        let policy = LocalMediaReadAheadPolicy::usb_mobile(LocalMediaKind::Video);

        session.prepare_read_ahead_request(0, 4, policy);
        session.store_read_ahead_range(0, vec![1, 2, 3, 4], policy);
        session.store_read_ahead_range(4, vec![5, 6, 7, 8], policy);

        let bytes = session
            .cached_read_ahead_range(2, 4)
            .expect("range should be assembled from adjacent cache segments");

        assert_eq!(bytes, vec![3, 4, 5, 6]);
    }

    #[test]
    fn usb_mobile_policy_uses_spec_read_ahead_windows() {
        let policy = LocalMediaReadAheadPolicy::usb_mobile(LocalMediaKind::Video);

        assert_eq!(policy.initial_window_bytes, 1024 * 1024);
        assert_eq!(policy.max_window_bytes, 8 * 1024 * 1024);
        assert_eq!(USB_MOBILE_MEDIA_RANGE_BYTES, 256 * 1024);
        assert!(policy.background_prefetch);
    }

    #[test]
    fn mobile_local_video_policy_uses_android_sized_read_windows() {
        let policy = LocalMediaReadAheadPolicy::mobile_local_video();

        assert_eq!(policy.initial_window_bytes, 2 * 1024 * 1024);
        assert_eq!(policy.max_window_bytes, 16 * 1024 * 1024);
        assert!(policy.background_prefetch);
    }

    #[test]
    fn overlapping_cached_request_does_not_clear_read_ahead_cache() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(7, LocalMediaKind::Video, "video/mp4".to_string(), 1024, 1)
            .expect("register media source");
        let policy = LocalMediaReadAheadPolicy::usb_mobile(LocalMediaKind::Video);

        session.prepare_read_ahead_request(0, 4, policy);
        session.store_read_ahead_range(0, vec![1, 2, 3, 4], policy);
        session.prepare_read_ahead_request(1, 2, policy);

        let bytes = session
            .cached_read_ahead_range(1, 2)
            .expect("overlapping cached request should not clear cache");

        assert_eq!(bytes, vec![2, 3]);
    }

    #[test]
    fn register_returns_error_when_manager_lock_is_poisoned() {
        let manager = std::sync::Arc::new(LocalMediaSourceManager::new());
        let poisoned_manager = manager.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoned_manager.inner.lock().expect("test lock");
            panic!("poison local media source manager");
        })
        .join();

        let error = manager
            .register(7, LocalMediaKind::Audio, "audio/mpeg".to_string(), 1, 1)
            .expect_err("poisoned manager should fail registration");

        assert_eq!(error, LOCAL_MEDIA_SOURCE_MANAGER_POISONED);
    }

    #[test]
    fn accessors_return_existing_fallbacks_when_manager_lock_is_poisoned() {
        let manager = std::sync::Arc::new(LocalMediaSourceManager::new());
        let poisoned_manager = manager.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoned_manager.inner.lock().expect("test lock");
            panic!("poison local media source manager");
        })
        .join();

        assert!(manager.get("token").is_none());
        assert!(manager.begin_request("token", 1).is_none());
        assert!(!manager.is_current("token", 1));
        assert!(manager.refresh("token", 1).is_none());
        assert!(!manager.pin("token", 1));
        assert!(!manager.release("token"));
        manager.clear();
    }
}
