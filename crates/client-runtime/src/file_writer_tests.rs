use super::*;
use crate::dispatch::policy::CoreRpcPriority;
use crate::session::file_reader::MAX_FILE_READ_BYTES;
use crate::session::file_writer::{
    FileWriteError, FileWriteTarget, FileWriterHandle, MAX_FILE_WRITE_BYTES,
};
use sha2::{Digest, Sha256};

async fn unlocked_writer(root: &TempDir) -> LocalSession {
    let runtime = session(root, Arc::new(InMemoryKeystore::new()));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic writer"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    runtime
}

fn writer(runtime: &LocalSession, name: &str, size: usize) -> FileWriterHandle {
    runtime
        .begin_file_writer(
            runtime.snapshot().unwrap().generation,
            FileWriteTarget {
                parent_path: "/".into(),
                name: name.into(),
                mime_type: Some("application/octet-stream".into()),
                byte_count: size as u64,
            },
        )
        .unwrap()
}

async fn cleanup_fence(runtime: &LocalSession) {
    runtime
        .dispatcher
        .run_adapter_phase(
            CoreRpcPriority::UserBlocking,
            "test:file-cleanup-fence",
            "test",
            runtime.dispatcher.low_priority_cancellation_generation(),
            || (),
        )
        .await
        .unwrap();
}

async fn append(
    runtime: &LocalSession,
    handle: &FileWriterHandle,
    id: u64,
    data: &[u8],
) -> serde_json::Value {
    let result = runtime
        .execute_admitted(
            runtime
                .prepare_file_append(id, handle, data.to_vec())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(result.result().unwrap()["completed"], false);
    result.result().unwrap().clone()
}

async fn finish(runtime: &LocalSession, handle: &FileWriterHandle, id: u64) -> u64 {
    let result = runtime
        .execute_admitted(runtime.prepare_file_finish(id, handle).unwrap())
        .await
        .unwrap();
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(result.result().unwrap()["completed"], true);
    result.result().unwrap()["node_id"].as_u64().unwrap()
}

#[tokio::test]
async fn erase_supersedes_retained_upload_cleanup_for_subsequent_lock_and_close() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    assert!(
        runtime
            .execute(
                2,
                1,
                RpcRequest::new(
                    "master:setup",
                    json!({"master_password":"synthetic erase administrator"})
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    let upload = writer(&runtime, "unfinished.bin", 2048);
    append(&runtime, &upload, 3, &[42; 1024]).await;
    let erase = runtime.begin_storage_erase(1).unwrap();
    let review = runtime.review_storage_erase(4, &erase).unwrap();
    assert!(runtime.execute_admitted(review).await.unwrap().is_ok());
    let commit = runtime
        .commit_storage_erase(5, &erase, "synthetic erase administrator".into())
        .unwrap();
    assert_eq!(
        runtime.execute_admitted(commit).await.unwrap_err(),
        SessionError::Revoked
    );
    assert!(matches!(
        erase.receipt().unwrap(),
        Some(crate::session::storage_erase::EraseReceipt::Completed(_))
    ));
    assert!(matches!(
        runtime.prepare_file_finish(6, &upload),
        Err(FileWriteError::Session(SessionError::Revoked))
    ));
    runtime.lock().unwrap();
    cleanup_fence(&runtime).await;
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Locked);
    assert!(!runtime.snapshot().unwrap().cleanup_pending);
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}

#[tokio::test]
async fn bounded_upload_is_invisible_until_finish_and_roundtrips_exact_bytes_and_empty_files() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let data: Vec<u8> = (0..(1024 * 1024 + 193)).map(|i| (i % 251) as u8).collect();
    let handle = writer(&runtime, "roundtrip.bin", data.len());
    // Within the declared file size, but above the per-call memory bound.
    assert!(matches!(
        runtime.prepare_file_append(2, &handle, vec![0; 1024 * 1024 + 1]),
        Err(FileWriteError::Length)
    ));
    let mut id = 2;
    let mut offset = 0;
    let mut node = 0;
    // A native caller can stream a MiB at a time, including a short final part.
    for chunk in data.chunks(1024 * 1024) {
        let progress = append(&runtime, &handle, id, chunk).await;
        offset += chunk.len();
        assert_eq!(progress["uploaded_bytes"], offset);
        node = progress["node_id"].as_u64().unwrap();
        id += 1;
        let before = runtime
            .execute(
                id,
                1,
                RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
            )
            .await
            .unwrap();
        assert_eq!(before.code(), Some("NODE_NOT_FOUND"));
        id += 1;
    }
    assert_eq!(finish(&runtime, &handle, id).await, node);
    id += 1;
    handle.cancel().unwrap(); // Completed files are never undone by disposal/cancellation.
    drop(handle);
    let read = runtime.begin_file_reader(1, node).unwrap();
    let mut actual = Vec::new();
    while actual.len() < data.len() {
        let response = runtime
            .execute_admitted(
                runtime
                    .prepare_file_read(id, &read, actual.len() as u64, MAX_FILE_READ_BYTES)
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(response.is_ok(), "{response:?}");
        id += 1;
        actual.extend(read.take_chunk().unwrap());
    }
    assert_eq!(Sha256::digest(&actual), Sha256::digest(&data));
    assert_eq!(actual, data);
    let empty = writer(&runtime, "empty.bin", 0);
    let node = finish(&runtime, &empty, id).await;
    let reader = runtime.begin_file_reader(1, node).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_file_read(id + 1, &reader, 0, 1).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(reader.take_chunk().unwrap().is_empty());
}

#[tokio::test]
async fn length_backpressure_and_foreign_session_checks_precede_storage_writes() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let handle = writer(&runtime, "bounded.bin", 4);
    assert!(matches!(
        runtime.prepare_file_finish(2, &handle),
        Err(FileWriteError::Length)
    ));
    for data in [Vec::new(), vec![1; 5], vec![1; MAX_FILE_WRITE_BYTES + 1]] {
        assert!(matches!(
            runtime.prepare_file_append(2, &handle, data),
            Err(FileWriteError::Length)
        ));
    }
    let admitted = runtime
        .prepare_file_append(2, &handle, b"ab".to_vec())
        .unwrap();
    assert!(matches!(
        runtime.prepare_file_append(3, &handle, b"cd".to_vec()),
        Err(FileWriteError::State)
    ));
    assert!(runtime.execute_admitted(admitted).await.unwrap().is_ok());
    assert!(matches!(
        runtime.prepare_file_finish(3, &handle),
        Err(FileWriteError::Length)
    ));
    let other_root = TempDir::new().unwrap();
    let other = unlocked_writer(&other_root).await;
    assert!(matches!(
        other.prepare_file_finish(2, &handle),
        Err(FileWriteError::Session(SessionError::RequestId))
    ));
    append(&runtime, &handle, 3, b"cd").await;
    finish(&runtime, &handle, 4).await;
    assert!(matches!(
        runtime.prepare_file_append(5, &handle, b"e".to_vec()),
        Err(FileWriteError::State)
    ));
}

#[tokio::test]
async fn cancellation_after_a_part_aborts_staging_and_frees_the_single_writer_slot() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let handle = writer(&runtime, "retry.bin", 6);
    assert!(matches!(
        runtime.begin_file_writer(
            1,
            FileWriteTarget {
                parent_path: "/".into(),
                name: "second".into(),
                mime_type: None,
                byte_count: 0
            }
        ),
        Err(FileWriteError::Session(SessionError::Busy))
    ));
    append(&runtime, &handle, 2, b"abc").await;
    runtime.cancel(2).unwrap();
    assert!(matches!(
        runtime.prepare_file_append(3, &handle, b"def".to_vec()),
        Err(FileWriteError::State)
    ));
    handle.cancel_and_wait().await.unwrap();
    drop(handle);
    let fresh = writer(&runtime, "retry.bin", 3);
    append(&runtime, &fresh, 3, b"new").await;
    finish(&runtime, &fresh, 4).await;
}

#[tokio::test]
async fn canceled_or_dropped_admission_cannot_leave_a_pending_upload() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let handle = writer(&runtime, "queued.bin", 3);
    let admitted = runtime
        .prepare_file_append(2, &handle, b"abc".to_vec())
        .unwrap();
    handle.cancel().unwrap();
    assert_eq!(
        runtime.execute_admitted(admitted).await.unwrap_err(),
        SessionError::Canceled
    );
    drop(handle);
    cleanup_fence(&runtime).await;
    let handle = writer(&runtime, "queued.bin", 3);
    drop(
        runtime
            .prepare_file_append(3, &handle, b"abc".to_vec())
            .unwrap(),
    );
    cleanup_fence(&runtime).await;
    assert!(matches!(
        runtime.prepare_file_finish(4, &handle),
        Err(FileWriteError::State)
    ));
    drop(handle);
    let handle = writer(&runtime, "queued.bin", 0);
    finish(&runtime, &handle, 4).await;
}

#[tokio::test]
async fn lock_discards_partial_file_and_old_writer_cannot_continue_after_unlock() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let handle = writer(&runtime, "resume.bin", 6);
    append(&runtime, &handle, 2, b"abc").await;
    runtime.lock().unwrap();
    assert!(matches!(
        runtime.prepare_file_finish(3, &handle),
        Err(FileWriteError::Session(SessionError::Revoked))
    ));
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    assert!(
        runtime
            .execute(
                3,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic writer"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let absent = runtime
        .execute(
            4,
            generation,
            RpcRequest::new("catalog:list", json!({"path":"/"})),
        )
        .await
        .unwrap();
    assert!(absent.is_ok(), "{absent:?}");
    // A reserved staging ID is not durable identity and may be reused on unlock.
    assert!(
        absent.result().unwrap()["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["name"] != "resume.bin")
    );
    assert!(matches!(
        runtime.prepare_file_finish(5, &handle),
        Err(FileWriteError::Session(SessionError::Revoked))
    ));
    drop(handle);
    cleanup_fence(&runtime).await;
    let fresh = writer(&runtime, "resume.bin", 0);
    finish(&runtime, &fresh, 5).await;
}

#[tokio::test]
async fn cancellation_between_core_write_and_publication_retains_cleanup_ownership() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let handle = writer(&runtime, "inflight.bin", 3);
    let mut admitted = runtime
        .prepare_file_append(2, &handle, b"abc".to_vec())
        .unwrap();
    let mut work = admitted.resource_work.take().unwrap();
    assert!(
        work.execute(
            &mut runtime.inner.adapter.lock().unwrap(),
            &admitted.request.0,
            &mut || panic!("File operations must not reset storage"),
        )
        .is_ok()
    );
    handle.cancel().unwrap();
    assert_eq!(work.publish(), Err(SessionError::Canceled));
    drop(work);
    drop(admitted);
    drop(handle);
    cleanup_fence(&runtime).await;
    let fresh = writer(&runtime, "inflight.bin", 0);
    finish(&runtime, &fresh, 3).await;
}

#[tokio::test]
async fn native_upload_conflict_preserves_the_existing_file_and_a_failed_writer_can_be_released() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let handle = writer(&runtime, "existing.bin", 3);
    append(&runtime, &handle, 2, b"old").await;
    let node = finish(&runtime, &handle, 3).await;
    drop(handle);
    let conflict = writer(&runtime, "existing.bin", 3);
    let response = runtime
        .execute_admitted(
            runtime
                .prepare_file_append(4, &conflict, b"new".to_vec())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.code(), Some("NAME_EXIST"));
    assert!(matches!(
        runtime.prepare_file_finish(5, &conflict),
        Err(FileWriteError::State)
    ));
    drop(conflict);
    cleanup_fence(&runtime).await;
    let reader = runtime.begin_file_reader(1, node).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_file_read(5, &reader, 0, 3).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(reader.take_chunk().unwrap(), b"old");
    let fresh = writer(&runtime, "separate.bin", 0);
    finish(&runtime, &fresh, 6).await;
}

#[tokio::test]
async fn failed_staging_cleanup_revokes_the_session_instead_of_allowing_more_writes() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_writer(&root).await;
    let handle = writer(&runtime, "broken-storage.bin", 6);
    append(&runtime, &handle, 2, b"abc").await;
    // Turn the disposable vault's existing files into directories to force a real
    // read I/O error. Undecryptable marker bytes are deliberately treated as absent
    // by Core's existing deniability contract and cannot simulate this boundary.
    let mut pending = vec![root.path().join("storage")];
    let mut replaced = 0;
    while let Some(path) = pending.pop() {
        if path.is_dir() {
            pending.extend(
                std::fs::read_dir(path)
                    .unwrap()
                    .map(|entry| entry.unwrap().path()),
            );
        } else {
            std::fs::remove_file(&path).unwrap();
            std::fs::create_dir(&path).unwrap();
            replaced += 1;
        }
    }
    assert!(replaced > 0);
    handle.cancel().unwrap();
    phase(&runtime, SessionPhase::Failed).await;
    assert_eq!(
        handle.cancel_and_wait().await,
        Err(FileWriteError::Session(SessionError::Unavailable))
    );
    assert!(matches!(
        runtime.prepare_file_finish(3, &handle),
        Err(FileWriteError::Session(SessionError::Revoked))
    ));
}
