use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::{Value, json};

fn request(command: &str, data: Value) -> Vec<u8> {
    serde_json::to_vec(&RpcRequest::new(command, data)).unwrap()
}

fn runtime(root: &std::path::Path) -> AirRuntime {
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.join("vault")).unwrap();
    AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    }
}

async fn finish(execution: Arc<AirExecution>) -> Value {
    let reply = execution.finish().await.unwrap();
    serde_json::from_slice(&reply.payload).unwrap()
}

async fn close(runtime: &AirRuntime) {
    let mut snapshot = runtime.shutdown().unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while snapshot.cleanup_pending {
            snapshot = runtime.events(snapshot.sequence).await.unwrap().snapshot;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn native_provider_uses_real_catalog_and_one_shot_core_session() {
    let root = tempfile::tempdir().unwrap();
    let runtime = runtime(root.path());
    let generation = runtime.snapshot().unwrap().generation;
    let unlocked = finish(
        runtime
            .begin_execute(
                1,
                generation,
                request(
                    "vault:unlock",
                    json!({"password": "synthetic-provider-vault"}),
                ),
            )
            .unwrap(),
    )
    .await;
    assert_eq!(unlocked["ok"], true);
    let created = finish(runtime.begin_execute(2, generation, request("passmanager:entry:create", json!({
        "entry_id": "provider-login", "title": "Example", "username": "alice",
        "entry_type": "login", "urls": [{"value": "https://example.com", "match": "base_domain"}],
        "secrets": {"password": "synthetic-provider-password"}
    }))).unwrap()).await;
    assert_eq!(created["ok"], true, "{created}");
    let context = json!({"kind": "web", "origin": "https://example.com/login"});
    let listed = finish(
        runtime
            .begin_provider_execute(
                3,
                generation,
                request("credential_provider:list", json!({"context": context})),
            )
            .unwrap(),
    )
    .await;
    assert_eq!(
        listed["result"]["candidates"][0]["credential_id"],
        "provider-login"
    );
    let opened = finish(
        runtime
            .begin_provider_execute(
                4,
                generation,
                request("credential_provider:session:open", json!({})),
            )
            .unwrap(),
    )
    .await;
    let token = opened["result"]["provider_session"].as_str().unwrap();
    let get = request(
        "credential_provider:getSecret",
        json!({"credential_id": "provider-login", "provider_session": token, "context": context}),
    );
    let secret = finish(
        runtime
            .begin_provider_execute(5, generation, get.clone())
            .unwrap(),
    )
    .await;
    assert_eq!(secret["result"]["username"], "alice");
    assert_eq!(secret["result"]["password"], "synthetic-provider-password");
    let replay = finish(runtime.begin_provider_execute(6, generation, get).unwrap()).await;
    assert_eq!(replay["code"], "PROVIDER_SESSION_EXPIRED");
    let opened = finish(
        runtime
            .begin_provider_execute(
                7,
                generation,
                request("credential_provider:session:open", json!({})),
            )
            .unwrap(),
    )
    .await;
    let token = opened["result"]["provider_session"].as_str().unwrap();
    let wrong_context = finish(
        runtime
            .begin_provider_execute(
                8,
                generation,
                request(
                    "credential_provider:getSecret",
                    json!({
                        "credential_id": "provider-login", "provider_session": token,
                        "context": {"kind": "web", "origin": "https://other.example.test"}
                    }),
                ),
            )
            .unwrap(),
    )
    .await;
    assert_eq!(wrong_context["code"], "ACCESS_DENIED");
    let opened = finish(
        runtime
            .begin_provider_execute(
                9,
                generation,
                request("credential_provider:session:open", json!({})),
            )
            .unwrap(),
    )
    .await;
    let pending_secret = runtime.begin_provider_execute(10, generation,
        request("credential_provider:getSecret", json!({
            "credential_id": "provider-login", "provider_session": opened["result"]["provider_session"],
            "context": context
        }))).unwrap();
    runtime.lock().unwrap();
    assert!(matches!(
        pending_secret.finish().await,
        Err(BridgeError::SessionRevoked)
    ));
    close(&runtime).await;
}

#[tokio::test]
async fn provider_and_application_share_request_ids_cancellation_and_revocation() {
    let root = tempfile::tempdir().unwrap();
    let runtime = runtime(root.path());
    let generation = runtime.snapshot().unwrap().generation;
    let status_request = request("credential_provider:status", json!({}));
    let status = runtime
        .begin_provider_execute(1, generation, status_request.clone())
        .unwrap();
    assert!(matches!(
        runtime.begin_execute(1, generation, request("vault:status", json!({}))),
        Err(BridgeError::InvalidRequestId)
    ));
    let reply = finish(status).await;
    assert_eq!(reply["result"]["vault_open"], false);
    let canceled = runtime
        .begin_provider_execute(2, generation, status_request.clone())
        .unwrap();
    runtime.cancel(2).unwrap();
    assert!(matches!(
        canceled.finish().await,
        Err(BridgeError::RequestCanceled)
    ));
    let revoked = runtime
        .begin_provider_execute(3, generation, status_request.clone())
        .unwrap();
    let inactive = runtime.deactivate().unwrap();
    assert!(inactive.generation > generation);
    assert!(matches!(
        revoked.finish().await,
        Err(BridgeError::SessionRevoked)
    ));
    assert!(matches!(
        runtime.begin_provider_execute(4, generation, status_request),
        Err(BridgeError::SessionRevoked)
    ));
    close(&runtime).await;
}

#[tokio::test]
async fn provider_entry_cannot_unlock_pair_or_request_transport_features() {
    let root = tempfile::tempdir().unwrap();
    let runtime = runtime(root.path());
    let generation = runtime.snapshot().unwrap().generation;
    for command in [
        "vault:unlock",
        "pairing:create",
        "catalog:list",
        "passkeys:delete",
    ] {
        assert!(matches!(
            runtime.begin_provider_execute(1, generation, request(command, json!({}))),
            Err(BridgeError::CapabilityUnavailable)
        ));
    }
    let request = br#"{"v":1,"command":"credential_provider:status","data":{},"transport_features":["remote"]}"#.to_vec();
    assert!(matches!(
        runtime.begin_provider_execute(1, generation, request),
        Err(BridgeError::CapabilityUnavailable)
    ));
    let open = finish(
        runtime
            .begin_provider_execute(
                1,
                generation,
                self::request("credential_provider:session:open", json!({})),
            )
            .unwrap(),
    )
    .await;
    assert_eq!(open["code"], "VAULT_REQUIRED");
    close(&runtime).await;
}
