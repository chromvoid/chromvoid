mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use std::io::Read as _;
use std::sync::Arc;
use test_helpers::*;

fn upload_file(router: &mut RpcRouter, parent_path: &str, name: &str, bytes: &[u8]) -> u64 {
    let upload = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": parent_path,
            "name": name,
            "total_size": bytes.len() as u64,
            "size": bytes.len() as u64,
            "offset": 0,
            "chunk_size": 1024 * 1024,
        }),
    );
    match router.handle_with_stream(&upload, Some(RpcInputStream::from_bytes(bytes.to_vec()))) {
        RpcReply::Json(r) => {
            assert_rpc_ok(&r);
            get_node_id(&r)
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

fn reopen_router(
    temp_dir: &tempfile::TempDir,
    keystore: &Arc<chromvoid_core::crypto::keystore::InMemoryKeystore>,
) -> RpcRouter {
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    router
}

fn assert_file_download(router: &mut RpcRouter, parent_path: &str, name: &str, expected: &[u8]) {
    let list = list_dir(router, parent_path);
    assert_rpc_ok(&list);
    let items = get_items(&list);
    let item = find_item_by_name(&items, name).unwrap_or_else(|| {
        panic!("{parent_path}/{name} should exist; items={items:?}");
    });
    let node_id = item
        .get("node_id")
        .and_then(|v| v.as_u64())
        .expect("node_id");

    let req = RpcRequest::new("catalog:download", serde_json::json!({"node_id": node_id}));
    let downloaded = match router.handle_with_stream(&req, None) {
        RpcReply::Stream(mut out) => {
            let mut buf = Vec::new();
            out.reader.read_to_end(&mut buf).expect("read stream");
            buf
        }
        RpcReply::Json(r) => panic!("expected stream reply for catalog:download, got JSON: {r:?}"),
        RpcReply::RangeStream(_) => panic!("expected full file stream reply"),
    };

    assert_eq!(downloaded, expected);
}

fn assert_absent(router: &mut RpcRouter, parent_path: &str, name: &str) {
    let list = list_dir(router, parent_path);
    assert_rpc_ok(&list);
    let items = get_items(&list);
    assert!(
        find_item_by_name(&items, name).is_none(),
        "{parent_path}/{name} should be absent; items={items:?}"
    );
}

#[test]
fn test_root_file_overwrite_by_delete_and_rename_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let original = vec![0x11u8; (1024 * 1024) + 7];
    let replacement = vec![0x22u8; (2 * 1024 * 1024) + 3];

    let doc_id = upload_file(&mut router, "/", "document.pdf", &original);

    let tmp_id = upload_file(&mut router, "/", ".temp_write", &replacement);

    assert_rpc_ok(&delete_node(&mut router, doc_id));
    assert_rpc_ok(&rename_node(&mut router, tmp_id, "document.pdf"));
    router.save().expect("save");

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = RpcRouter::new(storage).with_keystore(ks.clone());
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let list = list_dir(&mut router, "/");
    assert_rpc_ok(&list);
    let items = get_items(&list);
    let item = find_item_by_name(&items, "document.pdf").expect("document.pdf exists");
    let node_id = item
        .get("node_id")
        .and_then(|v| v.as_u64())
        .expect("node_id");

    let req = RpcRequest::new("catalog:download", serde_json::json!({"node_id": node_id}));
    let downloaded = match router.handle_with_stream(&req, None) {
        RpcReply::Stream(mut out) => {
            let mut buf = Vec::new();
            out.reader.read_to_end(&mut buf).expect("read stream");
            buf
        }
        RpcReply::Json(r) => panic!("expected stream reply for catalog:download, got JSON: {r:?}"),
        RpcReply::RangeStream(_) => panic!("expected full file stream reply"),
    };

    assert_eq!(downloaded, replacement);
}

#[test]
fn test_root_file_replace_same_node_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let original = b"original-root-file".to_vec();
    let replacement = b"replacement-root-file-with-new-size".to_vec();
    let file_id = upload_file(&mut router, "/", "document.pdf", &original);
    router.save().expect("initial save");

    let upload = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": "document.pdf",
            "total_size": replacement.len() as u64,
            "size": replacement.len() as u64,
            "offset": 0,
            "chunk_size": 1024 * 1024,
        }),
    );
    match router.handle_with_stream(
        &upload,
        Some(RpcInputStream::from_bytes(replacement.clone())),
    ) {
        RpcReply::Json(r) => {
            assert_rpc_ok(&r);
            assert_eq!(
                get_node_id(&r),
                file_id,
                "same-name root replacement should update the existing node"
            );
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
    router.save().expect("replacement save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_file_download(&mut router, "/", "document.pdf", &replacement);
}

#[test]
fn test_root_file_move_into_user_shard_then_rename_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let bytes = b"shared-from-total-commander".to_vec();
    let file_id = upload_file(&mut router, "/", "incoming.bin", &bytes);
    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&move_node(&mut router, file_id, "/docs"));
    assert_rpc_ok(&rename_node(&mut router, file_id, "renamed.bin"));
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_absent(&mut router, "/", "incoming.bin");
    assert_absent(&mut router, "/docs", "incoming.bin");
    assert_file_download(&mut router, "/docs", "renamed.bin", &bytes);
}

#[test]
fn test_shard_file_move_to_root_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    let bytes = b"nested-to-root".to_vec();
    let file_id = upload_file(&mut router, "/docs", "nested.bin", &bytes);
    assert_rpc_ok(&move_node(&mut router, file_id, "/"));
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_absent(&mut router, "/docs", "nested.bin");
    assert_file_download(&mut router, "/", "nested.bin", &bytes);
}

#[test]
fn test_shard_file_move_to_different_shard_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir(&mut router, "archive"));
    let bytes = b"docs-to-archive".to_vec();
    let file_id = upload_file(&mut router, "/docs", "nested.bin", &bytes);
    assert_rpc_ok(&move_node(&mut router, file_id, "/archive"));
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_absent(&mut router, "/docs", "nested.bin");
    assert_file_download(&mut router, "/archive", "nested.bin", &bytes);
}

#[test]
fn test_top_level_directory_rename_with_child_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let docs = create_dir(&mut router, "docs");
    assert_rpc_ok(&docs);
    let docs_id = get_node_id(&docs);
    let bytes = b"directory-rename-child".to_vec();
    upload_file(&mut router, "/docs", "child.bin", &bytes);
    assert_rpc_ok(&rename_node(&mut router, docs_id, "archive"));
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_absent(&mut router, "/", "docs");
    assert_file_download(&mut router, "/archive", "child.bin", &bytes);
}

#[test]
fn test_top_level_directory_move_into_another_shard_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let docs = create_dir(&mut router, "docs");
    assert_rpc_ok(&docs);
    let docs_id = get_node_id(&docs);
    assert_rpc_ok(&create_dir(&mut router, "archive"));
    let bytes = b"moved-directory-child".to_vec();
    upload_file(&mut router, "/docs", "child.bin", &bytes);
    assert_rpc_ok(&move_node(&mut router, docs_id, "/archive"));
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_absent(&mut router, "/", "docs");
    assert_file_download(&mut router, "/archive/docs", "child.bin", &bytes);
}

#[test]
fn test_nested_directory_move_back_to_root_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    assert_rpc_ok(&create_dir(&mut router, "archive"));
    let docs = create_dir_at(&mut router, "/archive", "docs");
    assert_rpc_ok(&docs);
    let docs_id = get_node_id(&docs);
    let bytes = b"nested-directory-back-to-root".to_vec();
    upload_file(&mut router, "/archive/docs", "child.bin", &bytes);
    assert_rpc_ok(&move_node(&mut router, docs_id, "/"));
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_absent(&mut router, "/archive", "docs");
    assert_file_download(&mut router, "/docs", "child.bin", &bytes);
}

#[test]
fn test_delete_recreate_same_top_level_shard_name_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let docs = create_dir(&mut router, "docs");
    assert_rpc_ok(&docs);
    let old_docs_id = get_node_id(&docs);
    upload_file(&mut router, "/docs", "old.bin", b"old");
    assert_rpc_ok(&delete_node(&mut router, old_docs_id));
    assert_rpc_ok(&create_dir(&mut router, "docs"));
    let bytes = b"new-shard-same-name".to_vec();
    upload_file(&mut router, "/docs", "new.bin", &bytes);
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_absent(&mut router, "/docs", "old.bin");
    assert_file_download(&mut router, "/docs", "new.bin", &bytes);
}

#[test]
fn test_new_directory_shard_with_child_single_save_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    let bytes = b"single-save-child".to_vec();
    upload_file(&mut router, "/docs", "child.bin", &bytes);
    router.save().expect("save");

    let mut router = reopen_router(&temp_dir, &ks);
    assert_file_download(&mut router, "/docs", "child.bin", &bytes);
}
