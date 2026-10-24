use super::*;
use crate::runtime::AirRuntime;
use chromvoid_android_runtime::autofill::{
    AutofillContext, runtime_autofill_get_secret, runtime_autofill_list,
};
use chromvoid_android_runtime::provider_hook::with_provider_core;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::{Value, json};

/// The application's own request, on its own identifiers.
fn app(runtime: &AirRuntime, id: u64, command: &str, data: Value) -> Value {
    let generation = runtime.session.snapshot().unwrap().generation;
    let response = executor()
        .block_on(
            runtime
                .session
                .execute(id, generation, RpcRequest::new(command, data)),
        )
        .unwrap();
    serde_json::to_value(&*response).unwrap()
}

fn context() -> AutofillContext {
    AutofillContext {
        origin: "https://example.com/login".to_string(),
        domain: "example.com".to_string(),
    }
}

// One test: the hook and its registry are process-wide.
#[test]
fn provider_paths_reach_the_session_on_their_own_identifiers_and_only_as_providers() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault")).unwrap();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    register(&runtime.session);
    assert!(ready());

    // The application opens the vault and saves a login, on identifiers far ahead.
    assert_eq!(
        app(
            &runtime,
            40,
            "vault:unlock",
            json!({"password": "synthetic-provider-vault"})
        )["ok"],
        true
    );
    let created = app(
        &runtime,
        41,
        "passmanager:entry:create",
        json!({
            "entry_id": "provider-login", "title": "Example", "username": "alice",
            "entry_type": "login", "urls": [{"value": "https://example.com", "match": "base_domain"}],
            "secrets": {"password": "synthetic-provider-password"}
        }),
    );
    assert_eq!(created["ok"], true, "{created}");

    // Autofill lists it and reads its secret through the shared owner, from identifier 1.
    let listed = runtime_autofill_list(&context());
    assert_eq!(listed["ok"], true, "{listed}");
    assert_eq!(listed["candidates"][0]["credential_id"], "provider-login");
    let session = listed["session_id"].as_str().unwrap().to_string();
    let secret = runtime_autofill_get_secret(&session, "provider-login", None);
    assert_eq!(secret["result"]["username"], "alice", "{secret}");
    assert_eq!(secret["result"]["password"], "synthetic-provider-password");

    // Only provider commands pass: a lock asked for by a provider path never reaches Core.
    let refused =
        with_provider_core(|core| core.handle(&RpcRequest::new("vault:lock", json!({})))).unwrap();
    match refused {
        RpcResponse::Error { code, .. } => {
            assert_eq!(code.as_deref(), Some(PROVIDER_POLICY_DENIED))
        }
        RpcResponse::Success { .. } => panic!("a provider path locked the vault"),
    }
    assert!(matches!(
        runtime.snapshot().unwrap().phase,
        crate::runtime::AirPhase::Unlocked
    ));

    // The application's sequence goes on as if the provider had never run.
    assert_eq!(app(&runtime, 42, "vault:status", json!({}))["ok"], true);

    // Locked by the application, the vault is Core's answer to the next fill: unlock first.
    runtime.lock().unwrap();
    executor().block_on(async {
        let mut snapshot = runtime.session.snapshot().unwrap();
        while snapshot.cleanup_pending || snapshot.phase != SessionPhase::Locked {
            snapshot = runtime
                .session
                .events(snapshot.sequence)
                .await
                .unwrap()
                .snapshot;
        }
    });
    let locked = runtime_autofill_list(&context());
    assert_eq!(locked["degraded"]["code"], "VAULT_REQUIRED", "{locked}");

    // A closed runtime leaves provider paths nothing to reach.
    drop(runtime);
    assert!(!ready());
    assert!(with_provider_core(|_| ()).is_err());
}
