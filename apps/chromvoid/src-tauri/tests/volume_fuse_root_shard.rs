#![cfg(any(target_os = "linux", target_os = "macos"))]

//! OS-level regression test for root-level files (shard roots).
//!
//! Consider a file created at the FUSE mount root (e.g. `/root.bin`).
//! In the sharded catalog model, root-level files are their own shards, and the
//! file node lives at `/` within that shard.
//!
//! Regression: if `catalog:prepareUpload` refreshed metadata for an existing
//! placeholder but failed to record a shard delta when `rel_path == "/"`, then
//! after a restart/unlock the reconstructed shard would keep the old size
//! (often 0), and macOS/macFUSE could treat the file as empty.

mod common;

use common::{catalog_download, catalog_find_child, deterministic_bytes, sha256_hex, TestVault};
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
async fn fuse_root_level_shard_persists() {
    if !common::require_fuse_driver("fuse_root_level_shard_persists") {
        return;
    }
    let _guard = common::acquire_fuse_test_guard("fuse_root_level_shard_persists");

    let vault = TestVault::new_unlocked();

    let dir = tempdir().expect("tempdir");
    let mountpoint1 = dir.path().join("mnt1");
    let mountpoint2 = dir.path().join("mnt2");
    let staging_dir = dir.path().join("staging");

    let filename = "root.bin";
    let data = deterministic_bytes(0xA11C_E, (2 * 1024 * 1024) + 7);
    let hash = sha256_hex(&data);

    // --- Mount #1: create placeholder (0 bytes) then overwrite with data ---
    let fuse = start_fuse_or_skip!(
        "fuse_root_level_shard_persists",
        mountpoint1.clone(),
        staging_dir.clone(),
        vault.adapter.clone(),
        "start_fuse_server (mount #1)"
    );
    tokio::time::sleep(Duration::from_millis(250)).await;

    let root_path = mountpoint1.join(filename);

    // Create an explicit 0-byte placeholder first.
    std::fs::File::create(&root_path).expect("create root placeholder");
    let meta0 = std::fs::metadata(&root_path).expect("stat placeholder");
    assert_eq!(meta0.len(), 0, "placeholder must be 0 bytes");

    // Overwrite with non-zero data.
    std::fs::write(&root_path, &data).expect("write root.bin");
    let f = std::fs::OpenOptions::new()
        .read(true)
        .open(&root_path)
        .expect("open root.bin for sync");
    f.sync_all().expect("sync_all root.bin");

    let got = std::fs::read(&root_path).expect("read root.bin");
    assert_eq!(sha256_hex(&got), hash, "mount #1 read mismatch");

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #1)");

    // --- Simulate restart/unlock and verify via core ---
    vault.restart_core_unlocked();

    let node_id =
        catalog_find_child(&vault.adapter, None, filename).expect("catalog contains root.bin");
    let downloaded = catalog_download(&vault.adapter, node_id);
    assert_eq!(
        sha256_hex(&downloaded),
        hash,
        "core download mismatch after restart"
    );

    // --- Mount #2: verify kernel-visible size + reads after restart ---
    let fuse = start_fuse_or_skip!(
        "fuse_root_level_shard_persists",
        mountpoint2.clone(),
        staging_dir,
        vault.adapter.clone(),
        "start_fuse_server (mount #2)"
    );
    tokio::time::sleep(Duration::from_millis(250)).await;

    let root_path = mountpoint2.join(filename);

    let meta = std::fs::metadata(&root_path).expect("stat root.bin after remount");
    assert_eq!(
        meta.len(),
        data.len() as u64,
        "st_size must match after remount (prevents macOS empty reads)"
    );

    let got2 = std::fs::read(&root_path).expect("read root.bin after remount");
    assert_eq!(sha256_hex(&got2), hash, "mount #2 read mismatch");

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #2)");
}
