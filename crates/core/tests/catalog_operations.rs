//! Integration tests for catalog operations (CRUD, move, validation)

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcReply;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use test_helpers::*;

fn move_node_with_replace(
    router: &mut RpcRouter,
    node_id: u64,
    new_parent_path: &str,
    new_name: &str,
    replace_existing: bool,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:move",
        serde_json::json!({
            "node_id": node_id,
            "new_parent_path": new_parent_path,
            "new_name": new_name,
            "replace_existing": replace_existing,
        }),
    ))
}

fn download_file(router: &mut RpcRouter, node_id: u64) -> Vec<u8> {
    match router.handle_with_stream(
        &RpcRequest::new("catalog:download", serde_json::json!({"node_id": node_id})),
        None,
    ) {
        RpcReply::Stream(mut stream) => {
            let mut out = Vec::new();
            std::io::Read::read_to_end(&mut stream.reader, &mut out).expect("download stream");
            out
        }
        RpcReply::Json(response) => panic!("expected stream, got JSON: {response:?}"),
        RpcReply::RangeStream(_) => panic!("expected full stream"),
    }
}

// ============================================================================
// catalog:move tests
// ============================================================================

#[test]
fn test_catalog_mutations_survive_fresh_router_without_explicit_save() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let docs = create_dir(&mut router, "docs");
    assert_rpc_ok(&docs);
    let archive = create_dir(&mut router, "archive");
    assert_rpc_ok(&archive);
    let file = create_dir_at(&mut router, "/docs", "draft");
    assert_rpc_ok(&file);
    let file_id = get_node_id(&file);
    assert_rpc_ok(&rename_node(&mut router, file_id, "final"));
    assert_rpc_ok(&move_node(&mut router, file_id, "/archive"));
    drop(router);

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore.clone());
    assert_rpc_ok(&unlock_vault(&mut reopened, "test"));
    let archive_items = get_items(&list_dir(&mut reopened, "/archive"));
    assert!(find_item_by_name(&archive_items, "final").is_some());
    let docs_items = get_items(&list_dir(&mut reopened, "/docs"));
    assert!(find_item_by_name(&docs_items, "final").is_none());

    assert_rpc_ok(&delete_node(&mut reopened, file_id));
    drop(reopened);

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut reopened_after_delete = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened_after_delete, "test"));
    let archive_items = get_items(&list_dir(&mut reopened_after_delete, "/archive"));
    assert!(find_item_by_name(&archive_items, "final").is_none());
}

#[test]
fn test_move_directory_basic() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "source");
    create_dir(&mut router, "dest");
    let file_response = create_dir_at(&mut router, "/source", "subdir");
    let subdir_id = get_node_id(&file_response);

    let response = move_node(&mut router, subdir_id, "/dest");
    assert_rpc_ok(&response);

    let source_items = get_items(&list_dir(&mut router, "/source"));
    assert!(source_items.is_empty(), "source should be empty after move");

    let dest_items = get_items(&list_dir(&mut router, "/dest"));
    assert!(
        find_item_by_name(&dest_items, "subdir").is_some(),
        "subdir should be in dest"
    );
}

#[test]
fn test_move_to_root() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "parent");
    let child_response = create_dir_at(&mut router, "/parent", "child");
    let child_id = get_node_id(&child_response);

    let response = move_node(&mut router, child_id, "/");
    assert_rpc_ok(&response);

    let root_items = get_items(&list_dir(&mut router, "/"));
    let names = get_item_names(&root_items);
    assert!(
        names.contains(&"child".to_string()),
        "child should be at root"
    );
    assert!(
        names.contains(&"parent".to_string()),
        "parent should still exist"
    );
}

#[test]
fn test_move_to_nonexistent_parent() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let dir_response = create_dir(&mut router, "mydir");
    let dir_id = get_node_id(&dir_response);

    let response = move_node(&mut router, dir_id, "/nonexistent");
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_move_root_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "dest");

    let response = move_node(&mut router, 0, "/dest");
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_move_creates_duplicate_name() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "source");
    create_dir(&mut router, "dest");
    create_dir_at(&mut router, "/dest", "conflict");

    let movable_response = create_dir_at(&mut router, "/source", "conflict");
    let movable_id = get_node_id(&movable_response);

    let response = move_node(&mut router, movable_id, "/dest");
    assert_rpc_error(&response, "NAME_EXIST");
}

#[test]
fn test_move_replace_existing_file_is_atomic() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    assert_rpc_ok(&create_dir(&mut router, "source"));
    assert_rpc_ok(&create_dir(&mut router, "dest"));
    let source_id = upload_file(
        &mut router,
        Some("/source"),
        ".safe-save.tmp",
        b"new bytes".to_vec(),
        Some("text/plain"),
    );
    let old_dest_id = upload_file(
        &mut router,
        Some("/dest"),
        "file.txt",
        b"old bytes".to_vec(),
        Some("text/plain"),
    );

    let response = move_node_with_replace(&mut router, source_id, "/dest", "file.txt", true);
    assert_rpc_ok(&response);

    let source_items = get_items(&list_dir(&mut router, "/source"));
    assert!(source_items.is_empty());
    let dest_items = get_items(&list_dir(&mut router, "/dest"));
    let file = find_item_by_name(&dest_items, "file.txt").expect("replacement file");
    assert_eq!(
        file.get("node_id").and_then(|value| value.as_u64()),
        Some(source_id)
    );
    assert_ne!(source_id, old_dest_id);
    assert_eq!(download_file(&mut router, source_id), b"new bytes");

    let old_dest_download = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:download",
            serde_json::json!({"node_id": old_dest_id}),
        ),
        None,
    );
    match old_dest_download {
        RpcReply::Json(response) => assert_rpc_error(&response, "NODE_NOT_FOUND"),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("old destination node should be gone, got stream")
        }
    }
}

#[test]
fn test_move_replace_type_mismatch_preserves_source_and_destination() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    assert_rpc_ok(&create_dir(&mut router, "source"));
    assert_rpc_ok(&create_dir(&mut router, "dest"));
    let source_dir = create_dir_at(&mut router, "/source", "folder.tmp");
    assert_rpc_ok(&source_dir);
    let source_id = get_node_id(&source_dir);
    let dest_id = upload_file(
        &mut router,
        Some("/dest"),
        "file.txt",
        b"keep me".to_vec(),
        Some("text/plain"),
    );

    let response = move_node_with_replace(&mut router, source_id, "/dest", "file.txt", true);
    assert_rpc_error(&response, "NAME_EXIST");

    let source_items = get_items(&list_dir(&mut router, "/source"));
    assert!(find_item_by_name(&source_items, "folder.tmp").is_some());
    let dest_items = get_items(&list_dir(&mut router, "/dest"));
    let file = find_item_by_name(&dest_items, "file.txt").expect("destination preserved");
    assert_eq!(
        file.get("node_id").and_then(|value| value.as_u64()),
        Some(dest_id)
    );
    assert_eq!(download_file(&mut router, dest_id), b"keep me");
}

#[test]
fn test_move_nonexistent_node() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "dest");

    let response = move_node(&mut router, 99999, "/dest");
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_move_deep_subtree() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "source");
    create_dir_at(&mut router, "/source", "level1");
    create_dir_at(&mut router, "/source/level1", "level2");
    create_dir_at(&mut router, "/source/level1/level2", "level3");

    create_dir(&mut router, "dest");

    let list_response = list_dir(&mut router, "/source");
    let items = get_items(&list_response);
    let level1_id = find_item_by_name(&items, "level1")
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();

    let response = move_node(&mut router, level1_id, "/dest");
    assert_rpc_ok(&response);

    let source_items = get_items(&list_dir(&mut router, "/source"));
    assert!(source_items.is_empty());

    assert!(list_dir(&mut router, "/dest/level1").is_ok());
    assert!(list_dir(&mut router, "/dest/level1/level2").is_ok());
    assert!(list_dir(&mut router, "/dest/level1/level2/level3").is_ok());
}

// ============================================================================
// Name validation tests
// ============================================================================

#[test]
fn test_create_empty_name_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = create_dir(&mut router, "");
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_create_name_with_slash_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = create_dir(&mut router, "a/b");
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_create_name_dot_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = create_dir(&mut router, ".");
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_create_name_dotdot_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = create_dir(&mut router, "..");
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_create_duplicate_name_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response1 = create_dir(&mut router, "mydir");
    assert_rpc_ok(&response1);

    let response2 = create_dir(&mut router, "mydir");
    assert_rpc_error(&response2, "NAME_EXIST");
}

#[test]
fn test_create_unicode_names() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let names = vec![
        "документы",
        "文档",
        "ドキュメント",
        "مستندات",
        "📁folder",
        "café",
        "naïve",
    ];

    for name in names {
        let response = create_dir(&mut router, name);
        assert_rpc_ok(&response);
    }

    let items = get_items(&list_dir(&mut router, "/"));
    assert_eq!(items.len(), 7);
}

#[test]
fn test_create_special_characters_in_name() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let valid_names = vec![
        "my-folder",
        "my_folder",
        "my.folder",
        "my folder",
        "folder (1)",
        "[backup]",
        "file@2024",
    ];

    for name in valid_names {
        let response = create_dir(&mut router, name);
        assert_rpc_ok(&response);
    }
}

#[test]
fn test_rename_to_existing_name_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "first");
    let second_response = create_dir(&mut router, "second");
    let second_id = get_node_id(&second_response);

    let response = rename_node(&mut router, second_id, "first");
    assert_rpc_error(&response, "NAME_EXIST");
}

#[test]
fn test_rename_to_same_name_succeeds() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let dir_response = create_dir(&mut router, "mydir");
    let dir_id = get_node_id(&dir_response);

    let response = rename_node(&mut router, dir_id, "mydir");
    assert_rpc_ok(&response);
}

#[test]
fn test_rename_empty_name_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let dir_response = create_dir(&mut router, "mydir");
    let dir_id = get_node_id(&dir_response);

    let response = rename_node(&mut router, dir_id, "");
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_rename_root_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = rename_node(&mut router, 0, "newroot");
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

// ============================================================================
// Edge cases tests
// ============================================================================

#[test]
fn test_delete_already_deleted_succeeds() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let dir_response = create_dir(&mut router, "mydir");
    let dir_id = get_node_id(&dir_response);

    let response1 = delete_node(&mut router, dir_id);
    assert_rpc_ok(&response1);

    let response2 = delete_node(&mut router, dir_id);
    // ADR-004: catalog:delete is idempotent (already-deleted -> ok: true)
    assert_rpc_ok(&response2);
}

#[test]
fn test_recreate_after_delete_new_id() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response1 = create_dir(&mut router, "mydir");
    let id1 = get_node_id(&response1);
    delete_node(&mut router, id1);

    let response2 = create_dir(&mut router, "mydir");
    let id2 = get_node_id(&response2);

    assert_ne!(id1, id2, "recreated node should have different ID");
}

// ADR-028: generic catalog commands on system shards are now denied.
// This test validates that the old pattern (create/delete under /.passmanager
// via catalog:*) is correctly blocked. The passmanager.* domain API (Task 4)
// will replace this workflow.
#[test]
fn test_recreate_after_delete_under_passmanager() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    assert_rpc_error(&create_dir(&mut router, ".passmanager"), "ACCESS_DENIED");
    assert_rpc_error(
        &create_dir_at(&mut router, "/.passmanager", "123"),
        "ACCESS_DENIED",
    );
    assert_rpc_error(&list_dir(&mut router, "/.passmanager"), "ACCESS_DENIED");
}

#[test]
fn test_list_nonexistent_path_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = list_dir(&mut router, "/nonexistent");
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_delete_root_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = delete_node(&mut router, 0);
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_operations_require_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = create_dir(&mut router, "test");
    assert_rpc_error(&response, "VAULT_REQUIRED");

    let response = list_dir(&mut router, "/");
    assert_rpc_error(&response, "VAULT_REQUIRED");

    let response = rename_node(&mut router, 1, "new");
    assert_rpc_error(&response, "VAULT_REQUIRED");

    let response = delete_node(&mut router, 1);
    assert_rpc_error(&response, "VAULT_REQUIRED");

    let response = move_node(&mut router, 1, "/");
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

#[test]
fn test_delete_directory_with_children() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let parent_response = create_dir(&mut router, "parent");
    let parent_id = get_node_id(&parent_response);

    create_dir_at(&mut router, "/parent", "child1");
    create_dir_at(&mut router, "/parent", "child2");
    create_dir_at(&mut router, "/parent/child1", "grandchild");

    let response = delete_node(&mut router, parent_id);
    assert_rpc_ok(&response);

    let response = list_dir(&mut router, "/parent");
    assert_rpc_error(&response, "NODE_NOT_FOUND");

    let items = get_items(&list_dir(&mut router, "/"));
    assert!(items.is_empty());
}
