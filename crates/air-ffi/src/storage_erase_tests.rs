use super::wallet_tests::rpc;
use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::json;

#[tokio::test]
async fn erase_ffi_keeps_confirmation_private_and_returns_actual_completion_after_revocation() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault")).unwrap();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    let master = "synthetic FFI erase administrator";
    assert_eq!(
        rpc(
            &runtime,
            1,
            "master:setup",
            json!({"master_password": master})
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(
            &runtime,
            2,
            "vault:unlock",
            json!({"password":"synthetic vault"})
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(
            &runtime,
            3,
            "catalog:createDir",
            json!({"name":"erase fixture"})
        )
        .await["ok"],
        true
    );
    let old_host = runtime.host().unwrap();
    let generation = runtime.session.snapshot().unwrap().generation;
    assert!(!NATIVE_COMMANDS.contains(&"erase:confirm"));
    assert!(!NATIVE_COMMANDS.contains(&"erase:execute"));
    let erase = runtime.begin_storage_erase(generation).unwrap();
    let reviewed = erase.begin_review(4).unwrap().finish().await.unwrap();
    let value: serde_json::Value = serde_json::from_slice(&reviewed.payload).unwrap();
    assert_eq!(value["ok"], true);
    assert_eq!(value["result"], serde_json::Value::Null);
    assert_eq!(erase.storage_paths().unwrap().len(), 1);
    let denied = erase
        .begin_commit(5, "wrong".into())
        .unwrap()
        .finish()
        .await
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(&denied.payload).unwrap();
    assert_eq!(value["code"], "INVALID_MASTER_PASSWORD");
    assert!(erase.receipt().unwrap().is_none());
    assert!(erase.storage_paths().is_ok());
    assert!(matches!(
        erase.begin_commit(6, master.into()).unwrap().finish().await,
        Err(BridgeError::SessionRevoked)
    ));
    assert!(
        matches!(erase.receipt().unwrap(), Some(AirEraseReceipt::Completed { erased_chunks, .. }) if erased_chunks > 0)
    );
    assert!(matches!(
        erase.begin_commit(7, master.into()),
        Err(BridgeError::SessionRevoked)
    ));
    assert!(matches!(
        erase.cancel_and_wait().await.unwrap(),
        Some(AirEraseReceipt::Completed { .. })
    ));
    assert!(!runtime.session.snapshot().unwrap().master_configured);
    assert!(!root.path().join("vault/master.verify").exists());
    assert!(old_host.preferences().await.is_err());
    assert_eq!(
        rpc(
            &runtime,
            8,
            "master:setup",
            json!({"master_password":"new administrator"})
        )
        .await["ok"],
        true
    );
    let new_host = runtime.host().unwrap();
    assert!(!Arc::ptr_eq(&old_host, &new_host));
    assert!(!new_host.preferences().await.unwrap().enabled);
    assert!(new_host.trusted_peers().await.unwrap().is_empty());
    runtime.session.close().unwrap();
}
