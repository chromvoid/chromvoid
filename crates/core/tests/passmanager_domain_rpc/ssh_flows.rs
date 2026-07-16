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
