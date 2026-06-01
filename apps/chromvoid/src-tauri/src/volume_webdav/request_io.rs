use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::Notify;

const WEBDAV_REQUEST_IO_RUNTIME_POISONED: &str = "WebDAV request IO runtime mutex poisoned";
const WEBDAV_REQUEST_IO_SHUTDOWN_TIMED_OUT: &str = "WebDAV request IO runtime shutdown timed out";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum WebDavRequestIoError {
    ShuttingDown,
    TaskFailed(String),
}

pub(super) struct WebDavRequestIoRuntimeState {
    inner: Arc<WebDavRequestIoRuntimeInner>,
}

impl std::fmt::Debug for WebDavRequestIoRuntimeState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("WebDavRequestIoRuntimeState")
            .finish_non_exhaustive()
    }
}

struct WebDavRequestIoRuntimeInner {
    lifecycle: Mutex<WebDavRequestIoLifecycleState>,
    active_drained: Notify,
}

#[derive(Default)]
struct WebDavRequestIoLifecycleState {
    shutting_down: bool,
    active_tasks: usize,
}

struct WebDavRequestIoTaskPermit {
    inner: Arc<WebDavRequestIoRuntimeInner>,
}

impl WebDavRequestIoRuntimeState {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(WebDavRequestIoRuntimeInner {
                lifecycle: Mutex::new(WebDavRequestIoLifecycleState::default()),
                active_drained: Notify::new(),
            }),
        }
    }

    pub(super) async fn spawn_blocking<T, F>(&self, task: F) -> Result<T, WebDavRequestIoError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let task_permit = self.try_begin_task()?;
        tokio::task::spawn_blocking(move || {
            let _task_permit = task_permit;
            task()
        })
        .await
        .map_err(|error| WebDavRequestIoError::TaskFailed(error.to_string()))
    }

    pub(super) fn request_shutdown(&self) {
        let Ok(mut lifecycle) = self.inner.lifecycle.lock() else {
            tracing::warn!("webdav: request IO runtime mutex poisoned during shutdown request");
            return;
        };
        lifecycle.shutting_down = true;
        if lifecycle.active_tasks == 0 {
            self.inner.active_drained.notify_waiters();
            self.inner.active_drained.notify_one();
        }
    }

    pub(super) async fn shutdown_with_grace(&self, grace: Duration) -> Result<(), String> {
        self.request_shutdown();
        {
            let lifecycle = self
                .inner
                .lifecycle
                .lock()
                .map_err(|_| WEBDAV_REQUEST_IO_RUNTIME_POISONED.to_string())?;
            if lifecycle.active_tasks == 0 {
                return Ok(());
            }
        }

        if grace.is_zero() {
            return Err(WEBDAV_REQUEST_IO_SHUTDOWN_TIMED_OUT.to_string());
        }

        let wait_for_drain = async {
            loop {
                let notified = self.inner.active_drained.notified();
                {
                    let lifecycle = self
                        .inner
                        .lifecycle
                        .lock()
                        .map_err(|_| WEBDAV_REQUEST_IO_RUNTIME_POISONED.to_string())?;
                    if lifecycle.active_tasks == 0 {
                        return Ok(());
                    }
                }
                notified.await;
            }
        };

        match tokio::time::timeout(grace, wait_for_drain).await {
            Ok(result) => result,
            Err(_) => Err(WEBDAV_REQUEST_IO_SHUTDOWN_TIMED_OUT.to_string()),
        }
    }

    fn try_begin_task(&self) -> Result<WebDavRequestIoTaskPermit, WebDavRequestIoError> {
        let mut lifecycle = match self.inner.lifecycle.lock() {
            Ok(lifecycle) => lifecycle,
            Err(_) => {
                tracing::warn!("webdav: request IO runtime mutex poisoned during admission");
                return Err(WebDavRequestIoError::ShuttingDown);
            }
        };
        if lifecycle.shutting_down {
            return Err(WebDavRequestIoError::ShuttingDown);
        }
        lifecycle.active_tasks = lifecycle.active_tasks.saturating_add(1);
        Ok(WebDavRequestIoTaskPermit {
            inner: self.inner.clone(),
        })
    }
}

impl Default for WebDavRequestIoRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for WebDavRequestIoTaskPermit {
    fn drop(&mut self) {
        let Ok(mut lifecycle) = self.inner.lifecycle.lock() else {
            tracing::warn!("webdav: request IO runtime mutex poisoned during task release");
            return;
        };
        lifecycle.active_tasks = lifecycle.active_tasks.saturating_sub(1);
        if lifecycle.active_tasks == 0 {
            self.inner.active_drained.notify_waiters();
            self.inner.active_drained.notify_one();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot;

    #[tokio::test]
    async fn shutdown_rejects_future_tasks() {
        let runtime = WebDavRequestIoRuntimeState::new();

        runtime
            .shutdown_with_grace(Duration::ZERO)
            .await
            .expect("shutdown without active tasks should succeed");

        assert_eq!(
            runtime.spawn_blocking(|| ()).await,
            Err(WebDavRequestIoError::ShuttingDown)
        );
    }

    #[tokio::test]
    async fn shutdown_waits_until_active_task_finishes() {
        let runtime = Arc::new(WebDavRequestIoRuntimeState::new());
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let task_runtime = runtime.clone();
        let task = tokio::spawn(async move {
            task_runtime
                .spawn_blocking(move || release_rx.recv().expect("release task"))
                .await
        });

        tokio::time::sleep(Duration::from_millis(10)).await;
        let shutdown_runtime = runtime.clone();
        let (started_tx, started_rx) = oneshot::channel();
        let shutdown_task = tokio::spawn(async move {
            let _ = started_tx.send(());
            shutdown_runtime
                .shutdown_with_grace(Duration::from_secs(1))
                .await
        });

        started_rx.await.expect("shutdown task should start");
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!shutdown_task.is_finished());

        release_tx.send(()).expect("release active task");
        task.await
            .expect("task should join")
            .expect("task should succeed");
        shutdown_task
            .await
            .expect("shutdown task should join")
            .expect("shutdown should drain");
    }

    #[tokio::test]
    async fn shutdown_times_out_while_task_is_active() {
        let runtime = Arc::new(WebDavRequestIoRuntimeState::new());
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        let task_runtime = runtime.clone();
        let task = tokio::spawn(async move {
            task_runtime
                .spawn_blocking(move || {
                    let _ = release_rx.recv();
                })
                .await
        });

        tokio::time::sleep(Duration::from_millis(10)).await;

        assert_eq!(
            runtime
                .shutdown_with_grace(Duration::from_millis(1))
                .await
                .expect_err("active task should time out"),
            WEBDAV_REQUEST_IO_SHUTDOWN_TIMED_OUT
        );
        assert_eq!(
            runtime.spawn_blocking(|| ()).await,
            Err(WebDavRequestIoError::ShuttingDown)
        );

        drop(release_tx);
        task.await
            .expect("task should join")
            .expect("task should drain");
    }
}
