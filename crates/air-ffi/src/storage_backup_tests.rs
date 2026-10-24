use super::wallet_tests::rpc;
use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::json;

#[tokio::test]
async fn storage_backup_uses_binary_resources_without_generic_rpc_admission() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault")).unwrap();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    let password = "synthetic backup administrator";
    assert_eq!(
        rpc(
            &runtime,
            1,
            "master:setup",
            json!({"master_password":password})
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
    assert!(matches!(
        runtime.begin_execute(
            3,
            1,
            serde_json::to_vec(&json!({"v":1,"command":"backup:local:start","data":{}})).unwrap()
        ),
        Err(BridgeError::CapabilityUnavailable)
    ));
    let backup = runtime.begin_storage_backup(1).unwrap();
    let response = backup
        .begin_prepare(4, password.to_string())
        .unwrap()
        .finish()
        .await
        .unwrap();
    let response: serde_json::Value = serde_json::from_slice(&response.payload).unwrap();
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"], serde_json::Value::Null);
    let artifacts = backup.artifacts().unwrap();
    assert_eq!(artifacts.len(), 5);
    assert_eq!(artifacts[0].name, "metadata.enc");
    assert!(matches!(
        backup.begin_read(5, 5),
        Err(BridgeError::InvalidBackupArtifact)
    ));
    let response = backup.begin_read(5, 0).unwrap().finish().await.unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&response.payload).unwrap()["ok"],
        true
    );
    assert_eq!(
        backup.take_chunk().unwrap().len() as u64,
        artifacts[0].byte_count
    );
    backup.cancel().unwrap();
    assert!(matches!(
        backup.take_chunk(),
        Err(BridgeError::InvalidBackupState)
    ));
    runtime.session.close().unwrap();
}
