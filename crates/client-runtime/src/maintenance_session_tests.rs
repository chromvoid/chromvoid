use super::*;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cancel_in_flight_rekey_preserves_the_old_password_and_data() {
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
    let generation = runtime.snapshot().unwrap().generation;
    assert!(
        runtime
            .execute(
                1,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"old synthetic password"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    assert!(runtime.execute(2, generation, RpcRequest::new("passmanager:entry:create", json!({
        "entry_id":"rekey-preserved", "title":"Preserved during cancellation", "entry_type":"login",
        "secrets":{"password":"synthetic preserved secret"}
    }))).await.unwrap().is_ok());
    key.block.store(true, Ordering::SeqCst);
    let work = runtime.clone();
    let rekey = tokio::spawn(async move {
        work.execute(3, generation, RpcRequest::new("vault:rekey", json!({
            "current_password":"old synthetic password", "new_password":"new synthetic password"
        }))).await
    });
    let reached = tokio::task::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(5)))
        .await
        .unwrap();
    if reached.is_ok() {
        runtime.cancel(3).unwrap();
    }
    key.release();
    reached.expect("Rekey must reach its actual key derivation before cancellation");
    assert_eq!(rekey.await.unwrap().unwrap_err(), SessionError::Canceled);
    runtime.lock().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    assert!(
        runtime
            .execute(
                4,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"old synthetic password"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let entries = runtime
        .execute(
            5,
            generation,
            RpcRequest::new("passmanager:entry:list", json!({})),
        )
        .await
        .unwrap();
    assert_eq!(
        entries.result().unwrap()["entries"][0]["title"],
        "Preserved during cancellation"
    );
    let secret = runtime
        .execute(
            6,
            generation,
            RpcRequest::new(
                "passmanager:secret:read",
                json!({"entry_id":"rekey-preserved", "secret_type":"password"}),
            ),
        )
        .await
        .unwrap();
    assert_eq!(
        secret.result().unwrap()["value"],
        "synthetic preserved secret"
    );
    runtime.close().unwrap();
}

#[tokio::test]
async fn erase_from_locked_storage_revokes_old_generation_before_new_setup() {
    let root = TempDir::new().unwrap();
    let key = Arc::new(InMemoryKeystore::new());
    let runtime = session(&root, key.clone());
    for (id, command, data) in [
        (
            1,
            "master:setup",
            json!({"master_password":"synthetic erase administrator"}),
        ),
        (
            2,
            "vault:unlock",
            json!({"password":"synthetic erased vault"}),
        ),
        (3, "catalog:createDir", json!({"name":"will be removed"})),
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
    let review = runtime
        .execute(4, generation, RpcRequest::new("erase:confirm", json!({})))
        .await
        .unwrap();
    let token = review.result().unwrap()["erase_token"].as_str().unwrap();
    let erased = runtime
        .execute(
            5,
            generation,
            RpcRequest::new(
                "erase:execute",
                json!({
                    "erase_token":token, "master_password":"synthetic erase administrator"
                }),
            ),
        )
        .await;
    assert_eq!(erased.unwrap_err(), SessionError::Revoked);
    let current = runtime.snapshot().unwrap();
    assert_eq!(current.phase, SessionPhase::Locked);
    assert!(!current.master_configured);
    assert!(current.generation > generation);
    assert!(key.load_storage_pepper().unwrap().is_none());
    assert_eq!(
        runtime
            .execute(
                6,
                generation,
                RpcRequest::new(
                    "master:setup",
                    json!({
                        "master_password":"stale caller must not configure"
                    })
                )
            )
            .await
            .unwrap_err(),
        SessionError::Revoked
    );
    assert!(
        runtime
            .execute(
                7,
                current.generation,
                RpcRequest::new(
                    "master:setup",
                    json!({
                        "master_password":"new administrator after erasure"
                    })
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}
