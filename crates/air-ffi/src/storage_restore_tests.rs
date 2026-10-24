use super::wallet_tests::rpc;
use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::json;
use std::collections::BTreeMap;

fn runtime(root: &std::path::Path) -> AirRuntime {
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.join("vault")).unwrap();
    AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    }
}

async fn finish(execution: Arc<AirExecution>) -> serde_json::Value {
    let response = execution.finish().await.unwrap();
    let value: serde_json::Value = serde_json::from_slice(&response.payload).unwrap();
    assert_eq!(value["ok"], true, "{value}");
    value
}

#[tokio::test]
async fn storage_restore_ffi_reviews_and_consumes_binary_source_without_generic_rpc_grants() {
    let source_dir = tempfile::tempdir().unwrap();
    let target_dir = tempfile::tempdir().unwrap();
    let source = runtime(source_dir.path());
    let target = runtime(target_dir.path());
    let master = "synthetic FFI restore administrator";
    assert_eq!(
        rpc(
            &source,
            1,
            "master:setup",
            json!({"master_password":master})
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(
            &source,
            2,
            "vault:unlock",
            json!({"password":"synthetic vault"})
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(
            &source,
            3,
            "catalog:createDir",
            json!({"name":"FFI restored folder"})
        )
        .await["ok"],
        true
    );
    let backup = source.begin_storage_backup(1).unwrap();
    finish(backup.begin_prepare(4, master.into()).unwrap()).await;
    let mut files = BTreeMap::new();
    let mut request = 5;
    for (index, artifact) in backup.artifacts().unwrap().iter().enumerate() {
        let mut bytes = Vec::new();
        while bytes.len() < artifact.byte_count as usize {
            finish(backup.begin_read(request, index as u32).unwrap()).await;
            request += 1;
            bytes.extend(backup.take_chunk().unwrap());
        }
        files.insert(artifact.name.clone(), bytes);
    }
    backup.cancel_and_wait().await.unwrap();
    for command in [
        "restore:local:start",
        "restore:local:uploadPack",
        "restore:local:validatePayload",
        "restore:local:commit",
    ] {
        assert!(matches!(
            target.begin_execute(
                1,
                1,
                serde_json::to_vec(&json!({"v":1,"command":command,"data":{}})).unwrap()
            ),
            Err(BridgeError::CapabilityUnavailable)
        ));
    }
    let limits = target.storage_restore_limits();
    let restore = target.begin_storage_restore(1).unwrap();
    assert!(matches!(
        restore.begin_commit(1),
        Err(BridgeError::InvalidRestoreState)
    ));
    assert!(matches!(
        restore.begin_append(
            1,
            AirRestoreArtifact::Pack,
            vec![0; limits.chunk_bytes as usize + 1]
        ),
        Err(BridgeError::RestoreInputTooLarge)
    ));
    request = 1;
    for spec in limits.artifacts {
        let bytes = &files[&spec.name];
        assert!(bytes.len() as u64 <= spec.maximum_bytes);
        for chunk in bytes.chunks(limits.chunk_bytes as usize) {
            finish(
                restore
                    .begin_append(request, spec.artifact, chunk.to_vec())
                    .unwrap(),
            )
            .await;
            request += 1;
        }
    }
    finish(restore.begin_review(request, master.into()).unwrap()).await;
    request += 1;
    assert_eq!(
        restore.preview().unwrap().byte_count,
        files["chunks.pack"].len() as u64
    );
    finish(restore.begin_commit(request).unwrap()).await;
    request += 1;
    assert!(matches!(
        restore.begin_commit(request),
        Err(BridgeError::InvalidRestoreState)
    ));
    assert_eq!(
        rpc(
            &target,
            request,
            "vault:unlock",
            json!({"password":"synthetic vault"})
        )
        .await["ok"],
        true
    );
    let list = rpc(
        &target,
        request + 1,
        "catalog:folder:list",
        json!({"path":"/"}),
    )
    .await;
    assert!(
        list["result"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["name"] == "FFI restored folder")
    );
    restore.cancel_and_wait().await.unwrap();
    target.session.close().unwrap();
    source.session.close().unwrap();
}
