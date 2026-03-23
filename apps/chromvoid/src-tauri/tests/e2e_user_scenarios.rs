#![cfg(any(target_os = "linux", target_os = "macos"))]

//! Full end-to-end user scenario tests.
//!
//! These tests simulate complete user workflows:
//! 1. Create vault (master setup)
//! 2. Unlock vault
//! 3. Mount via macFUSE
//! 4. Upload files via FUSE
//! 5. Rename/move files
//! 6. Delete files
//! 7. Download files
//! 8. Verify hash integrity
//!
//!
//! Tests self-skip at runtime if no working FUSE driver is available.

mod common;

use base64::{engine::general_purpose, Engine as _};
use chromvoid_lib::{detect_fuse_driver, FuseDriverStatus};
use common::{catalog_download, catalog_find_child, sha256_hex, TestVault};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::Barrier;
use std::time::{Duration, Instant};
use std::{
    sync::{Arc, Once},
    thread,
};
use tempfile::tempdir;

fn require_fuse_or_skip(test_name: &str) -> bool {
    match detect_fuse_driver() {
        FuseDriverStatus::Available => true,
        other => {
            eprintln!("SKIP {test_name}: FUSE driver not available ({other:?})");
            false
        }
    }
}

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

macro_rules! lock_fuse_test {
    ($test_name:expr) => {
        let _guard = common::acquire_fuse_test_guard($test_name);
    };
}

fn init_test_tracing() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let filter = tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
        let _ = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_test_writer()
            .try_init();
    });
}

macro_rules! log_phase {
    ($phase:expr) => {
        println!("\n[{}] {}", humantime(), $phase);
    };
}

macro_rules! log_step {
    ($msg:expr) => {
        println!("  [{}] {}", humantime(), $msg);
    };
    ($fmt:expr, $($arg:tt)*) => {
        println!("  [{}] {}", humantime(), format!($fmt, $($arg)*));
    };
}

fn humantime() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        (now.as_secs() / 3600) % 24,
        (now.as_secs() / 60) % 60,
        now.as_secs() % 60,
        now.subsec_millis()
    )
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.2} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

fn format_duration(duration: Duration) -> String {
    if duration.as_secs() > 60 {
        format!("{}m {}s", duration.as_secs() / 60, duration.as_secs() % 60)
    } else if duration.as_millis() > 1000 {
        format!("{:.2}s", duration.as_secs_f64())
    } else {
        format!("{}ms", duration.as_millis())
    }
}

fn dir_contains_name(dir: &Path, name: &str) -> std::io::Result<bool> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_name() == OsStr::new(name) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn wait_until_dir_absent(dir: &Path, name: &str, timeout: Duration) -> std::io::Result<bool> {
    let deadline = Instant::now() + timeout;
    loop {
        if !dir_contains_name(dir, name)? {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Ok(false);
        }
        thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(target_os = "macos")]
fn finder_list_names(mountpoint: &Path) -> Result<Vec<String>, String> {
    let out = common::finder_list_items(mountpoint);
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        if common::finder_automation_unavailable(&stderr) {
            return Err(format!(
                "SKIP Finder automation unavailable: {}",
                common::finder_output_detail(&out)
            ));
        }
        return Err(format!(
            "Finder list failed: {}",
            common::finder_output_detail(&out)
        ));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut names = Vec::new();
    for line in stdout.lines() {
        let item = line.trim();
        if !item.is_empty() {
            names.push(item.to_string());
        }
    }
    Ok(names)
}

#[cfg(target_os = "macos")]
fn finder_delete_with_skip(path: &Path) -> Result<(), String> {
    let out = common::finder_delete_file(path);
    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if common::finder_automation_unavailable(&stderr) {
        return Err(format!(
            "SKIP Finder automation unavailable: {}",
            common::finder_output_detail(&out)
        ));
    }
    Err(format!(
        "Finder delete failed: {}",
        common::finder_output_detail(&out)
    ))
}

#[cfg(target_os = "macos")]
fn assert_no_host_trash_leakage(filename: &str) {
    for candidate in common::host_trash_candidates(filename) {
        assert!(
            !candidate.exists(),
            "delete leaked to host trash path: {}",
            candidate.display()
        );
    }
}

/// Comprehensive user workflow: create, upload, rename, delete, verify persistence
#[tokio::test]
async fn e2e_user_full_workflow() {
    if !require_fuse_or_skip("e2e_user_full_workflow") {
        return;
    }
    lock_fuse_test!("e2e_user_full_workflow");
    let test_start = Instant::now();
    log_phase!("START: e2e_user_full_workflow");

    match detect_fuse_driver() {
        FuseDriverStatus::Available => {}
        FuseDriverStatus::Missing => {
            panic!("FUSE driver is missing. Install macFUSE (macOS) or ensure /dev/fuse exists (Linux).");
        }
        FuseDriverStatus::Unsupported => {
            panic!("FUSE is unsupported on this platform.");
        }
    }

    log_step!("Creating test vault and mounting FUSE...");
    let setup_start = Instant::now();
    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging_dir = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_user_full_workflow",
        mountpoint.clone(),
        staging_dir,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;
    log_step!(
        "FUSE mounted in {} (mountpoint: {:?})",
        format_duration(setup_start.elapsed()),
        mountpoint
    );

    log_phase!("PHASE 1: Upload files to root");
    let phase1_start = Instant::now();

    let root_file1_data = generate_test_data(1024 * 1024, 0x1111_1111);
    let root_file1_hash = sha256_hex(&root_file1_data);
    let root_file1_path = mountpoint.join("document.pdf");

    log_step!(
        "Writing document.pdf ({} bytes)...",
        format_bytes(root_file1_data.len() as u64)
    );
    let write_start = Instant::now();
    std::fs::write(&root_file1_path, &root_file1_data).expect("write root file");
    log_step!(
        "Write completed in {}",
        format_duration(write_start.elapsed())
    );

    log_step!("Reading back document.pdf for verification...");
    let read_start = Instant::now();
    let read_back = std::fs::read(&root_file1_path).expect("read root file back");
    log_step!(
        "Read completed in {}",
        format_duration(read_start.elapsed())
    );

    assert_eq!(
        sha256_hex(&read_back),
        root_file1_hash,
        "root file read mismatch immediately after write"
    );
    log_step!(
        "✓ document.pdf uploaded and verified (hash matches) in {}",
        format_duration(phase1_start.elapsed())
    );

    log_phase!("PHASE 2: Create directory structure");
    let phase2_start = Instant::now();

    let docs_dir = mountpoint.join("Documents");
    std::fs::create_dir(&docs_dir).expect("create Documents dir");

    let nested_file_data = generate_test_data(5 * 1024 * 1024, 0x2222_2222);
    let nested_file_hash = sha256_hex(&nested_file_data);
    let nested_file_path = docs_dir.join("report.docx");

    log_step!(
        "Writing Documents/report.docx ({} bytes)...",
        format_bytes(nested_file_data.len() as u64)
    );
    let write_start = Instant::now();
    std::fs::write(&nested_file_path, &nested_file_data).expect("write nested file");
    log_step!(
        "Write completed in {}",
        format_duration(write_start.elapsed())
    );

    log_step!("Reading back report.docx for verification...");
    let read_start = Instant::now();
    let read_nested = std::fs::read(&nested_file_path).expect("read nested file");
    log_step!(
        "Read completed in {}",
        format_duration(read_start.elapsed())
    );

    assert_eq!(
        sha256_hex(&read_nested),
        nested_file_hash,
        "nested file hash mismatch"
    );
    log_step!(
        "✓ report.docx uploaded and verified in {}",
        format_duration(phase2_start.elapsed())
    );

    let file_to_delete_data = generate_test_data(3 * 1024 * 1024, 0x4444_4444);
    let file_to_delete_path = docs_dir.join("temp_large_file.bin");

    log_step!(
        "Writing temp_large_file.bin ({} bytes) - will be deleted later...",
        format_bytes(file_to_delete_data.len() as u64)
    );
    let write_start = Instant::now();
    std::fs::write(&file_to_delete_path, &file_to_delete_data).expect("write file to delete");
    log_step!(
        "Write completed in {}",
        format_duration(write_start.elapsed())
    );
    log_step!(
        "✓ Phase 2 completed in {}",
        format_duration(phase2_start.elapsed())
    );

    log_phase!("PHASE 3: Rename file within directory");
    let phase3_start = Instant::now();

    let renamed_path = docs_dir.join("annual_report_2024.docx");
    log_step!("Renaming report.docx -> annual_report_2024.docx...");
    std::fs::rename(&nested_file_path, &renamed_path).expect("rename file");

    assert!(
        !nested_file_path.exists(),
        "old path should not exist after rename"
    );
    let renamed_data = std::fs::read(&renamed_path).expect("read renamed file");
    assert_eq!(
        sha256_hex(&renamed_data),
        nested_file_hash,
        "renamed file hash mismatch"
    );
    log_step!(
        "✓ Rename completed and verified in {}",
        format_duration(phase3_start.elapsed())
    );

    log_phase!("PHASE 4: Move file to root");
    let phase4_start = Instant::now();

    let moved_to_root = mountpoint.join("moved_report.docx");
    log_step!("Moving annual_report_2024.docx -> /moved_report.docx...");
    std::fs::rename(&renamed_path, &moved_to_root).expect("move file to root");

    let moved_data = std::fs::read(&moved_to_root).expect("read moved file");
    assert_eq!(
        sha256_hex(&moved_data),
        nested_file_hash,
        "moved file hash mismatch"
    );
    log_step!(
        "✓ Move completed and verified in {}",
        format_duration(phase4_start.elapsed())
    );

    log_phase!("PHASE 5: Overwrite existing file");
    let phase5_start = Instant::now();

    let overwrite_data = generate_test_data(2 * 1024 * 1024, 0x3333_3333);
    let overwrite_hash = sha256_hex(&overwrite_data);

    log_step!(
        "Atomically overwriting document.pdf (new size: {})...",
        format_bytes(overwrite_data.len() as u64)
    );
    let temp_path = mountpoint.join(".temp_write");
    let write_start = Instant::now();
    std::fs::write(&temp_path, &overwrite_data).expect("write temp file");
    std::fs::rename(&temp_path, &root_file1_path).expect("atomic replace");
    log_step!(
        "Atomic overwrite completed in {}",
        format_duration(write_start.elapsed())
    );

    let overwritten_data = std::fs::read(&root_file1_path).expect("read overwritten file");
    assert_eq!(
        sha256_hex(&overwritten_data),
        overwrite_hash,
        "overwritten file hash mismatch"
    );
    assert_eq!(
        overwritten_data.len(),
        2 * 1024 * 1024,
        "overwritten file size mismatch"
    );
    log_step!(
        "✓ Overwrite completed and verified in {}",
        format_duration(phase5_start.elapsed())
    );

    log_phase!("PHASE 6: Delete file and verify storage size reduction");
    let phase6_start = Instant::now();

    log_step!("Saving vault state before deletion...");
    vault.save();

    let storage_size_before = get_dir_size(&vault.storage_root);
    log_step!(
        "Storage size before deletion: {}",
        format_bytes(storage_size_before)
    );

    log_step!("Deleting temp_large_file.bin...");
    let delete_start = Instant::now();
    std::fs::remove_file(&file_to_delete_path).expect("delete file");
    log_step!(
        "Delete completed in {}",
        format_duration(delete_start.elapsed())
    );

    assert!(
        !file_to_delete_path.exists(),
        "deleted file should not exist in filesystem view"
    );

    log_step!("Saving vault state after deletion...");
    vault.save();

    let storage_size_after = get_dir_size(&vault.storage_root);
    log_step!(
        "Storage size after deletion: {}",
        format_bytes(storage_size_after)
    );

    let size_reduction = storage_size_before.saturating_sub(storage_size_after);
    log_step!("Storage size reduction: {}", format_bytes(size_reduction));
    assert!(
        size_reduction >= 2 * 1024 * 1024,
        "storage size should decrease by at least 2MB after deleting 3MB file. before={} after={} reduction={}",
        storage_size_before,
        storage_size_after,
        size_reduction
    );

    log_step!(
        "✓ Delete completed. Storage reduced by {} in {}",
        format_bytes(size_reduction),
        format_duration(phase6_start.elapsed())
    );

    log_phase!("PHASE 7: Unmount and verify persistence via core RPC");
    let phase7_start = Instant::now();

    log_step!("Unmounting FUSE...");
    let unmount_start = Instant::now();
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");
    log_step!(
        "Unmount completed in {}",
        format_duration(unmount_start.elapsed())
    );

    log_step!("Restarting core (simulating app restart)...");
    let restart_start = Instant::now();
    vault.restart_core_unlocked();
    log_step!(
        "Core restart completed in {}",
        format_duration(restart_start.elapsed())
    );

    log_step!("Verifying catalog state via RPC...");
    let root_items = common::catalog_list(&vault.adapter, None).items;
    assert!(
        root_items.iter().any(|i| i.name == "document.pdf"),
        "document.pdf missing from catalog"
    );
    assert!(
        root_items.iter().any(|i| i.name == "moved_report.docx"),
        "moved_report.docx missing from catalog"
    );
    assert!(
        root_items.iter().any(|i| i.name == "Documents"),
        "Documents dir missing from catalog"
    );

    let docs_items = common::catalog_list(&vault.adapter, Some("/Documents")).items;
    assert!(
        !docs_items.iter().any(|i| i.name == "temp_large_file.bin"),
        "temp_large_file.bin should not exist in catalog after deletion"
    );
    log_step!("✓ Catalog state verified (deleted file absent from catalog)");

    log_step!("Downloading document.pdf via RPC for hash verification...");
    let download_start = Instant::now();
    let doc_node_id =
        catalog_find_child(&vault.adapter, None, "document.pdf").expect("find document.pdf");
    let downloaded_doc = catalog_download(&vault.adapter, doc_node_id);
    log_step!(
        "Download completed in {} ({} bytes)",
        format_duration(download_start.elapsed()),
        format_bytes(downloaded_doc.len() as u64)
    );

    assert_eq!(
        sha256_hex(&downloaded_doc),
        overwrite_hash,
        "document.pdf RPC download hash mismatch"
    );
    log_step!("✓ document.pdf hash verified via RPC");

    log_step!("Downloading moved_report.docx via RPC...");
    let download_start = Instant::now();
    let report_node_id = catalog_find_child(&vault.adapter, None, "moved_report.docx")
        .expect("find moved_report.docx");
    let downloaded_report = catalog_download(&vault.adapter, report_node_id);
    log_step!(
        "Download completed in {} ({} bytes)",
        format_duration(download_start.elapsed()),
        format_bytes(downloaded_report.len() as u64)
    );

    assert_eq!(
        sha256_hex(&downloaded_report),
        nested_file_hash,
        "moved_report.docx RPC download hash mismatch"
    );
    log_step!("✓ moved_report.docx hash verified via RPC");
    log_step!(
        "✓ Phase 7 completed in {}",
        format_duration(phase7_start.elapsed())
    );

    log_phase!("PHASE 8: Remount and verify via FUSE");
    let phase8_start = Instant::now();

    log_step!("Remounting FUSE...");
    let remount_start = Instant::now();
    let fuse = start_fuse_or_skip!(
        "e2e_user_full_workflow",
        mountpoint.clone(),
        dir.path().join("staging2"),
        vault.adapter.clone(),
        "start_fuse_server (remount)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;
    log_step!(
        "Remount completed in {}",
        format_duration(remount_start.elapsed())
    );

    log_step!("Reading document.pdf from FUSE after remount...");
    let read_start = Instant::now();
    let remount_doc = std::fs::read(&root_file1_path).expect("read document.pdf after remount");
    log_step!(
        "Read completed in {} ({} bytes)",
        format_duration(read_start.elapsed()),
        format_bytes(remount_doc.len() as u64)
    );
    assert_eq!(
        sha256_hex(&remount_doc),
        overwrite_hash,
        "document.pdf hash mismatch after remount"
    );
    log_step!("✓ document.pdf readable after remount");

    log_step!("Reading moved_report.docx from FUSE after remount...");
    let read_start = Instant::now();
    let remount_report =
        std::fs::read(&moved_to_root).expect("read moved_report.docx after remount");
    log_step!(
        "Read completed in {} ({} bytes)",
        format_duration(read_start.elapsed()),
        format_bytes(remount_report.len() as u64)
    );
    assert_eq!(
        sha256_hex(&remount_report),
        nested_file_hash,
        "moved_report.docx hash mismatch after remount"
    );
    log_step!("✓ moved_report.docx readable after remount");

    assert!(
        docs_dir.exists(),
        "Documents directory should exist after remount"
    );
    log_step!("✓ Documents directory preserved");

    assert!(
        !file_to_delete_path.exists(),
        "deleted file should not exist after remount"
    );
    log_step!("✓ Deleted file confirmed absent after remount");

    log_step!("Final unmount...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("final unmount timeout");
    log_step!(
        "✓ Phase 8 completed in {}",
        format_duration(phase8_start.elapsed())
    );

    log_phase!(format!(
        "✅ ALL PHASES COMPLETED SUCCESSFULLY! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Test: File deletion removes catalog entry (encrypted chunks remain until compaction)
#[tokio::test]
async fn e2e_file_deletion_removes_catalog_entry() {
    if !require_fuse_or_skip("e2e_file_deletion_removes_catalog_entry") {
        return;
    }
    lock_fuse_test!("e2e_file_deletion_removes_catalog_entry");
    let test_start = Instant::now();
    log_phase!("START: e2e_file_deletion_removes_catalog_entry");

    // (FUSE availability checked above)

    log_step!("Creating test vault and mounting FUSE...");
    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_file_deletion_removes_catalog_entry",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let files = vec![
        ("file1.bin", 5 * 1024 * 1024, 0xAAAA_1111u64),
        ("file2.bin", 3 * 1024 * 1024, 0xBBBB_2222u64),
        ("file3.bin", 7 * 1024 * 1024, 0xCCCC_3333u64),
    ];

    let total_raw_size: u64 = files.iter().map(|(_, size, _)| *size as u64).sum();
    log_step!(
        "Creating {} files (total raw data: {})...",
        files.len(),
        format_bytes(total_raw_size)
    );

    let mut paths = vec![];
    for (name, size, seed) in &files {
        let data = generate_test_data(*size, *seed);
        let path = mountpoint.join(name);

        log_step!("Writing {} ({} bytes)...", name, format_bytes(*size as u64));
        let write_start = Instant::now();
        std::fs::write(&path, &data).expect(&format!("write {}", name));
        log_step!("  -> Written in {}", format_duration(write_start.elapsed()));

        paths.push((path, *size));
    }

    log_step!("Saving vault state...");
    vault.save();

    log_step!("Verifying files exist in catalog before deletion...");
    for (path, _) in &paths {
        let filename = path.file_name().unwrap().to_str().unwrap();
        let node_id = catalog_find_child(&vault.adapter, None, filename);
        assert!(
            node_id.is_some(),
            "{} should exist in catalog before deletion",
            filename
        );
        log_step!("  -> {} found in catalog", filename);
    }

    for (idx, (path, file_size)) in paths.iter().enumerate() {
        let filename = path.file_name().unwrap().to_str().unwrap();

        log_step!(
            "[Step {}/{}] Deleting {} ({} MB)...",
            idx + 1,
            paths.len(),
            filename,
            file_size / (1024 * 1024)
        );

        let delete_start = Instant::now();
        std::fs::remove_file(path).expect(&format!("delete {}", filename));
        log_step!(
            "  -> Deleted in {}",
            format_duration(delete_start.elapsed())
        );

        log_step!("Saving vault state...");
        let save_start = Instant::now();
        vault.save();
        log_step!("  -> Saved in {}", format_duration(save_start.elapsed()));

        log_step!("Verifying {} is removed from catalog...", filename);
        let node_id = catalog_find_child(&vault.adapter, None, filename);
        assert!(
            node_id.is_none(),
            "{} should not exist in catalog after deletion",
            filename
        );
        log_step!("✓ {} confirmed absent from catalog", filename);
    }

    log_step!("Unmounting FUSE...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_phase!(format!(
        "✅ Catalog entry deletion test passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Regression: deleting a file via WebView (RPC) while FUSE is mounted must not leave a stale
/// inode entry that breaks Finder-style replace flows.
///
/// Repro:
/// 1) Create file via FUSE
/// 2) Delete it via RPC (as WebView would)
/// 3) Copy same-name file back using atomic rename (tmp -> target)
#[tokio::test]
async fn e2e_webview_delete_while_mounted_allows_replace_same_name() {
    if !require_fuse_or_skip("e2e_webview_delete_while_mounted_allows_replace_same_name") {
        return;
    }
    lock_fuse_test!("e2e_webview_delete_while_mounted_allows_replace_same_name");

    let test_start = Instant::now();
    log_phase!("START: e2e_webview_delete_while_mounted_allows_replace_same_name");

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    log_step!("Mounting FUSE...");
    let fuse = start_fuse_or_skip!(
        "e2e_webview_delete_while_mounted_allows_replace_same_name",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let filename = "Screenshot 2026-02-02 at 14.32.37.png";
    let dest = mountpoint.join(filename);

    log_phase!("PHASE 1: Create file via FUSE");
    let initial = generate_test_data(256 * 1024, 0xD311_0001);
    let initial_hash = sha256_hex(&initial);
    std::fs::write(&dest, &initial).expect("write initial screenshot");
    let got = std::fs::read(&dest).expect("read initial screenshot");
    assert_eq!(sha256_hex(&got), initial_hash, "initial file read mismatch");

    let node_id =
        catalog_find_child(&vault.adapter, None, filename).expect("catalog contains initial file");

    log_phase!("PHASE 2: Delete file via RPC while still mounted");
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "catalog:delete".to_string(),
            serde_json::json!({"node_id": node_id}),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("catalog:delete failed: {other:?}"),
        }
        a.save().expect("adapter.save after delete");
    }

    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "file must be absent from core catalog immediately after delete"
    );

    log_phase!("PHASE 3: Re-copy same-name file via truncate+write (Finder-style replace)");
    let replacement = generate_test_data(512 * 1024, 0xD311_0002);
    let replacement_hash = sha256_hex(&replacement);

    {
        use std::io::Write as _;

        let mut f = match std::fs::OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(&dest)
        {
            Ok(f) => f,
            Err(e) => {
                // If the file was deleted outside of FUSE, the kernel/Finder may still believe it
                // exists and try to open+truncate it. A correct FUSE implementation should return
                // ENOENT (not EIO), and the caller can then fall back to create+write.
                if e.raw_os_error() == Some(libc::ENOENT) {
                    std::fs::OpenOptions::new()
                        .write(true)
                        .create(true)
                        .truncate(true)
                        .open(&dest)
                        .expect("open destination with create")
                } else {
                    panic!("open destination for truncate failed: {e:?}");
                }
            }
        };
        f.write_all(&replacement).expect("write replacement");
        f.sync_all().expect("sync_all replacement");
    }

    let got2 = std::fs::read(&dest).expect("read replaced file");
    assert_eq!(
        sha256_hex(&got2),
        replacement_hash,
        "replaced file read mismatch"
    );

    log_step!("Unmounting FUSE...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    // Ensure persistence via core.
    vault.restart_core_unlocked();
    let node_id2 =
        catalog_find_child(&vault.adapter, None, filename).expect("catalog contains replaced file");
    let downloaded = catalog_download(&vault.adapter, node_id2);
    assert_eq!(
        sha256_hex(&downloaded),
        replacement_hash,
        "core download mismatch after restart"
    );

    log_phase!(format!(
        "✅ WebView delete + replace flow passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

#[tokio::test]
async fn e2e_unlink_after_webview_delete_is_idempotent() {
    if !require_fuse_or_skip("e2e_unlink_after_webview_delete_is_idempotent") {
        return;
    }
    lock_fuse_test!("e2e_unlink_after_webview_delete_is_idempotent");

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_unlink_after_webview_delete_is_idempotent",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let filename = "finder-delete-race.bin";
    let path = mountpoint.join(filename);
    let data = generate_test_data(128 * 1024, 0xD311_1001);
    std::fs::write(&path, &data).expect("write file");

    let node_id =
        catalog_find_child(&vault.adapter, None, filename).expect("catalog contains file");
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "catalog:delete".to_string(),
            serde_json::json!({"node_id": node_id}),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("catalog:delete failed: {other:?}"),
        }
        a.save().expect("adapter.save after delete");
    }

    if let Err(err) = std::fs::remove_file(&path) {
        assert_eq!(
            err.kind(),
            std::io::ErrorKind::NotFound,
            "unlink after out-of-band delete should be idempotent"
        );
    }

    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "file must remain absent from core catalog"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");
}

#[tokio::test]
async fn e2e_finder_style_trash_delete_after_restart() {
    if !require_fuse_or_skip("e2e_finder_style_trash_delete_after_restart") {
        return;
    }
    lock_fuse_test!("e2e_finder_style_trash_delete_after_restart");

    let test_start = Instant::now();
    log_phase!("START: e2e_finder_style_trash_delete_after_restart");

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let filename = "Screenshot 2026-02-09 at 12.29.42.png";
    let ds_store = ".DS_Store";
    let uid = unsafe { libc::getuid() };
    let trash_parent = format!("/.Trashes/{uid}");

    log_phase!("PHASE 1: Create root files and persist");
    let fuse = start_fuse_or_skip!(
        "e2e_finder_style_trash_delete_after_restart",
        mountpoint.clone(),
        staging.clone(),
        vault.adapter.clone(),
        "start_fuse_server (mount #1)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let screenshot_path = mountpoint.join(filename);
    let ds_store_path = mountpoint.join(ds_store);
    let screenshot_data = generate_test_data(256 * 1024, 0xD311_2001);
    std::fs::write(&screenshot_path, &screenshot_data).expect("write screenshot");
    std::fs::write(&ds_store_path, b"finder-metadata").expect("write .DS_Store");

    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_some(),
        "screenshot should exist in root catalog"
    );
    assert!(
        catalog_find_child(&vault.adapter, None, ds_store).is_some(),
        ".DS_Store should exist in root catalog"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #1)");

    vault.restart_core_unlocked();

    log_phase!("PHASE 2: Finder-style move to .Trashes and delete");
    let fuse = start_fuse_or_skip!(
        "e2e_finder_style_trash_delete_after_restart",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server (mount #2)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let trash_dir = mountpoint.join(".Trashes").join(uid.to_string());
    if let Err(err) = std::fs::create_dir_all(&trash_dir) {
        tokio::time::timeout(Duration::from_secs(5), fuse.join())
            .await
            .expect("unmount timeout (mount #2)");
        eprintln!(
            "SKIP e2e_finder_style_trash_delete_after_restart: cannot create .Trashes/<uid> ({err})"
        );
        return;
    }

    let trashed_path = trash_dir.join(filename);
    if let Err(err) = std::fs::rename(mountpoint.join(filename), &trashed_path) {
        tokio::time::timeout(Duration::from_secs(5), fuse.join())
            .await
            .expect("unmount timeout (mount #2)");
        eprintln!(
            "SKIP e2e_finder_style_trash_delete_after_restart: finder-style rename unavailable ({err})"
        );
        return;
    }

    assert!(
        wait_until_dir_absent(&mountpoint, filename, Duration::from_secs(2))
            .expect("read_dir root after trash delete"),
        "root mount listing should drop deleted file without remount"
    );
    assert!(
        wait_until_dir_absent(&trash_dir, filename, Duration::from_secs(2))
            .expect("read_dir trash after trash delete"),
        "trash listing should not keep deleted file entry"
    );

    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "screenshot should be absent from root catalog after trash delete"
    );
    assert!(
        catalog_find_child(&vault.adapter, Some(trash_parent.as_str()), filename).is_none(),
        "trashed screenshot should be absent from trash catalog after delete"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #2)");

    vault.restart_core_unlocked();

    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "screenshot should remain absent after restart"
    );
    assert!(
        catalog_find_child(&vault.adapter, Some(trash_parent.as_str()), filename).is_none(),
        "trashed screenshot should remain absent after restart"
    );

    log_phase!(format!(
        "✅ Finder-style trash delete regression passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

#[cfg(target_os = "macos")]
fn macos_renamex_np(from: &Path, to: &Path, flags: u32) -> std::io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt as _;

    let from_c = CString::new(from.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "NUL in src path"))?;
    let to_c = CString::new(to.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "NUL in dst path"))?;

    let rc = unsafe { libc::renamex_np(from_c.as_ptr(), to_c.as_ptr(), flags as libc::c_uint) };
    if rc == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn e2e_macos_renamex_excl_semantics() {
    init_test_tracing();
    if !require_fuse_or_skip("e2e_macos_renamex_excl_semantics") {
        return;
    }
    lock_fuse_test!("e2e_macos_renamex_excl_semantics");

    let test_start = Instant::now();
    log_phase!("START: e2e_macos_renamex_excl_semantics");

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_macos_renamex_excl_semantics",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let src = mountpoint.join("renamex-excl-src.txt");
    let dst = mountpoint.join("renamex-excl-dst.txt");

    log_step!(
        "macOS renamex flags: RENAME_EXCL={:#x} RENAME_SWAP={:#x}",
        libc::RENAME_EXCL,
        libc::RENAME_SWAP
    );

    log_step!("Case 1: RENAME_EXCL succeeds when dst is missing");
    let _ = std::fs::remove_file(&dst);
    std::fs::write(&src, b"hello").expect("write src");
    let case1 = macos_renamex_np(&src, &dst, libc::RENAME_EXCL as u32);

    let mut case2: Option<std::io::Error> = None;
    let mut case2_src_exists = false;
    let mut case2_dst_exists = false;
    if case1.is_ok() {
        assert!(!src.exists(), "src must not exist after successful rename");
        assert!(dst.exists(), "dst must exist after successful rename");

        log_step!("Case 2: RENAME_EXCL fails with EEXIST when dst exists");
        std::fs::write(&src, b"world").expect("rewrite src");
        case2 = Some(
            macos_renamex_np(&src, &dst, libc::RENAME_EXCL as u32)
                .expect_err("renamex_np(EXCL) must fail when dst exists"),
        );
        case2_src_exists = src.exists();
        case2_dst_exists = dst.exists();
    }

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    case1.expect("renamex_np(EXCL) should succeed when dst missing");
    if let Some(err) = case2 {
        assert_eq!(
            err.raw_os_error(),
            Some(libc::EEXIST),
            "expected EEXIST, got {err:?}"
        );
        assert!(
            case2_src_exists,
            "src must still exist after failed EXCL rename"
        );
        assert!(
            case2_dst_exists,
            "dst must still exist after failed EXCL rename"
        );
    }

    log_phase!(format!(
        "✅ renamex_np EXCL semantics passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

#[tokio::test]
async fn e2e_finder_style_direct_unlink_with_open_handle_and_xattr_probe() {
    if !require_fuse_or_skip("e2e_finder_style_direct_unlink_with_open_handle_and_xattr_probe") {
        return;
    }
    lock_fuse_test!("e2e_finder_style_direct_unlink_with_open_handle_and_xattr_probe");

    let test_start = Instant::now();
    log_phase!("START: e2e_finder_style_direct_unlink_with_open_handle_and_xattr_probe");

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let filename = "Screenshot 2026-02-11 at 09.50.14.png";
    let path = mountpoint.join(filename);
    let initial = generate_test_data(192 * 1024, 0xD311_3001);
    let replacement = generate_test_data(320 * 1024, 0xD311_3002);
    let replacement_hash = sha256_hex(&replacement);

    log_phase!("PHASE 1: Create file and persist");
    let fuse = start_fuse_or_skip!(
        "e2e_finder_style_direct_unlink_with_open_handle_and_xattr_probe",
        mountpoint.clone(),
        staging.clone(),
        vault.adapter.clone(),
        "start_fuse_server (mount #1)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    std::fs::write(&path, &initial).expect("write initial file");
    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_some(),
        "initial file should exist in catalog"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #1)");

    vault.restart_core_unlocked();

    log_phase!("PHASE 2: Direct unlink with open handle and xattr probes");
    let fuse = start_fuse_or_skip!(
        "e2e_finder_style_direct_unlink_with_open_handle_and_xattr_probe",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server (mount #2)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let mut preview = std::fs::File::open(&path).expect("open file for preview");
    {
        use std::io::Read as _;
        let mut head = [0u8; 64];
        let _ = preview.read(&mut head).expect("read preview bytes");
    }

    if cfg!(target_os = "macos") {
        let finder_info = std::process::Command::new("xattr")
            .arg("-p")
            .arg("com.apple.FinderInfo")
            .arg(&path)
            .output()
            .expect("xattr finderinfo probe");
        assert!(
            finder_info.status.success(),
            "xattr FinderInfo probe failed: {}",
            String::from_utf8_lossy(&finder_info.stderr)
        );

        let list = std::process::Command::new("xattr")
            .arg("-l")
            .arg(&path)
            .output()
            .expect("xattr list probe");
        assert!(
            list.status.success(),
            "xattr list probe failed: {}",
            String::from_utf8_lossy(&list.stderr)
        );
    }

    std::fs::remove_file(&path).expect("direct unlink should succeed");
    let second_delete =
        std::fs::remove_file(&path).expect_err("second unlink should fail with not found");
    assert_eq!(
        second_delete.kind(),
        std::io::ErrorKind::NotFound,
        "second unlink should report not found"
    );

    drop(preview);

    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "file should be absent in catalog after unlink"
    );

    std::fs::write(&path, &replacement).expect("recreate file with same name");
    let got = std::fs::read(&path).expect("read recreated file");
    assert_eq!(
        sha256_hex(&got),
        replacement_hash,
        "recreated file read mismatch"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #2)");

    vault.restart_core_unlocked();
    let node_id = catalog_find_child(&vault.adapter, None, filename)
        .expect("catalog contains recreated file");
    let downloaded = catalog_download(&vault.adapter, node_id);
    assert_eq!(
        sha256_hex(&downloaded),
        replacement_hash,
        "core download mismatch after restart"
    );

    log_phase!(format!(
        "✅ Finder-style direct unlink regression passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

#[tokio::test]
async fn e2e_finder_automation_delete_after_restart() {
    if !require_fuse_or_skip("e2e_finder_automation_delete_after_restart") {
        return;
    }
    lock_fuse_test!("e2e_finder_automation_delete_after_restart");

    if !cfg!(target_os = "macos") {
        eprintln!("SKIP e2e_finder_automation_delete_after_restart: macOS only");
        return;
    }

    init_test_tracing();

    let test_start = Instant::now();
    log_phase!("START: e2e_finder_automation_delete_after_restart");

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let filename = "Screenshot 2026-02-11 at 10.21.39.png";
    let path = mountpoint.join(filename);
    let screenshot_data = generate_test_data(384 * 1024, 0xD311_4001);

    log_phase!("PHASE 1: Create file and persist");
    let fuse = start_fuse_or_skip!(
        "e2e_finder_automation_delete_after_restart",
        mountpoint.clone(),
        staging.clone(),
        vault.adapter.clone(),
        "start_fuse_server (mount #1)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    std::fs::write(&path, &screenshot_data).expect("write screenshot");
    std::fs::write(mountpoint.join(".DS_Store"), b"finder-metadata").expect("write .DS_Store");
    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_some(),
        "screenshot should exist before finder delete"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #1)");

    vault.restart_core_unlocked();

    log_phase!("PHASE 2: Delete via Finder automation");
    let fuse = start_fuse_or_skip!(
        "e2e_finder_automation_delete_after_restart",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server (mount #2)"
    );
    tokio::time::sleep(Duration::from_millis(400)).await;

    let script = [
        "on run argv",
        "set p to item 1 of argv",
        "with timeout of 15 seconds",
        "tell application \"Finder\"",
        "set targetItem to POSIX file p as alias",
        "delete targetItem",
        "end tell",
        "end timeout",
        "end run",
    ]
    .join("\n");

    let out = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .arg("--")
        .arg(path.as_os_str())
        .output()
        .expect("run osascript finder delete");

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        let detail = format!("stdout={stdout:?} stderr={stderr:?}");

        let automation_blocked = common::finder_automation_unavailable(&stderr);

        tokio::time::timeout(Duration::from_secs(5), fuse.join())
            .await
            .expect("unmount timeout (mount #2)");

        if automation_blocked {
            eprintln!(
                "SKIP e2e_finder_automation_delete_after_restart: Finder automation unavailable ({detail})"
            );
            return;
        }

        panic!("finder delete failed: {detail}");
    }

    tokio::time::sleep(Duration::from_millis(400)).await;

    assert!(
        !path.exists(),
        "file should be absent from mountpoint after Finder delete"
    );
    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "screenshot should be absent from catalog after Finder delete"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout (mount #2)");

    vault.restart_core_unlocked();
    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "screenshot should remain absent after restart"
    );

    log_phase!(format!(
        "✅ Finder automation delete regression passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn e2e_finder_delete_converges_without_stale_listing() {
    if !require_fuse_or_skip("e2e_finder_delete_converges_without_stale_listing") {
        return;
    }
    lock_fuse_test!("e2e_finder_delete_converges_without_stale_listing");

    init_test_tracing();

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_finder_delete_converges_without_stale_listing",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(350)).await;

    let filename = "finder-stale-converge-delete.txt";
    let path = mountpoint.join(filename);
    std::fs::write(&path, generate_test_data(96 * 1024, 0xFA11_0001)).expect("write delete target");

    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_some(),
        "delete target should exist in catalog before Finder delete"
    );

    match finder_delete_with_skip(&path) {
        Ok(()) => {}
        Err(msg) if msg.starts_with("SKIP ") => {
            tokio::time::timeout(Duration::from_secs(5), fuse.join())
                .await
                .expect("unmount timeout");
            eprintln!("SKIP e2e_finder_delete_converges_without_stale_listing: {msg}");
            return;
        }
        Err(msg) => {
            tokio::time::timeout(Duration::from_secs(5), fuse.join())
                .await
                .expect("unmount timeout");
            panic!("{msg}");
        }
    }

    let deadline = Instant::now() + Duration::from_secs(10);
    let mut converged = false;
    while Instant::now() < deadline {
        let shell_absent = !path.exists();
        let finder_absent = match finder_list_names(&mountpoint) {
            Ok(names) => !names.iter().any(|name| name == filename),
            Err(msg) if msg.starts_with("SKIP ") => {
                tokio::time::timeout(Duration::from_secs(5), fuse.join())
                    .await
                    .expect("unmount timeout");
                eprintln!("SKIP e2e_finder_delete_converges_without_stale_listing: {msg}");
                return;
            }
            Err(msg) => {
                tokio::time::timeout(Duration::from_secs(5), fuse.join())
                    .await
                    .expect("unmount timeout");
                panic!("{msg}");
            }
        };

        if shell_absent && finder_absent {
            converged = true;
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }

    assert!(
        converged,
        "shell/Finder delete convergence did not complete within timeout"
    );
    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "catalog should not contain deleted file after Finder delete"
    );
    assert_no_host_trash_leakage(filename);

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    vault.restart_core_unlocked();
    assert!(
        catalog_find_child(&vault.adapter, None, filename).is_none(),
        "deleted file should remain absent after restart"
    );
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn e2e_finder_replace_same_name_converges() {
    if !require_fuse_or_skip("e2e_finder_replace_same_name_converges") {
        return;
    }
    lock_fuse_test!("e2e_finder_replace_same_name_converges");

    init_test_tracing();

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_finder_replace_same_name_converges",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(350)).await;

    let filename = "finder-replace-converge.txt";
    let temp_name = ".finder-replace-converge.tmp";
    let path = mountpoint.join(filename);
    let temp_path = mountpoint.join(temp_name);

    let initial = generate_test_data(128 * 1024, 0xFA11_1001);
    let replacement = generate_test_data(192 * 1024, 0xFA11_1002);
    let replacement_hash = sha256_hex(&replacement);

    std::fs::write(&path, &initial).expect("write initial target");
    std::fs::write(&temp_path, &replacement).expect("write replacement source");

    let dst_node_before = catalog_find_child(&vault.adapter, None, filename)
        .expect("target should exist in catalog before replace");
    let src_node_before = catalog_find_child(&vault.adapter, None, temp_name)
        .expect("replacement source should exist in catalog before replace");

    macos_renamex_np(&temp_path, &path, 0).expect("renamex replace same-name");

    let read_back = std::fs::read(&path).expect("read replaced file");
    assert_eq!(
        sha256_hex(&read_back),
        replacement_hash,
        "replace final file content mismatch"
    );
    assert!(
        !temp_path.exists(),
        "replace temp source should be removed from shell view"
    );

    let dst_node_after = catalog_find_child(&vault.adapter, None, filename)
        .expect("target should exist after replace");
    assert_eq!(
        dst_node_after, src_node_before,
        "replace branch should preserve source node identity at destination"
    );
    assert_ne!(
        dst_node_after, dst_node_before,
        "replace branch should not keep pre-existing destination node id"
    );
    assert!(
        catalog_find_child(&vault.adapter, None, temp_name).is_none(),
        "temporary source should be absent from catalog after replace"
    );

    let deadline = Instant::now() + Duration::from_secs(10);
    let mut converged = false;
    while Instant::now() < deadline {
        let shell_ok = path.exists() && !temp_path.exists();
        let finder_ok = match finder_list_names(&mountpoint) {
            Ok(names) => {
                names.iter().any(|name| name == filename)
                    && !names.iter().any(|name| name == temp_name)
            }
            Err(msg) if msg.starts_with("SKIP ") => {
                tokio::time::timeout(Duration::from_secs(5), fuse.join())
                    .await
                    .expect("unmount timeout");
                eprintln!("SKIP e2e_finder_replace_same_name_converges: {msg}");
                return;
            }
            Err(msg) => {
                tokio::time::timeout(Duration::from_secs(5), fuse.join())
                    .await
                    .expect("unmount timeout");
                panic!("{msg}");
            }
        };

        if shell_ok && finder_ok {
            converged = true;
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }

    assert!(
        converged,
        "shell/Finder replace convergence did not complete within timeout"
    );
    assert_no_host_trash_leakage(filename);
    assert_no_host_trash_leakage(temp_name);

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    vault.restart_core_unlocked();
    let node_id = catalog_find_child(&vault.adapter, None, filename)
        .expect("replaced file should persist after restart");
    let downloaded = catalog_download(&vault.adapter, node_id);
    assert_eq!(
        sha256_hex(&downloaded),
        replacement_hash,
        "replace final content should persist after restart"
    );
}

/// Test: Root-level files maintain correct size after restart (regression test)
#[tokio::test]
async fn e2e_root_file_size_persists_after_restart() {
    if !require_fuse_or_skip("e2e_root_file_size_persists_after_restart") {
        return;
    }
    lock_fuse_test!("e2e_root_file_size_persists_after_restart");
    let test_start = Instant::now();
    log_phase!("START: e2e_root_file_size_persists_after_restart");

    // (FUSE availability checked above)

    log_step!("Creating test vault...");
    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    log_step!("Mounting FUSE...");
    let fuse = start_fuse_or_skip!(
        "e2e_root_file_size_persists_after_restart",
        mountpoint.clone(),
        staging.clone(),
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let file_path = mountpoint.join("test.bin");
    let data = generate_test_data(1024 * 1024, 0xBEEF);
    let hash = sha256_hex(&data);

    log_step!(
        "Writing test.bin ({} bytes)...",
        format_bytes(data.len() as u64)
    );
    let write_start = Instant::now();
    std::fs::write(&file_path, &data).expect("write file");
    log_step!("Written in {}", format_duration(write_start.elapsed()));

    log_step!("Syncing file...");
    let f = std::fs::OpenOptions::new()
        .read(true)
        .open(&file_path)
        .expect("open for sync");
    f.sync_all().expect("sync");
    drop(f);

    log_step!("Unmounting FUSE (first mount)...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_step!("Restarting core (simulating app restart)...");
    vault.restart_core_unlocked();

    log_step!("Remounting FUSE...");
    let fuse = start_fuse_or_skip!(
        "e2e_root_file_size_persists_after_restart",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server (remount)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let meta = std::fs::metadata(&file_path).expect("stat file");
    log_step!(
        "File size after remount: {} bytes (expected: {} bytes)",
        meta.len(),
        data.len()
    );
    assert_eq!(
        meta.len(),
        data.len() as u64,
        "File size changed after restart!"
    );

    log_step!("Reading file for hash verification...");
    let read_data = std::fs::read(&file_path).expect("read file");
    assert_eq!(
        sha256_hex(&read_data),
        hash,
        "File content changed after restart!"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_phase!(format!(
        "✅ Root-level file persistence test passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Test: Multiple files in nested directories
#[tokio::test]
async fn e2e_nested_directories_with_multiple_files() {
    if !require_fuse_or_skip("e2e_nested_directories_with_multiple_files") {
        return;
    }
    lock_fuse_test!("e2e_nested_directories_with_multiple_files");
    let test_start = Instant::now();
    log_phase!("START: e2e_nested_directories_with_multiple_files");

    match detect_fuse_driver() {
        FuseDriverStatus::Available => {}
        _ => panic!("FUSE driver required"),
    }

    log_step!("Creating test vault and mounting FUSE...");
    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_nested_directories_with_multiple_files",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let structure = vec![
        (
            "Projects",
            vec![
                ("main.rs", 100_000),
                ("lib.rs", 50_000),
                ("Cargo.toml", 1_000),
            ],
        ),
        (
            "Documents",
            vec![("notes.txt", 10_000), ("budget.xlsx", 500_000)],
        ),
        (
            "Photos",
            vec![("vacation.jpg", 2_000_000), ("profile.png", 500_000)],
        ),
    ];

    let total_files: usize = structure.iter().map(|(_, files)| files.len()).sum();
    log_step!(
        "Creating {} files in {} directories...",
        total_files,
        structure.len()
    );

    let mut all_hashes: Vec<(String, String)> = vec![];

    for (dir_name, files) in structure {
        let dir_path = mountpoint.join(dir_name);
        log_step!("Creating directory: {}", dir_name);
        std::fs::create_dir(&dir_path).expect(&format!("create {}", dir_name));

        for (file_name, size) in files {
            let data = generate_test_data(size, file_name.as_bytes()[0] as u64);
            let hash = sha256_hex(&data);
            let path = dir_path.join(file_name);

            log_step!(
                "Writing {}/{} ({} bytes)...",
                dir_name,
                file_name,
                format_bytes(size as u64)
            );
            let write_start = Instant::now();
            std::fs::write(&path, &data).expect(&format!("write {}/{}", dir_name, file_name));
            log_step!("  -> Written in {}", format_duration(write_start.elapsed()));

            let read_back =
                std::fs::read(&path).expect(&format!("read {}/{}", dir_name, file_name));
            assert_eq!(
                sha256_hex(&read_back),
                hash,
                "Immediate read-back failed for {}/{}",
                dir_name,
                file_name
            );

            all_hashes.push((format!("{}/{}", dir_name, file_name), hash));
        }
    }

    log_step!("Unmounting FUSE (first mount)...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_step!("Restarting core...");
    vault.restart_core_unlocked();

    log_step!("Remounting FUSE...");
    let fuse = start_fuse_or_skip!(
        "e2e_nested_directories_with_multiple_files",
        mountpoint.clone(),
        dir.path().join("staging2"),
        vault.adapter.clone(),
        "start_fuse_server (remount)"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    log_step!("Verifying all {} files after remount...", all_hashes.len());
    for (idx, (path, expected_hash)) in all_hashes.iter().enumerate() {
        let full_path = mountpoint.join(&path);

        log_step!("[{}/{}] Reading {}...", idx + 1, all_hashes.len(), path);
        let read_start = Instant::now();
        let data = std::fs::read(&full_path).expect(&format!("read {} after remount", path));
        log_step!(
            "  -> Read {} in {}",
            format_bytes(data.len() as u64),
            format_duration(read_start.elapsed())
        );

        assert_eq!(
            sha256_hex(&data),
            *expected_hash,
            "Hash mismatch for {} after remount",
            path
        );
    }

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_phase!(format!(
        "✅ Nested directories test passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Scenario: Create vault, upload file, erase vault. No storage files must remain.
#[tokio::test]
async fn e2e_erase_after_upload_leaves_no_storage_files() {
    if !require_fuse_or_skip("e2e_erase_after_upload_leaves_no_storage_files") {
        return;
    }
    lock_fuse_test!("e2e_erase_after_upload_leaves_no_storage_files");
    let test_start = Instant::now();
    log_phase!("START: e2e_erase_after_upload_leaves_no_storage_files");

    // (FUSE availability checked above)

    log_step!("Creating test vault (with master) and mounting FUSE...");
    let vault = TestVault::new_unlocked_with_master();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_erase_after_upload_leaves_no_storage_files",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let file_data = generate_test_data(2 * 1024 * 1024, 0xE11A_5E00);
    let file_hash = sha256_hex(&file_data);
    let file_path = mountpoint.join("erase_me.bin");

    log_step!(
        "Writing erase_me.bin ({} bytes)...",
        format_bytes(file_data.len() as u64)
    );
    std::fs::write(&file_path, &file_data).expect("write erase_me.bin");

    let read_back = std::fs::read(&file_path).expect("read erase_me.bin");
    assert_eq!(
        sha256_hex(&read_back),
        file_hash,
        "hash mismatch immediately after write"
    );

    log_step!("Unmounting FUSE...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_step!("Saving vault state...");
    vault.save();

    let files_before = list_regular_files(&vault.storage_root);
    assert!(
        !files_before.is_empty(),
        "expected storage to contain files before erase"
    );
    log_step!("Storage has {} files before erase", files_before.len());

    log_step!("Requesting erase token...");
    let erase_token = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "erase:confirm".to_string(),
            serde_json::json!({}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("erase:confirm failed: {res:?}");
        };
        result
            .get("erase_token")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    assert!(
        !erase_token.is_empty(),
        "erase:confirm returned empty erase_token"
    );

    log_step!("Executing erase...");
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "erase:execute".to_string(),
            serde_json::json!({
                "erase_token": erase_token,
                "master_password": vault.master_password.clone(),
            }),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("erase:execute failed: {other:?}"),
        }
    }

    let files_after = list_regular_files(&vault.storage_root);
    assert!(
        files_after.is_empty(),
        "storage not blank after erase: {files_after:?}"
    );
    log_step!("✓ Storage is blank after erase");

    log_step!("Restarting core and unlocking to verify catalog is empty...");
    vault.restart_core_unlocked();
    let root_items = common::catalog_list(&vault.adapter, None).items;
    assert!(
        root_items.is_empty(),
        "expected empty catalog after erase, got: {root_items:?}"
    );

    log_phase!(format!(
        "✅ Erase scenario passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Scenario: Backup + erase + restore round-trip should preserve file contents.
#[tokio::test]
async fn e2e_backup_restore_round_trip() {
    if !require_fuse_or_skip("e2e_backup_restore_round_trip") {
        return;
    }
    lock_fuse_test!("e2e_backup_restore_round_trip");
    let test_start = Instant::now();
    log_phase!("START: e2e_backup_restore_round_trip");

    // (FUSE availability checked above)

    log_step!("Creating test vault (with master) and mounting FUSE...");
    let vault = TestVault::new_unlocked_with_master();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_backup_restore_round_trip",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    log_phase!("PHASE 1: Write files via FUSE");
    let root_data = generate_test_data(1024 * 1024, 0xBACC_0001);
    let root_hash = sha256_hex(&root_data);
    let root_path = mountpoint.join("backup_me.bin");
    std::fs::write(&root_path, &root_data).expect("write backup_me.bin");

    let docs_dir = mountpoint.join("Docs");
    std::fs::create_dir(&docs_dir).expect("create Docs");
    let nested_data = generate_test_data(512 * 1024, 0xBACC_0002);
    let nested_hash = sha256_hex(&nested_data);
    let nested_path = docs_dir.join("nested.txt");
    std::fs::write(&nested_path, &nested_data).expect("write nested.txt");

    log_step!("Unmounting FUSE...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");
    vault.save();

    log_phase!("PHASE 2: Create local backup via RPC");
    let backup_dir = tempdir().expect("backup tempdir");
    let chunks_root = backup_dir.path().join("chunks");
    std::fs::create_dir_all(&chunks_root).expect("mkdir chunks");

    let (backup_id, chunk_count) = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "backup:local:start".to_string(),
            serde_json::json!({}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("backup:local:start failed: {res:?}");
        };
        let backup_id = result
            .get("backup_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let chunk_count = result
            .get("chunk_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        (backup_id, chunk_count)
    };
    assert!(
        !backup_id.is_empty(),
        "backup:local:start returned empty backup_id"
    );
    log_step!("backup_id={} chunk_count={}", backup_id, chunk_count);

    let mut chunk_names: Vec<String> = Vec::new();
    for i in 0..chunk_count {
        let (chunk_name, chunk_bytes) = {
            let mut a = vault.adapter.lock().expect("adapter lock");
            let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
                "backup:local:downloadChunk".to_string(),
                serde_json::json!({"backup_id": backup_id.clone(), "chunk_index": i}),
            ));
            let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
                panic!("backup:local:downloadChunk failed: {res:?}");
            };
            let name = result
                .get("chunk_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let data_b64 = result.get("data").and_then(|v| v.as_str()).unwrap_or("");
            let bytes = general_purpose::STANDARD
                .decode(data_b64)
                .expect("chunk bytes base64 decode");
            (name, bytes)
        };
        assert_eq!(chunk_name.len(), 64, "invalid chunk_name length");
        chunk_names.push(chunk_name.clone());
        write_backup_chunk(&chunks_root, &chunk_name, &chunk_bytes);
    }

    let (meta_enc, master_salt_b64, master_verify_b64) = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "backup:local:getMetadata".to_string(),
            serde_json::json!({"backup_id": backup_id.clone()}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("backup:local:getMetadata failed: {res:?}");
        };
        let meta_b64 = result
            .get("metadata")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let master_salt_b64 = result
            .get("master_salt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let master_verify_b64 = result
            .get("master_verify")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let meta_enc = general_purpose::STANDARD
            .decode(meta_b64)
            .expect("metadata base64 decode");
        (meta_enc, master_salt_b64, master_verify_b64)
    };
    std::fs::write(backup_dir.path().join("metadata.enc"), &meta_enc).expect("write metadata.enc");
    if let Ok(bytes) = general_purpose::STANDARD.decode(master_salt_b64.as_bytes()) {
        let _ = std::fs::write(backup_dir.path().join("master.salt"), &bytes);
    }
    if let Ok(bytes) = general_purpose::STANDARD.decode(master_verify_b64.as_bytes()) {
        let _ = std::fs::write(backup_dir.path().join("master.verify"), &bytes);
    }

    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "backup:local:finish".to_string(),
            serde_json::json!({"backup_id": backup_id.clone()}),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("backup:local:finish failed: {other:?}"),
        }
    }

    log_phase!("PHASE 3: Erase storage");
    let erase_token = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "erase:confirm".to_string(),
            serde_json::json!({}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("erase:confirm failed: {res:?}");
        };
        result
            .get("erase_token")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    assert!(
        !erase_token.is_empty(),
        "erase:confirm returned empty erase_token"
    );

    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "erase:execute".to_string(),
            serde_json::json!({
                "erase_token": erase_token,
                "master_password": vault.master_password.clone(),
            }),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("erase:execute failed: {other:?}"),
        }
    }

    let files_after_erase = list_regular_files(&vault.storage_root);
    assert!(
        files_after_erase.is_empty(),
        "storage not blank after erase"
    );
    log_step!("✓ Storage is blank after erase");

    log_phase!("PHASE 4: Restore from backup");
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        a.set_master_key(Some(vault.master_password.clone()));
    }

    let restore_id = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "restore:local:start".to_string(),
            serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("restore:local:start failed: {res:?}");
        };
        result
            .get("restore_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    assert!(
        !restore_id.is_empty(),
        "restore:local:start returned empty restore_id"
    );

    for (i, name) in chunk_names.iter().enumerate() {
        let chunk_path = backup_chunk_path(&chunks_root, name);
        let bytes = std::fs::read(&chunk_path).expect("read backup chunk");
        let data_b64 = general_purpose::STANDARD.encode(bytes);
        let is_last = (i + 1) as u64 == chunk_count;
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "restore:local:uploadChunk".to_string(),
            serde_json::json!({
                "restore_id": restore_id.clone(),
                "chunk_index": i as u64,
                "chunk_name": name,
                "data": data_b64,
                "is_last": is_last,
            }),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("restore:local:uploadChunk failed: {other:?}"),
        }
    }

    let meta_bytes =
        std::fs::read(backup_dir.path().join("metadata.enc")).expect("read metadata.enc");
    let meta_b64 = general_purpose::STANDARD.encode(meta_bytes);
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "restore:local:commit".to_string(),
            serde_json::json!({
                "restore_id": restore_id,
                "metadata": meta_b64,
                "master_salt": master_salt_b64,
                "master_verify": master_verify_b64,
            }),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("restore:local:commit failed: {other:?}"),
        }
    }

    log_phase!("PHASE 5: Unlock and verify file hashes via RPC");
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "vault:unlock".to_string(),
            serde_json::json!({"password": vault.vault_password.clone()}),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("vault:unlock after restore failed: {other:?}"),
        }
    }

    let root_id =
        catalog_find_child(&vault.adapter, None, "backup_me.bin").expect("find backup_me.bin");
    let downloaded_root = catalog_download(&vault.adapter, root_id);
    assert_eq!(
        sha256_hex(&downloaded_root),
        root_hash,
        "backup_me.bin hash mismatch after restore"
    );

    let docs_items = common::catalog_list(&vault.adapter, Some("/Docs")).items;
    assert!(
        docs_items.iter().any(|i| i.name == "nested.txt"),
        "nested.txt missing in /Docs after restore"
    );
    let nested_id =
        catalog_find_child(&vault.adapter, Some("/Docs"), "nested.txt").expect("find nested.txt");
    let downloaded_nested = catalog_download(&vault.adapter, nested_id);
    assert_eq!(
        sha256_hex(&downloaded_nested),
        nested_hash,
        "nested.txt hash mismatch after restore"
    );

    log_phase!(format!(
        "✅ Backup/restore round-trip passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Crash-consistency: after a large write is fully flushed/closed, data must survive a restart
/// even if we never call vault.save() explicitly.
#[tokio::test]
async fn e2e_crash_consistency_large_write_persists_without_explicit_save() {
    if !require_fuse_or_skip("e2e_crash_consistency_large_write_persists_without_explicit_save") {
        return;
    }
    lock_fuse_test!("e2e_crash_consistency_large_write_persists_without_explicit_save");
    let test_start = Instant::now();
    log_phase!("START: e2e_crash_consistency_large_write_persists_without_explicit_save");

    // (FUSE availability checked above)

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_crash_consistency_large_write_persists_without_explicit_save",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let data = generate_test_data(6 * 1024 * 1024, 0xC0FF_EE01);
    let expected_hash = sha256_hex(&data);
    let path = mountpoint.join("crash_large.bin");

    log_step!(
        "Writing crash_large.bin ({} bytes)...",
        format_bytes(data.len() as u64)
    );
    {
        use std::io::Write as _;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)
            .expect("open crash_large.bin");
        // Incremental writes to exercise staging + flush path.
        let mut pos: usize = 0;
        while pos < data.len() {
            let end = std::cmp::min(pos + 256 * 1024, data.len());
            f.write_all(&data[pos..end]).expect("write chunk");
            pos = end;
        }
        f.sync_all().expect("sync_all");
    }

    log_step!("Unmounting FUSE...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_step!("Restarting core WITHOUT explicit save...");
    vault.restart_core_unlocked_without_save();

    let node_id =
        catalog_find_child(&vault.adapter, None, "crash_large.bin").expect("find crash_large.bin");
    let downloaded = catalog_download(&vault.adapter, node_id);
    assert_eq!(downloaded.len(), data.len(), "size mismatch after restart");
    assert_eq!(
        sha256_hex(&downloaded),
        expected_hash,
        "hash mismatch after restart"
    );

    log_phase!(format!(
        "✅ Crash-consistency large write passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Crash-consistency: atomic overwrite via temp+rename must survive a restart without requiring
/// an explicit vault.save() call.
#[tokio::test]
async fn e2e_crash_consistency_atomic_overwrite_persists_without_explicit_save() {
    if !require_fuse_or_skip(
        "e2e_crash_consistency_atomic_overwrite_persists_without_explicit_save",
    ) {
        return;
    }
    lock_fuse_test!("e2e_crash_consistency_atomic_overwrite_persists_without_explicit_save");
    let test_start = Instant::now();
    log_phase!("START: e2e_crash_consistency_atomic_overwrite_persists_without_explicit_save");

    // (FUSE availability checked above)

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "e2e_crash_consistency_atomic_overwrite_persists_without_explicit_save",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let target = mountpoint.join("atomic.bin");
    let initial = generate_test_data(1024 * 1024, 0xC0FF_EE10);
    let overwrite = generate_test_data(2 * 1024 * 1024, 0xC0FF_EE11);
    let overwrite_hash = sha256_hex(&overwrite);

    std::fs::write(&target, &initial).expect("write initial atomic.bin");
    {
        let f = std::fs::OpenOptions::new()
            .read(true)
            .open(&target)
            .expect("open initial");
        f.sync_all().expect("sync initial");
    }

    // POSIX atomic replace pattern.
    let tmp = mountpoint.join(".atomic.tmp");
    std::fs::write(&tmp, &overwrite).expect("write tmp");
    {
        let f = std::fs::OpenOptions::new()
            .read(true)
            .open(&tmp)
            .expect("open tmp");
        f.sync_all().expect("sync tmp");
    }
    std::fs::rename(&tmp, &target).expect("atomic rename");

    log_step!("Unmounting FUSE...");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    log_step!("Restarting core WITHOUT explicit save...");
    vault.restart_core_unlocked_without_save();

    let node_id = catalog_find_child(&vault.adapter, None, "atomic.bin").expect("find atomic.bin");
    let downloaded = catalog_download(&vault.adapter, node_id);
    assert_eq!(
        downloaded.len(),
        overwrite.len(),
        "size mismatch after restart"
    );
    assert_eq!(
        sha256_hex(&downloaded),
        overwrite_hash,
        "hash mismatch after restart"
    );

    log_phase!(format!(
        "✅ Crash-consistency atomic overwrite passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Restore should fail on corrupted metadata and roll back any uploaded chunks/artifacts.
#[tokio::test]
async fn e2e_restore_rejects_corrupted_metadata_and_rolls_back() {
    if !require_fuse_or_skip("e2e_restore_rejects_corrupted_metadata_and_rolls_back") {
        return;
    }
    lock_fuse_test!("e2e_restore_rejects_corrupted_metadata_and_rolls_back");
    let test_start = Instant::now();
    log_phase!("START: e2e_restore_rejects_corrupted_metadata_and_rolls_back");

    // (FUSE availability checked above)

    let vault = TestVault::new_unlocked_with_master();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");
    let fuse = start_fuse_or_skip!(
        "e2e_restore_rejects_corrupted_metadata_and_rolls_back",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    // Seed some content so backup has chunks.
    std::fs::write(
        mountpoint.join("seed.bin"),
        generate_test_data(512 * 1024, 0x5151_0001),
    )
    .expect("write seed.bin");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    let backup = create_local_backup_artifact(&vault);

    // Erase to blank.
    erase_storage(&vault);
    assert!(
        list_regular_files(&vault.storage_root).is_empty(),
        "storage not blank after erase"
    );

    // Start restore and upload chunks.
    let restore_id = restore_start(&vault, backup.dir.path());
    restore_upload_all_chunks(&vault, &restore_id, backup.dir.path(), &backup.chunk_names);

    // Corrupt metadata so decrypt fails.
    let mut meta_bytes =
        std::fs::read(backup.dir.path().join("metadata.enc")).expect("read metadata.enc");
    assert!(!meta_bytes.is_empty(), "metadata.enc empty");
    let last = meta_bytes.len() - 1;
    meta_bytes[last] ^= 0x01;
    let bad_meta_b64 = general_purpose::STANDARD.encode(meta_bytes);

    let commit = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "restore:local:commit".to_string(),
            serde_json::json!({
                "restore_id": restore_id,
                "metadata": bad_meta_b64,
                "master_salt": backup.master_salt_b64,
                "master_verify": backup.master_verify_b64,
            }),
        ))
    };
    assert!(
        !commit.is_ok(),
        "expected restore:local:commit to fail on corrupted metadata"
    );

    let files_after = list_regular_files(&vault.storage_root);
    assert!(
        files_after.is_empty(),
        "expected rollback to blank storage, found: {files_after:?}"
    );

    log_phase!(format!(
        "✅ Corrupted-metadata restore rollback passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Restore should fail on wrong master password and roll back any uploaded chunks/artifacts.
#[tokio::test]
async fn e2e_restore_rejects_wrong_master_password_and_rolls_back() {
    if !require_fuse_or_skip("e2e_restore_rejects_wrong_master_password_and_rolls_back") {
        return;
    }
    lock_fuse_test!("e2e_restore_rejects_wrong_master_password_and_rolls_back");
    let test_start = Instant::now();
    log_phase!("START: e2e_restore_rejects_wrong_master_password_and_rolls_back");

    // (FUSE availability checked above)

    let vault = TestVault::new_unlocked_with_master();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");
    let fuse = start_fuse_or_skip!(
        "e2e_restore_rejects_wrong_master_password_and_rolls_back",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    std::fs::write(
        mountpoint.join("seed.bin"),
        generate_test_data(512 * 1024, 0x5151_0002),
    )
    .expect("write seed.bin");
    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    let backup = create_local_backup_artifact(&vault);

    erase_storage(&vault);
    assert!(
        list_regular_files(&vault.storage_root).is_empty(),
        "storage not blank after erase"
    );

    let restore_id = restore_start(&vault, backup.dir.path());
    restore_upload_all_chunks(&vault, &restore_id, backup.dir.path(), &backup.chunk_names);

    // Set wrong master password into adapter.
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        a.set_master_key(Some("wrong-password".to_string()));
    }

    let meta_bytes =
        std::fs::read(backup.dir.path().join("metadata.enc")).expect("read metadata.enc");
    let meta_b64 = general_purpose::STANDARD.encode(meta_bytes);

    let commit = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "restore:local:commit".to_string(),
            serde_json::json!({
                "restore_id": restore_id,
                "metadata": meta_b64,
                "master_salt": backup.master_salt_b64,
                "master_verify": backup.master_verify_b64,
            }),
        ))
    };
    assert!(
        !commit.is_ok(),
        "expected restore:local:commit to fail with wrong master password"
    );

    let files_after = list_regular_files(&vault.storage_root);
    assert!(
        files_after.is_empty(),
        "expected rollback to blank storage, found: {files_after:?}"
    );

    log_phase!(format!(
        "✅ Wrong-master restore rollback passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Concurrency: two threads perform atomic replace concurrently; result must be exactly one version
/// (no mixed content) and must persist after restart.
#[tokio::test]
async fn e2e_concurrent_atomic_overwrites_are_consistent_and_persist() {
    if !require_fuse_or_skip("e2e_concurrent_atomic_overwrites_are_consistent_and_persist") {
        return;
    }
    lock_fuse_test!("e2e_concurrent_atomic_overwrites_are_consistent_and_persist");
    let test_start = Instant::now();
    log_phase!("START: e2e_concurrent_atomic_overwrites_are_consistent_and_persist");

    // (FUSE availability checked above)

    let vault = TestVault::new_unlocked();
    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging = dir.path().join("staging");
    let fuse = start_fuse_or_skip!(
        "e2e_concurrent_atomic_overwrites_are_consistent_and_persist",
        mountpoint.clone(),
        staging,
        vault.adapter.clone(),
        "start_fuse_server"
    );
    tokio::time::sleep(Duration::from_millis(300)).await;

    let data_a = generate_test_data(2 * 1024 * 1024, 0xA11A_0001);
    let data_b = generate_test_data(2 * 1024 * 1024, 0xB22B_0001);
    let hash_a = sha256_hex(&data_a);
    let hash_b = sha256_hex(&data_b);

    let target = mountpoint.join("concurrent.bin");
    let barrier = Arc::new(Barrier::new(3));

    let mp1 = mountpoint.clone();
    let b1 = barrier.clone();
    let t1 = thread::spawn(move || {
        b1.wait();
        let tmp = mp1.join(".tmp_a");
        std::fs::write(&tmp, data_a).expect("write tmp_a");
        std::fs::rename(&tmp, mp1.join("concurrent.bin")).expect("rename tmp_a -> concurrent.bin");
    });

    let mp2 = mountpoint.clone();
    let b2 = barrier.clone();
    let t2 = thread::spawn(move || {
        b2.wait();
        let tmp = mp2.join(".tmp_b");
        std::fs::write(&tmp, data_b).expect("write tmp_b");
        std::fs::rename(&tmp, mp2.join("concurrent.bin")).expect("rename tmp_b -> concurrent.bin");
    });

    barrier.wait();
    t1.join().expect("join writer A");
    t2.join().expect("join writer B");

    let final_bytes = std::fs::read(&target).expect("read concurrent.bin");
    let final_hash = sha256_hex(&final_bytes);
    assert!(
        final_hash == hash_a || final_hash == hash_b,
        "concurrent result must match A or B exactly (no corruption). got={final_hash}"
    );

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    vault.restart_core_unlocked_without_save();
    let node_id =
        catalog_find_child(&vault.adapter, None, "concurrent.bin").expect("find concurrent.bin");
    let downloaded = catalog_download(&vault.adapter, node_id);
    assert_eq!(
        sha256_hex(&downloaded),
        final_hash,
        "hash changed after restart"
    );

    log_phase!(format!(
        "✅ Concurrent overwrite consistency passed! Total time: {}",
        format_duration(test_start.elapsed())
    )
    .as_str());
}

/// Helper: Generate deterministic test data
fn generate_test_data(size: usize, seed: u64) -> Vec<u8> {
    use rand::rngs::StdRng;
    use rand::{RngCore, SeedableRng};

    let mut rng = StdRng::seed_from_u64(seed);
    let mut data = vec![0u8; size];
    rng.fill_bytes(&mut data);
    data
}

/// Helper: Get total size of directory in bytes
fn get_dir_size(path: &std::path::Path) -> u64 {
    let mut total_size = 0u64;

    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let metadata = entry.metadata();
            match metadata {
                Ok(meta) if meta.is_file() => {
                    total_size += meta.len();
                }
                Ok(meta) if meta.is_dir() => {
                    total_size += get_dir_size(&entry.path());
                }
                _ => {}
            }
        }
    }

    total_size
}

fn list_regular_files(root: &Path) -> Vec<PathBuf> {
    fn walk(out: &mut Vec<PathBuf>, dir: &Path) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            let ft = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if ft.is_dir() {
                walk(out, &p);
            } else {
                out.push(p);
            }
        }
    }

    let mut out = Vec::new();
    walk(&mut out, root);
    out.sort();
    out
}

fn backup_chunk_path(chunks_root: &Path, chunk_name: &str) -> PathBuf {
    chunks_root
        .join(&chunk_name[0..1])
        .join(&chunk_name[1..3])
        .join(chunk_name)
}

fn write_backup_chunk(chunks_root: &Path, chunk_name: &str, bytes: &[u8]) {
    let p = backup_chunk_path(chunks_root, chunk_name);
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&p, bytes).expect("write backup chunk");
}

struct LocalBackupArtifact {
    dir: tempfile::TempDir,
    chunk_names: Vec<String>,
    master_salt_b64: String,
    master_verify_b64: String,
}

fn create_local_backup_artifact(vault: &TestVault) -> LocalBackupArtifact {
    let backup_dir = tempfile::tempdir().expect("backup tempdir");
    let chunks_root = backup_dir.path().join("chunks");
    std::fs::create_dir_all(&chunks_root).expect("mkdir chunks");

    let (backup_id, chunk_count) = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "backup:local:start".to_string(),
            serde_json::json!({}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("backup:local:start failed: {res:?}");
        };
        let backup_id = result
            .get("backup_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let chunk_count = result
            .get("chunk_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        (backup_id, chunk_count)
    };
    assert!(
        !backup_id.is_empty(),
        "backup:local:start returned empty backup_id"
    );

    let mut chunk_names: Vec<String> = Vec::new();
    for i in 0..chunk_count {
        let (chunk_name, bytes) = {
            let mut a = vault.adapter.lock().expect("adapter lock");
            let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
                "backup:local:downloadChunk".to_string(),
                serde_json::json!({"backup_id": backup_id.clone(), "chunk_index": i}),
            ));
            let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
                panic!("backup:local:downloadChunk failed: {res:?}");
            };
            let name = result
                .get("chunk_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let data_b64 = result.get("data").and_then(|v| v.as_str()).unwrap_or("");
            let bytes = general_purpose::STANDARD
                .decode(data_b64)
                .expect("chunk bytes base64 decode");
            (name, bytes)
        };

        assert_eq!(chunk_name.len(), 64, "invalid chunk_name length");
        chunk_names.push(chunk_name.clone());
        write_backup_chunk(&chunks_root, &chunk_name, &bytes);
    }

    let (meta_enc, master_salt_b64, master_verify_b64) = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "backup:local:getMetadata".to_string(),
            serde_json::json!({"backup_id": backup_id.clone()}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("backup:local:getMetadata failed: {res:?}");
        };
        let meta_b64 = result
            .get("metadata")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let master_salt_b64 = result
            .get("master_salt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let master_verify_b64 = result
            .get("master_verify")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let meta_enc = general_purpose::STANDARD
            .decode(meta_b64)
            .expect("metadata base64 decode");
        (meta_enc, master_salt_b64, master_verify_b64)
    };
    std::fs::write(backup_dir.path().join("metadata.enc"), &meta_enc).expect("write metadata.enc");

    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "backup:local:finish".to_string(),
            serde_json::json!({"backup_id": backup_id}),
        ));
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("backup:local:finish failed: {other:?}"),
        }
    }

    LocalBackupArtifact {
        dir: backup_dir,
        chunk_names,
        master_salt_b64,
        master_verify_b64,
    }
}

fn erase_storage(vault: &TestVault) {
    let erase_token = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        let res = a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "erase:confirm".to_string(),
            serde_json::json!({}),
        ));
        let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
            panic!("erase:confirm failed: {res:?}");
        };
        result
            .get("erase_token")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    assert!(
        !erase_token.is_empty(),
        "erase:confirm returned empty erase_token"
    );

    let res = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "erase:execute".to_string(),
            serde_json::json!({
                "erase_token": erase_token,
                "master_password": vault.master_password.clone(),
            }),
        ))
    };
    match res {
        chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
        other => panic!("erase:execute failed: {other:?}"),
    }
}

fn restore_start(vault: &TestVault, backup_path: &Path) -> String {
    {
        let mut a = vault.adapter.lock().expect("adapter lock");
        a.set_master_key(Some(vault.master_password.clone()));
    }

    let res = {
        let mut a = vault.adapter.lock().expect("adapter lock");
        a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
            "restore:local:start".to_string(),
            serde_json::json!({"backup_path": backup_path.to_string_lossy()}),
        ))
    };
    let chromvoid_core::rpc::types::RpcResponse::Success { result, .. } = res else {
        panic!("restore:local:start failed: {res:?}");
    };
    let restore_id = result
        .get("restore_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    assert!(
        !restore_id.is_empty(),
        "restore:local:start returned empty restore_id"
    );
    restore_id
}

fn restore_upload_all_chunks(
    vault: &TestVault,
    restore_id: &str,
    backup_dir: &Path,
    chunk_names: &[String],
) {
    let chunks_root = backup_dir.join("chunks");
    for (idx, name) in chunk_names.iter().enumerate() {
        let chunk_path = backup_chunk_path(&chunks_root, name);
        let bytes = std::fs::read(&chunk_path).expect("read backup chunk");
        let data_b64 = general_purpose::STANDARD.encode(bytes);
        let is_last = idx + 1 == chunk_names.len();

        let res = {
            let mut a = vault.adapter.lock().expect("adapter lock");
            a.handle(&chromvoid_core::rpc::types::RpcRequest::new(
                "restore:local:uploadChunk".to_string(),
                serde_json::json!({
                    "restore_id": restore_id,
                    "chunk_index": idx as u64,
                    "chunk_name": name,
                    "data": data_b64,
                    "is_last": is_last,
                }),
            ))
        };
        match res {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            other => panic!("restore:local:uploadChunk failed: {other:?}"),
        }
    }
}
