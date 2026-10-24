use super::*;
use crate::session::document_save::{DocumentSaveError, MAX_DOCUMENT_BYTES};
use crate::session::file_writer::FileWriteTarget;

async fn document() -> (TempDir, LocalSession, u64, u64) {
    let root = TempDir::new().unwrap();
    let runtime = session(&root, Arc::new(InMemoryKeystore::new()));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic document"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let writer = runtime
        .begin_file_writer(
            1,
            FileWriteTarget {
                parent_path: "/".into(),
                name: "Note.md".into(),
                mime_type: Some("text/markdown".into()),
                byte_count: 8,
            },
        )
        .unwrap();
    assert!(
        runtime
            .execute_admitted(
                runtime
                    .prepare_file_append(2, &writer, b"original".to_vec())
                    .unwrap()
            )
            .await
            .unwrap()
            .is_ok()
    );
    let result = runtime
        .execute_admitted(runtime.prepare_file_finish(3, &writer).unwrap())
        .await
        .unwrap();
    assert!(result.is_ok(), "{result:?}");
    let node = result.result().unwrap()["node_id"].as_u64().unwrap();
    let result = runtime
        .execute(
            4,
            1,
            RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
        )
        .await
        .unwrap();
    let revision = result.result().unwrap()["source_revision"]
        .as_u64()
        .unwrap();
    drop(writer);
    (root, runtime, node, revision)
}

async fn read(runtime: &LocalSession, request_id: &mut u64, node: u64) -> Vec<u8> {
    let reader = runtime
        .begin_file_reader(runtime.snapshot().unwrap().generation, node)
        .unwrap();
    let mut bytes = Vec::new();
    loop {
        *request_id += 1;
        let result = runtime
            .execute_admitted(
                runtime
                    .prepare_file_read(*request_id, &reader, bytes.len() as u64, 64 * 1024)
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(result.is_ok(), "{result:?}");
        let chunk = reader.take_chunk().unwrap();
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 == result.result().unwrap()["size"].as_u64().unwrap() {
            return bytes;
        }
        assert!(!chunk.is_empty(), "unexpected EOF");
    }
}

#[tokio::test]
async fn document_save_keeps_identity_checks_revision_and_supports_utf8_and_empty_content() {
    let (_root, runtime, node, revision) = document().await;
    let content = "# Документ\n\n- [x] сохранён 📝\n"
        .repeat(3000)
        .into_bytes();
    let result = runtime
        .execute_admitted(
            runtime
                .prepare_document_save(5, 1, node, revision, content.clone())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(result.is_ok(), "{result:?}");
    let saved = result.result().unwrap();
    assert_eq!(saved["node_id"], node);
    assert_eq!(saved["size"], content.len());
    assert_eq!(saved["mime_type"], "text/markdown");
    let current = saved["source_revision"].as_u64().unwrap();
    assert!(current > revision);
    let mut id = 5;
    assert_eq!(read(&runtime, &mut id, node).await, content);
    id += 1;
    let stale = runtime
        .execute_admitted(
            runtime
                .prepare_document_save(id, 1, node, revision, b"stale editor".to_vec())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(stale.code(), Some("ERR_STALE_SOURCE"));
    assert_eq!(read(&runtime, &mut id, node).await, content);
    id += 1;
    let empty = runtime
        .execute_admitted(
            runtime
                .prepare_document_save(id, 1, node, current, Vec::new())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(empty.is_ok(), "{empty:?}");
    assert_eq!(empty.result().unwrap()["node_id"], node);
    assert!(read(&runtime, &mut id, node).await.is_empty());
}

#[tokio::test]
async fn document_save_bounds_pending_memory_and_dropping_admission_does_not_write() {
    let (_root, runtime, node, revision) = document().await;
    assert!(matches!(
        runtime.prepare_document_save(5, 1, node, revision, vec![0; MAX_DOCUMENT_BYTES + 1]),
        Err(DocumentSaveError::Length)
    ));
    let pending = runtime
        .prepare_document_save(5, 1, node, revision, vec![b'a'; MAX_DOCUMENT_BYTES])
        .unwrap();
    assert!(matches!(
        runtime.prepare_document_save(6, 1, node, revision, Vec::new()),
        Err(DocumentSaveError::Session(SessionError::Busy))
    ));
    drop(pending);
    let mut id = 5;
    assert_eq!(read(&runtime, &mut id, node).await, b"original");
    id += 1;
    let result = runtime
        .execute_admitted(
            runtime
                .prepare_document_save(id, 1, node, revision, vec![b'b'; MAX_DOCUMENT_BYTES])
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(
        read(&runtime, &mut id, node).await,
        vec![b'b'; MAX_DOCUMENT_BYTES]
    );
}

#[tokio::test]
async fn cancel_and_lock_clear_unstarted_document_bytes_and_preserve_the_saved_file() {
    let (_root, runtime, node, revision) = document().await;
    for lock in [false, true] {
        let id = if lock { 7 } else { 5 };
        let pending = runtime
            .prepare_document_save(id, 1, node, revision, b"must not persist".to_vec())
            .unwrap();
        // Keep the admitted request alive to prove revoke clears its retained payload.
        let state = runtime
            .inner
            .authority
            .lock()
            .unwrap()
            .document_save
            .upgrade()
            .unwrap();
        if lock {
            runtime.lock().unwrap();
        } else {
            runtime.cancel(id).unwrap();
        }
        assert!(state.lock().unwrap().bytes.is_none());
        assert_eq!(
            runtime.execute_admitted(pending).await.unwrap_err(),
            if lock {
                SessionError::Revoked
            } else {
                SessionError::Canceled
            }
        );
        drop(state);
        if lock {
            phase(&runtime, SessionPhase::Locked).await;
            let generation = runtime.snapshot().unwrap().generation;
            assert!(
                runtime
                    .execute(
                        8,
                        generation,
                        RpcRequest::new("vault:unlock", json!({"password":"synthetic document"}))
                    )
                    .await
                    .unwrap()
                    .is_ok()
            );
        }
        let mut id = if lock { 8 } else { 5 };
        assert_eq!(read(&runtime, &mut id, node).await, b"original");
    }
}
