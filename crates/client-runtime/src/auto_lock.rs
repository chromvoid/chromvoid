//! Inactivity belongs to session authority, not to RPC traffic or presentation timers.
use std::sync::{Arc, MutexGuard};
use std::time::{Duration, Instant};

use super::{
    Authority, CoreRpcDispatcher, Inner, LocalSession, SessionError, SessionPhase, revoke_locked,
};

#[derive(Default)]
pub(super) struct AutoLock {
    timeout: Duration,
    last_activity: Option<Instant>,
    monitor_started: bool,
}

impl AutoLock {
    fn remaining(&self) -> Option<Duration> {
        if self.timeout.is_zero() {
            return None;
        }
        self.last_activity
            .map(|last| self.timeout.saturating_sub(last.elapsed()))
    }

    pub(super) fn expired(&self) -> bool {
        self.remaining()
            .is_some_and(|remaining| remaining.is_zero())
    }

    pub(super) fn record_activity(&mut self) {
        self.last_activity = Some(Instant::now());
    }

    pub(super) fn clear_activity(&mut self) {
        self.last_activity = None;
    }
}

impl LocalSession {
    /// Zero disables inactivity locking only; lifecycle revocation is always independent.
    /// The platform persists this nonsecret preference and configures it before unlocking.
    pub fn set_auto_lock_timeout(
        &self,
        generation: u64,
        timeout: Duration,
    ) -> Result<(), SessionError> {
        let mut authority = self.activity_authority(generation)?;
        if !timeout.is_zero() && !authority.auto_lock.monitor_started {
            let inner = self.inner.clone();
            let dispatcher = self.dispatcher.clone();
            std::thread::Builder::new()
                .name("chromvoid-idle-lock".into())
                .spawn(move || monitor(inner, dispatcher))
                .map_err(|_| SessionError::Unavailable)?;
            authority.auto_lock.monitor_started = true;
        }
        authority.auto_lock.timeout = timeout;
        if authority.snapshot.phase == SessionPhase::Unlocked {
            // Changing the setting is an explicit user action; bootstrap configuration is locked.
            authority.auto_lock.record_activity();
        }
        self.inner.idle_changed.notify_all();
        Ok(())
    }

    /// Only native user input belongs here. Reads, writes, peer traffic and polling never call it.
    pub fn record_user_activity(&self, generation: u64) -> Result<(), SessionError> {
        let mut authority = self.activity_authority(generation)?;
        if authority.snapshot.phase != SessionPhase::Unlocked {
            return Err(SessionError::Revoked);
        }
        authority.auto_lock.record_activity();
        self.inner.idle_changed.notify_all();
        Ok(())
    }

    fn activity_authority(
        &self,
        generation: u64,
    ) -> Result<MutexGuard<'_, Authority>, SessionError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) {
            if authority.snapshot.generation == generation && authority.auto_lock.expired() {
                revoke_locked(&self.inner, &self.dispatcher, true, false, authority)?;
            }
            return Err(SessionError::Revoked);
        }
        Ok(authority)
    }
}

fn monitor(inner: Arc<Inner>, dispatcher: CoreRpcDispatcher) {
    loop {
        let Ok(authority) = inner.authority.lock() else {
            return;
        };
        if matches!(
            authority.snapshot.phase,
            SessionPhase::Closed | SessionPhase::Failed
        ) {
            return;
        }
        match authority.auto_lock.remaining() {
            Some(remaining) if remaining.is_zero() => {
                // Expiry and revocation share the authority lock: newer input cannot race this check.
                if revoke_locked(&inner, &dispatcher, true, false, authority).is_err() {
                    return;
                }
            }
            Some(remaining) => {
                // Bound platform condvar waits for very large caller durations; this is not
                // a timeout limit. Ordinary minute/hour deadlines wait their exact remainder.
                if inner
                    .idle_changed
                    .wait_timeout(authority, remaining.min(Duration::from_secs(86_400)))
                    .is_err()
                {
                    return;
                }
            }
            None => {
                if inner.idle_changed.wait(authority).is_err() {
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "auto_lock_tests.rs"]
mod tests;
