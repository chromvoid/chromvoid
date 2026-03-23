//! SPEC-002: Anti-replay window for message ID enforcement.
//!
//! Maintains a monotonic message ID counter plus a 300-second TTL cache
//! for duplicate detection. Supports streaming transfers where the same
//! message_id appears on multiple continuation frames.

use std::collections::BTreeMap;
use std::time::{Duration, Instant};

/// TTL for the recently-seen cache.
const REPLAY_WINDOW_SECS: u64 = 300;

pub struct AntiReplay {
    last_seen: u64,
    recently_seen: BTreeMap<u64, Instant>,
    /// When a streaming transfer is active, the same message_id may appear
    /// on multiple continuation frames. This field tracks that id.
    active_stream_id: Option<u64>,
}

impl AntiReplay {
    pub fn new() -> Self {
        Self {
            last_seen: 0,
            recently_seen: BTreeMap::new(),
            active_stream_id: None,
        }
    }

    /// Mark a message_id as belonging to an active stream. Subsequent calls
    /// to `check()` with this id will be accepted until `clear_active_stream()`
    /// is called.
    pub fn set_active_stream(&mut self, id: u64) {
        self.active_stream_id = Some(id);
    }

    /// Clear the active stream, restoring normal anti-replay behaviour.
    pub fn clear_active_stream(&mut self) {
        self.active_stream_id = None;
    }

    pub fn check(&mut self, message_id: u64) -> Result<(), &'static str> {
        // Allow repeated message_id during an active stream.
        if let Some(stream_id) = self.active_stream_id {
            if message_id == stream_id {
                return Ok(());
            }
        }

        // SPEC-002: keep a short TTL cache for duplicate detection.
        let cutoff = Instant::now() - Duration::from_secs(REPLAY_WINDOW_SECS);
        self.recently_seen.retain(|_, ts| *ts > cutoff);

        if self.last_seen == 0 {
            self.last_seen = message_id;
            self.recently_seen.insert(message_id, Instant::now());
            return Ok(());
        }
        if message_id <= self.last_seen {
            return Err("replay");
        }
        if self.recently_seen.contains_key(&message_id) {
            return Err("duplicate");
        }
        self.last_seen = message_id;
        self.recently_seen.insert(message_id, Instant::now());
        Ok(())
    }
}

impl Default for AntiReplay {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[path = "anti_replay_tests.rs"]
mod tests;
