use super::*;
use crate::session::credential_import::{
    ImportError, ImportHandle, ImportMode, MAX_IMPORT_BYTES, MAX_IMPORT_CHUNK_BYTES,
};

async fn unlocked(root: &TempDir) -> LocalSession {
    let runtime = session(root, Arc::new(InMemoryKeystore::new()));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"import fixture"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    runtime
}

fn input(runtime: &LocalSession, bytes: &[u8], mode: ImportMode) -> ImportHandle {
    let handle = runtime
        .begin_root_import(
            runtime.snapshot().unwrap().generation,
            bytes.len() as u64,
            mode,
        )
        .unwrap();
    for chunk in bytes.chunks(MAX_IMPORT_CHUNK_BYTES) {
        handle.append(chunk).unwrap();
    }
    handle
}

async fn count(runtime: &LocalSession, id: u64) -> usize {
    let reply = runtime
        .execute(
            id,
            runtime.snapshot().unwrap().generation,
            RpcRequest::new("passmanager:entry:list", json!({})),
        )
        .await
        .unwrap();
    assert!(reply.is_ok(), "{reply:?}");
    reply.result().unwrap()["entries"].as_array().unwrap().len()
}

#[tokio::test]
async fn bulk_input_reviews_without_mutation_then_commits_exact_reviewed_content_once() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let note = "synthetic large import\n".repeat(65536);
    let bytes = serde_json::to_vec(
        &json!({"folders":[],"entries":[{"id":"bulk","title":"Bulk","note":note}]}),
    )
    .unwrap();
    assert!(bytes.len() > 1024 * 1024);
    let handle = input(&runtime, &bytes, ImportMode::Merge);
    let review = runtime.review_root_import(2, &handle).unwrap();
    assert!(runtime.execute_admitted(review).await.unwrap().is_ok());
    assert_eq!(count(&runtime, 3).await, 0);
    let commit = runtime.commit_root_import(4, &handle).unwrap();
    assert!(matches!(
        runtime.commit_root_import(5, &handle),
        Err(ImportError::State)
    ));
    assert!(runtime.execute_admitted(commit).await.unwrap().is_ok());
    assert_eq!(count(&runtime, 5).await, 1);
    let read = runtime
        .execute(
            6,
            1,
            RpcRequest::new(
                "passmanager:secret:read",
                json!({"entry_id":"bulk","secret_type":"note"}),
            ),
        )
        .await
        .unwrap();
    assert_eq!(read.result().unwrap()["value"], note);
    drop(handle);
    runtime.lock().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    assert!(
        runtime
            .execute(
                7,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"import fixture"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(count(&runtime, 8).await, 1);
}

#[tokio::test]
async fn import_contents_cannot_grant_replacement_and_stale_reviews_do_not_write() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    assert!(
        runtime
            .execute(
                2,
                1,
                RpcRequest::new(
                    "passmanager:entry:create",
                    json!({"entry_id":"existing","title":"Existing"})
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    let bytes = serde_json::to_vec(&json!({"mode":"replace","allow_destructive":true,"allowDestructive":true,"expected_revision":"forged", "folders":[],"entries":[{"id":"new","title":"New"}]})).unwrap();
    let handle = input(&runtime, &bytes, ImportMode::Merge);
    let reviewed = runtime
        .execute_admitted(runtime.review_root_import(3, &handle).unwrap())
        .await
        .unwrap();
    assert_eq!(reviewed.result().unwrap()["mode"], "merge");
    assert!(
        runtime
            .execute_admitted(runtime.commit_root_import(4, &handle).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(count(&runtime, 5).await, 2);
    drop(handle);
    let handle = input(
        &runtime,
        br#"{"folders":[],"entries":[]}"#,
        ImportMode::Replace,
    );
    assert!(
        runtime
            .execute_admitted(runtime.review_root_import(6, &handle).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(runtime.execute(7, 1, RpcRequest::new("passmanager:secret:save",json!({"entry_id":"existing","secret_type":"password","value":"changed after review"}))).await.unwrap().is_ok());
    let result = runtime
        .execute_admitted(runtime.commit_root_import(8, &handle).unwrap())
        .await
        .unwrap();
    assert_eq!(result.code(), Some("SYNC_CONFLICT"));
    assert_eq!(count(&runtime, 9).await, 2);
    assert!(matches!(
        runtime.commit_root_import(10, &handle),
        Err(ImportError::State)
    ));
}

#[tokio::test]
async fn transfer_limits_cancel_and_lock_invalidate_unused_inputs() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    assert!(matches!(
        runtime.begin_root_import(1, MAX_IMPORT_BYTES as u64 + 1, ImportMode::Merge),
        Err(ImportError::TooLarge)
    ));
    let handle = runtime.begin_root_import(1, 10, ImportMode::Merge).unwrap();
    assert!(matches!(
        runtime.begin_root_import(1, 1, ImportMode::Merge),
        Err(ImportError::Session(SessionError::Busy))
    ));
    handle.append(b"{}").unwrap();
    assert!(matches!(
        runtime.review_root_import(2, &handle),
        Err(ImportError::Length)
    ));
    assert_eq!(
        handle.append(b"more than remaining"),
        Err(ImportError::Length)
    );
    assert_eq!(handle.append(b""), Err(ImportError::State));
    drop(handle);
    let handle = input(
        &runtime,
        br#"{"folders":[],"entries":[]}"#,
        ImportMode::Merge,
    );
    assert!(
        runtime
            .execute_admitted(runtime.review_root_import(2, &handle).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    runtime.cancel(2).unwrap();
    assert!(matches!(
        runtime.commit_root_import(3, &handle),
        Err(ImportError::State)
    ));
    drop(handle);
    let handle = input(
        &runtime,
        br#"{"folders":[],"entries":[]}"#,
        ImportMode::Merge,
    );
    runtime.lock().unwrap();
    assert_eq!(
        handle.append(b"x"),
        Err(ImportError::Session(SessionError::Revoked))
    );
    phase(&runtime, SessionPhase::Locked).await;
    assert!(matches!(
        runtime.review_root_import(3, &handle),
        Err(ImportError::Session(SessionError::Revoked))
    ));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn queued_import_cancel_never_publishes_or_releases_its_memory_slot_early() {
    use std::future::{Future, poll_fn};
    use std::task::Poll;
    for commit in [false, true] {
        let root = TempDir::new().unwrap();
        let runtime = unlocked(&root).await;
        let handle = input(
            &runtime,
            br#"{"folders":[],"entries":[{"id":"cancelled","title":"Cancelled"}]}"#,
            ImportMode::Merge,
        );
        if commit {
            assert!(
                runtime
                    .execute_admitted(runtime.review_root_import(2, &handle).unwrap())
                    .await
                    .unwrap()
                    .is_ok()
            );
        }
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
        let admitted = if commit {
            runtime.commit_root_import(3, &handle).unwrap()
        } else {
            runtime.review_root_import(3, &handle).unwrap()
        };
        let mut work = Box::pin(runtime.execute_admitted(admitted));
        poll_fn(|context| {
            assert!(work.as_mut().poll(context).is_pending());
            Poll::Ready(())
        })
        .await;
        if !commit {
            handle.cancel().unwrap();
        }
        // Drop alone cancels a queued commit; both operations retain their physical memory lease.
        drop(handle);
        assert!(matches!(
            runtime.begin_root_import(1, 1, ImportMode::Merge),
            Err(ImportError::Session(SessionError::Busy))
        ));
        release.send(()).unwrap();
        barrier.await.unwrap().unwrap();
        assert_eq!(work.await.unwrap_err(), SessionError::Canceled);
        assert_eq!(count(&runtime, 4).await, 0);
        let next = runtime.begin_root_import(1, 1, ImportMode::Merge).unwrap();
        next.cancel().unwrap();
    }
}

#[tokio::test]
async fn revoked_import_memory_remains_bounded_across_unlock_and_old_work_cannot_run() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let handle = input(
        &runtime,
        br#"{"folders":[],"entries":[]}"#,
        ImportMode::Merge,
    );
    let admitted = runtime.review_root_import(2, &handle).unwrap();
    runtime.lock().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    assert!(
        runtime
            .execute(
                3,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"import fixture"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    drop(handle);
    assert!(matches!(
        runtime.begin_root_import(generation, 1, ImportMode::Merge),
        Err(ImportError::Session(SessionError::Busy))
    ));
    assert_eq!(
        runtime.execute_admitted(admitted).await.unwrap_err(),
        SessionError::Revoked
    );
    let handle = input(
        &runtime,
        br#"{"folders":[],"entries":[]}"#,
        ImportMode::Restore,
    );
    assert!(
        runtime
            .execute_admitted(runtime.review_root_import(4, &handle).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    runtime.lock().unwrap();
    assert!(matches!(
        runtime.commit_root_import(5, &handle),
        Err(ImportError::Session(SessionError::Revoked))
    ));
}

#[tokio::test]
async fn malformed_or_oversized_chunks_cannot_create_a_committable_review() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let mut id = 2;
    for bytes in [b"{".as_slice(), b"[null]", br#"{"entries":"wrong"}"#] {
        let handle = input(&runtime, bytes, ImportMode::Merge);
        assert!(
            !runtime
                .execute_admitted(runtime.review_root_import(id, &handle).unwrap())
                .await
                .unwrap()
                .is_ok()
        );
        id += 1;
        assert!(matches!(
            runtime.commit_root_import(id, &handle),
            Err(ImportError::State)
        ));
    }
    let handle = runtime
        .begin_root_import(1, MAX_IMPORT_BYTES as u64, ImportMode::Merge)
        .unwrap();
    assert_eq!(
        handle.append(&vec![b' '; MAX_IMPORT_CHUNK_BYTES + 1]),
        Err(ImportError::TooLarge)
    );
    assert!(matches!(
        runtime.review_root_import(id, &handle),
        Err(ImportError::State)
    ));
    assert_eq!(count(&runtime, id).await, 0);
}

#[tokio::test]
#[ignore = "explicit populated upper-bound transfer memory measurement"]
async fn import_transfer_memory_fixture() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let bytes = serde_json::to_vec(&json!({"folders":[],"entries":(0..1000).map(|id|json!({
        "id":format!("memory-{id}"),"title":format!("Memory {id}"),"note":"s".repeat(16_000)
    })).collect::<Vec<_>>()}))
    .unwrap();
    eprintln!("fixture input_bytes={}", bytes.len());
    let handle = input(&runtime, &bytes, ImportMode::Merge);
    drop(bytes);
    assert!(
        runtime
            .execute_admitted(runtime.review_root_import(2, &handle).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(
        runtime
            .execute_admitted(runtime.commit_root_import(3, &handle).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(count(&runtime, 4).await, 1000);
}

#[tokio::test]
async fn legacy_array_is_reviewed_and_committed_through_the_same_bounded_transfer() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let bytes =
        include_bytes!("../../core/tests/passmanager_domain_rpc/fixtures/legacy-credentials.json");
    let handle = input(&runtime, bytes, ImportMode::Merge);
    let result = runtime
        .execute_admitted(runtime.review_root_import(2, &handle).unwrap())
        .await
        .unwrap();
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(result.result().unwrap()["entry_count"], 3);
    assert_eq!(count(&runtime, 3).await, 0);
    assert!(
        runtime
            .execute_admitted(runtime.commit_root_import(4, &handle).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(count(&runtime, 5).await, 3);
    let secret = runtime
        .execute(
            6,
            1,
            RpcRequest::new(
                "passmanager:secret:read",
                json!({"entry_id":"group-login","secret_type":"password"}),
            ),
        )
        .await
        .unwrap();
    assert_eq!(
        secret.result().unwrap()["value"],
        "synthetic-group-password"
    );
    drop(handle);
    let malformed = input(
        &runtime,
        br#"[{"name":"Broken group","entries":[null]}]"#,
        ImportMode::Replace,
    );
    let result = runtime
        .execute_admitted(runtime.review_root_import(7, &malformed).unwrap())
        .await
        .unwrap();
    assert_eq!(result.code(), Some("EMPTY_PAYLOAD"));
    assert!(matches!(
        runtime.commit_root_import(8, &malformed),
        Err(ImportError::State)
    ));
    assert_eq!(count(&runtime, 8).await, 3);
    drop(malformed);
    // Empty legacy exports are valid documents; merge still preserves existing credentials.
    let empty = input(&runtime, b"[]", ImportMode::Merge);
    assert!(
        runtime
            .execute_admitted(runtime.review_root_import(9, &empty).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(
        runtime
            .execute_admitted(runtime.commit_root_import(10, &empty).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(count(&runtime, 11).await, 3);
}

#[tokio::test]
async fn bitwarden_review_warns_before_writing_and_reimport_updates_instead_of_duplicating() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let bytes = include_bytes!(
        "../../core/tests/passmanager_domain_rpc/fixtures/bitwarden-credentials.json"
    );
    for id in [2, 10] {
        let handle = input(&runtime, bytes, ImportMode::Merge);
        let result = runtime
            .execute_admitted(runtime.review_root_import(id, &handle).unwrap())
            .await
            .unwrap();
        assert!(result.is_ok(), "{result:?}");
        let preview = result.result().unwrap();
        assert_eq!(preview["source"], "bitwarden");
        assert_eq!(preview["entry_count"], 5);
        assert_eq!(
            preview["warnings"],
            json!([{"code":"unsupported_records","count":1},{"code":"passkeys_omitted","count":1}])
        );
        assert_eq!(count(&runtime, id + 1).await, if id == 2 { 0 } else { 5 });
        assert!(
            runtime
                .execute_admitted(runtime.commit_root_import(id + 2, &handle).unwrap())
                .await
                .unwrap()
                .is_ok()
        );
        assert_eq!(count(&runtime, id + 3).await, 5);
    }
    let invalid = input(&runtime, br#"{"items":[{"type":5}]}"#, ImportMode::Replace);
    assert!(
        !runtime
            .execute_admitted(runtime.review_root_import(20, &invalid).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(matches!(
        runtime.commit_root_import(21, &invalid),
        Err(ImportError::State)
    ));
    assert_eq!(count(&runtime, 22).await, 5);
}

#[tokio::test]
async fn csv_review_uses_the_same_snapshot_and_never_updates_by_display_name() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let bytes = include_bytes!("../../core/tests/passmanager_domain_rpc/fixtures/credentials.csv");
    for id in [2, 10] {
        let handle = input(&runtime, bytes, ImportMode::Merge);
        let review = runtime
            .execute_admitted(runtime.review_root_import(id, &handle).unwrap())
            .await
            .unwrap();
        assert!(review.is_ok(), "{review:?}");
        assert_eq!(review.result().unwrap()["source"], "csv");
        assert_eq!(review.result().unwrap()["entry_count"], 2);
        assert_eq!(
            review.result().unwrap()["warnings"],
            json!([{"code":"invalid_rows","count":1},{"code":"unmapped_columns","count":1}])
        );
        assert_eq!(count(&runtime, id + 1).await, if id == 2 { 0 } else { 2 });
        assert!(
            runtime
                .execute_admitted(runtime.commit_root_import(id + 2, &handle).unwrap())
                .await
                .unwrap()
                .is_ok()
        );
        assert_eq!(count(&runtime, id + 3).await, if id == 2 { 2 } else { 4 });
    }
    let invalid = input(&runtime, b"name,password\nBroken,", ImportMode::Replace);
    assert!(
        !runtime
            .execute_admitted(runtime.review_root_import(20, &invalid).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    assert!(matches!(
        runtime.commit_root_import(21, &invalid),
        Err(ImportError::State)
    ));
    assert_eq!(count(&runtime, 22).await, 4);
}

#[tokio::test]
async fn keepass_password_retry_requires_a_fresh_review_before_commit() {
    let root = TempDir::new().unwrap();
    let runtime = unlocked(&root).await;
    let bytes = include_bytes!("../../core/tests/passmanager_domain_rpc/fixtures/keepass-4.kdbx");
    for (id, password, code) in [
        (2, None, "CREDENTIAL_IMPORT_PASSWORD_REQUIRED"),
        (5, Some("incorrect"), "CREDENTIAL_IMPORT_PASSWORD_INVALID"),
    ] {
        let handle = input(&runtime, bytes, ImportMode::Merge);
        let admitted = runtime
            .review_root_import_with_password(
                id,
                &handle,
                password.map(|value| zeroize::Zeroizing::new(value.to_owned())),
            )
            .unwrap();
        let result = runtime.execute_admitted(admitted).await.unwrap();
        assert_eq!(result.code(), Some(code));
        assert!(matches!(
            runtime.commit_root_import(id + 1, &handle),
            Err(ImportError::State)
        ));
        assert_eq!(count(&runtime, id + 2).await, 0);
    }
    for id in [8, 12] {
        let handle = input(&runtime, bytes, ImportMode::Merge);
        let admitted = runtime
            .review_root_import_with_password(
                id,
                &handle,
                Some(zeroize::Zeroizing::new(
                    "synthetic-keepass-password".to_owned(),
                )),
            )
            .unwrap();
        let result = runtime.execute_admitted(admitted).await.unwrap();
        assert!(result.is_ok(), "{result:?}");
        assert_eq!(result.result().unwrap()["source"], "keepass");
        assert_eq!(result.result().unwrap()["entry_count"], 2);
        assert_eq!(count(&runtime, id + 1).await, if id == 8 { 0 } else { 2 });
        assert!(
            runtime
                .execute_admitted(runtime.commit_root_import(id + 2, &handle).unwrap())
                .await
                .unwrap()
                .is_ok()
        );
        assert_eq!(count(&runtime, id + 3).await, 2);
    }
}

#[tokio::test]
async fn canceled_or_revoked_keepass_review_cannot_publish_a_commit() {
    let bytes = include_bytes!("../../core/tests/passmanager_domain_rpc/fixtures/keepass-4.kdbx");
    for revoke in [false, true] {
        let root = TempDir::new().unwrap();
        let runtime = unlocked(&root).await;
        let handle = input(&runtime, bytes, ImportMode::Merge);
        let admitted = runtime
            .review_root_import_with_password(
                2,
                &handle,
                Some(zeroize::Zeroizing::new(
                    "synthetic-keepass-password".to_owned(),
                )),
            )
            .unwrap();
        if revoke {
            runtime.lock().unwrap();
            phase(&runtime, SessionPhase::Locked).await;
        } else {
            handle.cancel().unwrap();
        }
        let error = runtime.execute_admitted(admitted).await.unwrap_err();
        assert_eq!(
            error,
            if revoke {
                SessionError::Revoked
            } else {
                SessionError::Canceled
            }
        );
        assert!(runtime.commit_root_import(3, &handle).is_err());
        if !revoke {
            assert_eq!(count(&runtime, 3).await, 0);
        }
    }
}
