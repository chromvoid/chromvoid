use super::*;
use crate::session::file_reader::{
    FileReadError, FileReaderHandle, MAX_FILE_READ_BYTES, MAX_FILE_READERS,
};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use sha2::{Digest, Sha256};

async fn unlocked_files(root: &TempDir) -> LocalSession {
    let runtime = session(root, Arc::new(InMemoryKeystore::new()));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic files"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    runtime
}

// Seed through the real Core stream boundary until the runtime writer lands.
fn upload(runtime: &LocalSession, name: &str, bytes: &[u8]) -> u64 {
    let response = runtime.inner.adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            json!({
                "parent_path":"/", "name":name, "size":bytes.len(),
                "total_size":bytes.len(), "offset":0, "finish":true, "chunk_size":4096
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    );
    let RpcReply::Json(response) = response else {
        panic!("Expected upload response");
    };
    assert!(response.is_ok(), "{response:?}");
    response.result().unwrap()["node_id"].as_u64().unwrap()
}

async fn read(
    runtime: &LocalSession,
    handle: &FileReaderHandle,
    id: u64,
    offset: u64,
    length: usize,
) -> (serde_json::Value, Vec<u8>) {
    let response = runtime
        .execute_admitted(
            runtime
                .prepare_file_read(id, handle, offset, length)
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(response.is_ok(), "{response:?}");
    (
        response.result().unwrap().clone(),
        handle.take_chunk().unwrap(),
    )
}

#[tokio::test]
async fn positioned_reads_roundtrip_across_storage_chunks_and_verify_eof() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    let original: Vec<u8> = (0..(2 * 1024 * 1024 + 193))
        .map(|i| (i % 251) as u8)
        .collect();
    let node = upload(&runtime, "binary.dat", &original);
    let handle = runtime.begin_file_reader(1, node).unwrap();
    let (meta, positioned) = read(&runtime, &handle, 2, 4093, 23).await;
    assert_eq!(positioned, original[4093..4116]);
    assert_eq!(meta["size"], original.len());
    assert_eq!(meta["name"], "binary.dat");
    assert!(meta.get("bytes").is_none());
    let revision = meta["source_revision"].clone();
    let mut actual = Vec::new();
    let mut id = 3;
    loop {
        let (meta, chunk) = read(
            &runtime,
            &handle,
            id,
            actual.len() as u64,
            MAX_FILE_READ_BYTES,
        )
        .await;
        id += 1;
        assert_eq!(meta["source_revision"], revision);
        assert!(chunk.len() <= MAX_FILE_READ_BYTES);
        if chunk.is_empty() {
            break;
        }
        actual.extend(chunk);
    }
    assert_eq!(Sha256::digest(&actual), Sha256::digest(&original));
    assert_eq!(actual, original);
    assert!(
        read(&runtime, &handle, id, actual.len() as u64, 1)
            .await
            .1
            .is_empty()
    );
    let empty = upload(&runtime, "empty.txt", &[]);
    let handle = runtime.begin_file_reader(1, empty).unwrap();
    let (meta, chunk) = read(&runtime, &handle, id + 1, 0, MAX_FILE_READ_BYTES).await;
    assert_eq!(meta["size"], 0);
    assert!(chunk.is_empty());
}

#[tokio::test]
async fn changed_source_never_mixes_revisions_including_an_old_eof() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    let node = upload(&runtime, "changing.txt", b"old");
    let handle = runtime.begin_file_reader(1, node).unwrap();
    assert_eq!(read(&runtime, &handle, 2, 0, 1).await.1, b"o");
    let reply = runtime.inner.adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new(
            "catalog:file:replace",
            json!({"node_id":node,"size":3,"conflict_mode":"overwrite"}),
        ),
        Some(RpcInputStream::from_bytes(b"new".to_vec())),
    );
    let RpcReply::Json(response) = reply else {
        panic!("Expected replace response");
    };
    assert!(response.is_ok(), "{response:?}");
    let response = runtime
        .execute_admitted(runtime.prepare_file_read(3, &handle, 3, 1).unwrap())
        .await
        .unwrap();
    assert_eq!(response.code(), Some("ERR_MEDIA_STREAM_STALE"));
    assert_eq!(handle.take_chunk(), Err(FileReadError::State));
    let reopened = runtime.begin_file_reader(1, node).unwrap();
    assert_eq!(
        read(&runtime, &reopened, 4, 0, MAX_FILE_READ_BYTES).await.1,
        b"new"
    );
}

#[tokio::test]
async fn invalid_ranges_missing_and_directory_nodes_do_not_publish_bytes() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    let node = upload(&runtime, "small.bin", b"123");
    let handle = runtime.begin_file_reader(1, node).unwrap();
    for length in [0, MAX_FILE_READ_BYTES + 1, usize::MAX] {
        assert!(matches!(
            runtime.prepare_file_read(2, &handle, 0, length),
            Err(FileReadError::Length)
        ));
    }
    let response = runtime
        .execute_admitted(runtime.prepare_file_read(2, &handle, u64::MAX, 1).unwrap())
        .await
        .unwrap();
    assert_eq!(response.code(), Some("ERR_MEDIA_RANGE_INVALID"));
    assert_eq!(handle.take_chunk(), Err(FileReadError::State));
    let folder = runtime
        .execute(
            3,
            1,
            RpcRequest::new("catalog:createDir", json!({"name":"folder"})),
        )
        .await
        .unwrap();
    assert!(folder.is_ok(), "{folder:?}");
    let folder = folder.result().unwrap()["node_id"].as_u64().unwrap();
    for (id, node, code) in [
        (4, folder, "INTERNAL_ERROR"),
        (5, u64::MAX, "NODE_NOT_FOUND"),
    ] {
        let handle = runtime.begin_file_reader(1, node).unwrap();
        let response = runtime
            .execute_admitted(runtime.prepare_file_read(id, &handle, 0, 1).unwrap())
            .await
            .unwrap();
        assert_eq!(response.code(), Some(code));
        assert_eq!(handle.take_chunk(), Err(FileReadError::State));
    }
}

#[tokio::test]
async fn backpressure_cancellation_and_resource_bound_do_not_leave_readable_output() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    let node = upload(&runtime, "secret.bin", b"synthetic file content");
    let mut handles: Vec<_> = (0..MAX_FILE_READERS)
        .map(|_| runtime.begin_file_reader(1, node).unwrap())
        .collect();
    assert!(matches!(
        runtime.begin_file_reader(1, node),
        Err(FileReadError::Session(SessionError::Busy))
    ));
    let handle = handles.pop().unwrap();
    let admitted = runtime.prepare_file_read(2, &handle, 0, 4).unwrap();
    assert!(matches!(
        runtime.prepare_file_read(3, &handle, 4, 4),
        Err(FileReadError::State)
    ));
    runtime.cancel(2).unwrap();
    assert_eq!(
        runtime.execute_admitted(admitted).await.unwrap_err(),
        SessionError::Canceled
    );
    assert_eq!(handle.take_chunk(), Err(FileReadError::State));
    drop(handle);
    let handle = runtime.begin_file_reader(1, node).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_file_read(3, &handle, 0, 4).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(matches!(
        runtime.prepare_file_read(4, &handle, 4, 4),
        Err(FileReadError::State)
    ));
    runtime.cancel(3).unwrap();
    assert_eq!(handle.take_chunk(), Err(FileReadError::State));
    drop(handle);
    let handle = runtime.begin_file_reader(1, node).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_file_read(4, &handle, 0, 4).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(handle.take_chunk().unwrap(), b"synt");
    assert_eq!(handle.take_chunk(), Err(FileReadError::State));
    assert_eq!(read(&runtime, &handle, 5, 4, 4).await.1, b"heti");
}

#[tokio::test]
async fn locking_revokes_ready_and_admitted_readers_and_reunlock_does_not_restore_them() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    let node = upload(&runtime, "private.txt", b"synthetic private content");
    let ready = runtime.begin_file_reader(1, node).unwrap();
    let queued = runtime.begin_file_reader(1, node).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_file_read(2, &ready, 0, 8).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    let admitted = runtime.prepare_file_read(3, &queued, 0, 8).unwrap();
    runtime.lock().unwrap();
    assert_eq!(
        ready.take_chunk(),
        Err(FileReadError::Session(SessionError::Revoked))
    );
    assert_eq!(
        runtime.execute_admitted(admitted).await.unwrap_err(),
        SessionError::Revoked
    );
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    assert!(matches!(
        runtime.begin_file_reader(generation, node),
        Err(FileReadError::Session(SessionError::Revoked))
    ));
    assert!(
        runtime
            .execute(
                4,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic files"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(
        ready.take_chunk(),
        Err(FileReadError::Session(SessionError::Revoked))
    );
    let fresh = runtime.begin_file_reader(generation, node).unwrap();
    assert_eq!(read(&runtime, &fresh, 5, 0, 9).await.1, b"synthetic");
    let other_root = TempDir::new().unwrap();
    let other = unlocked_files(&other_root).await;
    assert!(matches!(
        other.prepare_file_read(2, &fresh, 0, 1),
        Err(FileReadError::Session(SessionError::RequestId))
    ));
}

#[tokio::test]
async fn prepared_bytes_cannot_publish_after_cancel_or_revoke() {
    // Exercise the worker execution/publication boundary with real Core output.
    // Session integration above covers admission and the production dispatcher.
    for lock in [false, true] {
        let root = TempDir::new().unwrap();
        let runtime = unlocked_files(&root).await;
        let node = upload(&runtime, "pending.bin", b"synthetic pending output");
        let handle = runtime.begin_file_reader(1, node).unwrap();
        let mut admitted = runtime.prepare_file_read(2, &handle, 0, 8).unwrap();
        let mut work = admitted.resource_work.take().unwrap();
        assert!(
            work.execute(
                &mut runtime.inner.adapter.lock().unwrap(),
                &admitted.request.0,
                &mut || panic!("File operations must not reset storage"),
            )
            .is_ok()
        );
        if lock {
            runtime.lock().unwrap();
        } else {
            runtime.cancel(2).unwrap();
        }
        assert_eq!(work.publish(), Err(SessionError::Canceled));
        assert!(handle.take_chunk().is_err());
        drop(work);
        drop(admitted);
        if lock {
            phase(&runtime, SessionPhase::Locked).await;
        }
    }
}

#[tokio::test]
async fn a_protected_node_id_is_not_a_file_read_capability() {
    use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    // Debug-only fixture admission; the worker's real read retains Core guards.
    set_bypass_system_shard_guards(true);
    let folder = runtime
        .inner
        .adapter
        .lock()
        .unwrap()
        .handle(&RpcRequest::new(
            "catalog:createDir",
            json!({"name":".passmanager"}),
        ));
    set_bypass_system_shard_guards(false);
    assert!(folder.is_ok(), "{folder:?}");
    set_bypass_system_shard_guards(true);
    let response = runtime.inner.adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            json!({
                "parent_path":"/.passmanager", "name":"protected.bin", "size":4,
                "total_size":4, "offset":0, "finish":true
            }),
        ),
        Some(RpcInputStream::from_bytes(b"test".to_vec())),
    );
    set_bypass_system_shard_guards(false);
    let RpcReply::Json(response) = response else {
        panic!("Expected upload response");
    };
    assert!(response.is_ok(), "{response:?}");
    let node = response.result().unwrap()["node_id"].as_u64().unwrap();
    let handle = runtime.begin_file_reader(1, node).unwrap();
    let response = runtime
        .execute_admitted(runtime.prepare_file_read(2, &handle, 0, 4).unwrap())
        .await
        .unwrap();
    assert_eq!(response.code(), Some("ACCESS_DENIED"));
    assert_eq!(handle.take_chunk(), Err(FileReadError::State));
}

#[tokio::test]
async fn lost_storage_data_fails_without_delivering_partial_bytes_or_eof() {
    use chromvoid_core::storage::Storage;
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    let node = upload(&runtime, "damaged.bin", &vec![7; 8192]);
    let handle = runtime.begin_file_reader(1, node).unwrap();
    assert_eq!(read(&runtime, &handle, 2, 0, 1).await.1, [7]);
    let storage = Storage::new(root.path().join("storage")).unwrap();
    let chunks = storage.list_chunks().unwrap();
    assert!(!chunks.is_empty());
    for chunk in chunks {
        storage.delete_chunk(&chunk).unwrap();
    }
    // The cached first block may be readable; the missing second block must fail
    // the entire bounded read, not expose its decrypted prefix as a successful read.
    let response = runtime
        .execute_admitted(runtime.prepare_file_read(3, &handle, 4090, 16).unwrap())
        .await
        .unwrap();
    assert!(!response.is_ok(), "{response:?}");
    assert_eq!(handle.take_chunk(), Err(FileReadError::State));
}

#[tokio::test]
async fn local_derivative_reads_only_after_ensure_and_stays_bounded() {
    use crate::session::peer_stream::DerivativeReadError;
    let root = TempDir::new().unwrap();
    let runtime = unlocked_files(&root).await;
    let mut png = Vec::new();
    image::DynamicImage::ImageRgb8(image::RgbImage::from_fn(2400, 1600, |x, y| {
        image::Rgb([(x % 251) as u8, (y % 241) as u8, ((x ^ y) % 199) as u8])
    }))
    .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
    .unwrap();
    let node = upload(&runtime, "photo.png", &png);
    let revision = runtime
        .inner
        .adapter
        .lock()
        .unwrap()
        .handle(&RpcRequest::new(
            "catalog:source:metadata",
            json!({"node_id": node}),
        ))
        .result()
        .unwrap()["source_revision"]
        .as_u64()
        .unwrap();

    let missing = runtime
        .execute_derivative(
            runtime
                .admit_derivative(50, 1, node, revision, "preview", false)
                .unwrap(),
        )
        .await;
    match missing {
        Err(DerivativeReadError::Response(response)) => {
            assert_eq!(response.code(), Some("NODE_NOT_FOUND"), "{response:?}")
        }
        other => panic!("expected a not-found reply, got {other:?}"),
    }

    let (response, bytes) = runtime
        .execute_derivative(
            runtime
                .admit_derivative(51, 1, node, revision, "preview", true)
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(response.is_ok(), "{response:?}");
    let meta = response.result().unwrap().clone();
    assert_eq!(meta["size"].as_u64().unwrap() as usize, bytes.len());
    assert!(meta["type"].as_str().unwrap().starts_with("image/"));
    let decoded = image::load_from_memory(&bytes).unwrap();
    assert!(decoded.width() <= 1920 && decoded.height() <= 1920);
    assert!(decoded.width() >= 1024);

    let (again, cached) = runtime
        .execute_derivative(
            runtime
                .admit_derivative(52, 1, node, revision, "preview", false)
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(again.is_ok());
    assert_eq!(*cached, *bytes);

    let thumbnail = runtime
        .execute_derivative(
            runtime
                .admit_derivative(53, 1, node, revision, "thumbnail", true)
                .unwrap(),
        )
        .await
        .unwrap()
        .1;
    let small = image::load_from_memory(&thumbnail).unwrap();
    assert!(small.width() <= 256 && small.height() <= 256);
    assert!(
        runtime
            .admit_derivative(54, 1, node, revision, "poster", true)
            .is_err()
    );
}
