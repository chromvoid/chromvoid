use super::*;
use crate::session::credential_export::{ExportError, MAX_EXPORT_BYTES, MAX_EXPORT_CHUNK_BYTES};
use crate::session::credential_import::{ImportError, ImportMode};

async fn unlocked_export(root: &TempDir) -> LocalSession {
    let runtime = session(root, Arc::new(InMemoryKeystore::new()));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"export fixture"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    runtime
}

#[tokio::test]
async fn exported_chunks_are_one_complete_snapshot_and_can_be_imported_without_secret_loss() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_export(&root).await;
    let note = "synthetic export\n".repeat(65536);
    let seed = json!({"folders":["Imported"],"entries":[{"id":"exported","title":"Before","folderPath":"Imported","username":"alice","password":"synthetic-password","note":note}]});
    assert!(
        runtime
            .execute(2, 1, RpcRequest::new("passmanager:root:import", seed))
            .await
            .unwrap()
            .is_ok()
    );
    let handle = runtime.begin_root_export(1).unwrap();
    assert!(matches!(handle.read_chunk(), Err(ExportError::State)));
    let prepared = runtime.prepare_root_export(3, &handle).unwrap();
    let response = runtime.execute_admitted(prepared).await.unwrap();
    assert!(response.is_ok());
    assert!(response.result().unwrap().is_null()); // No secret document in the metadata reply.
    let byte_count = handle.byte_count().unwrap();
    assert!(byte_count > 1024 * 1024);
    assert!(runtime.execute(4, 1, RpcRequest::new("passmanager:secret:save",json!({"entry_id":"exported","secret_type":"password","value":"changed after snapshot"}))).await.unwrap().is_ok());
    let mut bytes = Vec::new();
    loop {
        let chunk = handle.read_chunk().unwrap();
        assert!(chunk.len() <= MAX_EXPORT_CHUNK_BYTES);
        if chunk.is_empty() {
            break;
        }
        bytes.extend(chunk);
    }
    assert_eq!(bytes.len() as u64, byte_count);
    assert!(handle.read_chunk().unwrap().is_empty());
    let mut document: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(document["version"], 4);
    assert_eq!(document["entries"][0]["password"], "synthetic-password");
    assert_eq!(document["entries"][0]["note"], note);
    document["mode"] = json!("replace");
    document["allow_destructive"] = json!(true);
    assert!(
        runtime
            .execute(5, 1, RpcRequest::new("passmanager:root:import", document))
            .await
            .unwrap()
            .is_ok()
    );
    let saved = runtime
        .execute(
            6,
            1,
            RpcRequest::new(
                "passmanager:secret:read",
                json!({"entry_id":"exported","secret_type":"password"}),
            ),
        )
        .await
        .unwrap();
    assert_eq!(saved.result().unwrap()["value"], "synthetic-password");
}

#[tokio::test]
async fn import_and_export_share_the_physical_slot_and_canceled_preparation_does_not_publish() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_export(&root).await;
    let input = runtime.begin_root_import(1, 2, ImportMode::Merge).unwrap();
    assert!(matches!(
        runtime.begin_root_export(1),
        Err(ExportError::Session(SessionError::Busy))
    ));
    drop(input);
    let output = runtime.begin_root_export(1).unwrap();
    assert!(matches!(
        runtime.begin_root_import(1, 2, ImportMode::Merge),
        Err(ImportError::Session(SessionError::Busy))
    ));
    let admitted = runtime.prepare_root_export(2, &output).unwrap();
    output.cancel().unwrap();
    drop(output);
    assert!(matches!(
        runtime.begin_root_export(1),
        Err(ExportError::Session(SessionError::Busy))
    ));
    assert_eq!(
        runtime.execute_admitted(admitted).await.unwrap_err(),
        SessionError::Canceled
    );
    let next = runtime.begin_root_export(1).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_root_export(3, &next).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    runtime.cancel(3).unwrap();
    assert!(matches!(next.read_chunk(), Err(ExportError::State)));
}

#[tokio::test]
async fn lock_revokes_ready_output_and_foreign_sessions_cannot_prepare_it() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_export(&root).await;
    let output = runtime.begin_root_export(1).unwrap();
    let other_root = TempDir::new().unwrap();
    let other = unlocked_export(&other_root).await;
    assert!(matches!(
        other.prepare_root_export(2, &output),
        Err(ExportError::Session(SessionError::RequestId))
    ));
    assert!(
        runtime
            .execute_admitted(runtime.prepare_root_export(2, &output).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    runtime.lock().unwrap();
    assert!(matches!(
        output.read_chunk(),
        Err(ExportError::Session(SessionError::Revoked))
    ));
    assert!(matches!(
        output.byte_count(),
        Err(ExportError::Session(SessionError::Revoked))
    ));
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    assert!(matches!(
        runtime.begin_root_export(generation),
        Err(ExportError::Session(SessionError::Revoked))
    ));
}

#[tokio::test]
async fn oversized_export_fails_without_exposing_partial_document_or_modifying_the_vault() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_export(&root).await;
    let note = "s".repeat(MAX_EXPORT_BYTES);
    let seed = json!({"folders":[],"entries":[{"id":"large","title":"Large","note":note}]});
    assert!(
        runtime
            .execute(2, 1, RpcRequest::new("passmanager:root:import", seed))
            .await
            .unwrap()
            .is_ok()
    );
    let output = runtime.begin_root_export(1).unwrap();
    let result = runtime
        .execute_admitted(runtime.prepare_root_export(3, &output).unwrap())
        .await
        .unwrap();
    assert_eq!(result.code(), Some("CREDENTIAL_EXPORT_TOO_LARGE"));
    assert!(matches!(output.byte_count(), Err(ExportError::State)));
    assert!(matches!(output.read_chunk(), Err(ExportError::State)));
    let saved = runtime
        .execute(
            4,
            1,
            RpcRequest::new(
                "passmanager:secret:read",
                json!({"entry_id":"large","secret_type":"note"}),
            ),
        )
        .await
        .unwrap();
    assert_eq!(saved.result().unwrap()["value"], note);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn canceling_queued_export_keeps_its_slot_until_worker_completion() {
    use std::future::{Future, poll_fn};
    use std::task::Poll;
    let root = TempDir::new().unwrap();
    let runtime = unlocked_export(&root).await;
    let (started, receive_started) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let barrier = runtime
        .dispatcher
        .schedule_adapter_phase(
            crate::dispatch::policy::CoreRpcPriority::UserBlocking,
            "fixture",
            "hold worker",
            0,
            move || {
                started.send(()).unwrap();
                let _ = released.recv();
            },
        )
        .unwrap();
    tokio::task::spawn_blocking(move || {
        receive_started
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
    })
    .await
    .unwrap();
    let handle = runtime.begin_root_export(1).unwrap();
    let admitted = runtime.prepare_root_export(2, &handle).unwrap();
    let mut work = Box::pin(runtime.execute_admitted(admitted));
    poll_fn(|context| {
        assert!(work.as_mut().poll(context).is_pending());
        Poll::Ready(())
    })
    .await;
    runtime.cancel(2).unwrap();
    drop(handle);
    assert!(matches!(
        runtime.begin_root_export(1),
        Err(ExportError::Session(SessionError::Busy))
    ));
    release.send(()).unwrap();
    barrier.await.unwrap().unwrap();
    assert_eq!(work.await.unwrap_err(), SessionError::Canceled);
    let next = runtime.begin_root_export(1).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_root_export(3, &next).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(!next.read_chunk().unwrap().is_empty());
}

#[tokio::test]
#[ignore = "populated export memory fixture; run explicitly with process RSS measurement"]
async fn credential_export_memory_fixture() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked_export(&root).await;
    let note = "synthetic ".repeat(1400);
    let entries: Vec<_> = (0..1000)
        .map(|id| json!({"id":format!("export-{id}"),"title":format!("Export {id}"),"note":note}))
        .collect();
    assert!(
        runtime
            .execute(
                2,
                1,
                RpcRequest::new(
                    "passmanager:root:import",
                    json!({"folders":[],"entries":entries})
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    let output = runtime.begin_root_export(1).unwrap();
    assert!(
        runtime
            .execute_admitted(runtime.prepare_root_export(3, &output).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    let expected = output.byte_count().unwrap();
    let mut received = 0;
    loop {
        let chunk = output.read_chunk().unwrap();
        if chunk.is_empty() {
            break;
        }
        received += chunk.len() as u64;
    }
    assert_eq!(received, expected);
    println!("credential export fixture: 1000 entries, {received} output bytes");
}
