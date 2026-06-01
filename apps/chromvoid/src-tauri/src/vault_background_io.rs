use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
#[cfg(any(desktop, test))]
use std::time::Duration;

use tokio::sync::Notify;

#[cfg(any(desktop, test))]
const VAULT_BACKGROUND_IO_RUNTIME_POISONED: &str = "Vault background IO runtime mutex poisoned";
#[cfg(any(desktop, test))]
const VAULT_BACKGROUND_IO_SHUTDOWN_TIMED_OUT: &str =
    "Vault background IO runtime shutdown timed out";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum VaultBackgroundIoError {
    RekeyAlreadyInProgress,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum VaultBackgroundIoTaskError {
    ShuttingDown,
    TaskFailed(String),
}

pub(crate) struct VaultBackgroundIoRuntimeState {
    backup_cancel_flag: Arc<AtomicBool>,
    restore_cancel_flag: Arc<AtomicBool>,
    rekey_cancel_flag: Arc<AtomicBool>,
    rekey_active: Arc<AtomicBool>,
    cancellation_epoch: Arc<AtomicU64>,
    lifecycle: Arc<VaultBackgroundIoTaskLifecycle>,
}

struct VaultBackgroundIoTaskLifecycle {
    state: Mutex<VaultBackgroundIoLifecycleState>,
    active_drained: Notify,
}

#[derive(Default)]
struct VaultBackgroundIoLifecycleState {
    shutting_down: bool,
    active_tasks: usize,
}

struct VaultBackgroundIoTaskPermit {
    lifecycle: Arc<VaultBackgroundIoTaskLifecycle>,
}

pub(crate) struct VaultRekeyRunGuard {
    cancel_requested: Arc<AtomicBool>,
    in_progress: Arc<AtomicBool>,
}

impl Drop for VaultRekeyRunGuard {
    fn drop(&mut self) {
        self.cancel_requested.store(false, Ordering::Relaxed);
        self.in_progress.store(false, Ordering::Release);
    }
}

impl VaultBackgroundIoRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            backup_cancel_flag: Arc::new(AtomicBool::new(false)),
            restore_cancel_flag: Arc::new(AtomicBool::new(false)),
            rekey_cancel_flag: Arc::new(AtomicBool::new(false)),
            rekey_active: Arc::new(AtomicBool::new(false)),
            cancellation_epoch: Arc::new(AtomicU64::new(0)),
            lifecycle: Arc::new(VaultBackgroundIoTaskLifecycle {
                state: Mutex::new(VaultBackgroundIoLifecycleState::default()),
                active_drained: Notify::new(),
            }),
        }
    }

    pub(crate) async fn spawn_blocking<T, F>(
        &self,
        task: F,
    ) -> Result<T, VaultBackgroundIoTaskError>
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
        .map_err(|error| VaultBackgroundIoTaskError::TaskFailed(error.to_string()))
    }

    #[cfg(any(desktop, test))]
    pub(crate) async fn shutdown_with_grace(&self, grace: Duration) -> Result<(), String> {
        {
            let mut state = self
                .lifecycle
                .state
                .lock()
                .map_err(|_| VAULT_BACKGROUND_IO_RUNTIME_POISONED.to_string())?;
            state.shutting_down = true;
            if state.active_tasks == 0 {
                return Ok(());
            }
        }

        if grace.is_zero() {
            return Err(VAULT_BACKGROUND_IO_SHUTDOWN_TIMED_OUT.to_string());
        }

        let wait_for_drain = async {
            loop {
                let notified = self.lifecycle.active_drained.notified();
                {
                    let state = self
                        .lifecycle
                        .state
                        .lock()
                        .map_err(|_| VAULT_BACKGROUND_IO_RUNTIME_POISONED.to_string())?;
                    if state.active_tasks == 0 {
                        return Ok(());
                    }
                }
                notified.await;
            }
        };

        match tokio::time::timeout(grace, wait_for_drain).await {
            Ok(result) => result,
            Err(_) => Err(VAULT_BACKGROUND_IO_SHUTDOWN_TIMED_OUT.to_string()),
        }
    }

    fn try_begin_task(&self) -> Result<VaultBackgroundIoTaskPermit, VaultBackgroundIoTaskError> {
        let mut state = match self.lifecycle.state.lock() {
            Ok(state) => state,
            Err(_) => {
                tracing::warn!("vault_background_io: runtime mutex poisoned during admission");
                return Err(VaultBackgroundIoTaskError::ShuttingDown);
            }
        };
        if state.shutting_down {
            return Err(VaultBackgroundIoTaskError::ShuttingDown);
        }
        state.active_tasks = state.active_tasks.saturating_add(1);
        Ok(VaultBackgroundIoTaskPermit {
            lifecycle: self.lifecycle.clone(),
        })
    }

    pub(crate) fn cancel_backup(&self) {
        self.backup_cancel_flag.store(true, Ordering::Relaxed);
    }

    pub(crate) fn begin_backup_run(&self) -> Arc<AtomicBool> {
        self.backup_cancel_flag.store(false, Ordering::Relaxed);
        self.backup_cancel_flag.clone()
    }

    pub(crate) fn finish_backup_run(&self) {
        self.backup_cancel_flag.store(false, Ordering::Relaxed);
    }

    pub(crate) fn cancel_restore(&self) {
        self.restore_cancel_flag.store(true, Ordering::Relaxed);
    }

    pub(crate) fn begin_restore_run(&self) -> Arc<AtomicBool> {
        self.restore_cancel_flag.store(false, Ordering::Relaxed);
        self.restore_cancel_flag.clone()
    }

    pub(crate) fn finish_restore_run(&self) {
        self.restore_cancel_flag.store(false, Ordering::Relaxed);
    }

    pub(crate) fn cancel_rekey(&self) {
        self.rekey_cancel_flag.store(true, Ordering::Relaxed);
    }

    pub(crate) fn begin_rekey_run(
        &self,
    ) -> Result<(VaultRekeyRunGuard, Arc<AtomicBool>), VaultBackgroundIoError> {
        if self.rekey_active.swap(true, Ordering::AcqRel) {
            return Err(VaultBackgroundIoError::RekeyAlreadyInProgress);
        }

        self.rekey_cancel_flag.store(false, Ordering::Relaxed);
        Ok((
            VaultRekeyRunGuard {
                cancel_requested: self.rekey_cancel_flag.clone(),
                in_progress: self.rekey_active.clone(),
            },
            self.rekey_cancel_flag.clone(),
        ))
    }

    pub(crate) fn cancel_low_priority(&self) -> u64 {
        self.cancellation_epoch
            .fetch_add(1, Ordering::SeqCst)
            .saturating_add(1)
    }

    pub(crate) fn cancellation_epoch_handle(&self) -> Arc<AtomicU64> {
        self.cancellation_epoch.clone()
    }

    #[cfg(test)]
    pub(crate) fn current_epoch(&self) -> u64 {
        self.cancellation_epoch.load(Ordering::SeqCst)
    }
}

impl VaultBackgroundIoTaskError {
    pub(crate) fn into_rpc_error(self, task_label: &str) -> (String, Option<String>) {
        match self {
            VaultBackgroundIoTaskError::ShuttingDown => (
                "Vault background IO is shutting down".to_string(),
                Some("SHUTTING_DOWN".to_string()),
            ),
            VaultBackgroundIoTaskError::TaskFailed(error) => (
                format!("{task_label} task failed: {error}"),
                Some("INTERNAL".to_string()),
            ),
        }
    }
}

impl Default for VaultBackgroundIoRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for VaultBackgroundIoTaskPermit {
    fn drop(&mut self) {
        let Ok(mut state) = self.lifecycle.state.lock() else {
            tracing::warn!("vault_background_io: runtime mutex poisoned during task release");
            return;
        };
        state.active_tasks = state.active_tasks.saturating_sub(1);
        if state.active_tasks == 0 {
            self.lifecycle.active_drained.notify_waiters();
            self.lifecycle.active_drained.notify_one();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::oneshot;

    #[test]
    fn backup_cancel_flag_resets_around_run() {
        let runtime = VaultBackgroundIoRuntimeState::new();
        runtime.cancel_backup();

        let token = runtime.begin_backup_run();
        assert!(!token.load(Ordering::Relaxed));

        runtime.cancel_backup();
        assert!(token.load(Ordering::Relaxed));

        runtime.finish_backup_run();
        assert!(!token.load(Ordering::Relaxed));
    }

    #[test]
    fn restore_cancel_flag_resets_around_run() {
        let runtime = VaultBackgroundIoRuntimeState::new();
        runtime.cancel_restore();

        let token = runtime.begin_restore_run();
        assert!(!token.load(Ordering::Relaxed));

        runtime.cancel_restore();
        assert!(token.load(Ordering::Relaxed));

        runtime.finish_restore_run();
        assert!(!token.load(Ordering::Relaxed));
    }

    #[test]
    fn rekey_run_is_single_flight_until_guard_drops() {
        let runtime = VaultBackgroundIoRuntimeState::new();
        let (guard, _token) = runtime
            .begin_rekey_run()
            .expect("first rekey run should start");

        assert!(matches!(
            runtime.begin_rekey_run(),
            Err(VaultBackgroundIoError::RekeyAlreadyInProgress)
        ));

        drop(guard);
        assert!(runtime.begin_rekey_run().is_ok());
    }

    #[test]
    fn rekey_guard_resets_cancel_flag() {
        let runtime = VaultBackgroundIoRuntimeState::new();
        let (guard, token) = runtime.begin_rekey_run().expect("rekey run should start");

        runtime.cancel_rekey();
        assert!(token.load(Ordering::Relaxed));

        drop(guard);
        assert!(!token.load(Ordering::Relaxed));
    }

    #[test]
    fn low_priority_epoch_increments_and_shared_handle_observes_it() {
        let runtime = VaultBackgroundIoRuntimeState::new();
        let epoch = runtime.cancellation_epoch_handle();

        assert_eq!(runtime.current_epoch(), 0);
        assert_eq!(runtime.cancel_low_priority(), 1);
        assert_eq!(runtime.cancel_low_priority(), 2);
        assert_eq!(runtime.current_epoch(), 2);
        assert_eq!(epoch.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn spawn_blocking_runs_task_and_drains_on_completion() {
        let runtime = VaultBackgroundIoRuntimeState::new();

        assert_eq!(
            runtime.spawn_blocking(|| 7_u64).await.expect("task result"),
            7
        );
        runtime
            .shutdown_with_grace(Duration::ZERO)
            .await
            .expect("completed task should be drained");
    }

    #[tokio::test]
    async fn shutdown_rejects_future_tasks() {
        let runtime = VaultBackgroundIoRuntimeState::new();

        runtime
            .shutdown_with_grace(Duration::ZERO)
            .await
            .expect("shutdown without active tasks should succeed");

        assert_eq!(
            runtime.spawn_blocking(|| ()).await,
            Err(VaultBackgroundIoTaskError::ShuttingDown)
        );
    }

    #[tokio::test]
    async fn shutdown_waits_until_active_task_finishes() {
        let runtime = Arc::new(VaultBackgroundIoRuntimeState::new());
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
        let runtime = Arc::new(VaultBackgroundIoRuntimeState::new());
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
            VAULT_BACKGROUND_IO_SHUTDOWN_TIMED_OUT
        );
        assert_eq!(
            runtime.spawn_blocking(|| ()).await,
            Err(VaultBackgroundIoTaskError::ShuttingDown)
        );

        drop(release_tx);
        task.await
            .expect("task should join")
            .expect("task should drain");
    }

    #[tokio::test]
    async fn poisoned_lifecycle_mutex_returns_controlled_error() {
        let runtime = Arc::new(VaultBackgroundIoRuntimeState::new());
        let poisoned_runtime = runtime.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoned_runtime
                .lifecycle
                .state
                .lock()
                .expect("lifecycle lock");
            panic!("poison vault background IO lifecycle mutex");
        })
        .join();

        assert_eq!(
            runtime
                .shutdown_with_grace(Duration::ZERO)
                .await
                .expect_err("poisoned lifecycle should fail shutdown"),
            VAULT_BACKGROUND_IO_RUNTIME_POISONED
        );
    }
}
