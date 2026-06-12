use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use uuid::Uuid;

pub const MAX_MEDIA_RANGE_BYTES: u64 = 2 * 1024 * 1024;
pub const MEDIA_STREAM_IDLE_TTL_MS: u64 = 5 * 60 * 1000;
const LOCAL_MEDIA_SOURCE_MANAGER_POISONED: &str = "Local media source manager mutex poisoned";

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
    active_requests: Arc<AtomicUsize>,
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
    inner.sessions.retain(|_, session| {
        session.pinned
            || session.expires_at > now
            || session.active_requests.load(Ordering::SeqCst) > 0
    });
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
            active_requests: Arc::new(AtomicUsize::new(0)),
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
            .map(|mut inner| inner.sessions.remove(token).is_some())
            .unwrap_or(false)
    }

    pub(crate) fn clear(&self) {
        if let Some(mut inner) = self.lock_inner("clear sessions") {
            inner.sessions.clear();
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
        assert!(!manager.is_current(&session.token, session.generation));
        assert!(manager
            .begin_request(&session.token, session.generation)
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
