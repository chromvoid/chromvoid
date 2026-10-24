use std::sync::Arc;
use std::time::{Duration, Instant};

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use serde_json::json;
use tempfile::TempDir;

use super::super::tests::{phase, session};
use super::{LocalSession, SessionError, SessionPhase};

async fn unlock(runtime: &LocalSession, request: u64, generation: u64) {
    assert!(
        runtime
            .execute(
                request,
                generation,
                RpcRequest::new("vault:unlock", json!({"password": "synthetic idle vault"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
}

#[tokio::test]
async fn auto_lock_revokes_queued_work_and_locks_core_without_writing() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    unlock(&runtime, 1, 1).await;
    let queued = runtime.admit(2, 1, RpcRequest::new("passmanager:entry:create", json!({
        "entry_id": "idle-revoked", "title": "Must not be written", "username": "synthetic",
        "secrets": {"password": "synthetic"}, "entry_type": "login"
    }))).unwrap();
    runtime
        .set_auto_lock_timeout(1, Duration::from_millis(100))
        .unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    let locked = runtime.snapshot().unwrap();
    assert!(locked.generation > 1 && !locked.cleanup_pending);
    assert_eq!(
        runtime.execute_admitted(queued).await.unwrap_err(),
        SessionError::Revoked
    );
    assert!(!runtime.inner.adapter.lock().unwrap().is_unlocked());
    runtime
        .set_auto_lock_timeout(locked.generation, Duration::ZERO)
        .unwrap();
    unlock(&runtime, 3, locked.generation).await;
    let entries = runtime
        .execute(
            4,
            locked.generation,
            RpcRequest::new("passmanager:entry:list", json!({})),
        )
        .await
        .unwrap();
    assert_eq!(entries.result().unwrap()["entries"], json!([]));
}

#[tokio::test]
async fn auto_lock_metadata_polling_does_not_extend_the_idle_interval() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    unlock(&runtime, 1, 1).await;
    runtime
        .set_auto_lock_timeout(1, Duration::from_millis(500))
        .unwrap();
    let mut request = 2;
    let mut reads = 0;
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut ticks = tokio::time::interval(Duration::from_millis(30));
        loop {
            ticks.tick().await;
            match runtime
                .execute(request, 1, RpcRequest::new("vault:status", json!({})))
                .await
            {
                Ok(reply) => {
                    assert!(reply.is_ok());
                    reads += 1;
                }
                Err(SessionError::Revoked) => break,
                Err(error) => panic!("unexpected metadata error: {error:?}"),
            }
            request += 1;
        }
    })
    .await
    .expect("reads must not keep the vault unlocked");
    assert!(reads > 1);
    phase(&runtime, SessionPhase::Locked).await;
}

#[tokio::test]
async fn auto_lock_user_activity_extends_the_interval_then_idle_locks() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    runtime
        .set_auto_lock_timeout(1, Duration::from_secs(1))
        .unwrap();
    unlock(&runtime, 1, 1).await;
    let started = Instant::now();
    let mut ticks = tokio::time::interval(Duration::from_millis(100));
    while started.elapsed() < Duration::from_millis(1300) {
        ticks.tick().await;
        runtime.record_user_activity(1).unwrap();
        assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Unlocked);
    }
    phase(&runtime, SessionPhase::Locked).await;
}

#[tokio::test]
async fn auto_lock_disable_cancels_deadline_and_drop_releases_the_monitor() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    unlock(&runtime, 1, 1).await;
    runtime
        .set_auto_lock_timeout(1, Duration::from_millis(100))
        .unwrap();
    runtime.set_auto_lock_timeout(1, Duration::ZERO).unwrap();
    let snapshot = runtime.snapshot().unwrap();
    assert!(
        tokio::time::timeout(
            Duration::from_millis(200),
            runtime.events(snapshot.sequence)
        )
        .await
        .is_err()
    );
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Unlocked);
    let lease = runtime.lease();
    drop(runtime);
    tokio::time::timeout(Duration::from_secs(5), async {
        while lease.is_alive() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("the monitor must not retain a dropped session");
}

#[tokio::test]
async fn auto_lock_late_input_or_disabling_cannot_resurrect_expired_authority() {
    for disable in [false, true] {
        let root = TempDir::new().unwrap();
        let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
        unlock(&runtime, 1, 1).await;
        runtime.lock().unwrap();
        phase(&runtime, SessionPhase::Locked).await;
        let generation = runtime.snapshot().unwrap().generation;
        unlock(&runtime, 2, generation).await;
        {
            // Control the clock boundary without starting the monitor, so this specifically
            // tests admission before the timer thread has had a chance to revoke authority.
            let mut authority = runtime.inner.authority.lock().unwrap();
            authority.auto_lock.timeout = Duration::from_secs(1);
            authority.auto_lock.last_activity = Some(Instant::now() - Duration::from_secs(2));
        }
        assert_eq!(
            runtime.record_user_activity(generation - 1),
            Err(SessionError::Revoked)
        );
        assert_eq!(runtime.snapshot().unwrap().generation, generation);
        assert!(matches!(
            runtime.admit(3, generation, RpcRequest::new("vault:status", json!({}))),
            Err(SessionError::Revoked)
        ));
        let result = if disable {
            runtime.set_auto_lock_timeout(generation, Duration::ZERO)
        } else {
            runtime.record_user_activity(generation)
        };
        assert_eq!(result, Err(SessionError::Revoked));
        phase(&runtime, SessionPhase::Locked).await;
        assert!(runtime.snapshot().unwrap().generation > generation);
    }
}

#[tokio::test]
async fn auto_lock_failed_cleanup_wakes_untimed_inactivity_waiters() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let inner = runtime.inner.clone();
    let (adapter_held, held) = tokio::sync::oneshot::channel();
    let (release, released) = std::sync::mpsc::channel();
    let fault = std::thread::spawn(move || {
        let _adapter = inner.adapter.lock().unwrap();
        adapter_held.send(()).unwrap();
        released.recv().unwrap();
        panic!("synthetic adapter failure during delayed lock cleanup");
    });
    held.await.unwrap();
    let inner = runtime.inner.clone();
    let (waiting, is_waiting) = tokio::sync::oneshot::channel();
    let (finished, completion) = tokio::sync::oneshot::channel();
    let waiter = std::thread::spawn(move || {
        let mut waiting = Some(waiting);
        let mut authority = inner.authority.lock().unwrap();
        loop {
            if authority.snapshot.phase == SessionPhase::Failed {
                let _ = finished.send(());
                break;
            }
            if authority.snapshot.phase == SessionPhase::Deactivating {
                if let Some(waiting) = waiting.take() {
                    let _ = waiting.send(());
                }
            }
            authority = inner.idle_changed.wait(authority).unwrap();
        }
    });
    runtime.lock().unwrap();
    is_waiting.await.unwrap();
    // Acquiring authority after the signal fences the waiter's atomic mutex-release/wait.
    drop(runtime.inner.authority.lock().unwrap());
    release.send(()).unwrap();
    assert!(fault.join().is_err());
    let outcome = tokio::time::timeout(Duration::from_secs(2), completion).await;
    // Release the waiter even when testing a missing terminal notification.
    let _ = runtime.close();
    waiter.join().unwrap();
    assert!(
        outcome.is_ok(),
        "failed cleanup must wake the inactivity scheduler"
    );
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Failed);
}
