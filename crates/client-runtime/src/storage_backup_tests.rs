use super::*;
use crate::session::storage_backup::{BackupError, MAX_BACKUP_READ_BYTES};

const MASTER: &str = "synthetic backup administration password";

async fn setup(runtime: &LocalSession) {
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
    assert!(
        runtime
            .execute(
                2,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic vault"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    assert!(
        runtime
            .execute(
                3,
                1,
                RpcRequest::new("catalog:createDir", json!({"name":"backup source"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
}

#[tokio::test]
async fn storage_backup_drains_exact_artifacts_once_and_revokes_ready_bytes_on_lock() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    setup(&runtime).await;
    let handle = runtime.begin_storage_backup(1).unwrap();
    assert!(matches!(
        runtime.begin_storage_backup(1),
        Err(BackupError::Session(SessionError::Busy))
    ));
    let prepare = runtime
        .prepare_storage_backup(4, &handle, MASTER.to_string())
        .unwrap();
    assert!(runtime.execute_admitted(prepare).await.unwrap().is_ok());
    let artifacts = handle.artifacts().unwrap();
    assert_eq!(
        artifacts
            .iter()
            .map(|artifact| artifact.name.as_str())
            .collect::<Vec<_>>(),
        [
            "metadata.enc",
            "master.salt",
            "master.verify",
            "chunks.manifest.json",
            "chunks.pack"
        ]
    );
    let mut request = 5;
    for (index, artifact) in artifacts.iter().enumerate() {
        let mut total = 0;
        loop {
            let read = runtime
                .read_storage_backup(request, &handle, index)
                .unwrap();
            request += 1;
            assert!(runtime.execute_admitted(read).await.unwrap().is_ok());
            // Unconsumed bytes cannot be silently overwritten by another read.
            assert!(matches!(
                runtime.read_storage_backup(request, &handle, index),
                Err(BackupError::State)
            ));
            let bytes = handle.take_chunk().unwrap();
            assert!(bytes.len() <= MAX_BACKUP_READ_BYTES);
            total += bytes.len() as u64;
            assert!(matches!(handle.take_chunk(), Err(BackupError::State)));
            if bytes.is_empty() {
                break;
            }
        }
        assert_eq!(total, artifact.size);
    }
    let read = runtime.read_storage_backup(request, &handle, 0).unwrap();
    assert!(runtime.execute_admitted(read).await.unwrap().is_ok());
    runtime.lock().unwrap();
    assert_eq!(
        handle.take_chunk().unwrap_err(),
        BackupError::Session(SessionError::Revoked)
    );
    assert!(matches!(
        handle.artifacts(),
        Err(BackupError::Session(SessionError::Revoked))
    ));
    phase(&runtime, SessionPhase::Locked).await;
    handle.cancel().unwrap();
    drop(handle);
    runtime.close().unwrap();
}

#[tokio::test]
async fn storage_backup_wrong_password_never_publishes_and_queued_cancel_clears_authority() {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    setup(&runtime).await;
    let handle = runtime.begin_storage_backup(1).unwrap();
    let prepare = runtime
        .prepare_storage_backup(4, &handle, "incorrect".to_string())
        .unwrap();
    let response = runtime.execute_admitted(prepare).await.unwrap();
    assert_eq!(response.code(), Some("INVALID_MASTER_PASSWORD"));
    assert!(matches!(handle.artifacts(), Err(BackupError::State)));
    handle.cancel_and_wait().await.unwrap();
    drop(handle);
    // A failed attempt can be retried immediately after its public cleanup fence.
    let handle = runtime.begin_storage_backup(1).unwrap();
    let prepare = runtime
        .prepare_storage_backup(6, &handle, MASTER.to_string())
        .unwrap();
    runtime.cancel(6).unwrap();
    assert_eq!(
        runtime.execute_admitted(prepare).await.unwrap_err(),
        SessionError::Canceled
    );
    assert!(matches!(handle.artifacts(), Err(BackupError::State)));
    let response = runtime
        .execute(7, 1, RpcRequest::new("backup:local:start", json!({})))
        .await
        .unwrap();
    assert_eq!(response.code(), Some("EMPTY_PAYLOAD"));
    runtime.close().unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn storage_backup_lock_revokes_while_core_is_preparing_metadata() {
    let root = TempDir::new().unwrap();
    let (entered, receive) = mpsc::channel();
    let key = Arc::new(BlockingKey {
        key: InMemoryKeystore::new(),
        block: AtomicBool::new(false),
        entered,
        released: Mutex::new(false),
        release: Condvar::new(),
    });
    let runtime = Arc::new(session(&root, key.clone()));
    setup(&runtime).await;
    let handle = runtime.begin_storage_backup(1).unwrap();
    let admitted = runtime
        .prepare_storage_backup(4, &handle, MASTER.to_string())
        .unwrap();
    key.block.store(true, Ordering::SeqCst);
    let work = runtime.clone();
    let preparation = tokio::spawn(async move { work.execute_admitted(admitted).await });
    let reached = tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)))
        .await
        .unwrap();
    if reached.is_ok() {
        runtime.lock().unwrap();
        assert!(matches!(
            handle.artifacts(),
            Err(BackupError::Session(SessionError::Revoked))
        ));
    }
    key.release();
    reached.expect("Core metadata must reach actual pepper retrieval before lock");
    assert_eq!(
        preparation.await.unwrap().unwrap_err(),
        SessionError::Revoked
    );
    phase(&runtime, SessionPhase::Locked).await;
    assert!(matches!(
        handle.take_chunk(),
        Err(BackupError::Session(SessionError::Revoked))
    ));
    runtime.close().unwrap();
}
