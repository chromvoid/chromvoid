use super::support::*;
use serde_json::{json, Value};
use ssh_key::{Algorithm, HashAlg, LineEnding, PrivateKey};

fn fixture() -> PrivateKey {
    let mut key = PrivateKey::random(&mut rand_core::OsRng, Algorithm::Ed25519).unwrap();
    key.set_comment("synthetic-import@example.test");
    key
}
fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let response = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}

#[test]
fn ssh_exchange_roundtrip_preserves_identity_and_duplicate_imports_after_reopen() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    call(
        &mut router,
        "passmanager:entry:save",
        json!({"id":"ssh-source", "title":"Source"}),
    );
    let private = fixture();
    let fingerprint = private.fingerprint(HashAlg::Sha256).to_string();
    let encrypted = private
        .encrypt(&mut rand_core::OsRng, "synthetic-passphrase")
        .unwrap()
        .to_openssh(LineEnding::LF)
        .unwrap();
    let mut ids = Vec::new();
    for _ in 0..2 {
        let imported = call(
            &mut router,
            "passmanager:ssh:key:import",
            json!({
                "private_key":encrypted.as_str(), "passphrase":"synthetic-passphrase",
                "name":"Imported key", "source_entry_id":"ssh-source"
            }),
        );
        assert_eq!(imported["fingerprint"], fingerprint);
        assert_eq!(imported.as_object().unwrap().len(), 4);
        ids.push(imported["key_id"].as_str().unwrap().to_string());
    }
    assert_ne!(
        ids[0], ids[1],
        "duplicate import must not overwrite an existing record"
    );
    drop(router);
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
    let mut router = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    let listed = call(&mut router, "passmanager:ssh:list", json!({}));
    let keys = listed["sshKeys"].as_array().unwrap();
    assert_eq!(keys.len(), 2);
    for key in keys {
        assert_eq!(key["comment"], "synthetic-import@example.test");
        assert_eq!(key["sourceEntryId"], "ssh-source");
        assert_eq!(key["fingerprint"], fingerprint);
    }
    let stored = call(
        &mut router,
        "passmanager:ssh:secret:read",
        json!({"key_id":ids[0], "secret_type":"ssh_private_key"}),
    );
    let stored_bytes = stored["value"].as_str().unwrap().to_string();
    let stored = PrivateKey::from_openssh(&stored_bytes).unwrap();
    assert!(
        !stored.is_encrypted(),
        "vault owns stored key encryption, not the import passphrase"
    );
    // Root export generates document timestamps on each read; compare the actual catalog.
    let before = serde_json::to_value(router.session().unwrap().catalog().root()).unwrap();
    for passphrase in [None, Some("export-passphrase")] {
        let exported = call(
            &mut router,
            "passmanager:ssh:key:export",
            json!({
                "key_id":ids[0], "format":"openssh_private", "passphrase":passphrase
            }),
        );
        assert_eq!(exported["filename"], ids[0]);
        let mut decoded = PrivateKey::from_openssh(exported["content"].as_str().unwrap()).unwrap();
        assert_eq!(decoded.is_encrypted(), passphrase.is_some());
        if let Some(passphrase) = passphrase {
            decoded = decoded.decrypt(passphrase).unwrap();
        }
        assert_eq!(
            decoded.fingerprint(HashAlg::Sha256).to_string(),
            fingerprint
        );
        assert_eq!(decoded.comment(), private.comment());
    }
    assert_eq!(
        serde_json::to_value(router.session().unwrap().catalog().root()).unwrap(),
        before,
        "export must not mutate the catalog"
    );
    assert_eq!(
        call(
            &mut router,
            "passmanager:ssh:secret:read",
            json!({"key_id":ids[0], "secret_type":"ssh_private_key"})
        )["value"],
        stored_bytes
    );
    // A public export must work without any private material being available.
    call(
        &mut router,
        "passmanager:ssh:secret:delete",
        json!({"key_id":ids[0], "secret_type":"ssh_private_key"}),
    );
    let public = call(
        &mut router,
        "passmanager:ssh:key:export",
        json!({"key_id":ids[0], "format":"openssh_public"}),
    );
    assert_eq!(public["filename"], format!("{}.pub", ids[0]));
    assert_eq!(
        public["content"],
        private.public_key().to_openssh().unwrap()
    );
}

#[test]
fn ssh_exchange_invalid_imports_do_not_leave_records_or_secret_nodes() {
    let (mut router, _tmp) = create_test_router();
    for (command, data) in [
        (
            "passmanager:ssh:key:import",
            json!({"private_key":"synthetic"}),
        ),
        (
            "passmanager:ssh:key:export",
            json!({"key_id":"key", "format":"openssh_private"}),
        ),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(command, data)),
            "VAULT_REQUIRED",
        );
    }
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    let key = fixture();
    let plain = key.to_openssh(LineEnding::LF).unwrap();
    let encrypted = key
        .encrypt(&mut rand_core::OsRng, "synthetic-passphrase")
        .unwrap()
        .to_openssh(LineEnding::LF)
        .unwrap();
    for data in [
        json!({"private_key":"malformed"}),
        json!({"private_key":key.public_key().to_openssh().unwrap()}),
        json!({"private_key":encrypted.as_str()}),
        json!({"private_key":encrypted.as_str(), "passphrase":"wrong"}),
        json!({"private_key":plain.as_str(), "passphrase":"x".repeat(1025)}),
        json!({"private_key":"x".repeat(65537)}),
        json!({"private_key":plain.as_str(), "name":"bad\nname"}),
        json!({"private_key":plain.as_str(), "unknown":true}),
    ] {
        let failed = router.handle(&RpcRequest::new("passmanager:ssh:key:import", data));
        assert_rpc_error(&failed, "EMPTY_PAYLOAD");
        assert!(router
            .session()
            .unwrap()
            .catalog()
            .find_by_path("/.passmanager/.ssh")
            .is_none());
    }
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:key:import",
            json!({
                "private_key":plain.as_str(), "source_entry_id":"missing"
            }),
        )),
        "NODE_NOT_FOUND",
    );
    let imported = call(
        &mut router,
        "passmanager:ssh:key:import",
        json!({"private_key":plain.as_str()}),
    );
    let key_id = &imported["key_id"];
    for data in [
        json!({"key_id":key_id, "format":"pem"}),
        json!({"key_id":key_id, "format":"openssh_public", "passphrase":"secret"}),
        json!({"key_id":"../outside", "format":"openssh_private"}),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:ssh:key:export", data)),
            "EMPTY_PAYLOAD",
        );
    }
    call(
        &mut router,
        "passmanager:ssh:secret:save",
        json!({"key_id":key_id, "secret_type":"ssh_public_key", "value":"x".repeat(65537)}),
    );
    let oversized = router.handle(&RpcRequest::new(
        "passmanager:ssh:key:export",
        json!({"key_id":key_id, "format":"openssh_public"}),
    ));
    assert_rpc_error(&oversized, "EMPTY_PAYLOAD");
    assert_eq!(oversized.error_message(), Some("SSH key exceeds 64 KiB"));
    call(
        &mut router,
        "passmanager:ssh:secret:save",
        json!({"key_id":key_id, "secret_type":"ssh_public_key", "value":key.public_key().to_openssh().unwrap()}),
    );
    let mut metadata = call(&mut router, "passmanager:ssh:list", json!({}))["sshKeys"][0].clone();
    metadata["fingerprint"] = json!("SHA256:incorrect");
    call(
        &mut router,
        "passmanager:ssh:key:update",
        json!({"key":metadata}),
    );
    for format in ["openssh_public", "openssh_private"] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                "passmanager:ssh:key:export",
                json!({"key_id":key_id, "format":format}),
            )),
            "EMPTY_PAYLOAD",
        );
    }
}

#[test]
fn ssh_exchange_import_storage_failure_is_atomic() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    let key = fixture().to_openssh(LineEnding::LF).unwrap();
    let backup = tempfile::tempdir().unwrap();
    let saved = backup.path().join("vault");
    std::fs::rename(tmp.path(), &saved).unwrap();
    std::fs::write(tmp.path(), b"blocked synthetic storage").unwrap();
    let failed = router.handle(&RpcRequest::new(
        "passmanager:ssh:key:import",
        json!({"private_key":key.as_str()}),
    ));
    std::fs::remove_file(tmp.path()).unwrap();
    std::fs::rename(saved, tmp.path()).unwrap();
    assert!(!failed.is_ok());
    assert!(router
        .session()
        .unwrap()
        .catalog()
        .find_by_path("/.passmanager/.ssh")
        .is_none());
    drop(router);
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));
    assert!(reopened
        .session()
        .unwrap()
        .catalog()
        .find_by_path("/.passmanager/.ssh")
        .is_none());
}

#[test]
#[ignore = "requires ssh-keygen executable; run explicitly for OpenSSH interoperability"]
fn ssh_exchange_openssh_interoperability() {
    use std::{fs, process::Command};
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    let files = tempfile::tempdir().unwrap();
    for (algorithm, bits) in [
        ("ed25519", None),
        ("rsa", Some("2048")),
        ("ecdsa", Some("384")),
    ] {
        eprintln!("Checking OpenSSH interoperability: {algorithm}");
        let input = files.path().join(algorithm);
        let mut command = Command::new("ssh-keygen");
        command
            .args([
                "-q",
                "-t",
                algorithm,
                "-N",
                "synthetic-import-passphrase",
                "-C",
                "openssh-fixture",
                "-f",
            ])
            .arg(&input);
        if let Some(bits) = bits {
            command.args(["-b", bits]);
        }
        assert!(command.status().unwrap().success());
        let original_public = fs::read_to_string(input.with_extension("pub")).unwrap();
        let imported = call(
            &mut router,
            "passmanager:ssh:key:import",
            json!({
                "private_key":fs::read_to_string(&input).unwrap(), "passphrase":"synthetic-import-passphrase", "name":algorithm
            }),
        );
        assert_eq!(imported["key_type"], algorithm);
        if algorithm == "rsa" {
            let valid = PrivateKey::from_openssh(fs::read_to_string(&input).unwrap())
                .unwrap()
                .decrypt("synthetic-import-passphrase")
                .unwrap();
            let mut bad = valid.key_data().rsa().unwrap().clone();
            bad.private.iqmp = ssh_key::Mpint::from_positive_bytes(&[1]).unwrap();
            let bad = PrivateKey::new(
                ssh_key::private::KeypairData::Rsa(bad),
                "synthetic-invalid-crt",
            )
            .unwrap()
            .to_openssh(LineEnding::LF)
            .unwrap();
            assert_rpc_error(
                &router.handle(&RpcRequest::new(
                    "passmanager:ssh:key:import",
                    json!({"private_key":bad.as_str()}),
                )),
                "EMPTY_PAYLOAD",
            );
        }

        let fingerprint = Command::new("ssh-keygen")
            .args(["-l", "-E", "sha256", "-f"])
            .arg(&input)
            .output()
            .unwrap();
        assert!(fingerprint.status.success());
        assert_eq!(
            String::from_utf8(fingerprint.stdout)
                .unwrap()
                .split_whitespace()
                .nth(1)
                .unwrap(),
            imported["fingerprint"]
        );
        let exported = call(
            &mut router,
            "passmanager:ssh:key:export",
            json!({
                "key_id":imported["key_id"], "format":"openssh_private", "passphrase":"synthetic-export-passphrase"
            }),
        );
        let output = files.path().join(format!("{algorithm}-export"));
        fs::write(&output, exported["content"].as_str().unwrap()).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&output, fs::Permissions::from_mode(0o600)).unwrap();
        }
        let decoded = Command::new("ssh-keygen")
            .args(["-y", "-P", "synthetic-export-passphrase", "-f"])
            .arg(&output)
            .output()
            .unwrap();
        assert!(decoded.status.success());
        assert_eq!(
            String::from_utf8(decoded.stdout)
                .unwrap()
                .split_whitespace()
                .take(2)
                .collect::<Vec<_>>(),
            original_public
                .split_whitespace()
                .take(2)
                .collect::<Vec<_>>()
        );
    }
}

#[test]
fn ssh_exchange_debug_does_not_expose_private_keys_passphrases_or_exports() {
    use chromvoid_core::rpc::types::{
        PassmanagerSshExportRequest, PassmanagerSshExportResponse, PassmanagerSshImportRequest,
    };
    let import: PassmanagerSshImportRequest = serde_json::from_value(
        json!({"private_key":"synthetic-private-material", "passphrase":"synthetic-passphrase"}),
    )
    .unwrap();
    let export: PassmanagerSshExportRequest = serde_json::from_value(json!({"key_id":"synthetic-key", "format":"openssh_private", "passphrase":"synthetic-passphrase"})).unwrap();
    let response = PassmanagerSshExportResponse {
        filename: "synthetic-key".into(),
        content: "synthetic-private-material".into(),
    };
    for output in [
        format!("{import:?}"),
        format!("{export:?}"),
        format!("{response:?}"),
    ] {
        assert!(!output.contains("synthetic-private-material"));
        assert!(!output.contains("synthetic-passphrase"));
    }
}
