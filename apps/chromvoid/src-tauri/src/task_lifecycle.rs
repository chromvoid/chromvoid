use std::collections::HashMap;
use std::future::Future;
use std::hash::Hash;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(any(target_os = "ios", target_os = "macos", test))]
use std::sync::Arc;
use std::sync::Mutex;
#[cfg(any(desktop, test))]
use std::time::Duration;

use tauri::async_runtime::JoinHandle;
use tokio::sync::watch;

const TASK_LIFECYCLE_POISONED: &str = "Task lifecycle mutex poisoned";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(target_os = "android", allow(dead_code))]
pub(crate) enum ManagedTaskName {
    AutoLock,
    GatewayServer,
    ShutdownSignalListener,
    AndroidHostModeResume,
    MacosStaleMountCleanup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(
    not(any(target_os = "ios", target_os = "macos", test)),
    allow(dead_code)
)]
pub(crate) enum ExternalTaskName {
    CredentialProviderBridge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(target_os = "android", allow(dead_code))]
pub(crate) enum EventTaskName {
    SshAgentCatalogRefresh,
    VaultAutoMountAfterUnlock,
    VaultSshAgentAutoStartAfterUnlock,
    IosPendingWakeOrHostResume,
    IosForegroundReconnect,
    IosPushRegistrationSync,
    IosPushWakeHandling,
    IosBackgroundRefresh,
    AndroidQuickLock,
    VaultSystemSleepLock,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(target_os = "android", allow(dead_code))]
pub(crate) enum TaskShutdownReason {
    AppExit,
    #[cfg(test)]
    Test,
}

#[cfg(any(target_os = "ios", target_os = "macos", test))]
pub(crate) struct ExternalThreadTask {
    stop: Option<Box<dyn FnOnce() + Send + 'static>>,
    join_handle: Option<std::thread::JoinHandle<()>>,
    readiness: Option<ExternalTaskReadiness>,
}

#[derive(Clone)]
#[cfg(any(target_os = "ios", target_os = "macos", test))]
pub(crate) struct ExternalTaskReadiness {
    ready: Arc<AtomicBool>,
}

#[cfg(any(target_os = "ios", target_os = "macos", test))]
impl ExternalTaskReadiness {
    pub(crate) fn new() -> Self {
        Self {
            ready: Arc::new(AtomicBool::new(false)),
        }
    }

    pub(crate) fn mark_ready(&self) {
        self.ready.store(true, Ordering::Release);
    }

    pub(crate) fn mark_not_ready(&self) {
        self.ready.store(false, Ordering::Release);
    }

    pub(crate) fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Acquire)
    }
}

#[cfg(any(target_os = "ios", target_os = "macos", test))]
impl ExternalThreadTask {
    pub(crate) fn new(
        stop: impl FnOnce() + Send + 'static,
        join_handle: std::thread::JoinHandle<()>,
    ) -> Self {
        Self {
            stop: Some(Box::new(stop)),
            join_handle: Some(join_handle),
            readiness: None,
        }
    }

    pub(crate) fn with_readiness(
        stop: impl FnOnce() + Send + 'static,
        join_handle: std::thread::JoinHandle<()>,
        readiness: ExternalTaskReadiness,
    ) -> Self {
        Self {
            stop: Some(Box::new(stop)),
            join_handle: Some(join_handle),
            readiness: Some(readiness),
        }
    }

    fn stop(&mut self) {
        if let Some(readiness) = &self.readiness {
            readiness.mark_not_ready();
        }
        if let Some(stop) = self.stop.take() {
            stop();
        }
    }

    fn is_ready(&self) -> bool {
        self.readiness
            .as_ref()
            .is_some_and(ExternalTaskReadiness::is_ready)
    }

    fn join_if_finished(mut self, name: ExternalTaskName) {
        let Some(join_handle) = self.join_handle.take() else {
            return;
        };
        if join_handle.is_finished() {
            if join_handle.join().is_err() {
                tracing::warn!("task_lifecycle: external task panicked during join: {name:?}");
            }
        } else {
            tracing::warn!(
                "task_lifecycle: external task did not stop before grace elapsed: {name:?}"
            );
        }
    }
}

#[cfg(any(target_os = "ios", target_os = "macos", test))]
impl Drop for ExternalThreadTask {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(crate) struct TaskLifecycleRuntime {
    shutdown_requested: AtomicBool,
    shutdown_tx: watch::Sender<Option<TaskShutdownReason>>,
    tasks: Mutex<HashMap<ManagedTaskName, JoinHandle<()>>>,
    event_tasks: Mutex<HashMap<EventTaskName, Vec<JoinHandle<()>>>>,
    #[cfg(any(target_os = "ios", target_os = "macos", test))]
    external_threads: Mutex<HashMap<ExternalTaskName, ExternalThreadTask>>,
}

impl TaskLifecycleRuntime {
    pub(crate) fn new() -> Self {
        let (shutdown_tx, _shutdown_rx) = watch::channel(None);
        Self {
            shutdown_requested: AtomicBool::new(false),
            shutdown_tx,
            tasks: Mutex::new(HashMap::new()),
            event_tasks: Mutex::new(HashMap::new()),
            #[cfg(any(target_os = "ios", target_os = "macos", test))]
            external_threads: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn spawn_unique_async<F, Fut>(
        &self,
        name: ManagedTaskName,
        future_factory: F,
    ) -> Result<(), String>
    where
        F: FnOnce(watch::Receiver<Option<TaskShutdownReason>>) -> Fut + Send + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        if self.is_shutdown_requested() {
            return Err("Task lifecycle shutdown requested".to_string());
        }

        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| TASK_LIFECYCLE_POISONED.to_string())?;
        prune_finished(&mut tasks);
        if tasks.contains_key(&name) {
            return Err(format!("Task lifecycle task already running: {name:?}"));
        }

        let shutdown_rx = self.shutdown_tx.subscribe();
        let handle = tauri::async_runtime::spawn(future_factory(shutdown_rx));
        tasks.insert(name, handle);
        Ok(())
    }

    pub(crate) fn spawn_event_async<F, Fut>(
        &self,
        name: EventTaskName,
        future_factory: F,
    ) -> Result<(), String>
    where
        F: FnOnce(watch::Receiver<Option<TaskShutdownReason>>) -> Fut + Send + 'static,
        Fut: Future<Output = ()> + Send + 'static,
    {
        if self.is_shutdown_requested() {
            return Err("Task lifecycle shutdown requested".to_string());
        }

        let mut event_tasks = self
            .event_tasks
            .lock()
            .map_err(|_| TASK_LIFECYCLE_POISONED.to_string())?;
        let handles = event_tasks.entry(name).or_default();
        prune_finished_vec(handles);

        let shutdown_rx = self.shutdown_tx.subscribe();
        let handle = tauri::async_runtime::spawn(future_factory(shutdown_rx));
        handles.push(handle);
        Ok(())
    }

    #[cfg(any(target_os = "ios", target_os = "macos", test))]
    pub(crate) fn register_external_thread(
        &self,
        name: ExternalTaskName,
        task: ExternalThreadTask,
    ) -> Result<(), String> {
        if self.is_shutdown_requested() {
            return Err("Task lifecycle shutdown requested".to_string());
        }

        let mut external_threads = self
            .external_threads
            .lock()
            .map_err(|_| TASK_LIFECYCLE_POISONED.to_string())?;
        if external_threads.contains_key(&name) {
            return Err(format!(
                "Task lifecycle external task already registered: {name:?}"
            ));
        }
        external_threads.insert(name, task);
        Ok(())
    }

    #[cfg(any(target_os = "ios", target_os = "macos", test))]
    pub(crate) fn external_task_ready(&self, name: ExternalTaskName) -> Result<bool, String> {
        let external_threads = self
            .external_threads
            .lock()
            .map_err(|_| TASK_LIFECYCLE_POISONED.to_string())?;
        Ok(external_threads
            .get(&name)
            .is_some_and(ExternalThreadTask::is_ready))
    }

    pub(crate) fn is_shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::Acquire)
    }

    #[cfg(any(desktop, test))]
    pub(crate) async fn shutdown_with_grace(
        &self,
        reason: TaskShutdownReason,
        grace: Duration,
    ) -> Result<(), String> {
        self.shutdown_requested.store(true, Ordering::Release);
        self.shutdown_tx.send_replace(Some(reason));

        let mut shutdown_error = None;
        #[cfg(any(target_os = "ios", target_os = "macos", test))]
        let mut external_tasks = match self.external_threads.lock() {
            Ok(mut external_threads) => external_threads.drain().collect::<Vec<_>>(),
            Err(_) => {
                shutdown_error = Some(TASK_LIFECYCLE_POISONED.to_string());
                Vec::new()
            }
        };
        #[cfg(any(target_os = "ios", target_os = "macos", test))]
        for (_, task) in &mut external_tasks {
            task.stop();
        }

        if !grace.is_zero() {
            tokio::time::sleep(grace).await;
        }

        let mut handles = match self.tasks.lock() {
            Ok(mut tasks) => {
                prune_finished(&mut tasks);
                tasks.drain().map(|(_, handle)| handle).collect::<Vec<_>>()
            }
            Err(_) => {
                shutdown_error = Some(TASK_LIFECYCLE_POISONED.to_string());
                Vec::new()
            }
        };

        let event_handles = match self.event_tasks.lock() {
            Ok(mut event_tasks) => {
                for task_handles in event_tasks.values_mut() {
                    prune_finished_vec(task_handles);
                }
                event_tasks
                    .drain()
                    .flat_map(|(_, handles)| handles)
                    .collect::<Vec<_>>()
            }
            Err(_) => {
                shutdown_error = Some(TASK_LIFECYCLE_POISONED.to_string());
                Vec::new()
            }
        };
        handles.extend(event_handles);

        for handle in handles {
            handle.abort();
        }

        #[cfg(any(target_os = "ios", target_os = "macos", test))]
        for (name, task) in external_tasks {
            task.join_if_finished(name);
        }

        if let Some(error) = shutdown_error {
            return Err(error);
        }
        Ok(())
    }

    #[cfg(test)]
    fn active_task_names_for_test(&self) -> Result<Vec<ManagedTaskName>, String> {
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| TASK_LIFECYCLE_POISONED.to_string())?;
        prune_finished(&mut tasks);
        Ok(tasks.keys().copied().collect())
    }

    #[cfg(test)]
    fn external_task_names_for_test(&self) -> Result<Vec<ExternalTaskName>, String> {
        let external_threads = self
            .external_threads
            .lock()
            .map_err(|_| TASK_LIFECYCLE_POISONED.to_string())?;
        Ok(external_threads.keys().copied().collect())
    }

    #[cfg(test)]
    fn event_task_count_for_test(&self, name: EventTaskName) -> Result<usize, String> {
        let mut event_tasks = self
            .event_tasks
            .lock()
            .map_err(|_| TASK_LIFECYCLE_POISONED.to_string())?;
        let Some(handles) = event_tasks.get_mut(&name) else {
            return Ok(0);
        };
        prune_finished_vec(handles);
        Ok(handles.len())
    }
}

impl Default for TaskLifecycleRuntime {
    fn default() -> Self {
        Self::new()
    }
}

fn prune_finished<K>(tasks: &mut HashMap<K, JoinHandle<()>>)
where
    K: Eq + Hash,
{
    tasks.retain(|_, handle| !handle.inner().is_finished());
}

fn prune_finished_vec(tasks: &mut Vec<JoinHandle<()>>) {
    tasks.retain(|handle| !handle.inner().is_finished());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn external_test_task_with_readiness(
        readiness: Option<ExternalTaskReadiness>,
    ) -> (
        ExternalThreadTask,
        std::sync::Arc<AtomicBool>,
        std::sync::Arc<AtomicBool>,
    ) {
        let stop_requested = std::sync::Arc::new(AtomicBool::new(false));
        let stopped = std::sync::Arc::new(AtomicBool::new(false));
        let thread_stop_requested = stop_requested.clone();
        let thread_stopped = stopped.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let join_handle = std::thread::spawn(move || {
            let _ = ready_tx.send(());
            while !thread_stop_requested.load(Ordering::Acquire) {
                std::thread::sleep(Duration::from_millis(1));
            }
            thread_stopped.store(true, Ordering::Release);
        });
        ready_rx.recv().expect("external thread ready");
        let stop = {
            let stop_requested = stop_requested.clone();
            move || stop_requested.store(true, Ordering::Release)
        };
        let task = match readiness {
            Some(readiness) => ExternalThreadTask::with_readiness(stop, join_handle, readiness),
            None => ExternalThreadTask::new(stop, join_handle),
        };
        (task, stop_requested, stopped)
    }

    fn external_test_task() -> (
        ExternalThreadTask,
        std::sync::Arc<AtomicBool>,
        std::sync::Arc<AtomicBool>,
    ) {
        external_test_task_with_readiness(None)
    }

    fn external_ready_test_task(
        readiness: ExternalTaskReadiness,
    ) -> (
        ExternalThreadTask,
        std::sync::Arc<AtomicBool>,
        std::sync::Arc<AtomicBool>,
    ) {
        external_test_task_with_readiness(Some(readiness))
    }

    #[tokio::test]
    async fn duplicate_task_is_rejected_until_shutdown() {
        let runtime = TaskLifecycleRuntime::new();
        runtime
            .spawn_unique_async(ManagedTaskName::AutoLock, |_shutdown| async {
                std::future::pending::<()>().await;
            })
            .expect("spawn task");

        assert!(runtime
            .spawn_unique_async(ManagedTaskName::AutoLock, |_shutdown| async {})
            .expect_err("duplicate should fail")
            .contains("already running"));

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::ZERO)
            .await
            .expect("shutdown");
        assert!(runtime
            .active_task_names_for_test()
            .expect("task names")
            .is_empty());
    }

    #[tokio::test]
    async fn shutdown_notifies_tasks() {
        let runtime = TaskLifecycleRuntime::new();
        let (tx, rx) = tokio::sync::oneshot::channel();
        runtime
            .spawn_unique_async(ManagedTaskName::GatewayServer, |mut shutdown| async move {
                let _ = shutdown.changed().await;
                let _ = tx.send(*shutdown.borrow());
            })
            .expect("spawn task");

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::from_millis(20))
            .await
            .expect("shutdown");

        assert_eq!(
            rx.await.expect("shutdown reason"),
            Some(TaskShutdownReason::Test)
        );
        assert!(runtime.is_shutdown_requested());
    }

    #[tokio::test]
    async fn external_thread_registration_is_unique() {
        let runtime = TaskLifecycleRuntime::new();
        let (task, _, _) = external_test_task();
        runtime
            .register_external_thread(ExternalTaskName::CredentialProviderBridge, task)
            .expect("register");
        let (duplicate, _, _) = external_test_task();
        assert!(runtime
            .register_external_thread(ExternalTaskName::CredentialProviderBridge, duplicate)
            .expect_err("duplicate should fail")
            .contains("already registered"));
        assert_eq!(
            runtime
                .external_task_names_for_test()
                .expect("external names"),
            vec![ExternalTaskName::CredentialProviderBridge]
        );

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::from_millis(20))
            .await
            .expect("shutdown");
    }

    #[tokio::test]
    async fn external_thread_readiness_is_reported() {
        let runtime = TaskLifecycleRuntime::new();
        let readiness = ExternalTaskReadiness::new();
        let (task, _, _) = external_ready_test_task(readiness.clone());
        runtime
            .register_external_thread(ExternalTaskName::CredentialProviderBridge, task)
            .expect("register");

        assert!(!runtime
            .external_task_ready(ExternalTaskName::CredentialProviderBridge)
            .expect("readiness"));
        readiness.mark_ready();
        assert!(runtime
            .external_task_ready(ExternalTaskName::CredentialProviderBridge)
            .expect("readiness"));

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::from_millis(20))
            .await
            .expect("shutdown");
    }

    #[tokio::test]
    async fn shutdown_clears_external_thread_readiness() {
        let runtime = TaskLifecycleRuntime::new();
        let readiness = ExternalTaskReadiness::new();
        readiness.mark_ready();
        let (task, _, stopped) = external_ready_test_task(readiness.clone());
        runtime
            .register_external_thread(ExternalTaskName::CredentialProviderBridge, task)
            .expect("register");

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::from_millis(20))
            .await
            .expect("shutdown");

        assert!(!readiness.is_ready());
        assert!(stopped.load(Ordering::Acquire));
        assert!(!runtime
            .external_task_ready(ExternalTaskName::CredentialProviderBridge)
            .expect("readiness"));
    }

    #[tokio::test]
    async fn shutdown_stops_and_clears_external_threads() {
        let runtime = TaskLifecycleRuntime::new();
        let (task, stop_requested, stopped) = external_test_task();
        runtime
            .register_external_thread(ExternalTaskName::CredentialProviderBridge, task)
            .expect("register");

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::from_millis(20))
            .await
            .expect("shutdown");

        assert!(stop_requested.load(Ordering::Acquire));
        assert!(stopped.load(Ordering::Acquire));
        assert!(runtime
            .external_task_names_for_test()
            .expect("external task names")
            .is_empty());
    }

    #[test]
    fn external_thread_registration_after_shutdown_is_rejected() {
        let runtime = TaskLifecycleRuntime::new();
        runtime.shutdown_requested.store(true, Ordering::Release);
        let (task, _, _) = external_test_task();

        assert_eq!(
            runtime
                .register_external_thread(ExternalTaskName::CredentialProviderBridge, task)
                .expect_err("shutdown should fail"),
            "Task lifecycle shutdown requested"
        );
    }

    #[test]
    fn poisoned_task_lock_returns_controlled_error() {
        let runtime = TaskLifecycleRuntime::new();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = runtime.tasks.lock().expect("lock");
            panic!("poison task lifecycle mutex");
        }));

        assert_eq!(
            runtime
                .spawn_unique_async(ManagedTaskName::AutoLock, |_shutdown| async {})
                .expect_err("poison should fail"),
            TASK_LIFECYCLE_POISONED
        );
    }

    #[test]
    fn poisoned_external_thread_lock_returns_controlled_error() {
        let runtime = TaskLifecycleRuntime::new();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = runtime.external_threads.lock().expect("lock");
            panic!("poison external task lifecycle mutex");
        }));
        let (task, _, _) = external_test_task();

        assert_eq!(
            runtime
                .register_external_thread(ExternalTaskName::CredentialProviderBridge, task)
                .expect_err("poison should fail"),
            TASK_LIFECYCLE_POISONED
        );
        assert_eq!(
            runtime
                .external_task_ready(ExternalTaskName::CredentialProviderBridge)
                .expect_err("poison should fail"),
            TASK_LIFECYCLE_POISONED
        );
    }

    #[tokio::test]
    async fn concurrent_event_tasks_are_tracked() {
        let runtime = TaskLifecycleRuntime::new();
        runtime
            .spawn_event_async(EventTaskName::SshAgentCatalogRefresh, |_shutdown| async {
                std::future::pending::<()>().await;
            })
            .expect("spawn first event task");
        runtime
            .spawn_event_async(EventTaskName::SshAgentCatalogRefresh, |_shutdown| async {
                std::future::pending::<()>().await;
            })
            .expect("spawn second event task");

        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::SshAgentCatalogRefresh)
                .expect("event count"),
            2
        );

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::ZERO)
            .await
            .expect("shutdown");
        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::SshAgentCatalogRefresh)
                .expect("event count"),
            0
        );
    }

    #[tokio::test]
    async fn shutdown_notifies_event_tasks() {
        let runtime = TaskLifecycleRuntime::new();
        let (tx, rx) = tokio::sync::oneshot::channel();
        runtime
            .spawn_event_async(
                EventTaskName::IosPushWakeHandling,
                |mut shutdown| async move {
                    let _ = shutdown.changed().await;
                    let _ = tx.send(*shutdown.borrow());
                },
            )
            .expect("spawn event task");

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::from_millis(20))
            .await
            .expect("shutdown");

        assert_eq!(
            rx.await.expect("shutdown reason"),
            Some(TaskShutdownReason::Test)
        );
    }

    #[tokio::test]
    async fn android_quick_lock_event_tasks_are_tracked_and_shutdown() {
        let runtime = TaskLifecycleRuntime::new();
        runtime
            .spawn_event_async(EventTaskName::AndroidQuickLock, |_shutdown| async {
                std::future::pending::<()>().await;
            })
            .expect("spawn quick lock event task");

        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::AndroidQuickLock)
                .expect("event count"),
            1
        );

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::ZERO)
            .await
            .expect("shutdown");
        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::AndroidQuickLock)
                .expect("event count"),
            0
        );
    }

    #[tokio::test]
    async fn vault_unlock_event_tasks_are_tracked_and_shutdown() {
        let runtime = TaskLifecycleRuntime::new();
        runtime
            .spawn_event_async(
                EventTaskName::VaultAutoMountAfterUnlock,
                |_shutdown| async {
                    std::future::pending::<()>().await;
                },
            )
            .expect("spawn auto-mount unlock event task");
        runtime
            .spawn_event_async(
                EventTaskName::VaultSshAgentAutoStartAfterUnlock,
                |_shutdown| async {
                    std::future::pending::<()>().await;
                },
            )
            .expect("spawn SSH agent unlock event task");

        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::VaultAutoMountAfterUnlock)
                .expect("auto-mount event count"),
            1
        );
        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::VaultSshAgentAutoStartAfterUnlock)
                .expect("SSH agent event count"),
            1
        );

        runtime
            .shutdown_with_grace(TaskShutdownReason::Test, Duration::ZERO)
            .await
            .expect("shutdown");
        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::VaultAutoMountAfterUnlock)
                .expect("auto-mount event count"),
            0
        );
        assert_eq!(
            runtime
                .event_task_count_for_test(EventTaskName::VaultSshAgentAutoStartAfterUnlock)
                .expect("SSH agent event count"),
            0
        );
    }

    #[test]
    fn event_spawn_after_shutdown_is_rejected() {
        let runtime = TaskLifecycleRuntime::new();
        runtime.shutdown_requested.store(true, Ordering::Release);

        assert_eq!(
            runtime
                .spawn_event_async(EventTaskName::IosBackgroundRefresh, |_shutdown| async {})
                .expect_err("shutdown should fail"),
            "Task lifecycle shutdown requested"
        );
    }

    #[test]
    fn poisoned_event_lock_returns_controlled_error() {
        let runtime = TaskLifecycleRuntime::new();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = runtime.event_tasks.lock().expect("lock");
            panic!("poison event task lifecycle mutex");
        }));

        assert_eq!(
            runtime
                .spawn_event_async(EventTaskName::IosForegroundReconnect, |_shutdown| async {})
                .expect_err("poison should fail"),
            TASK_LIFECYCLE_POISONED
        );
    }
}
