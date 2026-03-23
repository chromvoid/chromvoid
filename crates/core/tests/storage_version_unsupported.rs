mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

#[test]
fn test_unlock_rejects_v1_storage_format() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();

    let _storage = Storage::new(storage_path).expect("storage");

    // Force format.version to v1 to simulate legacy storage.
    let format_path = storage_path.join("format.version");
    let bytes = std::fs::read(&format_path).expect("read format.version");
    let mut v: serde_json::Value = serde_json::from_slice(&bytes).expect("format.version json");
    if let Some(obj) = v.as_object_mut() {
        obj.insert("v".to_string(), serde_json::json!(1));
        obj.remove("kdf");
        obj.remove("pepper");
    }
    let out = serde_json::to_vec(&v).expect("serialize format.version");
    std::fs::write(&format_path, out).expect("write format.version");

    let storage = Storage::new(storage_path).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage).with_keystore(keystore);

    let response = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test_password"}),
    ));
    assert_rpc_error(&response, "STORAGE_VERSION_NOT_SUPPORTED");
}
