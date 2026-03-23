mod test_helpers;

use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_list_passmanager_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = list_dir(&mut router, "/.passmanager");
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_list_wallet_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = list_dir(&mut router, "/.wallet");
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_list_passmanager_nested_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = list_dir(&mut router, "/.passmanager/group/entry");
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_list_root_filters_system_shards() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = list_dir(&mut router, "/");
    assert_rpc_ok(&resp);

    let names = get_item_names(&get_items(&resp));
    assert!(!names.contains(&".passmanager".to_string()));
    assert!(!names.contains(&".wallet".to_string()));
}

#[test]
fn test_list_user_shard_allowed() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    create_dir(&mut router, "docs");
    let resp = list_dir(&mut router, "/docs");
    assert_rpc_ok(&resp);
}

#[test]
fn test_create_dir_inside_passmanager_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = create_dir_at(&mut router, "/.passmanager", "group");
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_create_dir_inside_wallet_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = create_dir_at(&mut router, "/.wallet", "tokens");
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_create_system_shard_root_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    assert_rpc_error(&create_dir(&mut router, ".passmanager"), "ACCESS_DENIED");
    assert_rpc_error(&create_dir(&mut router, ".wallet"), "ACCESS_DENIED");
}

#[test]
fn test_create_dir_user_shard_allowed() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    assert_rpc_ok(&create_dir(&mut router, "photos"));
}

#[test]
fn test_prepare_upload_in_passmanager_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({"name": "file.txt", "size": 10, "parent_path": "/.passmanager"}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_prepare_upload_in_wallet_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({"name": "key.dat", "size": 32, "parent_path": "/.wallet"}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

fn get_system_shard_node_id(router: &mut chromvoid_core::rpc::RpcRouter) -> Option<u64> {
    router.save().ok();
    lock_vault(router);
    unlock_vault(router, "pw");

    set_bypass_system_shard_guards(true);
    let resp = router.handle(&RpcRequest::new(
        "catalog:shard:load",
        serde_json::json!({"shard_id": ".passmanager"}),
    ));
    set_bypass_system_shard_guards(false);
    if !resp.is_ok() {
        return None;
    }
    let root = resp.result()?.get("root")?.clone();
    root.get("id")
        .or_else(|| root.get("node_id"))
        .and_then(|v| v.as_u64())
        .filter(|&id| id != 0)
}

#[test]
fn test_rename_system_node_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let Some(nid) = get_system_shard_node_id(&mut router) else {
        return;
    };

    let resp = rename_node(&mut router, nid, "renamed");
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_delete_system_node_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let Some(nid) = get_system_shard_node_id(&mut router) else {
        return;
    };

    let resp = delete_node(&mut router, nid);
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_move_into_system_shard_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = create_dir(&mut router, "userdir");
    assert_rpc_ok(&resp);
    let uid = get_node_id(&resp);

    assert_rpc_error(
        &move_node(&mut router, uid, "/.passmanager"),
        "ACCESS_DENIED",
    );
    assert_rpc_error(&move_node(&mut router, uid, "/.wallet"), "ACCESS_DENIED");
}

#[test]
fn test_download_system_node_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let Some(nid) = get_system_shard_node_id(&mut router) else {
        return;
    };

    let resp = router.handle(&RpcRequest::new(
        "catalog:download",
        serde_json::json!({"node_id": nid}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_upload_system_node_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let Some(nid) = get_system_shard_node_id(&mut router) else {
        return;
    };

    let resp = router.handle(&RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": nid, "size": 5}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_secret_write_system_node_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let Some(nid) = get_system_shard_node_id(&mut router) else {
        return;
    };

    let resp = router.handle(&RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({"node_id": nid, "size": 5}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_secret_read_system_node_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let Some(nid) = get_system_shard_node_id(&mut router) else {
        return;
    };

    let resp = router.handle(&RpcRequest::new(
        "catalog:secret:read",
        serde_json::json!({"node_id": nid}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_secret_erase_system_node_denied() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let Some(nid) = get_system_shard_node_id(&mut router) else {
        return;
    };

    let resp = router.handle(&RpcRequest::new(
        "catalog:secret:erase",
        serde_json::json!({"node_id": nid}),
    ));
    assert_rpc_error(&resp, "ACCESS_DENIED");
}

#[test]
fn test_rename_user_node_allowed() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = create_dir(&mut router, "mydir");
    assert_rpc_ok(&resp);
    assert_rpc_ok(&rename_node(&mut router, get_node_id(&resp), "mydir2"));
}

#[test]
fn test_delete_user_node_allowed() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let resp = create_dir(&mut router, "toremove");
    assert_rpc_ok(&resp);
    assert_rpc_ok(&delete_node(&mut router, get_node_id(&resp)));
}

#[test]
fn test_move_user_node_allowed() {
    let (mut router, _td) = create_test_router();
    unlock_vault(&mut router, "pw");

    let r1 = create_dir(&mut router, "src");
    assert_rpc_ok(&r1);
    let r2 = create_dir(&mut router, "dst");
    assert_rpc_ok(&r2);

    assert_rpc_ok(&move_node(&mut router, get_node_id(&r1), "/dst"));
}
