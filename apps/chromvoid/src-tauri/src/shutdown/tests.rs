use super::desktop_exit::{
    drain_volume_and_disconnect_mobile_usb, BACKEND_JOIN_EXIT_GRACE, VOLUME_UNMOUNT_EXIT_BUDGET,
};
use super::signal::exit_request_should_intercept;
use super::*;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use crate::commands::volume_ops::volume_join_timeout;

#[test]
fn exit_request_intercepts_only_once() {
    let guard = AtomicBool::new(false);
    assert!(exit_request_should_intercept(&guard));
    assert!(!exit_request_should_intercept(&guard));
}

#[tokio::test]
async fn exit_requested_then_exit_waits_for_same_cleanup_once() {
    use tokio::sync::oneshot;

    let guard = AtomicBool::new(false);
    let mut cleanup = None;
    let mut starts = 0;
    let (release_tx, release_rx) = oneshot::channel();
    let (goodbye_tx, mut goodbye_rx) = oneshot::channel();
    assert!(DesktopExitCleanupMode::Async
        .dispatch(&guard, &mut cleanup, || {
            starts += 1;
            tauri::async_runtime::spawn(async move {
                release_rx.await.expect("release cleanup");
                let _ = goodbye_tx.send(());
            })
        })
        .is_none());
    let original_started = cleanup.as_ref().expect("stored cleanup").0;
    let original_task = cleanup.as_ref().expect("stored cleanup").1.inner().id();
    assert!(DesktopExitCleanupMode::Async
        .dispatch(&guard, &mut cleanup, || panic!("duplicate cleanup"))
        .is_none());

    let pending = DesktopExitCleanupMode::Blocking
        .dispatch(&guard, &mut cleanup, || panic!("duplicate cleanup"))
        .expect("native Exit must wait for the in-progress cleanup");
    assert_eq!(pending.0, original_started);
    assert_eq!(pending.1.inner().id(), original_task);
    assert_eq!(starts, 1);

    let (waiting_tx, waiting_rx) = oneshot::channel();
    let mut waiter = tauri::async_runtime::spawn_blocking(move || {
        let _ = waiting_tx.send(());
        wait_desktop_exit_cleanup(pending);
    });
    waiting_rx.await.expect("native Exit waiter started");
    let still_waiting = tokio::time::timeout(Duration::from_millis(20), &mut waiter).await;
    let _ = release_tx.send(());
    tokio::time::timeout(Duration::from_secs(1), waiter)
        .await
        .expect("native Exit waiter must finish within budget")
        .expect("native Exit waiter joined");
    assert!(
        still_waiting.is_err(),
        "Exit must wait while cleanup is pending"
    );
    goodbye_rx
        .try_recv()
        .expect("cleanup completed before Exit");
    assert!(DesktopExitCleanupMode::Blocking
        .dispatch(&guard, &mut cleanup, || panic!("duplicate cleanup"))
        .is_none());
}

#[test]
fn exit_without_exit_requested_runs_blocking_cleanup_once() {
    let guard = AtomicBool::new(false);
    let mut cleanup = None;
    let mut starts = 0;
    let task = DesktopExitCleanupMode::Blocking
        .dispatch(&guard, &mut cleanup, || {
            starts += 1;
            tauri::async_runtime::spawn(async {})
        })
        .expect("native Exit cleanup");
    wait_desktop_exit_cleanup(task);
    assert_eq!(starts, 1);
    assert!(DesktopExitCleanupMode::Blocking
        .dispatch(&guard, &mut cleanup, || panic!("duplicate cleanup"))
        .is_none());
}

#[test]
fn volume_join_timeout_applies_budget_cap() {
    let timeout = volume_join_timeout(Duration::from_secs(12), Some(Duration::from_secs(5)));
    assert_eq!(timeout, Duration::from_secs(5));
}

#[test]
fn volume_join_timeout_still_clamps_without_budget() {
    let timeout = volume_join_timeout(Duration::from_secs(40), None);
    assert_eq!(timeout, Duration::from_secs(15));
}
#[tokio::test]
async fn blocked_volume_cleanup_still_attempts_usb_goodbye_within_budget() {
    use std::sync::{mpsc, Arc, Mutex};

    use chromvoid_core::rpc::types::RpcResponse;
    use chromvoid_core::rpc::RpcReply;
    use tokio::sync::oneshot;

    let budget = VOLUME_UNMOUNT_EXIT_BUDGET + BACKEND_JOIN_EXIT_GRACE;
    let volume_mutex = Arc::new(Mutex::new(()));
    let (locked_tx, locked_rx) = oneshot::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let held_mutex = volume_mutex.clone();
    let holder = std::thread::spawn(move || {
        let _guard = held_mutex.lock().expect("volume mutex");
        let _ = locked_tx.send(());
        // Release even if the deadline regresses, so the test fails instead of hanging.
        let _ = release_rx.recv_timeout(budget + Duration::from_secs(2));
    });
    locked_rx.await.expect("volume mutex held");

    let remote_io = crate::remote_io_runtime::RemoteIoRuntimeState::new();
    let (req_tx, mut req_rx) =
        tokio::sync::mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
    let (goodbye_tx, mut goodbye_rx) = oneshot::channel();
    let io_task = tokio::spawn(async move {
        let request = req_rx.recv().await.expect("USB goodbye request");
        assert_eq!(request.request.command, "mobile_usb:session_disconnect");
        let _ = goodbye_tx.send(tokio::time::Instant::now());
        let _ = request.reply_tx.send(RpcReply::Json(RpcResponse::success(
            serde_json::Value::Null,
        )));
        std::future::pending::<()>().await;
    });
    remote_io
        .store_test_mobile_usb_session(req_tx, io_task)
        .expect("mobile USB session");

    let (started_tx, mut started_rx) = oneshot::channel();
    let (finished_tx, finished_rx) = oneshot::channel();
    let started = tokio::time::Instant::now();
    let result = tokio::time::timeout(
        budget + Duration::from_secs(1),
        drain_volume_and_disconnect_mobile_usb(
            async move {
                let _ = started_tx.send(());
                let _guard = volume_mutex.lock().expect("blocked volume mutex");
                let _ = finished_tx.send(());
            },
            &remote_io,
        ),
    )
    .await;

    let _ = release_tx.send(());
    holder.join().expect("mutex holder joined");
    result.expect("USB goodbye must not wait for the blocked volume cleanup");
    started_rx.try_recv().expect("blocking cleanup started");
    let goodbye_at = goodbye_rx.try_recv().expect("USB goodbye attempted");
    assert!(goodbye_at.duration_since(started) >= budget);
    assert!(goodbye_at.duration_since(started) < budget + Duration::from_secs(1));
    tokio::time::timeout(Duration::from_secs(1), finished_rx)
        .await
        .expect("released cleanup completes")
        .expect("cleanup finished");
}
