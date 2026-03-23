mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use std::io::Read as _;
use test_helpers::*;

#[test]
fn test_root_file_overwrite_by_delete_and_rename_persists_across_restart() {
    let (mut router, temp_dir, ks) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let original = vec![0x11u8; (1024 * 1024) + 7];
    let replacement = vec![0x22u8; (2 * 1024 * 1024) + 3];

    let prepare = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "document.pdf",
            "size": original.len() as u64,
            "chunk_size": 1024 * 1024,
        }),
    ));
    assert_rpc_ok(&prepare);
    let doc_id = get_node_id(&prepare);

    let upload = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": doc_id, "size": original.len() as u64, "offset": 0}),
    );
    match router.handle_with_stream(&upload, Some(RpcInputStream::from_bytes(original))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    let prepare = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": ".temp_write",
            "size": replacement.len() as u64,
            "chunk_size": 1024 * 1024,
        }),
    ));
    assert_rpc_ok(&prepare);
    let tmp_id = get_node_id(&prepare);

    let upload = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": tmp_id, "size": replacement.len() as u64, "offset": 0}),
    );
    match router.handle_with_stream(
        &upload,
        Some(RpcInputStream::from_bytes(replacement.clone())),
    ) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

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
    };

    assert_eq!(downloaded, replacement);
}
