use super::*;

fn status_request() -> RpcRequest {
    RpcRequest::new("vault:status", json!({}))
}

#[tokio::test]
async fn native_and_two_peers_reuse_wire_ids_without_cross_cancellation_or_replay() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let first = runtime.open_peer_session(1).unwrap();
    let second = runtime.open_peer_session(1).unwrap();
    let native_request = runtime.admit(1, 1, status_request()).unwrap();
    let first_request = first.admit(1, status_request()).unwrap();
    let second_request = second.admit(1, status_request()).unwrap();
    first.cancel(1).unwrap();
    assert!(
        runtime
            .execute_admitted(native_request)
            .await
            .unwrap()
            .is_ok()
    );
    assert_eq!(
        runtime.execute_admitted(first_request).await.unwrap_err(),
        SessionError::Canceled
    );
    assert!(
        runtime
            .execute_admitted(second_request)
            .await
            .unwrap()
            .is_ok()
    );
    assert!(matches!(
        first.admit(1, status_request()),
        Err(SessionError::RequestId)
    ));
    assert!(matches!(
        second.admit(1, status_request()),
        Err(SessionError::RequestId)
    ));
    assert!(matches!(
        runtime.admit(1, 1, status_request()),
        Err(SessionError::RequestId)
    ));

    let native_request = runtime.admit(2, 1, status_request()).unwrap();
    let peer_request = second.admit(2, status_request()).unwrap();
    runtime.cancel(2).unwrap();
    assert_eq!(
        runtime.execute_admitted(native_request).await.unwrap_err(),
        SessionError::Canceled
    );
    assert!(
        runtime
            .execute_admitted(peer_request)
            .await
            .unwrap()
            .is_ok()
    );
}

#[tokio::test]
async fn closing_peer_cancels_its_admitted_work_and_keeps_native_session_usable() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let peer = runtime.open_peer_session(1).unwrap();
    let work = peer.admit(1, status_request()).unwrap();
    peer.close().unwrap();
    peer.close().unwrap();
    assert!(matches!(
        peer.admit(2, status_request()),
        Err(SessionError::Revoked)
    ));
    assert_eq!(
        runtime.execute_admitted(work).await.unwrap_err(),
        SessionError::Canceled
    );
    assert!(
        runtime
            .execute(1, 1, status_request())
            .await
            .unwrap()
            .is_ok()
    );
    let replacement = runtime.open_peer_session(1).unwrap();
    assert!(
        replacement
            .execute(1, status_request())
            .await
            .unwrap()
            .is_ok()
    );
}

#[tokio::test]
async fn peer_writes_use_the_same_core_and_publish_native_domain_events() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let peer = runtime.open_peer_session(1).unwrap();
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let before = runtime.snapshot().unwrap().sequence;
    let created = peer.execute(1, RpcRequest::new("passmanager:entry:create", json!({
        "entry_id":"peer-record", "title":"From peer", "username":"test", "entry_type":"login", "secrets":{"password":"synthetic"}
    }))).await.unwrap();
    assert!(created.is_ok(), "{created:?}");
    assert!(runtime.snapshot().unwrap().sequence > before);
    let native = runtime
        .execute(2, 1, RpcRequest::new("passmanager:entry:list", json!({})))
        .await
        .unwrap();
    assert_eq!(native.result().unwrap()["entries"][0]["title"], "From peer");
    let second = runtime.open_peer_session(1).unwrap();
    let remote = second
        .execute(1, RpcRequest::new("passmanager:entry:list", json!({})))
        .await
        .unwrap();
    assert_eq!(remote.result(), native.result());
}

#[tokio::test]
async fn peer_reads_do_not_invalidate_but_catalog_mutations_do() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let unlocked = runtime
        .execute(
            1,
            1,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
        )
        .await
        .unwrap();
    assert!(unlocked.is_ok(), "{unlocked:?}");
    let created = runtime.execute(2, 1, RpcRequest::new("passmanager:entry:create", json!({
        "entry_id":"peer-read-record", "title":"Peer read fixture", "username":"test", "entry_type":"login", "secrets":{"password":"synthetic secret"}
    }))).await.unwrap();
    assert!(created.is_ok(), "{created:?}");

    let peer = runtime.open_peer_session(1).unwrap();
    let before = runtime.snapshot().unwrap().sequence;
    for (index, (command, data)) in [
        ("vault:status", json!({})),
        (
            "passmanager:entry:page",
            json!({"offset":0,"limit":50,"query":""}),
        ),
        (
            "catalog:folder:list",
            json!({"path":"/","offset":0,"limit":20,"sort":{"by":"name","direction":"asc"},"filter":{}}),
        ),
        (
            "passmanager:secret:read",
            json!({"entry_id":"peer-read-record","secret_type":"password"}),
        ),
    ]
    .into_iter()
    .enumerate()
    {
        let response = peer
            .execute(index as u64 + 1, RpcRequest::new(command, data))
            .await
            .unwrap();
        assert!(response.is_ok(), "{command}: {response:?}");
        assert_eq!(
            runtime.snapshot().unwrap().sequence,
            before,
            "peer read {command} must not invalidate domains"
        );
    }

    let created = peer
        .execute(
            5,
            RpcRequest::new("catalog:createDir", json!({"name":"from-peer"})),
        )
        .await
        .unwrap();
    assert!(created.is_ok(), "{created:?}");
    assert!(runtime.snapshot().unwrap().sequence > before);
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
}

#[tokio::test]
async fn lifecycle_lock_and_background_revoke_all_old_peer_scopes() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let peer = runtime.open_peer_session(1).unwrap();
    let second = runtime.open_peer_session(1).unwrap();
    assert!(matches!(
        peer.admit(1, RpcRequest::new("vault:lock", json!({}))),
        Err(SessionError::Revoked)
    ));
    let old_request = second.admit(1, status_request()).unwrap();
    let locked = peer.lock().unwrap();
    assert!(locked.generation > 1);
    assert_eq!(
        runtime.execute_admitted(old_request).await.unwrap_err(),
        SessionError::Revoked
    );
    phase(&runtime, SessionPhase::Locked).await;
    assert_eq!(
        peer.execute(2, status_request()).await.unwrap_err(),
        SessionError::Revoked
    );
    let current = runtime.open_peer_session(locked.generation).unwrap();
    assert!(current.execute(1, status_request()).await.unwrap().is_ok());
    runtime.deactivate().unwrap();
    phase(&runtime, SessionPhase::Inactive).await;
    assert_eq!(
        current.execute(2, status_request()).await.unwrap_err(),
        SessionError::Revoked
    );
    assert!(matches!(
        runtime.open_peer_session(runtime.snapshot().unwrap().generation),
        Err(SessionError::Revoked)
    ));
    runtime.activate().unwrap();
    assert_eq!(
        current.execute(3, status_request()).await.unwrap_err(),
        SessionError::Revoked
    );
}

#[tokio::test]
async fn holding_peer_capability_cannot_keep_the_app_session_alive() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let weak = Arc::downgrade(&runtime);
    let peer = runtime.open_peer_session(1).unwrap();
    drop(runtime);
    assert!(weak.upgrade().is_none());
    assert_eq!(
        peer.execute(1, status_request()).await.unwrap_err(),
        SessionError::Revoked
    );
    peer.close().unwrap();
}

#[test]
fn all_callers_share_one_pending_budget_and_closed_scopes_release_admission_slots() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let peer = runtime.open_peer_session(1).unwrap();
    let other = runtime.open_peer_session(1).unwrap();
    let mut pending = Vec::new();
    for id in 1..=64 {
        pending.push(runtime.admit(id, 1, status_request()).unwrap());
        pending.push(peer.admit(id, status_request()).unwrap());
    }
    assert!(matches!(
        other.admit(1, status_request()),
        Err(SessionError::Busy)
    ));
    drop(pending.pop());
    let accepted = other.admit(1, status_request()).unwrap();
    assert!(matches!(
        other.admit(2, status_request()),
        Err(SessionError::Busy)
    ));
    drop(accepted);
    drop(pending);
    peer.close().unwrap();
    other.close().unwrap();
    for _ in 0..256 {
        runtime.open_peer_session(1).unwrap().close().unwrap();
    }
}

#[tokio::test]
async fn closing_peer_releases_only_its_imports_after_final_pending_work() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let peer = runtime.open_peer_session(1).unwrap();
    let other = runtime.open_peer_session(1).unwrap();
    let start = || {
        RpcRequest::new(
            "passmanager:import:start",
            json!({"byte_count":2,"mode":"merge"}),
        )
    };
    let imported = peer.execute(1, start()).await.unwrap();
    assert!(imported.is_ok(), "{imported:?}");
    let peer_id = imported.result().unwrap()["import_id"].as_str().unwrap();
    let busy = other.execute(1, start()).await.unwrap();
    assert!(!busy.is_ok(), "Core keeps its single active import budget");
    other.close().unwrap();
    let pending = peer.admit(2, status_request()).unwrap();
    peer.close().unwrap();
    let append = |id: &str, offset| {
        RpcRequest::new(
            "passmanager:import:append",
            json!({"import_id":id,"offset":offset,"chunk_base64":"QQ=="}),
        )
    };
    // Still leased by admitted work: cleanup cannot run ahead of a possible late allocation.
    assert!(
        runtime
            .execute(2, 1, append(peer_id, 0))
            .await
            .unwrap()
            .is_ok()
    );
    drop(pending);
    // The same dispatcher orders final peer cleanup before this ordinary request.
    let released = runtime.execute(3, 1, append(peer_id, 1)).await.unwrap();
    assert!(!released.is_ok(), "closed peer token must be revoked");
    let other = runtime.open_peer_session(1).unwrap();
    let imported_other = other.execute(1, start()).await.unwrap();
    assert!(
        imported_other.is_ok(),
        "cleanup must free Core's import slot"
    );
    let other_id = imported_other.result().unwrap()["import_id"]
        .as_str()
        .unwrap();
    runtime.open_peer_session(1).unwrap().close().unwrap();
    assert!(other.execute(2, append(other_id, 0)).await.unwrap().is_ok());
    assert!(
        runtime
            .execute(4, 1, status_request())
            .await
            .unwrap()
            .is_ok()
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn closing_peer_during_unlock_revokes_late_core_authority() {
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
    let peer = runtime.open_peer_session(1).unwrap();
    let mut unlock = Box::pin(peer.execute(
        1,
        RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
    ));
    poll_fn(|cx| {
        assert!(unlock.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    let ready = tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)))
        .await
        .unwrap();
    if ready.is_err() {
        key.release();
    }
    ready.expect("unlock must enter Core");
    let closed = peer.close();
    let revoked = runtime.snapshot().unwrap();
    key.release();
    closed.unwrap();
    assert!(revoked.generation > 1);
    assert_eq!(unlock.await.unwrap_err(), SessionError::Revoked);
    phase(&runtime, SessionPhase::Locked).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn in_flight_peer_work_does_not_retain_the_app_authority_owner() {
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
    let weak = Arc::downgrade(&runtime);
    let peer = runtime.open_peer_session(1).unwrap();
    let mut unlock = Box::pin(peer.execute(
        1,
        RpcRequest::new("vault:unlock", json!({"password":"synthetic"})),
    ));
    poll_fn(|cx| {
        assert!(unlock.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    let ready = tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)))
        .await
        .unwrap();
    if ready.is_err() {
        key.release();
    }
    ready.expect("unlock must enter Core");
    drop(runtime);
    let owner_released = weak.upgrade().is_none();
    key.release();
    assert!(
        owner_released,
        "a peer operation must not pin the app's authority owner"
    );
    assert_eq!(unlock.await.unwrap_err(), SessionError::Revoked);
    assert_eq!(
        peer.execute(2, status_request()).await.unwrap_err(),
        SessionError::Revoked
    );
}
