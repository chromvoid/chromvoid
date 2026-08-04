use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tokio::task::JoinSet;
use tracing::{info, warn};

use crate::commands::catalog::{
    HostDerivativeEnsureRequest, HostDerivativeEnsureServices, ImageDerivativeCancellation,
};
use crate::types::StreamOut;

const HOST_DERIVATIVE_ASYNC_SHUTDOWN_TIMEOUT: std::time::Duration =
    std::time::Duration::from_secs(1);

pub(super) struct HostDerivativeEnsureOutcome {
    pub(super) message_id: u64,
    pub(super) request: HostDerivativeEnsureRequest,
    pub(super) peer_stream_control: bool,
    pub(super) duration_ms: u128,
    pub(super) cancellation: ImageDerivativeCancellation,
    pub(super) result: Result<StreamOut, (String, Option<String>)>,
}

pub(super) struct HostDerivativeSessionCancellation {
    epoch: Arc<AtomicU64>,
    cancelled: bool,
}

impl HostDerivativeSessionCancellation {
    pub(super) fn new() -> Self {
        Self {
            epoch: Arc::new(AtomicU64::new(0)),
            cancelled: false,
        }
    }

    pub(super) fn epoch_handle(&self) -> Arc<AtomicU64> {
        self.epoch.clone()
    }

    pub(super) fn cancel(&mut self) {
        if !self.cancelled {
            self.epoch.fetch_add(1, Ordering::SeqCst);
            self.cancelled = true;
        }
    }
}

impl Drop for HostDerivativeSessionCancellation {
    fn drop(&mut self) {
        self.cancel();
    }
}

pub(super) fn spawn_host_derivative_ensure(
    jobs: &mut JoinSet<()>,
    outcome_tx: tokio::sync::mpsc::UnboundedSender<HostDerivativeEnsureOutcome>,
    services: Arc<HostDerivativeEnsureServices>,
    request: HostDerivativeEnsureRequest,
    message_id: u64,
    peer_stream_control: bool,
    session_cancellation_epoch: Arc<AtomicU64>,
) -> Arc<AtomicU64> {
    // Capture both epochs before yielding to the spawned task. If lock or
    // disconnect wins the scheduling race, this job must still observe the
    // stale snapshot instead of treating the newer epoch as its baseline.
    let request_cancellation_epoch = Arc::new(AtomicU64::new(0));
    let cancellation = services.cancellation_snapshot([
        session_cancellation_epoch,
        request_cancellation_epoch.clone(),
    ]);
    let outcome_cancellation = cancellation.clone();
    jobs.spawn(async move {
        let started = std::time::Instant::now();
        let result = services.ensure(request, cancellation).await;
        let _ = outcome_tx.send(HostDerivativeEnsureOutcome {
            message_id,
            request,
            peer_stream_control,
            duration_ms: started.elapsed().as_millis(),
            cancellation: outcome_cancellation,
            result,
        });
    });
    request_cancellation_epoch
}

pub(super) async fn shutdown_host_derivative_jobs(peer_id: &str, jobs: &mut JoinSet<()>) {
    let pending_jobs = jobs.len();
    if pending_jobs == 0 {
        return;
    }
    match tokio::time::timeout(HOST_DERIVATIVE_ASYNC_SHUTDOWN_TIMEOUT, jobs.shutdown()).await {
        Ok(()) => info!(
            peer_id,
            jobs = pending_jobs,
            "mobile_acceptor: derivative ensure async waiters stopped; native work cancellation-gated"
        ),
        Err(_) => warn!(
            peer_id,
            jobs = pending_jobs,
            "mobile_acceptor: derivative ensure async waiter shutdown timed out; native work remains cancellation-gated"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_cancellation_invalidates_existing_derivative_snapshot() {
        let mut session = HostDerivativeSessionCancellation::new();
        let cancellation = ImageDerivativeCancellation::capture_all([session.epoch_handle()]);

        session.cancel();

        let error = cancellation
            .check()
            .expect_err("existing derivative snapshot must be invalidated");
        assert_eq!(error.1.as_deref(), Some("CANCELLED"));
    }
}
