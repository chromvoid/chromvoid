use sha2::{Digest, Sha256};

use super::support::*;

fn assert_rpc_error_message(response: &RpcResponse, expected_code: &str, expected_message: &str) {
    assert_rpc_error(response, expected_code);
    assert_eq!(response.error_message(), Some(expected_message));
}

#[test]
fn test_passmanager_root_ssh_crud_and_entry_delete_preserves_key() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "source-entry", "title": "Source"}),
    )));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:ssh:key:update",
        serde_json::json!({
            "key": {
                "id": "root-key-1",
                "type": "ed25519",
                "fingerprint": "SHA256:root-key-1",
                "name": "Deploy key",
                "comment": "deploy@example.test",
                "sourceEntryId": "source-entry"
            }
        }),
    )));
    for (secret_type, value) in [
        ("ssh_private_key", "PRIVATE-ROOT-KEY"),
        ("ssh_public_key", "ssh-ed25519 AAAATEST deploy@example.test"),
    ] {
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:ssh:secret:save",
            serde_json::json!({
                "key_id": "root-key-1",
                "secret_type": secret_type,
                "value": value
            }),
        )));
    }

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:delete",
        serde_json::json!({"entry_id": "source-entry"}),
    )));

    let listed = router.handle(&RpcRequest::new(
        "passmanager:ssh:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let keys = listed
        .result()
        .and_then(|result| result.get("sshKeys"))
        .and_then(serde_json::Value::as_array)
        .expect("sshKeys");
    assert_eq!(keys.len(), 1);
    assert_eq!(
        keys[0].get("id").and_then(serde_json::Value::as_str),
        Some("root-key-1")
    );
    assert_eq!(
        keys[0]
            .get("sourceEntryId")
            .and_then(serde_json::Value::as_str),
        Some("source-entry")
    );

    let private = router.handle(&RpcRequest::new(
        "passmanager:ssh:secret:read",
        serde_json::json!({
            "key_id": "root-key-1",
            "secret_type": "ssh_private_key"
        }),
    ));
    assert_rpc_ok(&private);
    assert_eq!(
        private
            .result()
            .and_then(|result| result.get("value"))
            .and_then(serde_json::Value::as_str),
        Some("PRIVATE-ROOT-KEY")
    );

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:ssh:key:delete",
        serde_json::json!({"key_id": "root-key-1"}),
    )));
    let missing = router.handle(&RpcRequest::new(
        "passmanager:ssh:secret:read",
        serde_json::json!({
            "key_id": "root-key-1",
            "secret_type": "ssh_private_key"
        }),
    ));
    assert_rpc_error_message(&missing, "NODE_NOT_FOUND", "SSH secret not found");
}

#[test]
fn test_passmanager_root_import_migrates_legacy_metadata_and_copies_secrets() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "legacy-entry", "title": "Legacy"}),
    )));
    for (secret_type, value) in [
        ("ssh_private_key:legacy-key", "PRIVATE-LEGACY"),
        (
            "ssh_public_key:legacy-key",
            "ssh-ed25519 AAAALEGACY legacy@test",
        ),
    ] {
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:secret:save",
            serde_json::json!({
                "entry_id": "legacy-entry",
                "secret_type": secret_type,
                "value": value
            }),
        )));
    }

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "version": 3,
            "folders": [],
            "entries": [{
                "id": "legacy-entry",
                "title": "Legacy",
                "sshKeys": [{
                    "id": "legacy-key",
                    "type": "ed25519",
                    "fingerprint": "SHA256:legacy",
                    "name": "Legacy deploy",
                    "comment": "legacy@test"
                }]
            }]
        }),
    )));

    let listed = router.handle(&RpcRequest::new(
        "passmanager:ssh:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let key = listed
        .result()
        .and_then(|result| result.get("sshKeys"))
        .and_then(serde_json::Value::as_array)
        .and_then(|keys| keys.first())
        .expect("migrated key");
    assert_eq!(
        key.get("id").and_then(serde_json::Value::as_str),
        Some("legacy-key")
    );
    assert_eq!(
        key.get("sourceEntryId").and_then(serde_json::Value::as_str),
        Some("legacy-entry")
    );

    for (secret_type, expected) in [
        ("ssh_private_key", "PRIVATE-LEGACY"),
        ("ssh_public_key", "ssh-ed25519 AAAALEGACY legacy@test"),
    ] {
        let read = router.handle(&RpcRequest::new(
            "passmanager:ssh:secret:read",
            serde_json::json!({
                "key_id": "legacy-key",
                "secret_type": secret_type
            }),
        ));
        assert_rpc_ok(&read);
        assert_eq!(
            read.result()
                .and_then(|result| result.get("value"))
                .and_then(serde_json::Value::as_str),
            Some(expected)
        );
    }

    let entry = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "legacy-entry"}),
    ));
    assert_rpc_ok(&entry);
    assert!(entry
        .result()
        .and_then(|result| result.get("entry"))
        .and_then(|entry| entry.get("sshKeys"))
        .is_none());

    let old_secret = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "legacy-entry",
            "secret_type": "ssh_private_key:legacy-key"
        }),
    ));
    assert_rpc_error_message(&old_secret, "NODE_NOT_FOUND", "Secret not found");

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let root = exported
        .result()
        .and_then(|result| result.get("root"))
        .expect("root");
    assert_eq!(
        root.get("version").and_then(serde_json::Value::as_u64),
        Some(4)
    );
    assert_eq!(
        root.get("sshKeys")
            .and_then(serde_json::Value::as_array)
            .map(Vec::len),
        Some(1)
    );
    assert!(get_root_entry_by_id(&exported, "legacy-entry")
        .and_then(|entry| entry.get("sshKeys"))
        .is_none());
}

#[test]
fn test_passmanager_legacy_conflict_uses_deterministic_migrated_id() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "version": 3,
            "folders": [],
            "sshKeys": [{
                "id": "duplicate-key",
                "type": "ed25519",
                "fingerprint": "SHA256:root"
            }],
            "entries": [{
                "id": "legacy-conflict-entry",
                "title": "Legacy conflict",
                "sshKeys": [{
                    "id": "duplicate-key",
                    "type": "rsa",
                    "fingerprint": "SHA256:legacy-conflict"
                }]
            }]
        }),
    )));

    let digest = Sha256::digest(b"legacy-conflict-entry:duplicate-key");
    let expected = format!(
        "migrated-{}",
        digest[..16]
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    );
    let listed = router.handle(&RpcRequest::new(
        "passmanager:ssh:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let ids = listed
        .result()
        .and_then(|result| result.get("sshKeys"))
        .and_then(serde_json::Value::as_array)
        .expect("sshKeys")
        .iter()
        .filter_map(|key| key.get("id").and_then(serde_json::Value::as_str))
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["duplicate-key", expected.as_str()]);
}

#[test]
fn test_passmanager_ssh_keygen_persists_a_complete_pair_for_each_algorithm() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id":"ssh-source", "title":"SSH source"}),
    )));
    let mut created = Vec::new();
    for key_type in ["ed25519", "rsa", "ecdsa"] {
        let response = router.handle(&RpcRequest::new(
            "passmanager:ssh:keygen",
            serde_json::json!({
                "key_type":key_type, "name":"  Deploy key  ", "comment":"deploy@example.test",
                "source_entry_id":"ssh-source"
            }),
        ));
        assert_rpc_ok(&response);
        let result = response.result().unwrap().clone();
        assert_eq!(
            result.as_object().unwrap().len(),
            4,
            "no private key in generation response"
        );
        assert_eq!(result["key_type"], key_type);
        created.push(result);
    }
    drop(router);
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
    let mut router = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    let listed = router.handle(&RpcRequest::new(
        "passmanager:ssh:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let keys = listed.result().unwrap()["sshKeys"].as_array().unwrap();
    assert_eq!(keys.len(), 3);
    for result in created {
        let key_id = result["key_id"].as_str().unwrap();
        let metadata = keys.iter().find(|key| key["id"] == key_id).unwrap();
        assert_eq!(metadata["name"], "Deploy key");
        assert_eq!(metadata["sourceEntryId"], "ssh-source");
        assert_eq!(metadata["fingerprint"], result["fingerprint"]);
        assert!(metadata["createdTs"].as_u64().unwrap() > 0);
        let private_response = router.handle(&RpcRequest::new(
            "passmanager:ssh:secret:read",
            serde_json::json!({
                "key_id":key_id, "secret_type":"ssh_private_key"
            }),
        ));
        assert_rpc_ok(&private_response);
        let private = ssh_key::PrivateKey::from_openssh(
            private_response.result().unwrap()["value"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert!(!private.is_encrypted()); // Vault encryption remains the storage boundary.
        assert_eq!(
            private.public_key().to_openssh().unwrap(),
            result["public_key_openssh"]
        );
        assert_eq!(
            private.fingerprint(ssh_key::HashAlg::Sha256).to_string(),
            result["fingerprint"]
        );
        assert_eq!(private.comment(), "deploy@example.test");
        match result["key_type"].as_str().unwrap() {
            "ed25519" => assert_eq!(private.algorithm(), ssh_key::Algorithm::Ed25519),
            "rsa" => assert_eq!(
                private
                    .key_data()
                    .rsa()
                    .unwrap()
                    .public
                    .n
                    .as_positive_bytes()
                    .unwrap()
                    .len(),
                512
            ),
            "ecdsa" => assert_eq!(
                private.algorithm(),
                ssh_key::Algorithm::Ecdsa {
                    curve: ssh_key::EcdsaCurve::NistP256
                }
            ),
            _ => unreachable!(),
        }
        let public_response = router.handle(&RpcRequest::new(
            "passmanager:ssh:secret:read",
            serde_json::json!({
                "key_id":key_id, "secret_type":"ssh_public_key"
            }),
        ));
        assert_rpc_ok(&public_response);
        assert_eq!(
            public_response.result().unwrap()["value"],
            result["public_key_openssh"]
        );
    }
}

#[test]
fn test_passmanager_ssh_keygen_rejects_invalid_input_without_creating_keys() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:keygen",
            serde_json::json!({"key_type":"ed25519"}),
        )),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    for payload in [
        serde_json::json!({"key_type":"dsa"}),
        serde_json::json!({"key_type":"ed25519", "name":"x".repeat(257)}),
        serde_json::json!({"key_type":"ed25519", "comment":"first\nsecond"}),
        serde_json::json!({"key_type":"ed25519", "private_key":"unexpected"}),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:ssh:keygen", payload)),
            "EMPTY_PAYLOAD",
        );
    }
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:keygen",
            serde_json::json!({"key_type":"ed25519", "source_entry_id":"missing"}),
        )),
        "NODE_NOT_FOUND",
    );
    let listed = router.handle(&RpcRequest::new(
        "passmanager:ssh:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    assert_eq!(listed.result().unwrap()["sshKeys"], serde_json::json!([]));
}

#[test]
fn test_passmanager_ssh_keygen_storage_failure_leaves_no_partial_pair() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    // Temporarily replace this synthetic vault's directory with a regular file.
    // Metadata is initially absent, so failure happens while committing the new pair.
    let backup = tempfile::tempdir().unwrap();
    let saved = backup.path().join("vault");
    std::fs::rename(tmp.path(), &saved).unwrap();
    std::fs::write(tmp.path(), b"blocked test storage").unwrap();
    let response = router.handle(&RpcRequest::new(
        "passmanager:ssh:keygen",
        serde_json::json!({"key_type":"ed25519", "name":"Must not survive"}),
    ));
    std::fs::remove_file(tmp.path()).unwrap();
    std::fs::rename(saved, tmp.path()).unwrap();
    assert!(
        !response.is_ok(),
        "storage failure must not report a generated key"
    );
    assert!(
        router
            .session()
            .unwrap()
            .catalog()
            .find_by_path("/.passmanager/.ssh")
            .is_none(),
        "failed commit must not publish orphan secret nodes"
    );
    let listed = router.handle(&RpcRequest::new(
        "passmanager:ssh:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    assert_eq!(listed.result().unwrap()["sshKeys"], serde_json::json!([]));
    drop(router);
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));
    assert!(
        reopened
            .session()
            .unwrap()
            .catalog()
            .find_by_path("/.passmanager/.ssh")
            .is_none(),
        "failed commit must not persist orphan secret nodes"
    );
    let listed = reopened.handle(&RpcRequest::new(
        "passmanager:ssh:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    assert_eq!(listed.result().unwrap()["sshKeys"], serde_json::json!([]));
    let exported = reopened.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    assert_eq!(
        exported.result().unwrap()["root"]["sshKeys"],
        serde_json::json!([])
    );
}
