use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::oneshot;

use super::job::{
    CoreRpcCommandStart, CoreRpcDispatchError, CoreRpcPhaseResult, CoreRpcPhaseTiming,
};
use super::policy::{CoreRpcCommandPolicy, CoreRpcPriority};

#[derive(Clone)]
pub(crate) struct CoreRpcDispatcher {
    inner: Arc<DispatcherInner>,
}

struct DispatcherInner {
    queue: Mutex<DispatcherQueue>,
    queue_ready: Condvar,
    low_priority_cancellation_generation: AtomicU64,
    worker_handle: Mutex<Option<std::thread::JoinHandle<()>>>,
}

#[derive(Default)]
struct DispatcherQueue {
    privacy_critical: VecDeque<CoreRpcJob>,
    user_blocking: VecDeque<CoreRpcJob>,
    low_priority: VecDeque<CoreRpcJob>,
    shutdown_requested: bool,
}

struct CoreRpcJob {
    priority: CoreRpcPriority,
    command: String,
    phase_name: String,
    cancellation_generation: u64,
    enqueued_at: Instant,
    run: Box<dyn FnOnce(Result<CoreRpcJobContext, CoreRpcDispatchError>) + Send>,
}

struct CoreRpcJobContext {
    dispatcher_wait_ms: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(any(desktop, test)), allow(dead_code))]
pub(crate) enum CoreRpcDispatcherShutdown {
    Joined,
    AlreadyStopped,
    TimedOut,
}

#[cfg_attr(not(any(desktop, test)), allow(dead_code))]
enum WorkerJoinResult {
    Joined,
    Panicked,
    TimedOut(std::thread::JoinHandle<()>),
}

impl CoreRpcDispatcher {
    pub(crate) fn try_new() -> Result<Self, String> {
        let dispatcher = Self {
            inner: Arc::new(DispatcherInner {
                queue: Mutex::new(DispatcherQueue::default()),
                queue_ready: Condvar::new(),
                low_priority_cancellation_generation: AtomicU64::new(0),
                worker_handle: Mutex::new(None),
            }),
        };
        dispatcher.try_spawn_worker()?;
        Ok(dispatcher)
    }

    pub(crate) fn begin_command(&self, policy: CoreRpcCommandPolicy<'_>) -> CoreRpcCommandStart {
        let cancellation_generation = if policy.cancels_low_priority {
            self.cancel_low_priority()
        } else {
            self.low_priority_cancellation_generation()
        };

        CoreRpcCommandStart {
            cancellation_generation,
        }
    }

    pub(crate) fn cancel_low_priority(&self) -> u64 {
        self.inner
            .low_priority_cancellation_generation
            .fetch_add(1, Ordering::SeqCst)
            .saturating_add(1)
    }

    pub(crate) fn low_priority_cancellation_generation(&self) -> u64 {
        self.inner
            .low_priority_cancellation_generation
            .load(Ordering::SeqCst)
    }

    pub(crate) async fn run_adapter_phase<T, F>(
        &self,
        priority: CoreRpcPriority,
        command: impl Into<String>,
        phase_name: impl Into<String>,
        cancellation_generation: u64,
        phase: F,
    ) -> Result<CoreRpcPhaseResult<T>, CoreRpcDispatchError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let (tx, rx) = oneshot::channel();
        let command = command.into();
        let phase_name = phase_name.into();
        let log_command = command.clone();
        let log_phase_name = phase_name.clone();
        let job = CoreRpcJob {
            priority,
            command,
            phase_name,
            cancellation_generation,
            enqueued_at: Instant::now(),
            run: Box::new(move |context| {
                let context = match context {
                    Ok(context) => context,
                    Err(error) => {
                        let _ = tx.send(Err(error));
                        return;
                    }
                };
                let phase_start = Instant::now();
                let value = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(phase)) {
                    Ok(value) => value,
                    Err(_) => {
                        tracing::error!(
                            "core_rpc_dispatcher: adapter phase panicked command={} phase={}",
                            log_command,
                            log_phase_name
                        );
                        let _ = tx.send(Err(CoreRpcDispatchError::PhasePanicked));
                        return;
                    }
                };
                let timing = CoreRpcPhaseTiming {
                    dispatcher_wait_ms: context.dispatcher_wait_ms,
                    adapter_phase_ms: phase_start.elapsed().as_millis(),
                };
                let _ = tx.send(Ok(CoreRpcPhaseResult { value, timing }));
            }),
        };

        self.enqueue(job)?;
        rx.await.map_err(|_| CoreRpcDispatchError::WorkerClosed)?
    }

    pub(crate) async fn run_blocking_phase<T, F>(
        &self,
        priority: CoreRpcPriority,
        command: impl Into<String>,
        phase_name: impl Into<String>,
        cancellation_generation: u64,
        phase: F,
    ) -> Result<CoreRpcPhaseResult<T>, CoreRpcDispatchError>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        self.run_adapter_phase(
            priority,
            command,
            phase_name,
            cancellation_generation,
            phase,
        )
        .await
    }

    fn try_spawn_worker(&self) -> Result<(), String> {
        let mut worker_handle = self
            .inner
            .worker_handle
            .lock()
            .map_err(|_| "Core RPC dispatcher worker handle mutex poisoned".to_string())?;
        let inner = self.inner.clone();
        let handle = std::thread::Builder::new()
            .name("core-rpc-dispatcher".to_string())
            .spawn(move || worker_loop(inner))
            .map_err(|error| format!("spawn core RPC dispatcher worker: {error}"))?;
        *worker_handle = Some(handle);
        Ok(())
    }

    fn enqueue(&self, job: CoreRpcJob) -> Result<(), CoreRpcDispatchError> {
        let mut queue = self
            .inner
            .queue
            .lock()
            .map_err(|_| CoreRpcDispatchError::QueueUnavailable)?;
        if queue.shutdown_requested {
            return Err(CoreRpcDispatchError::WorkerClosed);
        }
        match job.priority {
            CoreRpcPriority::PrivacyCritical => queue.privacy_critical.push_back(job),
            CoreRpcPriority::UserBlocking => queue.user_blocking.push_back(job),
            CoreRpcPriority::LowPriority => queue.low_priority.push_back(job),
        }
        self.inner.queue_ready.notify_one();
        Ok(())
    }

    #[cfg_attr(not(any(desktop, test)), allow(dead_code))]
    fn set_shutdown_requested_and_drain_pending(
        &self,
    ) -> Result<Vec<CoreRpcJob>, CoreRpcDispatchError> {
        let mut queue = self
            .inner
            .queue
            .lock()
            .map_err(|_| CoreRpcDispatchError::QueueUnavailable)?;
        queue.shutdown_requested = true;
        Ok(queue.drain_pending())
    }

    #[cfg_attr(not(any(desktop, test)), allow(dead_code))]
    pub(crate) fn shutdown_with_timeout(
        &self,
        timeout: Duration,
    ) -> Result<CoreRpcDispatcherShutdown, CoreRpcDispatchError> {
        let pending = self.set_shutdown_requested_and_drain_pending()?;
        for job in pending {
            (job.run)(Err(CoreRpcDispatchError::WorkerClosed));
        }
        self.inner.queue_ready.notify_all();

        let mut worker_handle = self
            .inner
            .worker_handle
            .lock()
            .map_err(|_| CoreRpcDispatchError::QueueUnavailable)?;
        let Some(handle) = worker_handle.take() else {
            return Ok(CoreRpcDispatcherShutdown::AlreadyStopped);
        };

        match join_worker_with_timeout(handle, timeout) {
            WorkerJoinResult::Joined => Ok(CoreRpcDispatcherShutdown::Joined),
            WorkerJoinResult::Panicked => {
                tracing::warn!("core_rpc_dispatcher: worker thread panicked during shutdown");
                Ok(CoreRpcDispatcherShutdown::Joined)
            }
            WorkerJoinResult::TimedOut(handle) => {
                tracing::warn!("core_rpc_dispatcher: worker shutdown timed out");
                *worker_handle = Some(handle);
                Ok(CoreRpcDispatcherShutdown::TimedOut)
            }
        }
    }

    #[cfg_attr(not(any(desktop, test)), allow(dead_code))]
    pub(crate) async fn shutdown_with_timeout_async(
        &self,
        timeout: Duration,
    ) -> Result<CoreRpcDispatcherShutdown, String> {
        let dispatcher = self.clone();
        tokio::task::spawn_blocking(move || dispatcher.shutdown_with_timeout(timeout))
            .await
            .map_err(|error| format!("core RPC dispatcher shutdown task failed: {error}"))?
            .map_err(|error| error.to_string())
    }

    #[cfg(test)]
    fn pending_counts(&self) -> (usize, usize, usize) {
        let queue = self
            .inner
            .queue
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        (
            queue.privacy_critical.len(),
            queue.user_blocking.len(),
            queue.low_priority.len(),
        )
    }
}

#[cfg_attr(not(any(desktop, test)), allow(dead_code))]
fn join_worker_with_timeout(
    handle: std::thread::JoinHandle<()>,
    timeout: Duration,
) -> WorkerJoinResult {
    let deadline = Instant::now() + timeout;
    loop {
        if handle.is_finished() {
            return match handle.join() {
                Ok(()) => WorkerJoinResult::Joined,
                Err(_) => WorkerJoinResult::Panicked,
            };
        }

        let now = Instant::now();
        if now >= deadline {
            return WorkerJoinResult::TimedOut(handle);
        }
        std::thread::sleep(Duration::from_millis(10).min(deadline.duration_since(now)));
    }
}

fn worker_loop(inner: Arc<DispatcherInner>) {
    loop {
        let job = {
            let mut queue = match inner.queue.lock() {
                Ok(queue) => queue,
                Err(poisoned) => {
                    tracing::warn!("core_rpc_dispatcher: recovered poisoned queue lock");
                    poisoned.into_inner()
                }
            };
            loop {
                if let Some(job) = pop_next_job(&mut queue) {
                    break Some(job);
                }
                if queue.shutdown_requested {
                    break None;
                }
                queue = match inner.queue_ready.wait(queue) {
                    Ok(queue) => queue,
                    Err(poisoned) => {
                        tracing::warn!(
                            "core_rpc_dispatcher: recovered poisoned queue lock after wait"
                        );
                        poisoned.into_inner()
                    }
                };
            }
        };
        let Some(job) = job else {
            return;
        };

        let dispatcher_wait_ms = job.enqueued_at.elapsed().as_millis();
        let is_cancelled = job.priority == CoreRpcPriority::LowPriority
            && inner
                .low_priority_cancellation_generation
                .load(Ordering::SeqCst)
                != job.cancellation_generation;
        tracing::info!(
            "perf:core_rpc_dispatcher event=start command={} phase={} priority={:?} dispatcher_wait_ms={} cancelled={}",
            job.command,
            job.phase_name,
            job.priority,
            dispatcher_wait_ms,
            is_cancelled
        );
        let command = job.command.clone();
        let phase_name = job.phase_name.clone();
        let run = job.run;
        let context = if is_cancelled {
            Err(CoreRpcDispatchError::Cancelled)
        } else {
            Ok(CoreRpcJobContext { dispatcher_wait_ms })
        };
        if std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            (run)(context);
        }))
        .is_err()
        {
            tracing::error!(
                "core_rpc_dispatcher: job runner panicked command={} phase={}",
                command,
                phase_name
            );
        }
    }
}

fn pop_next_job(queue: &mut DispatcherQueue) -> Option<CoreRpcJob> {
    queue
        .privacy_critical
        .pop_front()
        .or_else(|| queue.user_blocking.pop_front())
        .or_else(|| queue.low_priority.pop_front())
}

impl DispatcherQueue {
    #[cfg_attr(not(any(desktop, test)), allow(dead_code))]
    fn drain_pending(&mut self) -> Vec<CoreRpcJob> {
        let pending_count =
            self.privacy_critical.len() + self.user_blocking.len() + self.low_priority.len();
        let mut pending = Vec::with_capacity(pending_count);
        pending.extend(self.privacy_critical.drain(..));
        pending.extend(self.user_blocking.drain(..));
        pending.extend(self.low_priority.drain(..));
        pending
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use super::*;
    use crate::core_rpc_dispatcher::policy::command_policy;

    fn new_dispatcher() -> CoreRpcDispatcher {
        CoreRpcDispatcher::try_new().expect("core RPC dispatcher")
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn queued_vault_lock_runs_before_queued_low_priority_commit() {
        let dispatcher = new_dispatcher();
        let order = Arc::new(Mutex::new(Vec::new()));
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let first_order = order.clone();
        let first_generation = dispatcher.low_priority_cancellation_generation();
        let first_dispatcher = dispatcher.clone();
        let first = tokio::spawn(async move {
            first_dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::LowPriority,
                    "catalog:media:inspect",
                    "active-read",
                    first_generation,
                    move || {
                        started_tx.send(()).expect("send start");
                        release_rx.recv().expect("release first phase");
                        first_order.lock().expect("order").push("first-low");
                    },
                )
                .await
                .expect("first phase")
        });
        started_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("first phase started");

        let low_order = order.clone();
        let low_generation = dispatcher.low_priority_cancellation_generation();
        let low_dispatcher = dispatcher.clone();
        let low = tokio::spawn(async move {
            low_dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::LowPriority,
                    "catalog:media:inspect",
                    "commit",
                    low_generation,
                    move || {
                        low_order.lock().expect("order").push("queued-low");
                    },
                )
                .await
        });

        let lock_order = order.clone();
        let lock_generation = dispatcher.begin_command(command_policy("vault:lock"));
        let lock_dispatcher = dispatcher.clone();
        let lock = tokio::spawn(async move {
            lock_dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::PrivacyCritical,
                    "vault:lock",
                    "generic",
                    lock_generation.cancellation_generation,
                    move || {
                        lock_order.lock().expect("order").push("vault-lock");
                    },
                )
                .await
                .expect("lock phase")
        });

        wait_for_pending_counts(&dispatcher, (1, 0, 1));
        release_tx.send(()).expect("release first");

        first.await.expect("first join");
        lock.await.expect("lock join");
        let low_result = low.await.expect("low join");
        assert_eq!(low_result, Err(CoreRpcDispatchError::Cancelled));
        assert_eq!(
            order.lock().expect("order").as_slice(),
            ["first-low", "vault-lock"]
        );
        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn queued_blocking_phase_uses_dispatcher_cancellation() {
        let dispatcher = new_dispatcher();
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let first_dispatcher = dispatcher.clone();
        let first = tokio::spawn(async move {
            first_dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::UserBlocking,
                    "test:command",
                    "active",
                    first_dispatcher.low_priority_cancellation_generation(),
                    move || {
                        started_tx.send(()).expect("send start");
                        release_rx.recv().expect("release first phase");
                    },
                )
                .await
                .expect("first phase")
        });
        started_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("first phase started");

        let generation = dispatcher.low_priority_cancellation_generation();
        let low_dispatcher = dispatcher.clone();
        let low = tokio::spawn(async move {
            low_dispatcher
                .run_blocking_phase(
                    CoreRpcPriority::LowPriority,
                    "catalog:media:inspect",
                    "read",
                    generation,
                    || -> () { panic!("cancelled blocking phase should not run") },
                )
                .await
        });

        wait_for_pending_counts(&dispatcher, (0, 0, 1));
        dispatcher.cancel_low_priority();
        release_tx.send(()).expect("release first");

        first.await.expect("first join");
        assert_eq!(
            low.await.expect("low join"),
            Err(CoreRpcDispatchError::Cancelled)
        );
        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );
    }

    #[test]
    fn low_priority_generic_dispatch_is_rejected() {
        let policy = command_policy("catalog:media:inspect");

        assert_eq!(policy.priority, CoreRpcPriority::LowPriority);
        assert!(policy.requires_split_handler);
    }

    #[test]
    fn vault_lock_increments_cancellation_before_waiting() {
        let dispatcher = new_dispatcher();
        let before = dispatcher.low_priority_cancellation_generation();

        let start = dispatcher.begin_command(command_policy("vault:lock"));

        assert_eq!(start.cancellation_generation, before + 1);
        assert_eq!(
            dispatcher.low_priority_cancellation_generation(),
            before + 1
        );
        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn shutdown_rejects_new_jobs_with_worker_closed() {
        let dispatcher = new_dispatcher();

        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );

        let result = dispatcher
            .run_adapter_phase(
                CoreRpcPriority::UserBlocking,
                "test:command",
                "test-phase",
                dispatcher.low_priority_cancellation_generation(),
                || (),
            )
            .await;

        assert_eq!(result, Err(CoreRpcDispatchError::WorkerClosed));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn shutdown_completes_pending_jobs_with_worker_closed() {
        let dispatcher = dispatcher_without_worker();
        let task_dispatcher = dispatcher.clone();
        let task = tokio::spawn(async move {
            task_dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::UserBlocking,
                    "test:command",
                    "test-phase",
                    task_dispatcher.low_priority_cancellation_generation(),
                    || panic!("queued phase should not run after shutdown"),
                )
                .await
        });

        wait_for_pending_counts(&dispatcher, (0, 1, 0));

        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::AlreadyStopped)
        );
        assert_eq!(
            task.await.expect("pending task should join"),
            Err(CoreRpcDispatchError::WorkerClosed)
        );
    }

    #[test]
    fn idle_worker_exits_on_shutdown() {
        let dispatcher = new_dispatcher();

        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );
    }

    #[test]
    fn shutdown_is_idempotent() {
        let dispatcher = new_dispatcher();

        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );
        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::AlreadyStopped)
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn shutdown_timeout_retains_worker_handle_for_retry() {
        let dispatcher = new_dispatcher();
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let task_dispatcher = dispatcher.clone();
        let task = tokio::spawn(async move {
            task_dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::UserBlocking,
                    "test:command",
                    "blocked-phase",
                    task_dispatcher.low_priority_cancellation_generation(),
                    move || {
                        started_tx.send(()).expect("send start");
                        release_rx.recv().expect("release blocked phase");
                        "done"
                    },
                )
                .await
        });
        started_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("blocked phase started");

        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_millis(10)),
            Ok(CoreRpcDispatcherShutdown::TimedOut)
        );

        let rejected = dispatcher
            .run_adapter_phase(
                CoreRpcPriority::UserBlocking,
                "test:command",
                "rejected-phase",
                dispatcher.low_priority_cancellation_generation(),
                || (),
            )
            .await;
        assert_eq!(rejected, Err(CoreRpcDispatchError::WorkerClosed));

        release_tx.send(()).expect("release blocked phase");
        let result = task
            .await
            .expect("blocked task should join")
            .expect("blocked phase should complete");
        assert_eq!(result.value, "done");
        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );
    }

    #[tokio::test]
    async fn shutdown_with_timeout_async_joins_idle_worker() {
        let dispatcher = new_dispatcher();

        assert_eq!(
            dispatcher
                .shutdown_with_timeout_async(Duration::from_secs(1))
                .await
                .expect("async shutdown should succeed"),
            CoreRpcDispatcherShutdown::Joined
        );
        assert_eq!(
            dispatcher
                .shutdown_with_timeout_async(Duration::ZERO)
                .await
                .expect("second async shutdown should succeed"),
            CoreRpcDispatcherShutdown::AlreadyStopped
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn run_adapter_phase_returns_error_when_queue_is_poisoned() {
        let dispatcher = dispatcher_without_worker();
        let inner = dispatcher.inner.clone();
        let _ = std::thread::spawn(move || {
            let _guard = inner.queue.lock().expect("test queue lock");
            panic!("poison dispatcher queue for test");
        })
        .join();

        let result = dispatcher
            .run_adapter_phase(
                CoreRpcPriority::UserBlocking,
                "test:command",
                "test-phase",
                dispatcher.low_priority_cancellation_generation(),
                || (),
            )
            .await;

        assert_eq!(result, Err(CoreRpcDispatchError::QueueUnavailable));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn panicked_adapter_phase_returns_error_and_worker_accepts_later_jobs() {
        let dispatcher = new_dispatcher();

        let result = dispatcher
            .run_adapter_phase(
                CoreRpcPriority::UserBlocking,
                "test:panic",
                "panic-phase",
                dispatcher.low_priority_cancellation_generation(),
                || -> () { panic!("adapter phase panic for test") },
            )
            .await;

        assert_eq!(result, Err(CoreRpcDispatchError::PhasePanicked));

        let later = dispatcher
            .run_adapter_phase(
                CoreRpcPriority::UserBlocking,
                "test:later",
                "later-phase",
                dispatcher.low_priority_cancellation_generation(),
                || "ok",
            )
            .await
            .expect("worker should accept later jobs after panic");
        assert_eq!(later.value, "ok");
        assert_eq!(
            dispatcher.shutdown_with_timeout(Duration::from_secs(2)),
            Ok(CoreRpcDispatcherShutdown::Joined)
        );
    }

    fn wait_for_pending_counts(dispatcher: &CoreRpcDispatcher, expected: (usize, usize, usize)) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if dispatcher.pending_counts() == expected {
                return;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(dispatcher.pending_counts(), expected);
    }

    fn dispatcher_without_worker() -> CoreRpcDispatcher {
        CoreRpcDispatcher {
            inner: Arc::new(DispatcherInner {
                queue: Mutex::new(DispatcherQueue::default()),
                queue_ready: Condvar::new(),
                low_priority_cancellation_generation: AtomicU64::new(0),
                worker_handle: Mutex::new(None),
            }),
        }
    }
}
