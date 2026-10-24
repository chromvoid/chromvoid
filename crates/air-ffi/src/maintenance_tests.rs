use super::wallet_tests::rpc;
use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::json;

#[tokio::test]
async fn password_maintenance_preserves_credentials_and_core_authorization() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault")).unwrap();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    let old_master = "synthetic old administrator";
    let new_master = "synthetic new administrator";
    let old_vault = "synthetic old vault password";
    let new_vault = "synthetic new vault password";
    assert_eq!(
        rpc(
            &runtime,
            1,
            "master:setup",
            json!({"master_password":old_master})
        )
        .await["ok"],
        true
    );
    let wrong_master = rpc(
        &runtime,
        2,
        "master:rekey",
        json!({
            "current_password":"incorrect synthetic administrator", "new_master_password":new_master
        }),
    )
    .await;
    assert_eq!(
        wrong_master["code"],
        "MASTER_REKEY_INVALID_CURRENT_PASSWORD"
    );
    // Administrative maintenance is supported while locked, without selecting a vault.
    let changed_master = rpc(
        &runtime,
        3,
        "master:rekey",
        json!({
            "current_password":old_master, "new_master_password":new_master
        }),
    )
    .await;
    assert_eq!(changed_master["ok"], true);
    assert_eq!(
        changed_master["result"]["rewrapped_artifacts"],
        json!(["master.verify"])
    );
    assert_eq!(changed_master["result"]["backup_recommended"], true);
    assert_eq!(rpc(&runtime, 4, "master:rekey", json!({
        "current_password":old_master, "new_master_password":"another synthetic administrator"
    })).await["code"], "MASTER_REKEY_INVALID_CURRENT_PASSWORD");
    assert_eq!(
        rpc(
            &runtime,
            5,
            "master:rekey",
            json!({
                "current_password":new_master, "new_master_password":old_master
            })
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(
            &runtime,
            6,
            "vault:rekey",
            json!({
                "current_password":old_vault, "new_password":new_vault
            })
        )
        .await["code"],
        "VAULT_REQUIRED"
    );
    assert_eq!(
        rpc(&runtime, 7, "vault:unlock", json!({"password":old_vault})).await["ok"],
        true
    );
    assert_eq!(rpc(&runtime, 8, "passmanager:entry:create", json!({
        "entry_id":"maintenance-fixture", "title":"Synthetic preserved record", "entry_type":"login",
        "secrets":{"password":"synthetic preserved password"}
    })).await["ok"], true);
    assert_eq!(
        rpc(
            &runtime,
            9,
            "vault:rekey",
            json!({
                "current_password":"incorrect synthetic vault", "new_password":new_vault
            })
        )
        .await["code"],
        "REKEY_INVALID_CURRENT_PASSWORD"
    );
    assert_eq!(
        rpc(
            &runtime,
            10,
            "vault:rekey",
            json!({
                "current_password":old_vault, "new_password":"short"
            })
        )
        .await["code"],
        "REKEY_PASSWORD_POLICY"
    );
    let changed_vault = rpc(
        &runtime,
        11,
        "vault:rekey",
        json!({
            "current_password":old_vault, "new_password":new_vault
        }),
    )
    .await;
    assert_eq!(changed_vault["ok"], true);
    assert_eq!(changed_vault["result"]["backup_recommended"], true);
    assert!(changed_vault["result"]["migrated_chunks"].as_u64().unwrap() > 0);
    let mut locked = runtime.lock().unwrap();
    while locked.cleanup_pending {
        locked = runtime.events(locked.sequence).await.unwrap().snapshot;
    }
    assert_eq!(
        rpc(&runtime, 12, "vault:unlock", json!({"password":new_vault})).await["ok"],
        true
    );
    let secret = rpc(
        &runtime,
        13,
        "passmanager:secret:read",
        json!({
            "entry_id":"maintenance-fixture", "secret_type":"password"
        }),
    )
    .await;
    assert_eq!(secret["result"]["value"], "synthetic preserved password");
    let generation = runtime.snapshot().unwrap().generation;
    runtime.deactivate().unwrap();
    for (id, command) in [(14, "vault:rekey"), (15, "master:rekey")] {
        assert!(matches!(
            runtime.begin_execute(
                id,
                generation,
                serde_json::to_vec(&json!({"v":1,"command":command,"data":{}})).unwrap()
            ),
            Err(BridgeError::SessionRevoked)
        ));
    }
    runtime.shutdown().unwrap();
}
