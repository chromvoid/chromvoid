use super::*;
use crate::session::tests::{phase, session, storage_tree};
use chromvoid_core::crypto::keystore::{InMemoryKeystore, Keystore};
use serde_json::json;
use std::collections::BTreeMap;
use tempfile::TempDir;

const MASTER: &str = "synthetic restore administrator";

async fn backup() -> BTreeMap<String, Vec<u8>> {
    let root = TempDir::new().unwrap();
    let source = session(&root, Arc::new(InMemoryKeystore::new()));
    for (id, command, data) in [
        (1, "master:setup", json!({"master_password":MASTER})),
        (2, "vault:unlock", json!({"password":"synthetic vault"})),
        (3, "catalog:createDir", json!({"name":"restored folder"})),
    ] {
        assert!(
            source
                .execute(id, 1, RpcRequest::new(command, data))
                .await
                .unwrap()
                .is_ok()
        );
    }
    let handle = source.begin_storage_backup(1).unwrap();
    let prepare = source
        .prepare_storage_backup(4, &handle, MASTER.to_string())
        .unwrap();
    assert!(source.execute_admitted(prepare).await.unwrap().is_ok());
    let mut files = BTreeMap::new();
    let mut request = 5;
    for (index, artifact) in handle.artifacts().unwrap().iter().enumerate() {
        let mut bytes = Vec::new();
        while bytes.len() < artifact.size as usize {
            let read = source.read_storage_backup(request, &handle, index).unwrap();
            request += 1;
            assert!(source.execute_admitted(read).await.unwrap().is_ok());
            bytes.extend(handle.take_chunk().unwrap());
        }
        files.insert(artifact.name.clone(), bytes);
    }
    handle.cancel_and_wait().await.unwrap();
    source.close().unwrap();
    phase(&source, SessionPhase::Closed).await;
    files
}

async fn receive(
    runtime: &LocalSession,
    files: &BTreeMap<String, Vec<u8>>,
    next: &mut u64,
) -> RestoreHandle {
    let handle = runtime
        .begin_storage_restore(runtime.snapshot().unwrap().generation)
        .unwrap();
    for artifact in LocalRestoreArtifact::ALL {
        for chunk in files[artifact.name()].chunks(MAX_RESTORE_APPEND_BYTES) {
            let append = runtime
                .append_storage_restore(*next, &handle, artifact, chunk.to_vec())
                .unwrap();
            *next += 1;
            assert!(runtime.execute_admitted(append).await.unwrap().is_ok());
        }
    }
    handle
}

async fn review(runtime: &LocalSession, handle: &RestoreHandle, next: &mut u64) {
    let request = runtime
        .review_storage_restore(*next, handle, MASTER.to_string())
        .unwrap();
    *next += 1;
    assert!(runtime.execute_admitted(request).await.unwrap().is_ok());
}

#[tokio::test]
async fn adoption_guard_rechecks_reviewed_restore_on_worker_before_replacing_pepper() {
    use chromvoid_core::rpc::{StorageMutationError, StorageMutationGuard};

    let files = backup().await;
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
    let mut next = 1;
    let handle = receive(&runtime, &files, &mut next).await;
    review(&runtime, &handle, &mut next).await;
    let commit = runtime.commit_storage_restore(next, &handle).unwrap();
    let before = storage_tree(root.path());
    denied.store(true, Ordering::SeqCst);
    assert!(matches!(
        runtime.commit_storage_restore(next + 1, &handle),
        Err(RestoreError::Session(SessionError::AdoptionRequired))
    ));
    let response = runtime.execute_admitted(commit).await.unwrap();
    assert_eq!(response.code(), Some("ADOPTION_ACTION_FORBIDDEN"));
    assert_eq!(key.load_storage_pepper().unwrap(), None);
    assert_eq!(storage_tree(root.path()), before);
    handle.cancel_and_wait().await.unwrap();
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}

#[tokio::test]
async fn adoption_guard_protects_typed_restore_commit_after_preparation() {
    use chromvoid_core::rpc::{StorageMutationError, StorageMutationGuard};

    let files = backup().await;
    let root = TempDir::new().unwrap();
    let key = Arc::new(InMemoryKeystore::new());
    let mut adapter =
        LocalCoreAdapter::new_with_keystore(root.path().join("storage"), key.clone()).unwrap();
    let mut input = LocalRestoreInput::new().unwrap();
    for artifact in LocalRestoreArtifact::ALL {
        for chunk in files[artifact.name()].chunks(MAX_RESTORE_APPEND_BYTES) {
            input.append(artifact, chunk).unwrap();
        }
    }
    let prepared = adapter
        .prepare_local_restore(input, MASTER.into(), &|| false)
        .unwrap();
    adapter = adapter.with_storage_mutation_guard(StorageMutationGuard::new(|| {
        Err(StorageMutationError::AdoptionRequired)
    }));
    let before = storage_tree(root.path());
    let response = adapter
        .commit_local_restore(prepared, &|| false)
        .unwrap_err();
    assert_eq!(response.code(), Some("ADOPTION_ACTION_FORBIDDEN"));
    assert_eq!(key.load_storage_pepper().unwrap(), None);
    assert_eq!(storage_tree(root.path()), before);
}

#[tokio::test]
async fn reviewed_restore_from_runtime_backup_requires_confirmation_and_cannot_replay() {
    let files = backup().await;
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let mut next = 1;
    let handle = receive(&runtime, &files, &mut next).await;
    assert!(matches!(
        runtime.commit_storage_restore(next, &handle),
        Err(RestoreError::State)
    ));
    assert!(matches!(
        runtime.begin_storage_restore(1),
        Err(RestoreError::Session(SessionError::Busy))
    ));
    review(&runtime, &handle, &mut next).await;
    assert_eq!(
        handle.preview().unwrap().byte_count,
        files["chunks.pack"].len() as u64
    );
    assert!(!runtime.snapshot().unwrap().master_configured);
    assert!(
        chromvoid_core::storage::Storage::new(root.path().join("storage"))
            .unwrap()
            .list_chunks()
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        runtime.append_storage_restore(next, &handle, LocalRestoreArtifact::Pack, vec![0]),
        Err(RestoreError::State)
    ));
    let commit = runtime.commit_storage_restore(next, &handle).unwrap();
    next += 1;
    assert!(matches!(
        runtime.commit_storage_restore(next, &handle),
        Err(RestoreError::State)
    ));
    assert!(runtime.execute_admitted(commit).await.unwrap().is_ok());
    assert!(runtime.snapshot().unwrap().master_configured);
    assert!(matches!(
        runtime.commit_storage_restore(next, &handle),
        Err(RestoreError::State)
    ));
    let unlock = runtime
        .execute(
            next,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic vault"})),
        )
        .await
        .unwrap();
    assert!(unlock.is_ok());
    let list = runtime
        .execute(
            next + 1,
            1,
            RpcRequest::new("catalog:list", json!({"path":"/"})),
        )
        .await
        .unwrap();
    let value = list.result().unwrap();
    assert!(
        value["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["name"] == "restored folder")
    );
    runtime.close().unwrap();
}

#[tokio::test]
async fn restore_wrong_password_and_queued_cancellation_allow_clean_retry() {
    let files = backup().await;
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let mut next = 1;
    let handle = receive(&runtime, &files, &mut next).await;
    let bad = runtime
        .review_storage_restore(next, &handle, "wrong".into())
        .unwrap();
    next += 1;
    assert_eq!(
        runtime.execute_admitted(bad).await.unwrap().code(),
        Some("INVALID_BACKUP")
    );
    assert!(matches!(handle.preview(), Err(RestoreError::State)));
    handle.cancel_and_wait().await.unwrap();
    drop(handle);
    let handle = receive(&runtime, &files, &mut next).await;
    review(&runtime, &handle, &mut next).await;
    let commit = runtime.commit_storage_restore(next, &handle).unwrap();
    runtime.cancel(next).unwrap();
    next += 1;
    assert_eq!(
        runtime.execute_admitted(commit).await.unwrap_err(),
        SessionError::Canceled
    );
    handle.cancel_and_wait().await.unwrap();
    assert!(!runtime.snapshot().unwrap().master_configured);
    drop(handle);
    let handle = receive(&runtime, &files, &mut next).await;
    review(&runtime, &handle, &mut next).await;
    let commit = runtime.commit_storage_restore(next, &handle).unwrap();
    assert!(runtime.execute_admitted(commit).await.unwrap().is_ok());
    runtime.close().unwrap();
}

#[tokio::test]
async fn restore_lock_revokes_receiving_and_reviewed_sources_and_closes_worker_files() {
    let files = backup().await;
    for reviewed in [false, true] {
        let root = TempDir::new().unwrap();
        let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
        let mut next = 1;
        let handle = receive(&runtime, &files, &mut next).await;
        if reviewed {
            review(&runtime, &handle, &mut next).await;
        }
        runtime.lock().unwrap();
        assert_eq!(
            handle.preview().unwrap_err(),
            RestoreError::Session(SessionError::Revoked)
        );
        assert!(matches!(
            runtime.commit_storage_restore(next, &handle),
            Err(RestoreError::Session(SessionError::Revoked))
        ));
        phase(&runtime, SessionPhase::Locked).await;
        handle.cancel_and_wait().await.unwrap();
        assert!(matches!(
            *handle.resource.source.lock().unwrap(),
            RestoreSource::Empty
        ));
        assert!(!runtime.snapshot().unwrap().master_configured);
        drop(handle);
        let retry = runtime
            .begin_storage_restore(runtime.snapshot().unwrap().generation)
            .unwrap();
        retry.cancel_and_wait().await.unwrap();
        runtime.close().unwrap();
    }
}

#[tokio::test]
async fn erase_releases_a_retained_receiving_restore_before_reporting_completion() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("master:setup", json!({"master_password":MASTER}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let handle = runtime.begin_storage_restore(1).unwrap();
    let append = runtime
        .append_storage_restore(2, &handle, LocalRestoreArtifact::Pack, vec![42; 1024])
        .unwrap();
    assert!(runtime.execute_admitted(append).await.unwrap().is_ok());
    assert!(matches!(
        *handle.resource.source.lock().unwrap(),
        RestoreSource::Receiving(_)
    ));
    let erase = runtime.begin_storage_erase(1).unwrap();
    let review = runtime.review_storage_erase(3, &erase).unwrap();
    assert!(runtime.execute_admitted(review).await.unwrap().is_ok());
    let commit = runtime
        .commit_storage_erase(4, &erase, MASTER.into())
        .unwrap();
    let mut completion = Box::pin(runtime.execute_admitted(commit));
    assert!(futures_util::poll!(&mut completion).is_pending());
    // Leave the caller future pending: its cancellation guard must not accidentally
    // clean the resource before we observe the worker's published completion.
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let snapshot = runtime.snapshot().unwrap();
            if snapshot.generation > 1 && !snapshot.cleanup_pending {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(matches!(
        erase.receipt().unwrap(),
        Some(storage_erase::EraseReceipt::Completed(_))
    ));
    assert!(!runtime.snapshot().unwrap().cleanup_pending);
    // Do not cancel/drop the retained handle: completed reset owns physical cleanup.
    assert!(matches!(
        *handle.resource.source.lock().unwrap(),
        RestoreSource::Empty
    ));
    assert_eq!(completion.await.unwrap_err(), SessionError::Revoked);
    runtime.close().unwrap();
}

#[tokio::test]
async fn restore_admission_checks_size_session_ownership_and_expiry_before_commit() {
    let files = backup().await;
    let root = TempDir::new().unwrap();
    let other_root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let other = session(&other_root, Arc::new(InMemoryKeystore::new()));
    let mut next = 1;
    let handle = receive(&runtime, &files, &mut next).await;
    assert!(matches!(
        runtime.append_storage_restore(
            next,
            &handle,
            LocalRestoreArtifact::Pack,
            vec![0; MAX_RESTORE_APPEND_BYTES + 1]
        ),
        Err(RestoreError::TooLarge)
    ));
    assert!(matches!(
        other.review_storage_restore(1, &handle, MASTER.into()),
        Err(RestoreError::Session(SessionError::RequestId))
    ));
    review(&runtime, &handle, &mut next).await;
    handle.resource.state.lock().unwrap().last_activity =
        Instant::now() - LocalRestoreInput::idle_timeout() - std::time::Duration::from_secs(1);
    assert!(matches!(
        runtime.commit_storage_restore(next, &handle),
        Err(RestoreError::Expired)
    ));
    handle.cancel_and_wait().await.unwrap();
    assert!(matches!(
        *handle.resource.source.lock().unwrap(),
        RestoreSource::Empty
    ));
    assert!(!runtime.snapshot().unwrap().master_configured);
    runtime.close().unwrap();
    other.close().unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn restore_lock_during_material_commit_reconciles_bootstrap_without_replaying() {
    use chromvoid_core::crypto::keystore::{Keystore, KeystoreError};
    use std::sync::{Condvar, mpsc};
    use std::time::Duration;

    struct BlockingStore {
        key: InMemoryKeystore,
        entered: mpsc::Sender<()>,
        released: Mutex<bool>,
        release: Condvar,
    }
    impl Keystore for BlockingStore {
        fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
            self.key.load_storage_pepper()
        }
        fn store_storage_pepper(&self, value: [u8; 32]) -> Result<(), KeystoreError> {
            self.entered.send(()).unwrap();
            let mut released = self.released.lock().unwrap();
            while !*released {
                released = self.release.wait(released).unwrap();
            }
            self.key.store_storage_pepper(value)
        }
        fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
            self.key.delete_storage_pepper()
        }
    }
    let files = backup().await;
    let root = TempDir::new().unwrap();
    let (entered, receive_boundary) = mpsc::channel();
    let key = Arc::new(BlockingStore {
        key: InMemoryKeystore::new(),
        entered,
        released: Mutex::new(false),
        release: Condvar::new(),
    });
    let runtime = Arc::new(session(&root, key.clone()));
    let mut next = 1;
    let handle = receive(&runtime, &files, &mut next).await;
    review(&runtime, &handle, &mut next).await;
    let commit = runtime.commit_storage_restore(next, &handle).unwrap();
    next += 1;
    let future = runtime.execute_admitted(commit);
    let task = tokio::spawn(future);
    let reached =
        tokio::task::spawn_blocking(move || receive_boundary.recv_timeout(Duration::from_secs(5)))
            .await
            .unwrap();
    let locked = if reached.is_ok() {
        let worker = runtime.clone();
        Some(
            tokio::time::timeout(
                Duration::from_secs(2),
                tokio::task::spawn_blocking(move || worker.lock()),
            )
            .await,
        )
    } else {
        None
    };
    *key.released.lock().unwrap() = true;
    key.release.notify_all();
    reached.expect("restore reached pepper publication after material writes");
    locked
        .unwrap()
        .expect("lock cannot wait for Core IO")
        .unwrap()
        .unwrap();
    assert_eq!(task.await.unwrap().unwrap_err(), SessionError::Revoked);
    phase(&runtime, SessionPhase::Locked).await;
    let snapshot = runtime.snapshot().unwrap();
    assert!(
        snapshot.master_configured,
        "cleanup must reconcile the completed restore"
    );
    assert!(matches!(
        runtime.commit_storage_restore(next, &handle),
        Err(RestoreError::Session(SessionError::Revoked))
    ));
    let unlock = runtime
        .execute(
            next,
            snapshot.generation,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic vault"})),
        )
        .await
        .unwrap();
    assert!(unlock.is_ok());
    let list = runtime
        .execute(
            next + 1,
            snapshot.generation,
            RpcRequest::new("catalog:list", json!({"path":"/"})),
        )
        .await
        .unwrap();
    assert!(
        list.result().unwrap()["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["name"] == "restored folder")
    );
    runtime.close().unwrap();
}
