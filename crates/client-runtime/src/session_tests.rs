use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, mpsc};
use std::time::Duration;

use chromvoid_core::crypto::keystore::{InMemoryKeystore, Keystore, KeystoreError};
use chromvoid_core::rpc::types::RpcRequest;
use serde_json::json;
use tempfile::TempDir;

use crate::LocalCoreAdapter;
use crate::session::{LocalSession, SessionError, SessionPhase};

#[path = "maintenance_session_tests.rs"]
mod maintenance;
#[path = "storage_backup_tests.rs"]
mod storage_backup;

pub(super) fn session(root: &TempDir, key: Arc<dyn Keystore>) -> LocalSession {
    let adapter = LocalCoreAdapter::new_with_keystore(root.path().join("storage"), key).unwrap();
    LocalSession::new(adapter).unwrap()
}

pub(super) fn storage_tree(root: &Path) -> BTreeMap<PathBuf, Option<Vec<u8>>> {
    fn visit(root: &Path, directory: &Path, entries: &mut BTreeMap<PathBuf, Option<Vec<u8>>>) {
        for entry in std::fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            let relative = path.strip_prefix(root).unwrap().to_path_buf();
            if path.is_dir() {
                entries.insert(relative, None);
                visit(root, &path, entries);
            } else {
                entries.insert(relative, Some(std::fs::read(path).unwrap()));
            }
        }
    }
    let mut entries = BTreeMap::new();
    visit(root, root, &mut entries);
    entries
}

pub(super) async fn phase(session: &LocalSession, expected: SessionPhase) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let snapshot = session.snapshot().unwrap();
            if snapshot.phase == expected {
                break;
            }
            session.events(snapshot.sequence).await.unwrap();
        }
    })
    .await
    .expect("lifecycle event must arrive");
}

#[tokio::test]
async fn real_storage_unlock_lock_and_reopen_preserve_entries() {
    let root = TempDir::new().unwrap();
    let key = Arc::new(InMemoryKeystore::new());
    let runtime = session(&root, key.clone());
    let unlock = RpcRequest::new("vault:unlock", json!({"password":"synthetic vault"}));
    assert!(runtime.execute(1, 1, unlock.clone()).await.unwrap().is_ok());
    let create = runtime.execute(2, 1, RpcRequest::new("passmanager:entry:create", json!({
        "entry_id":"native-contract", "title":"Synthetic", "username":"test", "secrets":{"password":"synthetic secret"}, "entry_type":"login"
    }))).await.unwrap();
    assert!(create.is_ok(), "{create:?}");
    let locked = runtime.lock().unwrap();
    assert!(locked.generation > 1);
    assert_eq!(
        runtime.execute(3, 1, unlock.clone()).await.unwrap_err(),
        SessionError::Revoked
    );
    phase(&runtime, SessionPhase::Locked).await;
    runtime.close().unwrap();
    while runtime.snapshot().unwrap().cleanup_pending {
        let snapshot = runtime.snapshot().unwrap();
        if snapshot.cleanup_pending {
            runtime.events(snapshot.sequence).await.unwrap();
        }
    }
    drop(runtime);

    let reopened = session(&root, key);
    assert_eq!(reopened.snapshot().unwrap().phase, SessionPhase::Locked);
    assert!(reopened.execute(1, 1, unlock).await.unwrap().is_ok());
    let list = reopened
        .execute(2, 1, RpcRequest::new("passmanager:entry:list", json!({})))
        .await
        .unwrap();
    assert_eq!(list.result().unwrap()["entries"][0]["title"], "Synthetic");
}

struct BlockingKey {
    key: InMemoryKeystore,
    block: AtomicBool,
    entered: mpsc::Sender<()>,
    released: Mutex<bool>,
    release: Condvar,
}
impl BlockingKey {
    fn release(&self) {
        *self.released.lock().unwrap() = true;
        self.release.notify_all();
    }
}
impl Keystore for BlockingKey {
    fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
        if self.block.swap(false, Ordering::SeqCst) {
            self.entered.send(()).unwrap();
            let mut released = self.released.lock().unwrap();
            while !*released {
                released = self.release.wait(released).unwrap();
            }
        }
        self.key.load_storage_pepper()
    }
    fn store_storage_pepper(&self, value: [u8; 32]) -> Result<(), KeystoreError> {
        self.key.store_storage_pepper(value)
    }
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        self.key.delete_storage_pepper()
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn background_revokes_before_blocked_unlock_finishes_and_resume_stays_locked() {
    let root = TempDir::new().unwrap();
    let (entered, receive) = mpsc::channel();
    let key = Arc::new(BlockingKey {
        key: InMemoryKeystore::new(),
        block: AtomicBool::new(true),
        entered,
        released: Mutex::new(false),
        release: Condvar::new(),
    });
    let runtime = Arc::new(session(&root, key.clone()));
    let work = runtime.clone();
    let unlock = tokio::spawn(async move {
        work.execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
        )
        .await
    });
    tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)).unwrap())
        .await
        .unwrap();

    let revoke = runtime.clone();
    let background = tokio::task::spawn_blocking(move || revoke.deactivate());
    let result = tokio::time::timeout(Duration::from_secs(2), background).await;
    // Always release the deliberate blocked boundary, including on a regression.
    key.release();
    let snapshot = result
        .expect("revocation must not wait for Core")
        .unwrap()
        .unwrap();
    assert!(snapshot.generation > 1);
    runtime.activate().unwrap();
    assert_eq!(unlock.await.unwrap().unwrap_err(), SessionError::Revoked);
    phase(&runtime, SessionPhase::Locked).await;
    let current = runtime.snapshot().unwrap();
    let status = runtime
        .execute(
            2,
            current.generation,
            RpcRequest::new("vault:status", json!({})),
        )
        .await
        .unwrap();
    assert_eq!(status.result().unwrap()["is_unlocked"], false);
}

#[tokio::test]
async fn event_overflow_is_explicit_and_close_is_terminal() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    for _ in 0..40 {
        runtime.deactivate().unwrap();
        phase(&runtime, SessionPhase::Inactive).await;
        runtime.activate().unwrap();
    }
    let batch = runtime.events(0).await.unwrap();
    assert!(batch.gap);
    assert_eq!(batch.events.len(), 64);
    assert!(
        batch
            .events
            .windows(2)
            .all(|pair| pair[0].snapshot.sequence + 1 == pair[1].snapshot.sequence)
    );
    let closed = runtime.close().unwrap();
    assert_eq!(closed.phase, SessionPhase::Closed);
    let repeated = runtime.close().unwrap();
    assert_eq!(repeated.generation, closed.generation);
    assert_eq!(repeated.phase, SessionPhase::Closed);
    assert_eq!(runtime.activate(), Err(SessionError::Unavailable));
    assert_eq!(
        runtime
            .execute(
                1,
                closed.generation,
                RpcRequest::new("vault:status", json!({}))
            )
            .await
            .unwrap_err(),
        SessionError::Revoked
    );
}

#[tokio::test]
async fn request_ids_cannot_be_reused_and_cancellation_is_idempotent() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let status = RpcRequest::new("vault:status", json!({}));
    assert!(runtime.execute(5, 1, status.clone()).await.unwrap().is_ok());
    assert_eq!(
        runtime.execute(5, 1, status.clone()).await.unwrap_err(),
        SessionError::RequestId
    );
    assert_eq!(
        runtime.execute(4, 1, status).await.unwrap_err(),
        SessionError::RequestId
    );
    runtime.cancel(5).unwrap();
    runtime.cancel(5).unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn canceled_queued_setup_never_mutates_storage() {
    use std::future::{Future, poll_fn};
    use std::task::Poll;
    let root = TempDir::new().unwrap();
    let (entered, receive) = mpsc::channel();
    let key = Arc::new(BlockingKey {
        key: InMemoryKeystore::new(),
        block: AtomicBool::new(true),
        entered,
        released: Mutex::new(false),
        release: Condvar::new(),
    });
    let runtime = Arc::new(session(&root, key.clone()));
    let work = runtime.clone();
    let unlock = tokio::spawn(async move {
        work.execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
        )
        .await
    });
    tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)).unwrap())
        .await
        .unwrap();
    let mut setup = Box::pin(runtime.execute(
        2,
        1,
        RpcRequest::new("master:setup", json!({"master_password":"synthetic admin"})),
    ));
    // Start the public future once while Core is deliberately occupied.
    poll_fn(|context| {
        assert!(setup.as_mut().poll(context).is_pending());
        Poll::Ready(())
    })
    .await;
    runtime.cancel(2).unwrap();
    key.release();
    assert!(unlock.await.unwrap().unwrap().is_ok());
    assert_eq!(setup.await.unwrap_err(), SessionError::Canceled);
    assert!(!root.path().join("storage/master.verify").exists());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn queued_work_is_bounded_even_after_callers_drop_and_lock_can_still_enter() {
    use std::future::{Future, poll_fn};
    use std::task::Poll;
    let root = TempDir::new().unwrap();
    let (entered, receive) = mpsc::channel();
    let key = Arc::new(BlockingKey {
        key: InMemoryKeystore::new(),
        block: AtomicBool::new(true),
        entered,
        released: Mutex::new(false),
        release: Condvar::new(),
    });
    struct ReleaseOnDrop(Arc<BlockingKey>);
    impl Drop for ReleaseOnDrop {
        fn drop(&mut self) {
            self.0.release();
        }
    }
    let release = ReleaseOnDrop(key.clone());
    let runtime = Arc::new(session(&root, key));
    let work = runtime.clone();
    let unlock = tokio::spawn(async move {
        work.execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
        )
        .await
    });
    tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)).unwrap())
        .await
        .unwrap();
    let mut pending = Vec::new();
    for id in 2..=128 {
        let mut request =
            Box::pin(runtime.execute(id, 1, RpcRequest::new("vault:status", json!({}))));
        poll_fn(|context| {
            assert!(request.as_mut().poll(context).is_pending());
            Poll::Ready(())
        })
        .await;
        pending.push(request);
    }
    assert_eq!(
        runtime
            .execute(129, 1, RpcRequest::new("vault:status", json!({})))
            .await
            .unwrap_err(),
        SessionError::Busy
    );
    drop(pending);
    // Dropped callers do not free the bound while their jobs still occupy the queue.
    assert_eq!(
        runtime
            .execute(130, 1, RpcRequest::new("vault:status", json!({})))
            .await
            .unwrap_err(),
        SessionError::Busy
    );
    let revoke = runtime.clone();
    let lock = tokio::time::timeout(
        Duration::from_secs(2),
        tokio::task::spawn_blocking(move || revoke.lock()),
    )
    .await;
    drop(release);
    assert!(
        lock.expect("privacy lock bypasses the request bound")
            .unwrap()
            .is_ok()
    );
    assert_eq!(unlock.await.unwrap().unwrap_err(), SessionError::Revoked);
    phase(&runtime, SessionPhase::Locked).await;
}

struct UnavailableKey;
impl Keystore for UnavailableKey {
    fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
        Err(KeystoreError::Unavailable)
    }
    fn store_storage_pepper(&self, _: [u8; 32]) -> Result<(), KeystoreError> {
        panic!("must not initialize after unavailable load")
    }
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        panic!("must not erase")
    }
}

#[tokio::test]
async fn unavailable_keystore_does_not_initialize_or_erase_storage() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(UnavailableKey));
    let response = runtime
        .execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
        )
        .await
        .unwrap();
    assert_eq!(response.code(), Some("KEYSTORE_UNAVAILABLE"));
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Locked);
    assert!(
        !chromvoid_core::storage::Storage::new(root.path().join("storage"))
            .unwrap()
            .salt_exists()
    );
    assert!(!root.path().join("storage/master.verify").exists());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dropping_unlock_future_revokes_its_late_authority() {
    use std::future::{Future, poll_fn};
    use std::task::Poll;
    let root = TempDir::new().unwrap();
    let (entered, receive) = mpsc::channel();
    let key = Arc::new(BlockingKey {
        key: InMemoryKeystore::new(),
        block: AtomicBool::new(true),
        entered,
        released: Mutex::new(false),
        release: Condvar::new(),
    });
    let runtime = session(&root, key.clone());
    let mut unlock = Box::pin(runtime.execute(
        1,
        1,
        RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
    ));
    poll_fn(|context| {
        assert!(unlock.as_mut().poll(context).is_pending());
        Poll::Ready(())
    })
    .await;
    tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)).unwrap())
        .await
        .unwrap();
    drop(unlock);
    let revoked = runtime.snapshot().unwrap();
    key.release();
    assert!(revoked.generation > 1);
    phase(&runtime, SessionPhase::Locked).await;
}

#[tokio::test]
async fn initialized_storage_without_pepper_is_preserved() {
    let root = TempDir::new().unwrap();
    let storage = chromvoid_core::storage::Storage::new(root.path().join("storage")).unwrap();
    let chunk = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";
    storage
        .write_chunk(chunk, b"existing opaque fixture chunk")
        .unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let response = runtime
        .execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
        )
        .await
        .unwrap();
    assert_eq!(response.code(), Some("STORAGE_PEPPER_REQUIRED"));
    assert_eq!(
        storage.read_chunk(chunk).unwrap(),
        b"existing opaque fixture chunk"
    );
    assert!(!storage.salt_exists());
}

struct FailedReadback(AtomicBool);
impl Keystore for FailedReadback {
    fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
        Ok(None)
    }
    fn store_storage_pepper(&self, _: [u8; 32]) -> Result<(), KeystoreError> {
        self.0.store(true, Ordering::SeqCst);
        Ok(())
    }
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        panic!("must not erase after failed readback")
    }
}

#[tokio::test]
async fn failed_keystore_readback_does_not_commit_vault_initialization() {
    let root = TempDir::new().unwrap();
    let key = Arc::new(FailedReadback(AtomicBool::new(false)));
    let runtime = session(&root, key.clone());
    let response = runtime
        .execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
        )
        .await
        .unwrap();
    assert!(key.0.load(Ordering::SeqCst));
    assert_eq!(response.code(), Some("KEYSTORE_UNAVAILABLE"));
    assert!(
        !chromvoid_core::storage::Storage::new(root.path().join("storage"))
            .unwrap()
            .salt_exists()
    );
}

#[tokio::test]
async fn administrator_setup_updates_safe_metadata_without_unlocking_a_vault() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    assert!(!runtime.snapshot().unwrap().master_configured);
    let response = runtime
        .execute(
            1,
            1,
            RpcRequest::new(
                "master:setup",
                json!({"master_password":"synthetic administrator"}),
            ),
        )
        .await
        .unwrap();
    assert!(response.is_ok(), "{response:?}");
    let snapshot = runtime.snapshot().unwrap();
    assert!(snapshot.master_configured);
    assert_eq!(snapshot.phase, SessionPhase::Locked);
}

#[tokio::test]
async fn a_provider_path_has_its_own_identifiers_and_the_same_fence() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let status = || RpcRequest::new("vault:status", json!({}));
    // The application is far along its sequence; the provider starts from its own.
    assert!(runtime.execute(40, 1, status()).await.unwrap().is_ok());
    let provider = runtime.admit_provider(1, 1, status()).unwrap();
    assert!(runtime.execute_admitted(provider).await.unwrap().is_ok());
    assert_eq!(
        runtime.admit_provider(1, 1, status()).err(),
        Some(SessionError::RequestId)
    );
    // Neither sequence moves the other.
    assert!(runtime.execute(41, 1, status()).await.unwrap().is_ok());
    assert!(runtime.admit_provider(2, 1, status()).is_ok());
    // A generation the session no longer accepts is refused to a provider too.
    assert_eq!(
        runtime.admit_provider(3, 99, status()).err(),
        Some(SessionError::Revoked)
    );
}

#[tokio::test]
async fn synchronous_admission_preserves_ids_when_execution_is_polled_in_reverse_order() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let read = || RpcRequest::new("vault:status", json!({}));
    let earlier = runtime.admit(1, 1, read()).unwrap();
    let later = runtime.admit(2, 1, read()).unwrap();
    assert_eq!(
        runtime.admit(1, 1, read()).err(),
        Some(SessionError::RequestId)
    );
    assert_eq!(
        runtime.admit(2, 1, read()).err(),
        Some(SessionError::RequestId)
    );
    assert!(runtime.execute_admitted(later).await.unwrap().is_ok());
    assert!(runtime.execute_admitted(earlier).await.unwrap().is_ok());
    let cancelled = runtime.admit(3, 1, read()).unwrap();
    runtime.cancel(3).unwrap();
    assert_eq!(
        runtime.execute_admitted(cancelled).await.unwrap_err(),
        SessionError::Canceled
    );
    let revoked = runtime.admit(4, 1, read()).unwrap();
    runtime.lock().unwrap();
    assert_eq!(
        runtime.execute_admitted(revoked).await.unwrap_err(),
        SessionError::Revoked
    );
}

#[tokio::test]
async fn dropping_admitted_requests_releases_capacity_without_reusing_ids_or_crossing_sessions() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let read = || RpcRequest::new("vault:status", json!({}));
    let held: Vec<_> = (1..=super::MAX_PENDING as u64)
        .map(|id| runtime.admit(id, 1, read()).unwrap())
        .collect();
    let next = super::MAX_PENDING as u64 + 1;
    assert_eq!(
        runtime.admit(next, 1, read()).err(),
        Some(SessionError::Busy)
    );
    drop(held);
    assert_eq!(
        runtime.admit(1, 1, read()).err(),
        Some(SessionError::RequestId)
    );
    let available = runtime.admit(next, 1, read()).unwrap();
    assert!(runtime.execute_admitted(available).await.unwrap().is_ok());
    let other_root = TempDir::new().unwrap();
    let other = session(&other_root, Arc::new(InMemoryKeystore::new()));
    let foreign = runtime.admit(next + 1, 1, read()).unwrap();
    assert_eq!(
        other.execute_admitted(foreign).await.unwrap_err(),
        SessionError::RequestId
    );
}

#[path = "credential_import_tests.rs"]
mod credential_import_tests;

#[path = "credential_export_tests.rs"]
mod credential_export_tests;

#[path = "file_reader_tests.rs"]
mod file_reader_tests;

#[path = "document_save_tests.rs"]
mod document_save_tests;
#[path = "file_writer_tests.rs"]
mod file_writer_tests;

#[tokio::test]
async fn catalog_mutations_publish_domain_invalidations_without_ui_subscriptions() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    let response = runtime
        .execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"event-fixture"})),
        )
        .await
        .unwrap();
    assert!(response.is_ok());
    let before = runtime.snapshot().unwrap().sequence;
    let created = runtime.execute(2, 1, RpcRequest::new("passmanager:entry:create", json!({
        "entry_id":"event-record", "title":"Event account", "username":"alice", "entry_type":"login", "secrets":{"password":"synthetic"}
    }))).await.unwrap();
    assert!(created.is_ok(), "{created:?}");
    assert!(
        runtime.snapshot().unwrap().sequence > before,
        "successful catalog mutation must notify native observers"
    );
    let batch = tokio::time::timeout(Duration::from_secs(2), runtime.events(before))
        .await
        .unwrap()
        .unwrap();
    assert!(
        batch
            .events
            .iter()
            .any(|event| event.kind == crate::session::SessionEventKind::DomainInvalidated)
    );
    let before_read = runtime.snapshot().unwrap().sequence;
    let read = runtime
        .execute(3, 1, RpcRequest::new("passmanager:entry:list", json!({})))
        .await
        .unwrap();
    assert!(read.is_ok(), "{read:?}");
    assert_eq!(
        runtime.snapshot().unwrap().sequence,
        before_read,
        "metadata reads must not trigger invalidation"
    );
    let deleted = runtime
        .execute(
            4,
            1,
            RpcRequest::new(
                "passmanager:entry:delete",
                json!({"entry_id":"event-record"}),
            ),
        )
        .await
        .unwrap();
    assert!(deleted.is_ok(), "{deleted:?}");
    assert!(runtime.snapshot().unwrap().sequence > before_read);
}

#[path = "peer_session_tests.rs"]
mod peer_session_tests;
