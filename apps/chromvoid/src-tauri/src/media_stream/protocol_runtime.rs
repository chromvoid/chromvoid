use std::sync::{Arc, Mutex};
#[cfg(any(desktop, test))]
use std::time::Duration;

use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore, TryAcquireError};

pub(crate) const MEDIA_PROTOCOL_MAX_CONCURRENT_REQUESTS: usize = 8;
#[cfg(any(desktop, test))]
const MEDIA_PROTOCOL_RUNTIME_POISONED: &str = "Media protocol runtime mutex poisoned";
#[cfg(any(desktop, test))]
const MEDIA_PROTOCOL_RUNTIME_SHUTDOWN_TIMED_OUT: &str = "Media protocol runtime shutdown timed out";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MediaProtocolRuntimeError {
    Busy,
    ShuttingDown,
}

#[derive(Clone)]
pub(crate) struct MediaProtocolRuntimeState {
    inner: Arc<MediaProtocolRuntimeInner>,
}

struct MediaProtocolRuntimeInner {
    requests: Arc<Semaphore>,
    lifecycle: Mutex<MediaProtocolLifecycleState>,
    active_drained: Notify,
}

#[derive(Default)]
struct MediaProtocolLifecycleState {
    shutting_down: bool,
    active_requests: usize,
}

pub(crate) struct MediaProtocolRequestPermit {
    inner: Arc<MediaProtocolRuntimeInner>,
    _request_permit: OwnedSemaphorePermit,
}

impl MediaProtocolRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(MediaProtocolRuntimeInner {
                requests: Arc::new(Semaphore::new(MEDIA_PROTOCOL_MAX_CONCURRENT_REQUESTS)),
                lifecycle: Mutex::new(MediaProtocolLifecycleState::default()),
                active_drained: Notify::new(),
            }),
        }
    }

    pub(crate) fn try_begin_request(
        &self,
    ) -> Result<MediaProtocolRequestPermit, MediaProtocolRuntimeError> {
        let request_permit = match self.inner.requests.clone().try_acquire_owned() {
            Ok(permit) => permit,
            Err(TryAcquireError::NoPermits) => return Err(MediaProtocolRuntimeError::Busy),
            Err(TryAcquireError::Closed) => return Err(MediaProtocolRuntimeError::ShuttingDown),
        };

        let mut lifecycle = match self.inner.lifecycle.lock() {
            Ok(lifecycle) => lifecycle,
            Err(_) => {
                tracing::warn!("media_stream: protocol runtime mutex poisoned during admission");
                return Err(MediaProtocolRuntimeError::ShuttingDown);
            }
        };
        if lifecycle.shutting_down {
            return Err(MediaProtocolRuntimeError::ShuttingDown);
        }
        lifecycle.active_requests = lifecycle.active_requests.saturating_add(1);
        Ok(MediaProtocolRequestPermit {
            inner: self.inner.clone(),
            _request_permit: request_permit,
        })
    }

    #[cfg(any(desktop, test))]
    pub(crate) async fn shutdown_with_grace(&self, grace: Duration) -> Result<(), String> {
        self.inner.requests.close();
        {
            let mut lifecycle = self
                .inner
                .lifecycle
                .lock()
                .map_err(|_| MEDIA_PROTOCOL_RUNTIME_POISONED.to_string())?;
            lifecycle.shutting_down = true;
            if lifecycle.active_requests == 0 {
                return Ok(());
            }
        }

        if grace.is_zero() {
            return Err(MEDIA_PROTOCOL_RUNTIME_SHUTDOWN_TIMED_OUT.to_string());
        }

        let wait_for_drain = async {
            loop {
                let notified = self.inner.active_drained.notified();
                {
                    let lifecycle = self
                        .inner
                        .lifecycle
                        .lock()
                        .map_err(|_| MEDIA_PROTOCOL_RUNTIME_POISONED.to_string())?;
                    if lifecycle.active_requests == 0 {
                        return Ok(());
                    }
                }
                notified.await;
            }
        };

        match tokio::time::timeout(grace, wait_for_drain).await {
            Ok(result) => result,
            Err(_) => Err(MEDIA_PROTOCOL_RUNTIME_SHUTDOWN_TIMED_OUT.to_string()),
        }
    }

    pub(crate) fn spawn_blocking_request<F>(
        &self,
        request_permit: MediaProtocolRequestPermit,
        task: F,
    ) where
        F: FnOnce() + Send + 'static,
    {
        let _join_handle = tauri::async_runtime::spawn_blocking(move || {
            let _request_permit = request_permit;
            task();
        });
    }
}

impl Default for MediaProtocolRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for MediaProtocolRequestPermit {
    fn drop(&mut self) {
        let Ok(mut lifecycle) = self.inner.lifecycle.lock() else {
            tracing::warn!("media_stream: protocol runtime mutex poisoned during request release");
            return;
        };
        lifecycle.active_requests = lifecycle.active_requests.saturating_sub(1);
        if lifecycle.active_requests == 0 {
            self.inner.active_drained.notify_waiters();
            self.inner.active_drained.notify_one();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot;

    #[test]
    fn enforces_concurrent_request_limit() {
        let runtime = MediaProtocolRuntimeState::new();
        let mut permits = Vec::new();

        for _ in 0..MEDIA_PROTOCOL_MAX_CONCURRENT_REQUESTS {
            permits.push(
                runtime
                    .try_begin_request()
                    .expect("request permit should be available"),
            );
        }

        assert!(matches!(
            runtime.try_begin_request(),
            Err(MediaProtocolRuntimeError::Busy)
        ));
    }

    #[test]
    fn releases_permit_when_request_finishes() {
        let runtime = MediaProtocolRuntimeState::new();
        let mut permits = Vec::new();

        for _ in 0..MEDIA_PROTOCOL_MAX_CONCURRENT_REQUESTS {
            permits.push(
                runtime
                    .try_begin_request()
                    .expect("request permit should be available"),
            );
        }

        drop(permits.pop());

        assert!(runtime.try_begin_request().is_ok());
    }

    #[tokio::test]
    async fn shutdown_rejects_future_requests() {
        let runtime = MediaProtocolRuntimeState::new();

        runtime
            .shutdown_with_grace(Duration::ZERO)
            .await
            .expect("shutdown without active requests should succeed");

        assert!(matches!(
            runtime.try_begin_request(),
            Err(MediaProtocolRuntimeError::ShuttingDown)
        ));
    }

    #[tokio::test]
    async fn shutdown_waits_until_active_request_finishes() {
        let runtime = MediaProtocolRuntimeState::new();
        let permit = runtime
            .try_begin_request()
            .expect("request permit should be available");
        let runtime_clone = runtime.clone();
        let (started_tx, started_rx) = oneshot::channel();

        let shutdown_task = tokio::spawn(async move {
            let _ = started_tx.send(());
            runtime_clone
                .shutdown_with_grace(Duration::from_secs(1))
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
    async fn shutdown_times_out_when_active_request_remains() {
        let runtime = MediaProtocolRuntimeState::new();
        let _permit = runtime
            .try_begin_request()
            .expect("request permit should be available");

        assert_eq!(
            runtime
                .shutdown_with_grace(Duration::from_millis(1))
                .await
                .expect_err("active request should time out"),
            MEDIA_PROTOCOL_RUNTIME_SHUTDOWN_TIMED_OUT
        );
        assert!(matches!(
            runtime.try_begin_request(),
            Err(MediaProtocolRuntimeError::ShuttingDown)
        ));
    }

    #[tokio::test]
    async fn poisoned_lifecycle_mutex_returns_controlled_error() {
        let runtime = MediaProtocolRuntimeState::new();
        let poisoned_runtime = runtime.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoned_runtime
                .inner
                .lifecycle
                .lock()
                .expect("lifecycle lock");
            panic!("poison media protocol lifecycle mutex");
        })
        .join();

        assert_eq!(
            runtime
                .shutdown_with_grace(Duration::ZERO)
                .await
                .expect_err("poisoned lifecycle should fail shutdown"),
            MEDIA_PROTOCOL_RUNTIME_POISONED
        );
    }

    #[tokio::test]
    async fn blocking_request_holds_permit_until_task_finishes() {
        let runtime = MediaProtocolRuntimeState::new();
        let permit = runtime
            .try_begin_request()
            .expect("request permit should be available");
        let runtime_clone = runtime.clone();
        let (release_tx, release_rx) = std::sync::mpsc::channel();

        runtime.spawn_blocking_request(permit, move || {
            release_rx
                .recv()
                .expect("release signal should be sent before test exits");
        });

        let shutdown_task = tokio::spawn(async move {
            runtime_clone
                .shutdown_with_grace(Duration::from_secs(1))
                .await
        });

        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!shutdown_task.is_finished());

        release_tx
            .send(())
            .expect("blocking request should still be waiting");
        shutdown_task
            .await
            .expect("shutdown task should join")
            .expect("shutdown should succeed after blocking request finishes");
    }
}
