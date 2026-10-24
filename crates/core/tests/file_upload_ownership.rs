mod test_helpers;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::{json, Value};
use std::io::Read;
use test_helpers::*;

fn download_file(router: &mut chromvoid_core::rpc::RpcRouter, node_id: u64) -> Vec<u8> {
    match router.handle_with_stream(
        &RpcRequest::new("catalog:download", json!({"node_id":node_id})),
        None,
    ) {
        RpcReply::Stream(mut stream) => {
            let mut bytes = Vec::new();
            stream.reader.read_to_end(&mut bytes).unwrap();
            bytes
        }
        _ => panic!("Expected file stream"),
    }
}

fn part(router: &mut chromvoid_core::rpc::RpcRouter, mut data: Value, bytes: &[u8]) -> RpcResponse {
    data["size"] = json!(bytes.len());
    match router.handle_with_stream(
        &RpcRequest::new("catalog:upload", data),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    ) {
        RpcReply::Json(response) => response,
        _ => panic!("Upload must return metadata"),
    }
}

#[test]
fn create_only_preserves_existing_bytes_by_path_and_id_and_legacy_overwrite_still_works() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "synthetic upload");
    let node = upload_file(
        &mut router,
        Some("/"),
        "existing.txt",
        b"original".to_vec(),
        None,
    );
    for target in [
        json!({"name":"existing.txt", "create_only":true}),
        json!({"node_id":node,"create_only":true}),
    ] {
        assert_rpc_error(&part(&mut router, target, b"bad"), "NAME_EXIST");
        assert_eq!(download_file(&mut router, node), b"original");
    }
    let overwritten = part(
        &mut router,
        json!({"name":"existing.txt","total_size":3}),
        b"new",
    );
    assert_rpc_ok(&overwritten);
    assert_eq!(get_node_id(&overwritten), node);
    assert_eq!(download_file(&mut router, node), b"new");
}

#[test]
fn guarded_abort_and_invalid_options_cannot_cancel_or_replace_another_upload() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "synthetic upload");
    let opened = part(
        &mut router,
        json!({"name":"staged.txt","create_only":true}),
        b"ab",
    );
    assert_rpc_ok(&opened);
    assert_eq!(opened.result().unwrap()["completed"], false);
    let node = get_node_id(&opened);
    for (value, code) in [
        (json!(node + 1), "NODE_NOT_FOUND"),
        (json!("bad"), "EMPTY_PAYLOAD"),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                "catalog:upload:abort",
                json!({"node_id":value}),
            )),
            code,
        );
    }
    assert_rpc_error(
        &part(
            &mut router,
            json!({"node_id":node,"offset":2,"create_only":"true"}),
            b"x",
        ),
        "EMPTY_PAYLOAD",
    );
    let finished = part(
        &mut router,
        json!({"node_id":node,"offset":2,"finish":true,"create_only":true}),
        b"cd",
    );
    assert_rpc_ok(&finished);
    assert_eq!(download_file(&mut router, node), b"abcd");
    let staged = part(
        &mut router,
        json!({"name":"canceled.txt","create_only":true}),
        b"cancel",
    );
    assert_rpc_ok(&staged);
    let canceled = router.handle(&RpcRequest::new(
        "catalog:upload:abort",
        json!({"node_id":get_node_id(&staged)}),
    ));
    assert_rpc_ok(&canceled);
    assert_eq!(canceled.result().unwrap()["aborted"], true);
    let fresh = part(
        &mut router,
        json!({"name":"canceled.txt","create_only":true,"finish":true}),
        b"fresh",
    );
    assert_rpc_ok(&fresh);
    assert_eq!(download_file(&mut router, get_node_id(&fresh)), b"fresh");
}

#[test]
fn a_name_created_during_staging_is_not_overwritten_at_finish() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "synthetic upload");
    let staged = part(
        &mut router,
        json!({"name":"collision","create_only":true}),
        b"pending",
    );
    assert_rpc_ok(&staged);
    let folder = create_dir(&mut router, "collision");
    assert_rpc_ok(&folder);
    let finished = part(
        &mut router,
        json!({"node_id":get_node_id(&staged),"offset":7,"finish":true,"create_only":true}),
        &[],
    );
    assert_rpc_error(&finished, "NAME_EXIST");
    assert_rpc_ok(&list_dir(&mut router, "/collision"));
    let fresh = part(
        &mut router,
        json!({"name":"separate","create_only":true,"finish":true}),
        b"ok",
    );
    assert_rpc_ok(&fresh);
}

#[test]
fn upload_names_cannot_address_protected_paths_from_the_root() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "synthetic upload");
    for create_only in [false, true] {
        for name in [".passmanager", ".wallet/key", ".passkeys/key"] {
            assert_rpc_error(
                &part(
                    &mut router,
                    json!({"parent_path":"/","name":name,"finish":true,"create_only":create_only}),
                    b"denied",
                ),
                "ACCESS_DENIED",
            );
        }
    }
    assert_rpc_ok(&part(
        &mut router,
        json!({"name":"ordinary.txt","finish":true,"create_only":true}),
        b"allowed",
    ));
}

#[test]
fn reopening_core_discards_unfinished_upload_without_changing_committed_files() {
    use chromvoid_core::rpc::RpcRouter;
    use chromvoid_core::storage::Storage;
    let (mut router, root, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic recovery"));
    let stable = upload_file(
        &mut router,
        Some("/"),
        "stable.txt",
        b"committed".to_vec(),
        None,
    );
    let staged = part(
        &mut router,
        json!({"name":"interrupted.txt","create_only":true}),
        b"partial",
    );
    assert_rpc_ok(&staged);
    assert_eq!(staged.result().unwrap()["completed"], false);
    drop(router); // No finish or abort: only the existing durable marker survives.
    let mut reopened = RpcRouter::new(Storage::new(root.path()).unwrap()).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "synthetic recovery"));
    assert_eq!(download_file(&mut reopened, stable), b"committed");
    let items = get_items(&list_dir(&mut reopened, "/"));
    assert!(find_item_by_name(&items, "interrupted.txt").is_none());
    let fresh = part(
        &mut reopened,
        json!({"name":"interrupted.txt","create_only":true,"finish":true}),
        b"fresh",
    );
    assert_rpc_ok(&fresh);
    assert_eq!(download_file(&mut reopened, get_node_id(&fresh)), b"fresh");
}
