//! ADR-004 Admin commands (target contract)

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use std::fs;
use std::io::Read;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

const MASTER_PASSWORD: &str = "correct horse battery staple";

fn create_router_with_master() -> (RpcRouter, TempDir) {
    enable_fast_kdf_for_tests();

    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage).with_keystore(keystore);
    let setup = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup);
    (router, temp_dir)
}

fn admin_erase(
    router: &mut RpcRouter,
    master_password: &str,
    confirm: bool,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        "admin:erase",
        serde_json::json!({
            "master_password": master_password,
            "confirm": confirm,
        }),
    ))
}

#[test]
fn test_admin_erase_requires_master_password() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = router.handle(&RpcRequest::new(
        "admin:erase",
        serde_json::json!({"confirm": true}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_admin_erase_requires_confirmation() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = admin_erase(&mut router, MASTER_PASSWORD, false);
    assert_rpc_error(&response, "ERASE_NO_CONFIRM");
}

#[test]
fn test_admin_erase_invalid_master_password() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = admin_erase(&mut router, "wrong-password", true);
    assert_rpc_error(&response, "INVALID_MASTER_PASSWORD");
}

#[test]
fn test_admin_erase_clears_all_data_and_master_files() {
    let (mut router, temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "documents");
    create_dir(&mut router, "photos");

    let items = get_items(&list_dir(&mut router, "/"));
    assert_eq!(items.len(), 2);

    let response = admin_erase(&mut router, MASTER_PASSWORD, true);
    assert_rpc_ok(&response);

    // Must return storage to BLANK state (ADR-001/ADR-012): no master artifacts remain.
    assert!(!temp_dir.path().join("master.salt").exists());
    assert!(!temp_dir.path().join("master.verify").exists());

    unlock_vault(&mut router, "test_password");
    let items = get_items(&list_dir(&mut router, "/"));
    assert!(items.is_empty());
}

fn admin_backup(
    router: &mut RpcRouter,
    master_password: &str,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        "admin:backup",
        serde_json::json!({"master_password": master_password}),
    ))
}

fn admin_restore(
    router: &mut RpcRouter,
    master_password: &str,
    content: &str,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        "admin:restore",
        serde_json::json!({
            "master_password": master_password,
            "content": content,
        }),
    ))
}

#[test]
fn test_admin_backup_stream_meta_contract() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    router.save().expect("save");

    let backup_request = RpcRequest::new(
        "admin:backup",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
        }),
    );

    let reply = router.handle_with_stream(&backup_request, None);
    let (meta, bytes_len) = match reply {
        RpcReply::Stream(mut out) => {
            let meta = out.meta.clone();
            let mut buf = Vec::new();
            out.reader
                .read_to_end(&mut buf)
                .expect("read backup stream");
            (meta, buf.len() as u64)
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    };

    assert!(
        meta.name.starts_with("chromvoid-backup-") && meta.name.ends_with(".chromvoid"),
        "backup filename must follow ADR-004: chromvoid-backup-{{timestamp}}.chromvoid, got {}",
        meta.name
    );
    assert_eq!(meta.mime_type, "application/x-chromvoid-backup");
    assert_eq!(meta.size, bytes_len);
    assert!(meta.chunk_size > 0);
}

#[test]
fn test_admin_restore_rejects_non_blank_storage() {
    let (mut router, _temp_dir) = create_router_with_master();

    // Create a non-blank storage state (salt exists after unlock).
    unlock_vault(&mut router, "test_password");

    let restore_request = RpcRequest::new(
        "admin:restore",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
            "content": "",
        }),
    );

    let reply = router.handle_with_stream(
        &restore_request,
        Some(RpcInputStream::from_bytes(vec![0u8])),
    );
    match reply {
        RpcReply::Json(r) => assert_rpc_error(&r, "STORAGE_NOT_BLANK"),
        RpcReply::Stream(_) => panic!("admin:restore must return JSON response"),
    }
}

#[test]
fn test_admin_restore_invalid_backup_format_is_typed_error() {
    let (mut router, _temp_dir) = create_router_with_master();

    let restore_request = RpcRequest::new(
        "admin:restore",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
            "content": "",
        }),
    );

    // Must be blank (Storage::new creates chunks/ but no salt file).
    let reply = router.handle_with_stream(
        &restore_request,
        Some(RpcInputStream::from_bytes(b"not-json".to_vec())),
    );
    match reply {
        RpcReply::Json(r) => assert_rpc_error(&r, "INVALID_BACKUP"),
        RpcReply::Stream(_) => panic!("admin:restore must return JSON response"),
    }
}

#[test]
fn test_admin_restore_checksum_mismatch_is_typed_error() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "test_password");
    create_dir(&mut router, "docs");
    router.save().expect("save");

    let backup_request = RpcRequest::new(
        "admin:backup",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
        }),
    );
    let backup_bytes = match router.handle_with_stream(&backup_request, None) {
        RpcReply::Stream(mut out) => {
            let mut buf = Vec::new();
            out.reader
                .read_to_end(&mut buf)
                .expect("read backup stream");
            buf
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    };

    // Tamper bytes while keeping JSON parseable.
    let mut v: serde_json::Value =
        serde_json::from_slice(&backup_bytes).expect("backup must be JSON");
    if let Some(arr) = v.as_array_mut() {
        if let Some(first) = arr.first_mut() {
            if let Some(pair) = first.as_array_mut() {
                if let Some(bytes) = pair.get_mut(1).and_then(|b| b.as_array_mut()) {
                    if let Some(n) = bytes.first_mut() {
                        if let Some(x) = n.as_u64() {
                            *n = serde_json::Value::from(((x + 1) % 256) as u64);
                        }
                    }
                }
            }
        }
    }
    let tampered = serde_json::to_vec(&v).expect("serialize tampered backup");

    let (mut router2, _temp_dir2) = create_router_with_master();
    let restore_request = RpcRequest::new(
        "admin:restore",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
            "content": "",
        }),
    );
    let reply =
        router2.handle_with_stream(&restore_request, Some(RpcInputStream::from_bytes(tampered)));

    match reply {
        RpcReply::Json(r) => assert_rpc_error(&r, "CHECKSUM_MISMATCH"),
        RpcReply::Stream(_) => panic!("admin:restore must return JSON response"),
    }
}

#[test]
fn test_admin_backup_requires_master_password() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = router.handle(&RpcRequest::new("admin:backup", serde_json::json!({})));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_admin_backup_wrong_master_password_is_typed_error() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = admin_backup(&mut router, "wrong-password");
    assert_rpc_error(&response, "INVALID_MASTER_PASSWORD");
}

#[test]
fn test_admin_backup_requires_stream() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = admin_backup(&mut router, MASTER_PASSWORD);
    assert_rpc_error(&response, "STREAM_REQUIRED");
}

#[test]
fn test_admin_restore_requires_master_password() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = router.handle(&RpcRequest::new(
        "admin:restore",
        serde_json::json!({"content": "somedata"}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_admin_restore_wrong_master_password_is_typed_error() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = admin_restore(&mut router, "wrong-password", "somedata");
    assert_rpc_error(&response, "INVALID_MASTER_PASSWORD");
}

#[test]
fn test_admin_restore_requires_stream() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = admin_restore(&mut router, MASTER_PASSWORD, "somedata");
    assert_rpc_error(&response, "NO_STREAM");
}

#[test]
fn test_admin_backup_restore_roundtrip_with_stream() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "test_password");

    create_dir(&mut router, "docs");
    router.save().expect("save");

    let backup_request = RpcRequest::new(
        "admin:backup",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
        }),
    );

    let backup_reply = router.handle_with_stream(&backup_request, None);
    let backup_bytes = match backup_reply {
        RpcReply::Stream(mut out) => {
            let mut buf = Vec::new();
            out.reader
                .read_to_end(&mut buf)
                .expect("read backup stream");
            buf
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    };

    let (mut router2, _temp_dir2) = create_router_with_master();

    let restore_request = RpcRequest::new(
        "admin:restore",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
            "content": "",
        }),
    );
    let restore_reply = router2.handle_with_stream(
        &restore_request,
        Some(RpcInputStream::from_bytes(backup_bytes)),
    );

    match restore_reply {
        RpcReply::Json(r) => {
            assert_rpc_ok(&r);
            // ADR-004: restore must return nodes_restored.
            let result = r.result().expect("restore must return result");
            assert!(result
                .get("nodes_restored")
                .and_then(|v| v.as_u64())
                .is_some());
        }
        RpcReply::Stream(_) => panic!("admin:restore must return JSON response"),
    }

    unlock_vault(&mut router2, "test_password");
    let items = get_items(&list_dir(&mut router2, "/"));
    assert!(find_item_by_name(&items, "docs").is_some());
}

#[test]
fn test_admin_backup_restore_restores_master_artifacts() {
    let (mut router1, temp_dir1) = create_router_with_master();
    unlock_vault(&mut router1, "test_password");
    create_dir(&mut router1, "docs");
    router1.save().expect("save");

    let master_salt1 = fs::read(temp_dir1.path().join("master.salt")).expect("read master.salt");
    let master_verify1 =
        fs::read(temp_dir1.path().join("master.verify")).expect("read master.verify");
    assert_eq!(master_salt1.len(), 16);
    assert_eq!(master_verify1.len(), 32);

    let backup_request = RpcRequest::new(
        "admin:backup",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
        }),
    );
    let backup_bytes = match router1.handle_with_stream(&backup_request, None) {
        RpcReply::Stream(mut out) => {
            let mut buf = Vec::new();
            out.reader
                .read_to_end(&mut buf)
                .expect("read backup stream");
            buf
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    };

    // Restore into a fresh blank storage (no master artifacts pre-seeded).
    let temp_dir2 = TempDir::new().expect("temp dir");
    let storage2 = Storage::new(temp_dir2.path()).expect("storage");
    let keystore2 = Arc::new(InMemoryKeystore::new());
    let mut router2 = RpcRouter::new(storage2).with_keystore(keystore2);

    let restore_request = RpcRequest::new(
        "admin:restore",
        serde_json::json!({
            "master_password": MASTER_PASSWORD,
            "content": "",
        }),
    );
    let restore_reply = router2.handle_with_stream(
        &restore_request,
        Some(RpcInputStream::from_bytes(backup_bytes)),
    );
    match restore_reply {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("admin:restore must return JSON response"),
    }

    let master_salt2 =
        fs::read(temp_dir2.path().join("master.salt")).expect("read restored master.salt");
    let master_verify2 =
        fs::read(temp_dir2.path().join("master.verify")).expect("read restored master.verify");
    assert_eq!(master_salt1, master_salt2);
    assert_eq!(master_verify1, master_verify2);

    // Admin operations must remain functional after restore.
    let erase = router2.handle(&RpcRequest::new(
        "admin:erase",
        serde_json::json!({"master_password": MASTER_PASSWORD, "confirm": true}),
    ));
    assert_rpc_ok(&erase);
}
