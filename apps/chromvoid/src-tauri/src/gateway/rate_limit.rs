use std::collections::HashMap;
use std::net::IpAddr;

/// SECURITY: Maximum concurrent connections per IP address.
pub(super) const MAX_CONNECTIONS_PER_IP: usize = 5;

/// Rate limiter using sliding window.
pub(super) struct RateLimiter {
    /// Timestamps of recent requests (in ms since epoch).
    timestamps: std::collections::VecDeque<u64>,
    /// Window size in milliseconds.
    window_ms: u64,
    /// Maximum requests allowed in the window.
    max_requests: usize,
}

impl RateLimiter {
    pub(super) fn new(max_requests: usize, window_ms: u64) -> Self {
        Self {
            timestamps: std::collections::VecDeque::with_capacity(max_requests),
            window_ms,
            max_requests,
        }
    }

    pub(super) fn check(&mut self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let cutoff = now.saturating_sub(self.window_ms);
        while let Some(&ts) = self.timestamps.front() {
            if ts < cutoff {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }

        if self.timestamps.len() >= self.max_requests {
            return false;
        }

        self.timestamps.push_back(now);
        true
    }
}

pub(super) struct ConnectionTracker {
    connections: HashMap<IpAddr, usize>,
}

impl ConnectionTracker {
    pub(super) fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    pub(super) fn try_acquire(&mut self, ip: IpAddr) -> bool {
        let count = self.connections.entry(ip).or_insert(0);
        if *count >= MAX_CONNECTIONS_PER_IP {
            return false;
        }
        *count += 1;
        true
    }

    pub(super) fn release(&mut self, ip: IpAddr) {
        if let Some(count) = self.connections.get_mut(&ip) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                self.connections.remove(&ip);
            }
        }
    }
}

#[cfg(test)]
#[path = "rate_limit_tests.rs"]
mod tests;
