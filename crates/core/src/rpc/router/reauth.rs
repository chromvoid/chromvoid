//! Reusable in-memory limiter for master-password re-authentication surfaces.

pub(super) const REAUTH_WINDOW_MS: u64 = 15 * 60 * 1000;
pub(super) const REAUTH_LOCKOUT_MS: u64 = 15 * 60 * 1000;
pub(super) const REAUTH_MAX_FAILURES: usize = 5;

#[derive(Debug, Default)]
pub(super) struct ReauthLimiter {
    failed_attempts: Vec<u64>,
    lockout_until: Option<u64>,
}

impl ReauthLimiter {
    pub(super) fn is_locked(&mut self, now: u64) -> bool {
        let Some(lockout_until) = self.lockout_until else {
            return false;
        };
        if lockout_until > now {
            return true;
        }
        self.lockout_until = None;
        self.failed_attempts.clear();
        false
    }

    pub(super) fn record_success(&mut self) {
        self.failed_attempts.clear();
    }

    /// Returns true when this failure starts a new lockout window.
    pub(super) fn record_failure(&mut self, now: u64) -> bool {
        self.failed_attempts
            .retain(|attempt| attempt.saturating_add(REAUTH_WINDOW_MS) > now);
        self.failed_attempts.push(now);
        if self.failed_attempts.len() < REAUTH_MAX_FAILURES {
            return false;
        }
        self.lockout_until = Some(now.saturating_add(REAUTH_LOCKOUT_MS));
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locks_on_fifth_failure_for_fifteen_minutes() {
        let mut limiter = ReauthLimiter::default();
        for now in 0..4 {
            assert!(!limiter.record_failure(now));
            assert!(!limiter.is_locked(now));
        }
        assert!(limiter.record_failure(4));
        assert!(limiter.is_locked(4));
        assert!(!limiter.is_locked(REAUTH_LOCKOUT_MS + 4));
    }

    #[test]
    fn success_clears_the_sliding_failure_window() {
        let mut limiter = ReauthLimiter::default();
        for now in 0..4 {
            assert!(!limiter.record_failure(now));
        }
        limiter.record_success();
        assert!(!limiter.record_failure(5));
        assert!(!limiter.is_locked(5));
    }
}
