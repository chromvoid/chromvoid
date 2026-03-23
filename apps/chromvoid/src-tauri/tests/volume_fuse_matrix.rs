#![cfg(any(target_os = "linux", target_os = "macos"))]

//! OS-level integration tests for FUSE volume backend.
//!
//! These tests mount the real FUSE filesystem and perform normal `std::fs`
//! operations against the mountpoint, verifying persistence via core RPC.
//!
//! Ignored by default because it requires:
//! - Linux: `/dev/fuse` + a functional fusermount setup
//! - macOS: macFUSE installed

mod common;

use common::{
    catalog_download, catalog_find_child, catalog_list, deterministic_bytes, sha256_hex, TestVault,
};
use std::io::Write as _;
use std::path::Path;
use std::time::Duration;
use tempfile::tempdir;

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
async fn fuse_rw_matrix() {
    if !common::require_fuse_driver("fuse_rw_matrix") {
        return;
    }
    let _guard = common::acquire_fuse_test_guard("fuse_rw_matrix");

    let vault = TestVault::new_unlocked();

    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging_dir = dir.path().join("staging");

    fn read_exact_at(path: &Path, offset: u64, len: usize) -> Vec<u8> {
        use std::io::{Read, Seek, SeekFrom};
        let mut f = std::fs::File::open(path).expect("open for random read");
        f.seek(SeekFrom::Start(offset)).expect("seek");
        let mut buf = vec![0u8; len];
        f.read_exact(&mut buf).expect("read_exact");
        buf
    }

    // --- Mount #1: write & verify ---
    let fuse = start_fuse_or_skip!(
        "fuse_rw_matrix",
        mountpoint.clone(),
        staging_dir.clone(),
        vault.adapter.clone(),
        "start_fuse_server (mount #1)"
    );

    // Give the kernel a moment to finalize the mount.
    tokio::time::sleep(Duration::from_millis(250)).await;

    // --- Direct filesystem operations (through FUSE mount) ---
    let docs = mountpoint.join("docs");
    std::fs::create_dir(&docs).expect("mkdir docs");

    let sub = docs.join("sub");
    std::fs::create_dir(&sub).expect("mkdir docs/sub");

    // 1) small file create + read
    let small = sub.join("hello.txt");
    std::fs::write(&small, b"hello fuse").expect("write hello.txt");
    assert_eq!(
        std::fs::read(&small).expect("read hello.txt"),
        b"hello fuse"
    );

    // 2) append
    {
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&small)
            .expect("open append");
        f.write_all(b" + append").expect("append write");
    }
    assert_eq!(
        std::fs::read(&small).expect("read after append"),
        b"hello fuse + append"
    );

    // 3) atomic-save style replace: write tmp + rename over existing
    let tmp = sub.join(".tmp");
    std::fs::write(&tmp, b"atomic").expect("write .tmp");
    std::fs::rename(&tmp, &small).expect("rename .tmp -> hello.txt (replace)");
    assert_eq!(
        std::fs::read(&small).expect("read after replace"),
        b"atomic"
    );

    // 4) size matrix around the 8MB upload chunk boundary.
    // Store expected hashes to verify via core (after unmount) and after re-mount.
    let mut expected: Vec<(String, String)> = Vec::new();
    let size_cases: Vec<(String, u64, usize)> = vec![
        ("s0".to_string(), 0x100, 0),
        ("s1".to_string(), 0x101, 1),
        ("s4k".to_string(), 0x102, 4 * 1024),
        ("s64k".to_string(), 0x103, 64 * 1024),
        ("s1m".to_string(), 0x104, 1 * 1024 * 1024),
        ("s8m-1".to_string(), 0x105, (8 * 1024 * 1024) - 1),
        ("s8m".to_string(), 0x106, 8 * 1024 * 1024),
        ("s8m+1".to_string(), 0x107, (8 * 1024 * 1024) + 1),
        ("s16m+123".to_string(), 0x108, (16 * 1024 * 1024) + 123),
    ];

    for (tag, seed, size) in &size_cases {
        let name = format!("size-{tag}.bin");
        let fs_path = sub.join(&name);
        let data = deterministic_bytes(*seed, *size);
        let hash = sha256_hex(&data);

        std::fs::write(&fs_path, &data).unwrap_or_else(|_| panic!("write {name}"));
        let got = std::fs::read(&fs_path).unwrap_or_else(|_| panic!("read {name}"));
        assert_eq!(sha256_hex(&got), hash, "roundtrip hash mismatch for {name}");

        expected.push((format!("/docs/sub/{name}"), hash));
    }

    // 4b) random-access patch write + truncate (exercises write offsets + setattr)
    let patch_path = sub.join("patch.bin");
    let mut patch = deterministic_bytes(0xDEAD_BEEF, 64 * 1024);
    std::fs::write(&patch_path, &patch).expect("write patch.bin");
    {
        use std::io::{Seek, SeekFrom, Write};
        let mut f = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&patch_path)
            .expect("open patch.bin rw");
        f.seek(SeekFrom::Start(123)).expect("seek");
        f.write_all(b"PATCH").expect("patch write");
    }
    patch[123..128].copy_from_slice(b"PATCH");
    assert_eq!(
        sha256_hex(&std::fs::read(&patch_path).expect("read patched")),
        sha256_hex(&patch)
    );

    {
        let f = std::fs::OpenOptions::new()
            .write(true)
            .open(&patch_path)
            .expect("open for truncate");
        f.set_len(128).expect("set_len");
    }
    patch.truncate(128);
    assert_eq!(std::fs::read(&patch_path).expect("read truncated"), patch);

    // 5) overwrite + rename/move on one of the big files.
    let big_path = sub.join("size-s8m+1.bin");
    let overwrite = b"short".to_vec();
    std::fs::write(&big_path, &overwrite).expect("overwrite size-s8m+1.bin with short");
    assert_eq!(
        std::fs::read(&big_path).expect("read overwritten"),
        overwrite
    );

    // 6) rename + move
    let moved = docs.join("moved.bin");
    std::fs::rename(&big_path, &moved).expect("rename/move big.bin -> moved.bin");
    assert_eq!(std::fs::read(&moved).expect("read moved.bin"), b"short");

    // Adjust expected list: we moved + changed this file.
    expected.retain(|(p, _)| p != "/docs/sub/size-s8m+1.bin");
    expected.push(("/docs/moved.bin".to_string(), sha256_hex(&overwrite)));
    assert!(!big_path.exists(), "old path should not exist after rename");

    // 6b) random-access reads on a mid-size file to exercise non-monotonic offsets.
    let mid_path = sub.join("size-s1m.bin");
    let mid_expected = deterministic_bytes(0x104, 1 * 1024 * 1024);
    assert_eq!(
        read_exact_at(&mid_path, 0, 32),
        mid_expected[0..32],
        "random read start"
    );
    assert_eq!(
        read_exact_at(&mid_path, 1234, 64),
        mid_expected[1234..(1234 + 64)],
        "random read mid"
    );
    assert_eq!(
        read_exact_at(&mid_path, (mid_expected.len() - 97) as u64, 97),
        mid_expected[(mid_expected.len() - 97)..],
        "random read tail"
    );
    // Backwards seek should still work (forces internal stream reset in read-only path).
    assert_eq!(
        read_exact_at(&mid_path, 16, 16),
        mid_expected[16..32],
        "random read backwards"
    );

    // 6c) sparse write beyond EOF (creates a hole of zeros).
    let sparse_path = sub.join("sparse.bin");
    std::fs::write(&sparse_path, b"START").expect("write sparse START");
    {
        use std::io::{Seek, SeekFrom, Write};
        let mut f = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&sparse_path)
            .expect("open sparse rw");
        f.seek(SeekFrom::Start((1 * 1024 * 1024) + 7))
            .expect("seek sparse");
        f.write_all(b"END").expect("write sparse END");
        f.sync_all().expect("sync_all sparse");
    }
    let sparse = std::fs::read(&sparse_path).expect("read sparse");
    assert_eq!(&sparse[0..5], b"START");
    assert_eq!(
        &sparse[(1 * 1024 * 1024) + 7..(1 * 1024 * 1024) + 10],
        b"END"
    );
    assert!(
        sparse[5..(1 * 1024 * 1024) + 7].iter().all(|b| *b == 0),
        "sparse hole must be zero-filled"
    );
    expected.push(("/docs/sub/sparse.bin".to_string(), sha256_hex(&sparse)));

    // 7) keep /docs (and moved.bin) for persistence checks.
    std::fs::remove_file(&patch_path).expect("remove patch.bin");
    std::fs::remove_file(&small).expect("remove hello.txt");

    // Unmount.
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    // --- Verify persistence / catalog state ---
    vault.restart_core_unlocked();

    // The old path must not exist after rename.
    assert!(
        catalog_find_child(&vault.adapter, Some("/docs/sub"), "size-s8m+1.bin").is_none(),
        "catalog still contains old path /docs/sub/size-s8m+1.bin"
    );

    for (path, expected_hash) in &expected {
        let (parent, name) = match path.rsplit_once('/') {
            Some((p, n)) if !p.is_empty() => (p.to_string(), n.to_string()),
            _ => panic!("bad test path: {path}"),
        };
        let parent = if parent.is_empty() {
            "/".to_string()
        } else {
            parent
        };
        let node_id = catalog_find_child(&vault.adapter, Some(&parent), &name)
            .unwrap_or_else(|| panic!("catalog missing {path}"));
        let downloaded = catalog_download(&vault.adapter, node_id);
        assert_eq!(
            sha256_hex(&downloaded),
            *expected_hash,
            "core download mismatch for {path}"
        );
    }

    // --- Mount #2: verify old files readable via FUSE ---
    let fuse = start_fuse_or_skip!(
        "fuse_rw_matrix",
        mountpoint.clone(),
        staging_dir,
        vault.adapter.clone(),
        "start_fuse_server (mount #2)"
    );
    tokio::time::sleep(Duration::from_millis(250)).await;

    let moved_old = mountpoint.join("docs/moved.bin");
    {
        // Diagnostics for the "empty read after remount" bug.
        // On macOS/macFUSE, if kernel sees st_size==0 it may return EOF without calling read().
        let exists = moved_old.exists();
        let meta = std::fs::metadata(&moved_old).expect("stat moved.bin after remount");

        println!(
            "DEBUG moved.bin after remount: exists={exists} is_file={} len={} ",
            meta.is_file(),
            meta.len()
        );
        if let Ok(entries) = std::fs::read_dir(mountpoint.join("docs")) {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            names.sort();
            println!("DEBUG /docs entries after remount: {names:?}");
        }

        let docs_list = catalog_list(&vault.adapter, Some("/docs"));
        let moved_item = docs_list.items.iter().find(|it| it.name == "moved.bin");
        println!("DEBUG core catalog:list /docs moved.bin: {moved_item:?}");
    }

    let got_moved = std::fs::read(&moved_old).expect("read moved.bin after remount");
    println!(
        "DEBUG moved.bin read bytes: len={} bytes={got_moved:?}",
        got_moved.len()
    );
    assert_eq!(got_moved, b"short");

    // Read back the largest file to catch "old files half not readable" issues.
    let big_old = mountpoint.join("docs/sub/size-s16m+123.bin");
    let big_seed = 0x108;
    let big_expected = deterministic_bytes(big_seed, (16 * 1024 * 1024) + 123);
    let big_hash = sha256_hex(&big_expected);
    let got = std::fs::read(&big_old).expect("read old big file after remount");
    assert_eq!(
        sha256_hex(&got),
        big_hash,
        "remount read mismatch for big file"
    );

    // Cleanup: delete /docs from the mounted filesystem.
    let docs = mountpoint.join("docs");
    let sub = docs.join("sub");
    for (tag, _seed, _size) in &size_cases {
        let name = format!("size-{tag}.bin");
        let _ = std::fs::remove_file(sub.join(name));
    }
    let _ = std::fs::remove_file(docs.join("moved.bin"));
    let _ = std::fs::remove_file(sub.join("sparse.bin"));
    let _ = std::fs::remove_dir(&sub);
    let _ = std::fs::remove_dir(&docs);

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #2)");

    let root_docs = catalog_find_child(&vault.adapter, None, "docs");
    assert!(root_docs.is_none(), "docs directory should be deleted");

    // Re-create /docs and a large file to validate core download path too.
    // (Second mount not needed; use RPC directly through core.)
    {
        use chromvoid_core::rpc::types::{PrepareUploadResponse, RpcRequest, RpcResponse};
        use chromvoid_core::rpc::RpcInputStream;
        use chromvoid_core::rpc::RpcReply;
        use serde_json::json;

        let big2 = deterministic_bytes(0xBADC0DE, 2 * 1024 * 1024);
        let big2_hash = sha256_hex(&big2);

        let mut a = vault.adapter.lock().expect("adapter lock");

        let mk = a.handle(&RpcRequest::new(
            "catalog:createDir".to_string(),
            json!({"name": "docs", "parent_path": null}),
        ));
        match mk {
            RpcResponse::Success { .. } => {}
            other => panic!("catalog:createDir failed: {other:?}"),
        }

        let prep = a.handle(&RpcRequest::new(
            "catalog:prepareUpload".to_string(),
            json!({"parent_path": "/docs", "name": "big2.bin", "size": big2.len() as u64, "mime_type": null, "chunk_size": null}),
        ));
        let RpcResponse::Success { result, .. } = prep else {
            panic!("prepareUpload failed: {prep:?}");
        };
        let prep: PrepareUploadResponse =
            serde_json::from_value(result).expect("parse PrepareUploadResponse");
        let up = a.handle_with_stream(
            &RpcRequest::new(
                "catalog:upload".to_string(),
                json!({"node_id": prep.node_id, "size": big2.len() as u64, "offset": 0}),
            ),
            Some(RpcInputStream::from_bytes(big2.clone())),
        );
        match up {
            RpcReply::Json(RpcResponse::Success { .. }) => {}
            RpcReply::Json(r) => panic!("upload failed: {r:?}"),
            RpcReply::Stream(_) => panic!("upload failed: unexpected stream reply"),
        }
        a.save().expect("save");

        drop(a);

        let node_id =
            catalog_find_child(&vault.adapter, Some("/docs"), "big2.bin").expect("big2.bin node");
        let downloaded = catalog_download(&vault.adapter, node_id);
        assert_eq!(sha256_hex(&downloaded), big2_hash);
    }
}
