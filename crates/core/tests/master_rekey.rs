//! SPEC-101 master password rekey.

mod test_helpers;

use chromvoid_core::crypto::{derive_vault_key, hash};
use chromvoid_core::rpc::types::RpcRequest;
use std::fs;
use std::path::Path;
use test_helpers::*;

const OLD_MASTER_PASSWORD: &str = "correct horse battery staple";
const NEW_MASTER_PASSWORD: &str = "new correct horse staple";

fn setup_master(router: &mut chromvoid_core::rpc::RpcRouter, password: &str) {
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": password}),
    )));
}

fn master_rekey(
    router: &mut chromvoid_core::rpc::RpcRouter,
    current_password: &str,
    new_master_password: &str,
) -> chromvoid_core::rpc::types::RpcResponse {
    master_rekey_with_payload(
        router,
        serde_json::json!({
            "current_password": current_password,
            "new_master_password": new_master_password,
        }),
    )
}

fn master_rekey_with_payload(
    router: &mut chromvoid_core::rpc::RpcRouter,
    payload: serde_json::Value,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new("master:rekey", payload))
}

fn master_rekey_transaction_path(base: &Path) -> std::path::PathBuf {
    base.join("master.rekey.transaction.json")
}

fn staged_master_verify_path(base: &Path) -> std::path::PathBuf {
    base.join(".master.verify.master-rekey.tmp")
}

fn write_legacy_master_rekey_payload(base: &Path, transaction: serde_json::Value) {
    fs::write(
        master_rekey_transaction_path(base),
        serde_json::to_vec(&transaction).expect("encode transaction"),
    )
    .expect("write transaction");
}

#[test]
fn test_master_rekey_keeps_salt_and_updates_verify() {
    let (mut router, temp_dir) = create_test_router();
    setup_master(&mut router, OLD_MASTER_PASSWORD);

    let salt_path = temp_dir.path().join("master.salt");
    let verify_path = temp_dir.path().join("master.verify");
    let original_salt = fs::read(&salt_path).expect("master.salt exists");
    let original_verify = fs::read(&verify_path).expect("master.verify exists");

    let response = master_rekey(&mut router, OLD_MASTER_PASSWORD, NEW_MASTER_PASSWORD);
    assert_rpc_ok(&response);
    assert_eq!(
        response
            .result()
            .and_then(|result| result.get("backup_recommended"))
            .and_then(|value| value.as_bool()),
        Some(true)
    );
    assert_eq!(
        response
            .result()
            .and_then(|result| result.get("rewrapped_artifacts"))
            .and_then(|value| value.as_array())
            .map(|items| items
                .iter()
                .filter_map(|item| item.as_str())
                .collect::<Vec<_>>()),
        Some(vec!["master.verify"])
    );

    let next_salt = fs::read(&salt_path).expect("master.salt exists");
    let next_verify = fs::read(&verify_path).expect("master.verify exists");
    assert_eq!(original_salt, next_salt, "master.salt must not rotate");
    assert_ne!(original_verify, next_verify, "master.verify must change");

    let old_setup = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": OLD_MASTER_PASSWORD}),
    ));
    assert_rpc_error(&old_setup, "INVALID_MASTER_PASSWORD");
    assert_eq!(old_setup.error_message(), Some("Invalid master password"));
    let setup_new = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": NEW_MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup_new);
    assert_eq!(
        setup_new
            .result()
            .and_then(|result| result.get("created"))
            .and_then(|value| value.as_bool()),
        Some(false)
    );
}

#[test]
fn test_master_rekey_rejects_wrong_current_password_without_changing_verify() {
    let (mut router, temp_dir) = create_test_router();
    setup_master(&mut router, OLD_MASTER_PASSWORD);
    let verify_path = temp_dir.path().join("master.verify");
    let original_verify = fs::read(&verify_path).expect("master.verify exists");

    let response = master_rekey(&mut router, "wrong master password", NEW_MASTER_PASSWORD);
    assert_rpc_error(&response, "MASTER_REKEY_INVALID_CURRENT_PASSWORD");
    assert_eq!(
        response.error_message(),
        Some("Current master password is invalid")
    );

    let next_verify = fs::read(&verify_path).expect("master.verify exists");
    assert_eq!(original_verify, next_verify);
    assert!(!master_rekey_transaction_path(temp_dir.path()).exists());
    assert!(!staged_master_verify_path(temp_dir.path()).exists());
}

#[test]
fn test_master_rekey_rejects_password_policy_failures_without_changing_verify() {
    let (mut router, temp_dir) = create_test_router();
    setup_master(&mut router, OLD_MASTER_PASSWORD);
    let verify_path = temp_dir.path().join("master.verify");
    let original_verify = fs::read(&verify_path).expect("master.verify exists");

    let too_short = master_rekey(&mut router, OLD_MASTER_PASSWORD, "too-short");
    assert_rpc_error(&too_short, "MASTER_REKEY_PASSWORD_POLICY");
    assert_eq!(
        too_short.error_message(),
        Some("New master password must be at least 12 characters")
    );

    let unchanged = master_rekey(&mut router, OLD_MASTER_PASSWORD, OLD_MASTER_PASSWORD);
    assert_rpc_error(&unchanged, "MASTER_REKEY_PASSWORD_POLICY");
    assert_eq!(
        unchanged.error_message(),
        Some("New master password must be different from the current master password"),
    );

    let next_verify = fs::read(&verify_path).expect("master.verify exists");
    assert_eq!(original_verify, next_verify);
    assert!(!master_rekey_transaction_path(temp_dir.path()).exists());
    assert!(!staged_master_verify_path(temp_dir.path()).exists());
}

#[test]
fn test_master_rekey_accepts_password_aliases() {
    let cases = [
        (
            "current_master_password",
            "new_password",
            "new alias master password one",
        ),
        (
            "currentMasterPassword",
            "newMasterPassword",
            "new alias master password two",
        ),
    ];

    for (current_key, new_key, new_password) in cases {
        let (mut router, _temp_dir) = create_test_router();
        setup_master(&mut router, OLD_MASTER_PASSWORD);

        let mut payload = serde_json::Map::new();
        payload.insert(
            current_key.to_string(),
            serde_json::Value::String(OLD_MASTER_PASSWORD.to_string()),
        );
        payload.insert(
            new_key.to_string(),
            serde_json::Value::String(new_password.to_string()),
        );

        let response = master_rekey_with_payload(&mut router, serde_json::Value::Object(payload));
        assert_rpc_ok(&response);
    }
}

#[test]
fn test_master_rekey_committing_transaction_recovers_on_next_master_setup() {
    let (mut router, temp_dir) = create_test_router();
    setup_master(&mut router, OLD_MASTER_PASSWORD);

    let salt: [u8; 16] = fs::read(temp_dir.path().join("master.salt"))
        .expect("master.salt exists")
        .as_slice()
        .try_into()
        .expect("master.salt is 16 bytes");
    let new_key = derive_vault_key(NEW_MASTER_PASSWORD, &salt).expect("derive new key");
    let new_verify = hash(&*new_key);
    fs::write(staged_master_verify_path(temp_dir.path()), new_verify).expect("write staged verify");
    write_legacy_master_rekey_payload(
        temp_dir.path(),
        serde_json::json!({
            "version": 1,
            "phase": "committing",
            "artifacts": [{
                "name": "master.verify",
                "target_name": "master.verify",
                "temp_name": ".master.verify.master-rekey.tmp",
            }],
        }),
    );

    let setup_new = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": NEW_MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup_new);
    assert!(!master_rekey_transaction_path(temp_dir.path()).exists());
    assert!(!staged_master_verify_path(temp_dir.path()).exists());
}

#[test]
fn test_master_rekey_staging_transaction_rolls_back_on_next_master_setup() {
    let (mut router, temp_dir) = create_test_router();
    setup_master(&mut router, OLD_MASTER_PASSWORD);

    let verify_path = temp_dir.path().join("master.verify");
    let original_verify = fs::read(&verify_path).expect("master.verify exists");
    let salt: [u8; 16] = fs::read(temp_dir.path().join("master.salt"))
        .expect("master.salt exists")
        .as_slice()
        .try_into()
        .expect("master.salt is 16 bytes");
    let new_key = derive_vault_key(NEW_MASTER_PASSWORD, &salt).expect("derive new key");
    let new_verify = hash(&*new_key);
    fs::write(staged_master_verify_path(temp_dir.path()), new_verify).expect("write staged verify");
    write_legacy_master_rekey_payload(
        temp_dir.path(),
        serde_json::json!({
            "version": 1,
            "phase": "staging",
            "artifacts": [{
                "name": "master.verify",
                "target_name": "master.verify",
                "temp_name": ".master.verify.master-rekey.tmp",
            }],
        }),
    );

    let setup_old = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": OLD_MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup_old);
    assert_eq!(
        fs::read(&verify_path).expect("master.verify exists"),
        original_verify
    );
    assert!(!master_rekey_transaction_path(temp_dir.path()).exists());
    assert!(!staged_master_verify_path(temp_dir.path()).exists());

    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "master:setup",
            serde_json::json!({"master_password": NEW_MASTER_PASSWORD}),
        )),
        "INVALID_MASTER_PASSWORD",
    );
}

#[test]
fn test_master_rekey_invalid_transaction_registry_fails_without_changing_verify() {
    let cases = [
        (
            "unsupported version",
            serde_json::json!({
                "version": 2,
                "phase": "staging",
                "artifacts": [{
                    "name": "master.verify",
                    "target_name": "master.verify",
                    "temp_name": ".master.verify.master-rekey.tmp",
                }],
            }),
        ),
        (
            "extra artifact",
            serde_json::json!({
                "version": 1,
                "phase": "staging",
                "artifacts": [
                    {
                        "name": "master.verify",
                        "target_name": "master.verify",
                        "temp_name": ".master.verify.master-rekey.tmp",
                    },
                    {
                        "name": "unexpected",
                        "target_name": "unexpected",
                        "temp_name": ".unexpected.master-rekey.tmp",
                    },
                ],
            }),
        ),
        (
            "temp mismatch",
            serde_json::json!({
                "version": 1,
                "phase": "staging",
                "artifacts": [{
                    "name": "master.verify",
                    "target_name": "master.verify",
                    "temp_name": ".wrong.tmp",
                }],
            }),
        ),
    ];

    for (name, transaction) in cases {
        let (mut router, temp_dir) = create_test_router();
        setup_master(&mut router, OLD_MASTER_PASSWORD);
        let verify_path = temp_dir.path().join("master.verify");
        let original_verify = fs::read(&verify_path).expect("master.verify exists");
        write_legacy_master_rekey_payload(temp_dir.path(), transaction);

        let response = master_rekey(&mut router, OLD_MASTER_PASSWORD, NEW_MASTER_PASSWORD);
        assert_rpc_error(&response, "MASTER_REKEY_INTEGRITY_FAILED");
        assert!(response
            .error_message()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .contains("master rekey transaction"));
        assert_eq!(
            fs::read(&verify_path).expect("master.verify exists"),
            original_verify,
            "{name} must not change master.verify"
        );
        assert!(
            master_rekey_transaction_path(temp_dir.path()).exists(),
            "{name} must leave invalid transaction for inspection"
        );
    }
}

#[test]
fn test_master_setup_rejects_invalid_master_rekey_transaction() {
    let (mut router, temp_dir) = create_test_router();
    setup_master(&mut router, OLD_MASTER_PASSWORD);
    write_legacy_master_rekey_payload(
        temp_dir.path(),
        serde_json::json!({
            "version": 1,
            "phase": "staging",
            "artifacts": [{
                "name": "master.verify",
                "target_name": "master.verify",
                "temp_name": ".wrong.tmp",
            }],
        }),
    );

    let response = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": OLD_MASTER_PASSWORD}),
    ));
    assert_rpc_error(&response, "MASTER_REKEY_INTEGRITY_FAILED");
    assert!(response
        .error_message()
        .unwrap_or_default()
        .starts_with("Master rekey transaction"));
}
