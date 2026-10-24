use super::*;
use crate::session::tests::{phase, session, storage_tree};
use chromvoid_core::crypto::keystore::{InMemoryKeystore, Keystore, KeystoreError};
use serde_json::json;
use tempfile::TempDir;

const MASTER: &str = "synthetic erase administrator";

async fn configured(root: &TempDir, key: Arc<dyn Keystore>) -> LocalSession {
    let runtime = session(root, key);
    for (id, command, data) in [
        (1, "master:setup", json!({"master_password":MASTER})),
        (2, "vault:unlock", json!({"password":"synthetic vault"})),
        (3, "catalog:createDir", json!({"name":"erase fixture"})),
    ] {
        assert!(
            runtime
                .execute(id, 1, RpcRequest::new(command, data))
                .await
                .unwrap()
                .is_ok()
        );
    }
    runtime.lock().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    runtime
}

async fn reviewed(runtime: &LocalSession) -> EraseHandle {
    let handle = runtime
        .begin_storage_erase(runtime.snapshot().unwrap().generation)
        .unwrap();
    let request = runtime.review_storage_erase(4, &handle).unwrap();
    let result = runtime.execute_admitted(request).await.unwrap();
    assert!(result.is_ok());
    // Core's confirmation token never crosses the ordinary response boundary.
    assert_eq!(result.result(), Some(&serde_json::Value::Null));
    assert_eq!(handle.preview().unwrap().storage_paths.len(), 1);
    handle
}

#[tokio::test]
async fn adoption_guard_rechecks_admitted_erase_before_storage_and_pepper_deletion() {
    use chromvoid_core::rpc::{StorageMutationError, StorageMutationGuard};

    let root = TempDir::new().unwrap();
    let key = Arc::new(InMemoryKeystore::new());
    let denied = Arc::new(AtomicBool::new(false));
    let policy = denied.clone();
    let adapter = LocalCoreAdapter::new_with_keystore(root.path().join("storage"), key.clone())
        .unwrap()
        .with_storage_mutation_guard(StorageMutationGuard::new(move || {
            if policy.load(Ordering::SeqCst) {
                Err(StorageMutationError::AdoptionRequired)
            } else {
                Ok(())
            }
        }));
    let runtime = LocalSession::new(adapter).unwrap();
    for (id, command, data) in [
        (1, "master:setup", json!({"master_password":MASTER})),
        (2, "vault:unlock", json!({"password":"synthetic vault"})),
        (
            3,
            "catalog:createDir",
            json!({"name":"guarded vault content"}),
        ),
    ] {
        assert!(
            runtime
                .execute(id, 1, RpcRequest::new(command, data))
                .await
                .unwrap()
                .is_ok()
        );
    }
    runtime.lock().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    let handle = reviewed(&runtime).await;
    let commit = runtime
        .commit_storage_erase(5, &handle, MASTER.into())
        .unwrap();
    let pepper = key.load_storage_pepper().unwrap();
    let before = storage_tree(root.path());
    denied.store(true, Ordering::SeqCst);
    assert!(matches!(
        runtime.commit_storage_erase(6, &handle, MASTER.into()),
        Err(EraseError::Session(SessionError::AdoptionRequired))
    ));
    let response = runtime.execute_admitted(commit).await.unwrap();
    assert_eq!(response.code(), Some("ADOPTION_ACTION_FORBIDDEN"));
    assert_eq!(runtime.snapshot().unwrap().generation, generation);
    assert!(handle.receipt().unwrap().is_none());
    assert_eq!(key.load_storage_pepper().unwrap(), pepper);
    assert_eq!(storage_tree(root.path()), before);
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}

#[tokio::test]
async fn password_retry_then_erase_preserves_a_receipt_after_generation_revocation() {
    let root = TempDir::new().unwrap();
    let key = Arc::new(InMemoryKeystore::new());
    let runtime = configured(&root, key.clone()).await;
    let generation = runtime.snapshot().unwrap().generation;
    let handle = reviewed(&runtime).await;
    let denied = runtime
        .commit_storage_erase(5, &handle, "wrong".into())
        .unwrap();
    assert_eq!(
        runtime.execute_admitted(denied).await.unwrap().code(),
        Some("INVALID_MASTER_PASSWORD")
    );
    assert_eq!(runtime.snapshot().unwrap().generation, generation);
    assert!(handle.receipt().unwrap().is_none());
    assert!(handle.preview().is_ok());
    assert!(key.load_storage_pepper().unwrap().is_some());
    let erase = runtime
        .commit_storage_erase(6, &handle, MASTER.into())
        .unwrap();
    assert_eq!(
        runtime.execute_admitted(erase).await.unwrap_err(),
        SessionError::Revoked
    );
    let Some(EraseReceipt::Completed(stats)) = handle.receipt().unwrap() else {
        panic!("Actual deletion must produce its own receipt");
    };
    assert!(stats.erased_chunks > 0);
    assert!(stats.erased_bytes > 0);
    assert!(key.load_storage_pepper().unwrap().is_none());
    assert!(!root.path().join("storage/master.verify").exists());
    assert!(matches!(
        runtime.commit_storage_erase(7, &handle, MASTER.into()),
        Err(EraseError::Session(SessionError::Revoked))
    ));
    assert!(matches!(
        handle.cancel_and_wait().await.unwrap(),
        Some(EraseReceipt::Completed(_))
    ));
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}

#[tokio::test]
async fn canceled_or_dropped_confirmation_cannot_delete_or_manufacture_a_receipt() {
    let root = TempDir::new().unwrap();
    let key = Arc::new(InMemoryKeystore::new());
    let runtime = configured(&root, key.clone()).await;
    let handle = reviewed(&runtime).await;
    let pepper = key.load_storage_pepper().unwrap();
    let verifier = std::fs::read(root.path().join("storage/master.verify")).unwrap();
    let queued = runtime
        .commit_storage_erase(5, &handle, MASTER.into())
        .unwrap();
    runtime.cancel(5).unwrap();
    assert_eq!(
        runtime.execute_admitted(queued).await.unwrap_err(),
        SessionError::Canceled
    );
    assert_eq!(handle.cancel_and_wait().await.unwrap(), None);
    assert!(matches!(
        runtime.commit_storage_erase(6, &handle, MASTER.into()),
        Err(EraseError::State)
    ));
    assert_eq!(key.load_storage_pepper().unwrap(), pepper);
    assert_eq!(
        std::fs::read(root.path().join("storage/master.verify")).unwrap(),
        verifier
    );
    drop(handle);
    let next = runtime
        .begin_storage_erase(runtime.snapshot().unwrap().generation)
        .unwrap();
    let review = runtime.review_storage_erase(7, &next).unwrap();
    drop(review);
    assert!(matches!(next.preview(), Err(EraseError::State)));
    assert!(next.receipt().unwrap().is_none());
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}

#[tokio::test]
async fn lock_and_foreign_runtime_reject_review_without_success_receipt() {
    let root = TempDir::new().unwrap();
    let runtime = configured(&root, Arc::new(InMemoryKeystore::new())).await;
    let handle = reviewed(&runtime).await;
    let foreign_root = TempDir::new().unwrap();
    let foreign = session(&foreign_root, Arc::new(InMemoryKeystore::new()));
    assert!(matches!(
        foreign.commit_storage_erase(5, &handle, MASTER.into()),
        Err(EraseError::Session(SessionError::RequestId))
    ));
    runtime.lock().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    assert!(matches!(
        handle.preview(),
        Err(EraseError::Session(SessionError::Revoked))
    ));
    assert_eq!(handle.receipt().unwrap(), None);
    runtime.close().unwrap();
    foreign.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
    phase(&foreign, SessionPhase::Closed).await;
}

#[tokio::test]
async fn canceling_published_review_or_password_retry_invalidates_its_confirmation() {
    for cancel_retry in [false, true] {
        let root = TempDir::new().unwrap();
        let key = Arc::new(InMemoryKeystore::new());
        let runtime = configured(&root, key.clone()).await;
        let handle = reviewed(&runtime).await;
        let canceled_id = if cancel_retry {
            let denied = runtime
                .commit_storage_erase(5, &handle, "wrong".into())
                .unwrap();
            assert_eq!(
                runtime.execute_admitted(denied).await.unwrap().code(),
                Some("INVALID_MASTER_PASSWORD")
            );
            5
        } else {
            4
        };
        runtime.cancel(canceled_id).unwrap();
        assert!(matches!(handle.preview(), Err(EraseError::State)));
        assert!(matches!(
            runtime.commit_storage_erase(6, &handle, MASTER.into()),
            Err(EraseError::State)
        ));
        assert_eq!(handle.receipt().unwrap(), None);
        assert!(key.load_storage_pepper().unwrap().is_some());
        assert!(root.path().join("storage/master.verify").exists());
        runtime.close().unwrap();
        phase(&runtime, SessionPhase::Closed).await;
    }
}

struct DeleteGate {
    key: InMemoryKeystore,
    entered: std::sync::mpsc::Sender<()>,
    release: (Mutex<bool>, std::sync::Condvar),
    fail: bool,
}

impl Keystore for DeleteGate {
    fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
        self.key.load_storage_pepper()
    }
    fn store_storage_pepper(&self, value: [u8; 32]) -> Result<(), KeystoreError> {
        self.key.store_storage_pepper(value)
    }
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        self.entered.send(()).unwrap();
        let mut released = self.release.0.lock().unwrap();
        while !*released {
            released = self.release.1.wait(released).unwrap();
        }
        if self.fail {
            Err(KeystoreError::Unavailable)
        } else {
            self.key.delete_storage_pepper()
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn revocation_during_actual_deletion_keeps_the_true_success_or_failure_receipt() {
    for fail in [false, true] {
        let root = TempDir::new().unwrap();
        let (entered, receiver) = std::sync::mpsc::channel();
        let key = Arc::new(DeleteGate {
            key: InMemoryKeystore::new(),
            entered,
            release: (Mutex::new(false), std::sync::Condvar::new()),
            fail,
        });
        let runtime = Arc::new(configured(&root, key.clone()).await);
        let host = Arc::new(crate::session::native_host::NativeHost::new(&runtime).unwrap());
        let handle = reviewed(&runtime).await;
        let erase = runtime
            .commit_storage_erase(5, &handle, MASTER.into())
            .unwrap();
        let future = runtime.execute_admitted(erase);
        let task = tokio::spawn(future);
        let reached = tokio::task::spawn_blocking(move || {
            receiver.recv_timeout(std::time::Duration::from_secs(5))
        })
        .await
        .unwrap();
        let verifier_removed = !root.path().join("storage/master.verify").exists();
        let revoked = reached.is_ok().then(|| runtime.lock());
        let (suspended, observe) = std::sync::mpsc::channel();
        let suspend = std::thread::spawn(move || {
            let _ = host.suspend();
            let _ = suspended.send(());
        });
        let returned = tokio::task::spawn_blocking(move || {
            observe.recv_timeout(std::time::Duration::from_secs(2))
        })
        .await
        .unwrap();
        *key.release.0.lock().unwrap() = true;
        key.release.1.notify_all();
        reached.expect("Deletion must reach primary key cleanup");
        suspend.join().unwrap();
        returned.expect("Host suspension must return without waiting for primary-key deletion");
        revoked.unwrap().unwrap();
        assert!(verifier_removed);
        assert_eq!(task.await.unwrap().unwrap_err(), SessionError::Revoked);
        let receipt = handle.cancel_and_wait().await.unwrap();
        if fail {
            assert_eq!(
                receipt,
                Some(EraseReceipt::Incomplete {
                    key_cleanup_failed: true,
                    host_cleanup_failed: false,
                })
            );
            assert!(key.load_storage_pepper().unwrap().is_some());
        } else {
            assert!(matches!(receipt, Some(EraseReceipt::Completed(_))));
            assert!(key.load_storage_pepper().unwrap().is_none());
        }
        runtime.close().unwrap();
        phase(&runtime, SessionPhase::Closed).await;
    }
}
