use super::HostResponderTaskRuntime;
use std::time::Duration;
use tokio::task::JoinHandle;

const POISON_ERROR: &str = "host responder mutex poisoned";

fn pending_task() -> JoinHandle<()> {
    tokio::spawn(std::future::pending())
}

async fn assert_cancelled(task: JoinHandle<()>) {
    let error = tokio::time::timeout(Duration::from_secs(2), task)
        .await
        .expect("responder must stop")
        .expect_err("responder must be cancelled");
    assert!(error.is_cancelled());
}

#[tokio::test]
async fn replacement_aborts_previous_task_and_rejects_its_late_store() {
    let runtime = HostResponderTaskRuntime::new();
    let first = runtime.begin(POISON_ERROR).unwrap();
    let task = pending_task();
    runtime
        .store(first, task.abort_handle(), POISON_ERROR)
        .unwrap();

    let second = runtime.begin(POISON_ERROR).unwrap();
    assert!(!runtime.is_generation_current(first));
    assert!(runtime.is_generation_current(second));
    assert_cancelled(task).await;

    let late_task = pending_task();
    runtime
        .store(first, late_task.abort_handle(), POISON_ERROR)
        .unwrap();
    assert_cancelled(late_task).await;

    let (resume, resumed) = tokio::sync::oneshot::channel();
    let (alive, observed_alive) = tokio::sync::oneshot::channel();
    let current = tokio::spawn(async move {
        resumed.await.unwrap();
        alive.send(()).unwrap();
        std::future::pending::<()>().await;
    });
    runtime
        .store(second, current.abort_handle(), POISON_ERROR)
        .unwrap();
    runtime.clear_if_current(first, POISON_ERROR).unwrap();
    resume.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(2), observed_alive)
        .await
        .expect("current responder must remain live after stale completion")
        .expect("current responder acknowledged work");
    runtime.cancel(POISON_ERROR).unwrap();
    assert!(!runtime.is_generation_current(second));
    assert_cancelled(current).await;
}

#[tokio::test]
async fn cancellation_before_store_aborts_late_task_and_allows_restart() {
    let runtime = HostResponderTaskRuntime::new();
    let generation = runtime.begin(POISON_ERROR).unwrap();
    runtime.cancel(POISON_ERROR).unwrap();
    let late_task = pending_task();
    runtime
        .store(generation, late_task.abort_handle(), POISON_ERROR)
        .unwrap();
    assert_cancelled(late_task).await;

    let restarted = runtime.begin(POISON_ERROR).unwrap();
    let task = pending_task();
    runtime
        .store(restarted, task.abort_handle(), POISON_ERROR)
        .unwrap();
    runtime.cancel(POISON_ERROR).unwrap();
    assert_cancelled(task).await;
}

#[tokio::test]
async fn clearing_current_task_releases_cancellation_without_aborting_it() {
    let runtime = HostResponderTaskRuntime::new();
    let generation = runtime.begin(POISON_ERROR).unwrap();
    let (finish, finished) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move { finished.await.expect("finish signal") });
    runtime
        .store(generation, task.abort_handle(), POISON_ERROR)
        .unwrap();

    runtime.clear_if_current(generation, POISON_ERROR).unwrap();
    assert!(runtime.is_generation_current(generation));
    runtime.cancel(POISON_ERROR).unwrap();
    finish.send(()).expect("cleared task still running");
    tokio::time::timeout(Duration::from_secs(2), task)
        .await
        .expect("task must finish")
        .expect("cleared task must not be aborted");
}

#[tokio::test]
async fn poisoned_owner_returns_caller_error_and_aborts_incoming_task() {
    let runtime = HostResponderTaskRuntime::new();
    let generation = runtime.begin(POISON_ERROR).unwrap();
    let _ = std::panic::catch_unwind(|| {
        let _guard = runtime.task.lock().unwrap();
        panic!("poison the responder owner");
    });

    assert_eq!(runtime.begin(POISON_ERROR).unwrap_err(), POISON_ERROR);
    assert_eq!(runtime.cancel(POISON_ERROR).unwrap_err(), POISON_ERROR);
    assert_eq!(
        runtime
            .clear_if_current(generation, POISON_ERROR)
            .unwrap_err(),
        POISON_ERROR
    );
    let task = pending_task();
    assert_eq!(
        runtime
            .store(generation, task.abort_handle(), POISON_ERROR)
            .unwrap_err(),
        POISON_ERROR
    );
    assert_cancelled(task).await;
}
