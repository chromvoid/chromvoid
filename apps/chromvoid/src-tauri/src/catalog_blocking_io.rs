use std::sync::{Arc, Mutex};
#[cfg(any(desktop, test))]
use std::time::Duration;

use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore, TryAcquireError};

pub(crate) const CATALOG_BLOCKING_IO_MAX_CONCURRENT_TASKS: usize = 8;
#[cfg(any(desktop, test))]
const CATALOG_BLOCKING_IO_RUNTIME_POISONED: &str = "Catalog blocking IO runtime mutex poisoned";
#[cfg(any(desktop, test))]
const CATALOG_BLOCKING_IO_SHUTDOWN_TIMED_OUT: &str =
    "Catalog blocking IO runtime shutdown timed out";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CatalogBlockingIoError {
    Busy,
    ShuttingDown,
    TaskFailed(String),
}

#[derive(Clone)]
pub(crate) struct CatalogBlockingIoRuntimeState {
    inner: Arc<CatalogBlockingIoRuntimeInner>,
}

struct CatalogBlockingIoRuntimeInner {
    tasks: Arc<Semaphore>,
    lifecycle: Mutex<CatalogBlockingIoLifecycleState>,
    active_drained: Notify,
}

#[derive(Default)]
struct CatalogBlockingIoLifecycleState {
    shutting_down: bool,
    active_tasks: usize,
}

struct CatalogBlockingIoTaskPermit {
    inner: Arc<CatalogBlockingIoRuntimeInner>,
    _task_permit: OwnedSemaphorePermit,
}

impl CatalogBlockingIoRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(CatalogBlockingIoRuntimeInner {
                tasks: Arc::new(Semaphore::new(CATALOG_BLOCKING_IO_MAX_CONCURRENT_TASKS)),
                lifecycle: Mutex::new(CatalogBlockingIoLifecycleState::default()),
                active_drained: Notify::new(),
            }),
        }
    }

    pub(crate) async fn spawn_blocking<T, F>(&self, task: F) -> Result<T, CatalogBlockingIoError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let task_permit = self.try_begin_task()?;
        tauri::async_runtime::spawn_blocking(move || {
            let _task_permit = task_permit;
            task()
        })
        .await
        .map_err(|error| CatalogBlockingIoError::TaskFailed(error.to_string()))
    }

    #[cfg(any(desktop, test))]
    pub(crate) async fn shutdown_with_grace(&self, grace: Duration) -> Result<(), String> {
        self.inner.tasks.close();
        {
            let mut lifecycle = self
                .inner
                .lifecycle
                .lock()
                .map_err(|_| CATALOG_BLOCKING_IO_RUNTIME_POISONED.to_string())?;
            lifecycle.shutting_down = true;
            if lifecycle.active_tasks == 0 {
                return Ok(());
            }
        }

        if grace.is_zero() {
            return Err(CATALOG_BLOCKING_IO_SHUTDOWN_TIMED_OUT.to_string());
        }

        let wait_for_drain = async {
            loop {
                let notified = self.inner.active_drained.notified();
                {
                    let lifecycle = self
                        .inner
                        .lifecycle
                        .lock()
                        .map_err(|_| CATALOG_BLOCKING_IO_RUNTIME_POISONED.to_string())?;
                    if lifecycle.active_tasks == 0 {
                        return Ok(());
                    }
                }
                notified.await;
            }
        };

        match tokio::time::timeout(grace, wait_for_drain).await {
            Ok(result) => result,
            Err(_) => Err(CATALOG_BLOCKING_IO_SHUTDOWN_TIMED_OUT.to_string()),
        }
    }

    fn try_begin_task(&self) -> Result<CatalogBlockingIoTaskPermit, CatalogBlockingIoError> {
        let task_permit = match self.inner.tasks.clone().try_acquire_owned() {
            Ok(permit) => permit,
            Err(TryAcquireError::NoPermits) => return Err(CatalogBlockingIoError::Busy),
            Err(TryAcquireError::Closed) => return Err(CatalogBlockingIoError::ShuttingDown),
        };

        let mut lifecycle = match self.inner.lifecycle.lock() {
            Ok(lifecycle) => lifecycle,
            Err(_) => {
                tracing::warn!("catalog_blocking_io: runtime mutex poisoned during admission");
                return Err(CatalogBlockingIoError::ShuttingDown);
            }
        };
        if lifecycle.shutting_down {
            return Err(CatalogBlockingIoError::ShuttingDown);
        }
        lifecycle.active_tasks = lifecycle.active_tasks.saturating_add(1);
        Ok(CatalogBlockingIoTaskPermit {
            inner: self.inner.clone(),
            _task_permit: task_permit,
        })
    }
}

impl CatalogBlockingIoError {
    pub(crate) fn into_rpc_error(self, task_label: &str) -> (String, Option<String>) {
        match self {
            CatalogBlockingIoError::Busy => (
                "Catalog background IO is busy".to_string(),
                Some("BUSY".to_string()),
            ),
            CatalogBlockingIoError::ShuttingDown => (
                "Catalog background IO is shutting down".to_string(),
                Some("SHUTTING_DOWN".to_string()),
            ),
            CatalogBlockingIoError::TaskFailed(error) => (
                format!("{task_label} task failed: {error}"),
                Some("INTERNAL".to_string()),
            ),
        }
    }
}

impl Default for CatalogBlockingIoRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for CatalogBlockingIoTaskPermit {
    fn drop(&mut self) {
        let Ok(mut lifecycle) = self.inner.lifecycle.lock() else {
            tracing::warn!("catalog_blocking_io: runtime mutex poisoned during task release");
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
    async fn enforces_concurrent_task_limit() {
        let runtime = CatalogBlockingIoRuntimeState::new();
        let mut permits = Vec::new();

        for _ in 0..CATALOG_BLOCKING_IO_MAX_CONCURRENT_TASKS {
            permits.push(runtime.try_begin_task().expect("task permit"));
        }

        assert!(matches!(
            runtime.try_begin_task(),
            Err(CatalogBlockingIoError::Busy)
        ));
    }

    #[tokio::test]
    async fn dropping_task_permit_frees_capacity() {
        let runtime = CatalogBlockingIoRuntimeState::new();
        let mut permits = Vec::new();

        for _ in 0..CATALOG_BLOCKING_IO_MAX_CONCURRENT_TASKS {
            permits.push(runtime.try_begin_task().expect("task permit"));
        }

        drop(permits.pop());

        assert!(runtime.try_begin_task().is_ok());
    }

    #[tokio::test]
    async fn shutdown_rejects_future_tasks() {
        let runtime = CatalogBlockingIoRuntimeState::new();

        runtime
            .shutdown_with_grace(Duration::ZERO)
            .await
            .expect("shutdown without active tasks should succeed");

        assert!(matches!(
            runtime.try_begin_task(),
            Err(CatalogBlockingIoError::ShuttingDown)
        ));
    }

    #[tokio::test]
    async fn shutdown_waits_until_active_task_finishes() {
        let runtime = CatalogBlockingIoRuntimeState::new();
        let permit = runtime.try_begin_task().expect("task permit");
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
            .expect("shutdown should succeed after task drops");
    }

    #[tokio::test]
    async fn shutdown_times_out_when_active_task_remains() {
        let runtime = CatalogBlockingIoRuntimeState::new();
        let _permit = runtime.try_begin_task().expect("task permit");

        assert_eq!(
            runtime
                .shutdown_with_grace(Duration::from_millis(1))
                .await
                .expect_err("active task should time out"),
            CATALOG_BLOCKING_IO_SHUTDOWN_TIMED_OUT
        );
        assert!(matches!(
            runtime.try_begin_task(),
            Err(CatalogBlockingIoError::ShuttingDown)
        ));
    }

    #[tokio::test]
    async fn poisoned_lifecycle_mutex_returns_controlled_error() {
        let runtime = CatalogBlockingIoRuntimeState::new();
        let poisoned_runtime = runtime.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoned_runtime
                .inner
                .lifecycle
                .lock()
                .expect("lifecycle lock");
            panic!("poison catalog blocking IO lifecycle mutex");
        })
        .join();

        assert_eq!(
            runtime
                .shutdown_with_grace(Duration::ZERO)
                .await
                .expect_err("poisoned lifecycle should fail shutdown"),
            CATALOG_BLOCKING_IO_RUNTIME_POISONED
        );
    }
}
