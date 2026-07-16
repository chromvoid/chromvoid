use std::time::Duration;

pub(crate) struct PairHandshakeRetryPolicy {
    pub(crate) attempts: usize,
    pub(crate) timeout: Duration,
    pub(crate) retry_delay: Duration,
}

pub(crate) struct ConnectHandshakeRetryPolicy {
    pub(crate) attempts: usize,
    pub(crate) timeout: Duration,
    pub(crate) retry_delay: Duration,
}

pub(crate) fn pair_handshake_retry_policy() -> PairHandshakeRetryPolicy {
    PairHandshakeRetryPolicy {
        attempts: 10,
        // XX has no per-message timeout of its own; a peer stalling mid-XX
        // must not hang the pair attempt forever. Generous enough for the
        // phone-side accessory service bring-up (~0.5s observed).
        timeout: Duration::from_secs(5),
        retry_delay: Duration::from_millis(500),
    }
}

#[cfg(not(test))]
pub(crate) fn connect_handshake_retry_policy() -> ConnectHandshakeRetryPolicy {
    ConnectHandshakeRetryPolicy {
        attempts: 3,
        timeout: Duration::from_secs(2),
        retry_delay: Duration::from_millis(500),
    }
}

#[cfg(test)]
pub(crate) fn connect_handshake_retry_policy() -> ConnectHandshakeRetryPolicy {
    ConnectHandshakeRetryPolicy {
        attempts: 3,
        timeout: Duration::from_millis(50),
        retry_delay: Duration::from_millis(1),
    }
}
