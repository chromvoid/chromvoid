mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::keystore::Keystore;
use chromvoid_core::crypto::{blob_chunk_name, derive_vault_key_v2};
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn set_storage_format_v2(base_path: &Path) {
    let format_path = base_path.join("format.version");
    let bytes = fs::read(&format_path).expect("read format.version");
    let mut v: serde_json::Value = serde_json::from_slice(&bytes).expect("format.version JSON");
    if let Some(obj) = v.as_object_mut() {
        obj.insert("v".to_string(), serde_json::json!(2));
        obj.insert("kdf".to_string(), serde_json::json!(2));
        obj.insert("pepper".to_string(), serde_json::json!(true));
    }
    let out = serde_json::to_vec(&v).expect("serialize format.version");
    fs::write(&format_path, out).expect("write format.version");
}

#[test]
fn test_v2_upload_download_uses_blob_chunk_naming() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");

    // Enable v2 mode before first unlock.
    set_storage_format_v2(temp_dir.path());

    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

    let password = "vault_password";
    assert_rpc_ok(&unlock_vault(&mut router, password));

    let bytes = b"hello blob naming".to_vec();
    let prepare = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "blob.txt",
            "size": bytes.len() as u64,
            "chunk_size": 4,
        }),
    ));
    assert_rpc_ok(&prepare);
    let node_id = get_node_id(&prepare);

    let upload_req = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": node_id, "size": bytes.len() as u64, "offset": 0}),
    );
    match router.handle_with_stream(&upload_req, Some(RpcInputStream::from_bytes(bytes.clone()))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON"),
    }

    // Verify the first blob chunk name exists.
    let salt_bytes = fs::read(temp_dir.path().join("salt")).expect("read salt");
    let vault_salt: [u8; 16] = salt_bytes
        .as_slice()
        .try_into()
        .expect("salt must be 16 bytes");
    let pepper = keystore
        .load_storage_pepper()
        .expect("load pepper")
        .expect("pepper must exist");
    let vault_key = derive_vault_key_v2(password, &vault_salt, &pepper).expect("derive v2 key");

    let chunk0 = blob_chunk_name(
        &*vault_key,
        u32::try_from(node_id).expect("node_id fits u32"),
        0,
    );
    let storage2 = Storage::new(temp_dir.path()).expect("storage");
    assert!(storage2.chunk_exists(&chunk0).expect("chunk_exists"));

    // Roundtrip download.
    let download_req = RpcRequest::new("catalog:download", serde_json::json!({"node_id": node_id}));
    match router.handle_with_stream(&download_req, None) {
        RpcReply::Stream(mut out) => {
            let mut downloaded = Vec::new();
            use std::io::Read;
            out.reader
                .read_to_end(&mut downloaded)
                .expect("read stream");
            assert_eq!(downloaded, bytes);
        }
        RpcReply::Json(r) => panic!("expected stream, got JSON: {r:?}"),
    }
}
