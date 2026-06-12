use std::sync::{Arc, Mutex};
use std::time::Duration;

use tracing::{info, warn};

use super::accept::{accept_connection, AcceptAttemptProgress};
use super::{AcceptorState, MobileAcceptorRuntimeState, SignalingClient};
use crate::core_adapter::CoreAdapter;
use crate::network::signaling::SIGNALING_CLIENT_CLOSE_GRACE;

const NEXT_ACCEPT_READY_POLL_INTERVAL: Duration = Duration::from_millis(100);
const RETRY_DELAY_OTHER_BASE_MS: u64 = 500;
const RETRY_DELAY_OTHER_CAP_MS: u64 = 5_000;
const RETRY_DELAY_PRE_HANDSHAKE_BASE_MS: u64 = 1_000;
const RETRY_DELAY_PRE_HANDSHAKE_CAP_MS: u64 = 10_000;
const RETRY_DELAY_RATE_LIMIT_BASE_MS: u64 = 5_000;
const RETRY_DELAY_RATE_LIMIT_CAP_MS: u64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum AcceptErrorClass {
    RoomFull,
    RoomExpired,
    ModeMismatch,
    RateLimit,
    PreMsg1Closed,
    Other,
}

impl AcceptErrorClass {
    pub(super) fn classify(error: &str) -> Self {
        let error = error.to_ascii_lowercase();
        if error.contains("429 too many requests")
            || error.contains("code=4029")
            || error.contains("reason=rate limit exceeded")
        {
            Self::RateLimit
        } else if error.contains("code=4001") || error.contains("reason=room full") {
            Self::RoomFull
        } else if error.contains("code=4002") || error.contains("reason=room expired") {
            Self::RoomExpired
        } else if error.contains("code=4003")
            || error.contains("reason=room mode mismatch")
            || error.contains("reason=mode mismatch")
        {
            Self::ModeMismatch
        } else if error.contains("msg1 recv")
            && (error.contains("wss closed")
                || error.contains("without close frame")
                || error.contains("transport closed")
                || error.contains("timeout"))
        {
            Self::PreMsg1Closed
        } else {
            Self::Other
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::RoomFull => "room_full",
            Self::RoomExpired => "room_expired",
            Self::ModeMismatch => "mode_mismatch",
            Self::RateLimit => "rate_limit",
            Self::PreMsg1Closed => "pre_msg1_closed",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub(super) struct RetryBackoffState {
    pub(super) pre_handshake_failures: usize,
    rate_limit_failures: usize,
    other_failures: usize,
    last_logged_class: Option<AcceptErrorClass>,
    last_logged_delay_ms: Option<u64>,
}

impl RetryBackoffState {
    pub(super) fn note_msg1_received(&mut self) {
        self.pre_handshake_failures = 0;
    }

    pub(super) fn note_success(&mut self) {
        *self = Self::default();
    }

    pub(super) fn register_failure(&mut self, class: AcceptErrorClass) -> (usize, Duration, bool) {
        let (failure_count, retry_delay) = match class {
            AcceptErrorClass::RateLimit => {
                self.rate_limit_failures += 1;
                self.pre_handshake_failures = 0;
                self.other_failures = 0;
                (
                    self.rate_limit_failures,
                    capped_backoff(
                        RETRY_DELAY_RATE_LIMIT_BASE_MS,
                        self.rate_limit_failures,
                        RETRY_DELAY_RATE_LIMIT_CAP_MS,
                    ),
                )
            }
            AcceptErrorClass::RoomFull
            | AcceptErrorClass::RoomExpired
            | AcceptErrorClass::PreMsg1Closed => {
                self.pre_handshake_failures += 1;
                self.rate_limit_failures = 0;
                self.other_failures = 0;
                (
                    self.pre_handshake_failures,
                    capped_backoff(
                        RETRY_DELAY_PRE_HANDSHAKE_BASE_MS,
                        self.pre_handshake_failures,
                        RETRY_DELAY_PRE_HANDSHAKE_CAP_MS,
                    ),
                )
            }
            AcceptErrorClass::ModeMismatch | AcceptErrorClass::Other => {
                self.other_failures += 1;
                self.pre_handshake_failures = 0;
                self.rate_limit_failures = 0;
                (
                    self.other_failures,
                    capped_backoff(
                        RETRY_DELAY_OTHER_BASE_MS,
                        self.other_failures,
                        RETRY_DELAY_OTHER_CAP_MS,
                    ),
                )
            }
        };

        let retry_delay_ms = retry_delay.as_millis() as u64;
        let should_warn = self.last_logged_class != Some(class)
            || self.last_logged_delay_ms != Some(retry_delay_ms);
        self.last_logged_class = Some(class);
        self.last_logged_delay_ms = Some(retry_delay_ms);

        (failure_count, retry_delay, should_warn)
    }
}

fn capped_backoff(base_ms: u64, failure_count: usize, cap_ms: u64) -> Duration {
    let shift = failure_count.saturating_sub(1).min(16) as u32;
    let multiplier = 1u64 << shift;
    Duration::from_millis(base_ms.saturating_mul(multiplier).min(cap_ms))
}

pub(super) async fn wait_until_next_accept_ready(
    runtime: &MobileAcceptorRuntimeState,
    shutdown_rx: &mut tokio::sync::oneshot::Receiver<()>,
) -> bool {
    let mut logged_block = false;

    loop {
        let blocked = runtime.with_acceptor(|a| {
            if a.connected_peers.is_empty() {
                None
            } else {
                Some((a.state, a.connected_peers.len(), a.room_id.clone()))
            }
        });

        let Ok(blocked) = blocked else {
            warn!("mobile_acceptor: runtime unavailable while waiting for next accept");
            return false;
        };

        let Some((state, peer_count, room_id)) = blocked else {
            return true;
        };

        if !logged_block {
            if state == AcceptorState::Connected {
                info!(
                    "mobile_acceptor: delaying next accept until active peer disconnects room_id={:?} peer_count={}",
                    room_id, peer_count
                );
            } else {
                warn!(
                    "mobile_acceptor: delaying next accept with active peers in unexpected state={:?} room_id={:?} peer_count={}",
                    state, room_id, peer_count
                );
            }
            logged_block = true;
        }

        tokio::select! {
            biased;

            _ = &mut *shutdown_rx => return false,
            _ = tokio::time::sleep(NEXT_ACCEPT_READY_POLL_INTERVAL) => {}
        }
    }
}

pub(super) async fn listener_loop(
    runtime: Arc<MobileAcceptorRuntimeState>,
    generation: u64,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    mut signaling: Option<SignalingClient>,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    storage_root: std::path::PathBuf,
    relay_url: String,
    room_id: String,
) {
    let mut retry_state = RetryBackoffState::default();
    loop {
        if !runtime.is_generation_current(generation) {
            info!("Mobile acceptor listener shutting down");
            break;
        }

        if !wait_until_next_accept_ready(&runtime, &mut shutdown_rx).await {
            info!("Mobile acceptor listener shutting down");
            break;
        }

        tokio::select! {
            biased;

            _ = &mut shutdown_rx => {
                info!("Mobile acceptor listener shutting down");
                break;
            }

            result = async {
                let mut progress = AcceptAttemptProgress::default();
                let result = accept_connection(
                    runtime.clone(),
                    generation,
                    adapter.clone(),
                    signaling.as_mut(),
                    &storage_root,
                    &relay_url,
                    &room_id,
                    &mut progress,
                )
                .await;
                (result, progress)
            } => {
                let (result, progress) = result;
                match result {
                    Ok(peer_id) => {
                        retry_state.note_success();
                        info!("Desktop peer connected: {}", peer_id);
                    }
                    Err(e) => {
                        if progress.saw_msg1 {
                            retry_state.note_msg1_received();
                        }
                        let _ = runtime.with_acceptor_if_current(generation, |a| {
                            if a.state == AcceptorState::Handshaking {
                                a.state = AcceptorState::Listening;
                            }
                        });
                        let class = AcceptErrorClass::classify(&e);
                        let (failure_count, retry_delay, should_warn) =
                            retry_state.register_failure(class);
                        let retry_delay_ms = retry_delay.as_millis() as u64;
                        if should_warn {
                            warn!(
                                "mobile_acceptor: accept retry scheduled relay={} room_id={} class={} failure_count={} pre_handshake_failures={} delay_ms={} error={}",
                                relay_url,
                                room_id,
                                class.label(),
                                failure_count,
                                retry_state.pre_handshake_failures,
                                retry_delay_ms,
                                e
                            );
                        } else {
                            info!(
                                "mobile_acceptor: accept retry scheduled relay={} room_id={} class={} failure_count={} pre_handshake_failures={} delay_ms={} error={}",
                                relay_url,
                                room_id,
                                class.label(),
                                failure_count,
                                retry_state.pre_handshake_failures,
                                retry_delay_ms,
                                e
                            );
                        }
                        tokio::select! {
                            biased;

                            _ = &mut shutdown_rx => {
                                info!("Mobile acceptor listener shutting down");
                                break;
                            }

                            _ = tokio::time::sleep(retry_delay) => {}
                        }
                    }
                }
            }
        }
    }
    if let Some(mut signaling) = signaling.take() {
        if let Err(error) = signaling
            .close_with_grace(SIGNALING_CLIENT_CLOSE_GRACE)
            .await
        {
            warn!("mobile_acceptor: signaling close failed on listener exit: {error}");
        }
    }
    let _ = runtime.clear_listener_task_if_current(generation);
}
