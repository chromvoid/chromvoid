use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::async_runtime::JoinHandle;
use tokio::time::Instant as TokioInstant;
use tracing::warn;

use super::backend::VolumeBackendHandle;

const VOLUME_BACKEND_JOIN_RUNTIME_POISONED: &str = "Volume backend join runtime mutex poisoned";

pub(crate) const VOLUME_BACKGROUND_JOIN_TIMEOUT: Duration = Duration::from_secs(3);

struct VolumeBackendJoinTask {
    handle: JoinHandle<()>,
    fuse_staging_dir: Option<PathBuf>,
}

pub(crate) struct VolumeBackendJoinRuntimeState {
    shutdown_requested: AtomicBool,
    next_task_id: AtomicU64,
    tasks: Mutex<HashMap<u64, VolumeBackendJoinTask>>,
}

impl VolumeBackendJoinRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            shutdown_requested: AtomicBool::new(false),
            next_task_id: AtomicU64::new(1),
            tasks: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn spawn_join_backend(
        &self,
        mut handle: VolumeBackendHandle,
        timeout: Duration,
    ) -> Result<u64, String> {
        let fuse_staging_dir = handle.fuse_staging_dir();
        let mut tasks = match self.tasks.lock() {
            Ok(tasks) => tasks,
            Err(_) => {
                handle.shutdown();
                cleanup_fuse_staging_dir(fuse_staging_dir.as_ref());
                return Err(VOLUME_BACKEND_JOIN_RUNTIME_POISONED.to_string());
            }
        };
        prune_finished_tasks(&mut tasks);

        if self.shutdown_requested.load(Ordering::Acquire) {
            handle.shutdown();
            cleanup_fuse_staging_dir(fuse_staging_dir.as_ref());
            return Err("Volume backend join runtime shutdown requested".to_string());
        }

        let task_id = self.next_task_id.fetch_add(1, Ordering::AcqRel);
        let task_staging_dir = fuse_staging_dir.clone();
        let join_handle = tauri::async_runtime::spawn(async move {
            if tokio::time::timeout(timeout, handle.join()).await.is_err() {
                cleanup_fuse_staging_dir(task_staging_dir.as_ref());
            }
        });

        tasks.insert(
            task_id,
            VolumeBackendJoinTask {
                handle: join_handle,
                fuse_staging_dir,
            },
        );
        Ok(task_id)
    }

    pub(crate) async fn shutdown_with_grace(&self, grace: Duration) -> Result<(), String> {
        self.shutdown_requested.store(true, Ordering::Release);

        let tasks = {
            let mut tasks = self
                .tasks
                .lock()
                .map_err(|_| VOLUME_BACKEND_JOIN_RUNTIME_POISONED.to_string())?;
            prune_finished_tasks(&mut tasks);
            tasks.drain().map(|(_, task)| task).collect::<Vec<_>>()
        };

        wait_for_tasks_to_finish(&tasks, grace).await;

        for task in tasks {
            if task.handle.inner().is_finished() {
                continue;
            }
            task.handle.abort();
            cleanup_fuse_staging_dir(task.fuse_staging_dir.as_ref());
        }

        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn active_task_count_for_test(&self) -> Result<usize, String> {
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| VOLUME_BACKEND_JOIN_RUNTIME_POISONED.to_string())?;
        prune_finished_tasks(&mut tasks);
        Ok(tasks.len())
    }

    #[cfg(test)]
    fn poison_tasks_for_test(&self) {
        let _guard = self.tasks.lock().expect("join runtime lock");
        panic!("poison volume backend join runtime");
    }
}

impl Default for VolumeBackendJoinRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

fn prune_finished_tasks(tasks: &mut HashMap<u64, VolumeBackendJoinTask>) {
    tasks.retain(|_, task| !task.handle.inner().is_finished());
}

async fn wait_for_tasks_to_finish(tasks: &[VolumeBackendJoinTask], grace: Duration) {
    if grace.is_zero() {
        return;
    }

    let deadline = TokioInstant::now() + grace;
    while tasks.iter().any(|task| !task.handle.inner().is_finished()) {
        let now = TokioInstant::now();
        if now >= deadline {
            break;
        }
        tokio::time::sleep((deadline - now).min(Duration::from_millis(10))).await;
    }
}

pub(crate) fn cleanup_fuse_staging_dir(dir: Option<&PathBuf>) {
    let Some(dir) = dir else {
        return;
    };
    if let Err(error) = std::fs::remove_dir_all(dir) {
        if dir.exists() {
            warn!(
                "volume backend join: failed to remove FUSE staging dir {}: {}",
                dir.display(),
                error
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use std::time::Duration;

    use tempfile::tempdir;
    use tokio::sync::{mpsc, oneshot};

    use super::*;
    use crate::volume_manager::{FuseSessionHandle, VolumeBackendHandle};

    fn fuse_backend_with_pending_task(staging_dir: PathBuf) -> VolumeBackendHandle {
        let mountpoint = staging_dir
            .parent()
            .expect("staging dir parent")
            .join("mount");
        let (shutdown_tx, _shutdown_rx) = mpsc::channel(1);
        let task = tokio::spawn(async {
            std::future::pending::<()>().await;
        });
        let handle = FuseSessionHandle::new(
            mountpoint,
            staging_dir,
            Arc::new(AtomicBool::new(false)),
            shutdown_tx,
            task,
        );
        VolumeBackendHandle::Fuse(handle)
    }

    fn fuse_backend_with_releasable_task(
        staging_dir: PathBuf,
    ) -> (VolumeBackendHandle, oneshot::Sender<()>) {
        let mountpoint = staging_dir
            .parent()
            .expect("staging dir parent")
            .join("mount");
        let (shutdown_tx, _shutdown_rx) = mpsc::channel(1);
        let (release_tx, release_rx) = oneshot::channel();
        let task = tokio::spawn(async {
            let _ = release_rx.await;
        });
        let handle = FuseSessionHandle::new(
            mountpoint,
            staging_dir,
            Arc::new(AtomicBool::new(false)),
            shutdown_tx,
            task,
        );
        (VolumeBackendHandle::Fuse(handle), release_tx)
    }

    fn fuse_backend_with_completed_task(staging_dir: PathBuf) -> VolumeBackendHandle {
        let mountpoint = staging_dir
            .parent()
            .expect("staging dir parent")
            .join("mount");
        let (shutdown_tx, _shutdown_rx) = mpsc::channel(1);
        let task = tokio::spawn(async {});
        let handle = FuseSessionHandle::new(
            mountpoint,
            staging_dir,
            Arc::new(AtomicBool::new(false)),
            shutdown_tx,
            task,
        );
        VolumeBackendHandle::Fuse(handle)
    }

    #[tokio::test]
    async fn runtime_prunes_completed_join_tasks() {
        let temp = tempdir().expect("tempdir");
        let staging_dir = temp.path().join("staging");
        std::fs::create_dir_all(&staging_dir).expect("create staging dir");
        let runtime = VolumeBackendJoinRuntimeState::new();

        runtime
            .spawn_join_backend(
                fuse_backend_with_completed_task(staging_dir),
                Duration::from_secs(1),
            )
            .expect("spawn join task");

        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(
            runtime
                .active_task_count_for_test()
                .expect("active count should succeed"),
            0
        );
    }

    #[tokio::test]
    async fn runtime_timeout_removes_fuse_staging_dir() {
        let temp = tempdir().expect("tempdir");
        let staging_dir = temp.path().join("staging");
        std::fs::create_dir_all(&staging_dir).expect("create staging dir");
        let runtime = VolumeBackendJoinRuntimeState::new();

        runtime
            .spawn_join_backend(
                fuse_backend_with_pending_task(staging_dir.clone()),
                Duration::from_millis(10),
            )
            .expect("spawn join task");

        tokio::time::sleep(Duration::from_millis(80)).await;

        assert!(!staging_dir.exists(), "timeout must remove staging dir");
    }

    #[tokio::test]
    async fn shutdown_aborts_pending_tasks_and_removes_fuse_staging_dir() {
        let temp = tempdir().expect("tempdir");
        let staging_dir = temp.path().join("staging");
        std::fs::create_dir_all(&staging_dir).expect("create staging dir");
        let runtime = VolumeBackendJoinRuntimeState::new();

        runtime
            .spawn_join_backend(
                fuse_backend_with_pending_task(staging_dir.clone()),
                Duration::from_secs(30),
            )
            .expect("spawn join task");

        runtime
            .shutdown_with_grace(Duration::from_millis(1))
            .await
            .expect("shutdown should succeed");

        assert!(!staging_dir.exists(), "shutdown must remove staging dir");
        assert_eq!(
            runtime
                .active_task_count_for_test()
                .expect("active count should succeed"),
            0
        );
    }

    #[tokio::test]
    async fn shutdown_returns_when_join_tasks_finish_before_grace() {
        let temp = tempdir().expect("tempdir");
        let staging_dir = temp.path().join("staging");
        std::fs::create_dir_all(&staging_dir).expect("create staging dir");
        let runtime = VolumeBackendJoinRuntimeState::new();
        let (backend, release_tx) = fuse_backend_with_releasable_task(staging_dir.clone());

        runtime
            .spawn_join_backend(backend, Duration::from_secs(30))
            .expect("spawn join task");

        let started = TokioInstant::now();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            let _ = release_tx.send(());
        });
        runtime
            .shutdown_with_grace(Duration::from_secs(1))
            .await
            .expect("shutdown should succeed");

        assert!(
            started.elapsed() < Duration::from_millis(500),
            "shutdown should not wait full grace once join tasks finish"
        );
        assert!(
            !staging_dir.exists(),
            "completed join must remove staging dir"
        );
    }

    #[tokio::test]
    async fn shutdown_rejects_new_join_tasks() {
        let temp = tempdir().expect("tempdir");
        let staging_dir = temp.path().join("staging");
        std::fs::create_dir_all(&staging_dir).expect("create staging dir");
        let runtime = VolumeBackendJoinRuntimeState::new();

        runtime
            .shutdown_with_grace(Duration::ZERO)
            .await
            .expect("shutdown should succeed");

        let error = runtime
            .spawn_join_backend(
                fuse_backend_with_pending_task(staging_dir),
                Duration::from_secs(1),
            )
            .expect_err("shutdown runtime should reject new tasks");

        assert_eq!(error, "Volume backend join runtime shutdown requested");
    }

    #[test]
    fn poisoned_runtime_mutex_returns_controlled_error() {
        let runtime = Arc::new(VolumeBackendJoinRuntimeState::new());
        let poisoned_runtime = runtime.clone();
        let _ = std::thread::spawn(move || poisoned_runtime.poison_tasks_for_test()).join();

        let error = runtime
            .active_task_count_for_test()
            .expect_err("poisoned runtime should fail");

        assert_eq!(error, VOLUME_BACKEND_JOIN_RUNTIME_POISONED);
    }
}
