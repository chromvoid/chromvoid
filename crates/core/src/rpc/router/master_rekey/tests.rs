use std::sync::Once;

use serde_json::json;
use tempfile::TempDir;

use crate::rpc::types::RpcRequest;
use crate::storage::Storage;

use super::types::{master_rekey_temp_name, MASTER_REKEY_ARTIFACTS, MASTER_REKEY_TRANSACTION_FILE};
use super::*;

const OLD_MASTER_PASSWORD: &str = "correct horse battery staple";
const NEW_MASTER_PASSWORD: &str = "new correct horse staple";

static FAST_KDF_INIT: Once = Once::new();

fn enable_fast_kdf_for_tests() {
    FAST_KDF_INIT.call_once(|| {
        if std::env::var_os("CHROMVOID_TEST_FAST_KDF").is_none() {
            std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1");
        }
    });
}

fn create_router_with_cached_master_key() -> (RpcRouter, TempDir) {
    enable_fast_kdf_for_tests();

    let temp_dir = TempDir::new().expect("create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("create storage");
    let mut router = RpcRouter::new(storage).with_master_key(OLD_MASTER_PASSWORD);
    let response = router.handle(&RpcRequest::new(
        "master:setup",
        json!({"master_password": OLD_MASTER_PASSWORD}),
    ));
    assert!(response.is_ok(), "master setup failed: {response:?}");
    (router, temp_dir)
}

#[test]
fn handle_master_rekey_updates_cached_master_key_and_removes_transaction_artifacts() {
    let (mut router, temp_dir) = create_router_with_cached_master_key();

    let response = router.handle(&RpcRequest::new(
        "master:rekey",
        json!({
            "current_password": OLD_MASTER_PASSWORD,
            "new_master_password": NEW_MASTER_PASSWORD,
        }),
    ));

    assert!(response.is_ok(), "master rekey failed: {response:?}");
    assert_eq!(router.master_key.as_deref(), Some(NEW_MASTER_PASSWORD));
    assert!(!temp_dir.path().join(MASTER_REKEY_TRANSACTION_FILE).exists());
    assert!(!temp_dir
        .path()
        .join(".master.verify.master-rekey.tmp")
        .exists());
}

#[test]
fn master_rekey_registry_names_are_stable() {
    assert_eq!(MASTER_REKEY_ARTIFACTS.len(), 1);
    let artifact = &MASTER_REKEY_ARTIFACTS[0];
    assert_eq!(artifact.name, "master.verify");
    assert_eq!(artifact.file_name, "master.verify");
    assert_eq!(
        master_rekey_temp_name(artifact),
        ".master.verify.master-rekey.tmp"
    );
}

#[test]
fn master_rekey_recovery_removes_orphan_temp_without_transaction() {
    let (router, temp_dir) = create_router_with_cached_master_key();
    let temp_path = temp_dir.path().join(".master.verify.master-rekey.tmp");
    std::fs::write(&temp_path, [7_u8; 32]).expect("write orphan temp");
    assert!(temp_path.exists());

    router
        .recover_master_rekey_transaction()
        .expect("recover master rekey transaction");

    assert!(!temp_path.exists());
}
