use std::sync::Arc;

use tempfile::TempDir;

use crate::crypto::keystore::InMemoryKeystore;
use crate::rpc::types::RpcRequest;
use crate::rpc::RpcRouter;
use crate::storage::Storage;

use super::DomainUnitOfWork;

#[test]
fn domain_uow_commits_staged_catalog_and_blob_once() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
    let unlock = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "pw"}),
    ));
    assert!(unlock.is_ok(), "{unlock:?}");

    let session = router.session.as_mut().expect("session");
    let mut uow = DomainUnitOfWork::begin(session, &storage, ".wallet", "test-domain-uow");
    uow.ensure_dir("/.wallet").expect("wallet root");
    uow.stage_blob_write(
        "/.wallet",
        "index.json",
        br#"{"schema_version":1,"wallet_ids":[]}"#,
        "application/json",
    )
    .expect("stage write");
    let outcome = uow.commit(session).expect("commit");
    assert_eq!(outcome.chunks_written(), 1);
    assert!(session
        .catalog()
        .find_by_path("/.wallet/index.json")
        .is_some());
}

#[test]
fn domain_uow_rejects_staged_catalog_changes_outside_domain() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
    let unlock = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "pw"}),
    ));
    assert!(unlock.is_ok(), "{unlock:?}");

    let session = router.session.as_mut().expect("session");
    let mut uow = DomainUnitOfWork::begin(session, &storage, ".wallet", "test-domain-uow");
    let mut staged = session.catalog().clone();
    staged
        .create_dir("/", "outside")
        .expect("outside domain mutation");

    let response = uow.replace_staged_catalog(staged).expect_err("must reject");
    assert_eq!(response.code(), Some("ACCESS_DENIED"));
    assert_eq!(
        response.message(),
        "Domain transaction changed data outside domain"
    );
}

#[test]
fn domain_uow_rejects_path_outside_domain_with_access_denied() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
    let unlock = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "pw"}),
    ));
    assert!(unlock.is_ok(), "{unlock:?}");

    let session = router.session.as_mut().expect("session");
    let mut uow = DomainUnitOfWork::begin(session, &storage, ".wallet", "test-domain-uow");
    let error = uow.ensure_dir("/.passmanager").expect_err("must reject");

    assert_eq!(error.code(), Some("ACCESS_DENIED"));
    assert_eq!(error.message(), "Domain transaction path outside domain");
}

#[test]
fn domain_uow_rejects_missing_node_with_node_not_found() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
    let unlock = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "pw"}),
    ));
    assert!(unlock.is_ok(), "{unlock:?}");

    let session = router.session.as_mut().expect("session");
    let mut uow = DomainUnitOfWork::begin(session, &storage, ".wallet", "test-domain-uow");
    let error = uow.stage_delete_node(999).expect_err("must reject");

    assert_eq!(error.code(), Some("NODE_NOT_FOUND"));
    assert_eq!(error.message(), "Node not found");
}

#[test]
fn domain_uow_maps_invalid_chunk_name_to_rpc_response() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
    let unlock = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "pw"}),
    ));
    assert!(unlock.is_ok(), "{unlock:?}");

    let session = router.session.as_mut().expect("session");
    let mut uow = DomainUnitOfWork::begin(session, &storage, ".wallet", "test-domain-uow");
    let error = uow
        .stage_encrypted_chunk(" ".to_string(), Vec::new())
        .expect_err("must reject");

    assert_eq!(error.code(), Some("INTERNAL_ERROR"));
    assert_eq!(error.message(), "Domain chunk name is required");

    let response = error.into_rpc_response();
    assert_eq!(response.code(), Some("INTERNAL_ERROR"));
    assert_eq!(
        response.error_message(),
        Some("Domain chunk name is required")
    );
}
