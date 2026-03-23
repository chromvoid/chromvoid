#![cfg(any(target_os = "linux", target_os = "macos"))]

//! OS-level integration test for FUSE read-write.
//!
//! This mounts the real FUSE filesystem and performs normal `std::fs` operations
//! against the mountpoint, then verifies persistence via core RPC (`catalog:list` +
//! `catalog:download`).
//!
//! Ignored by default because it requires:
//! - Linux: `/dev/fuse` + a functional fusermount setup
//! - macOS: macFUSE installed

mod common;

use chromvoid_core::rpc::types::{CatalogListResponse, RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
use serde_json::json;
use std::io::Read as _;
use std::sync::{Arc, Mutex};
use tempfile::tempdir;

use chromvoid_lib::{CoreAdapter, LocalCoreAdapter};

macro_rules! start_fuse_or_skip {
    ($test_name:expr, $mountpoint:expr, $staging_dir:expr, $adapter:expr, $context:expr) => {{
        match chromvoid_lib::start_fuse_server($mountpoint, $staging_dir, $adapter).await {
            Ok(fuse) => fuse,
            Err(err) => {
                if common::skip_fuse_mount_error($test_name, &err) {
                    return;
                }
                panic!("{}: {}", $context, err);
            }
        }
    }};
}

#[tokio::test]
async fn fuse_rw_roundtrip_mount_smoke() {
    if !common::require_fuse_driver("fuse_rw_roundtrip_mount_smoke") {
        return;
    }
    let _guard = common::acquire_fuse_test_guard("fuse_rw_roundtrip_mount_smoke");

    let dir = tempdir().expect("tempdir");
    let storage_root = dir.path().join("storage");
    let mountpoint = dir.path().join("mnt");
    let staging_dir = dir.path().join("staging");

    let mut adapter = LocalCoreAdapter::new(storage_root).expect("LocalCoreAdapter::new");
    adapter.set_master_key(Some("test-master-key".to_string()));

    // Unlock vault.
    let unlock = RpcRequest::new("vault:unlock".to_string(), json!({"password": "test"}));
    match adapter.handle(&unlock) {
        RpcResponse::Success { .. } => {}
        other => panic!("vault:unlock failed in test setup: {other:?}"),
    }

    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> = Arc::new(Mutex::new(Box::new(adapter)));

    let fuse = start_fuse_or_skip!(
        "fuse_rw_roundtrip_mount_smoke",
        mountpoint.clone(),
        staging_dir,
        adapter.clone(),
        "start_fuse_server"
    );

    // Give the kernel a moment to finalize the mount.
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;

    let docs = mountpoint.join("docs");
    std::fs::create_dir(&docs).expect("mkdir docs");

    let file = docs.join("hello.txt");
    std::fs::write(&file, b"hello fuse").expect("write hello.txt");
    let got = std::fs::read(&file).expect("read hello.txt");
    assert_eq!(got, b"hello fuse");

    let renamed = docs.join("renamed.txt");
    std::fs::rename(&file, &renamed).expect("rename hello.txt -> renamed.txt");

    // Atomic-save style: write temp + rename over existing
    let tmp = docs.join(".tmp");
    std::fs::write(&tmp, b"atomic").expect("write .tmp");
    std::fs::rename(&tmp, &renamed).expect("rename .tmp -> renamed.txt (replace)");
    let got2 = std::fs::read(&renamed).expect("read renamed.txt");
    assert_eq!(got2, b"atomic");

    // Unmount.
    tokio::time::timeout(std::time::Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    // Verify persistence via core catalog directly.
    let (docs_id, file_id) = {
        let mut a = adapter.lock().expect("adapter lock");
        let root = a.handle(&RpcRequest::new(
            "catalog:list".to_string(),
            json!({"path": serde_json::Value::Null, "include_hidden": null}),
        ));
        let RpcResponse::Success { result, .. } = root else {
            panic!("catalog:list root failed: {root:?}");
        };
        let root_list: CatalogListResponse =
            serde_json::from_value(result).expect("parse root list");
        let docs_item = root_list
            .items
            .iter()
            .find(|it| it.name == "docs")
            .expect("docs dir exists in catalog");
        let docs_id = docs_item.node_id;

        let docs_list = a.handle(&RpcRequest::new(
            "catalog:list".to_string(),
            json!({"path": "/docs", "include_hidden": null}),
        ));
        let RpcResponse::Success { result, .. } = docs_list else {
            panic!("catalog:list /docs failed: {docs_list:?}");
        };
        let docs_list: CatalogListResponse =
            serde_json::from_value(result).expect("parse docs list");
        let file_item = docs_list
            .items
            .iter()
            .find(|it| it.name == "renamed.txt")
            .expect("renamed.txt exists in catalog");
        (docs_id, file_item.node_id)
    };

    assert!(docs_id > 0);
    assert!(file_id > 0);

    let downloaded = {
        let mut a = adapter.lock().expect("adapter lock");
        let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": file_id}));
        match a.handle_with_stream(&req, None) {
            RpcReply::Stream(mut out) => {
                let mut buf = Vec::new();
                out.reader
                    .read_to_end(&mut buf)
                    .expect("read download stream");
                buf
            }
            RpcReply::Json(r) => {
                panic!("expected stream reply for catalog:download, got JSON: {r:?}")
            }
        }
    };

    assert_eq!(downloaded, b"atomic");
}
