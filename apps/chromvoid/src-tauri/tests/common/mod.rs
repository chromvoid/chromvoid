#![allow(dead_code)]

use chromvoid_core::rpc::types::{CatalogListResponse, RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::io::Read as _;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use chromvoid_lib::{detect_fuse_driver, CoreAdapter, FuseDriverStatus, LocalCoreAdapter};

pub struct TestVault {
    _tmp: tempfile::TempDir,
    pub storage_root: PathBuf,
    pub adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,

    pub vault_password: String,
    pub master_password: String,
}

impl TestVault {
    pub fn new_unlocked() -> Self {
        let tmp = tempfile::tempdir().expect("tempdir");
        let storage_root = tmp.path().join("storage");

        let vault_password = "test".to_string();
        let master_password = "test-master-key".to_string();

        let mut adapter =
            LocalCoreAdapter::new(storage_root.clone()).expect("LocalCoreAdapter::new");
        adapter.set_master_key(Some(master_password.clone()));

        let unlock = RpcRequest::new(
            "vault:unlock".to_string(),
            json!({"password": vault_password}),
        );
        match adapter.handle(&unlock) {
            RpcResponse::Success { .. } => {}
            other => panic!("vault:unlock failed in test setup: {other:?}"),
        }

        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> = Arc::new(Mutex::new(Box::new(adapter)));

        Self {
            _tmp: tmp,
            storage_root,
            adapter,

            vault_password,
            master_password,
        }
    }

    pub fn new_unlocked_with_master() -> Self {
        let tmp = tempfile::tempdir().expect("tempdir");
        let storage_root = tmp.path().join("storage");

        let vault_password = "test".to_string();
        let master_password = "correct horse battery staple".to_string();

        let mut adapter =
            LocalCoreAdapter::new(storage_root.clone()).expect("LocalCoreAdapter::new");
        adapter.set_master_key(Some(master_password.clone()));

        let setup = RpcRequest::new(
            "master:setup".to_string(),
            json!({"master_password": master_password}),
        );
        match adapter.handle(&setup) {
            RpcResponse::Success { .. } => {}
            other => panic!("master:setup failed in test setup: {other:?}"),
        }

        let unlock = RpcRequest::new(
            "vault:unlock".to_string(),
            json!({"password": vault_password}),
        );
        match adapter.handle(&unlock) {
            RpcResponse::Success { .. } => {}
            other => panic!("vault:unlock failed in test setup: {other:?}"),
        }

        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> = Arc::new(Mutex::new(Box::new(adapter)));

        Self {
            _tmp: tmp,
            storage_root,
            adapter,
            vault_password,
            master_password,
        }
    }

    pub fn save(&self) {
        let mut a = self.adapter.lock().expect("adapter lock");
        a.save().expect("adapter.save");
    }

    /// Simulate an app restart: close the current core adapter and re-open
    /// a new LocalCoreAdapter pointing at the same storage.
    pub fn restart_core_unlocked(&self) {
        // Persist any pending changes.
        self.save();

        let mut adapter = LocalCoreAdapter::new(self.storage_root.clone())
            .expect("LocalCoreAdapter::new (restart)");
        adapter.set_master_key(Some(self.master_password.clone()));

        let unlock = RpcRequest::new(
            "vault:unlock".to_string(),
            json!({"password": self.vault_password}),
        );
        match adapter.handle(&unlock) {
            RpcResponse::Success { .. } => {}
            other => panic!("vault:unlock failed on restart: {other:?}"),
        }

        let mut guard = self.adapter.lock().expect("adapter lock");
        *guard = Box::new(adapter);
    }

    /// Simulate a hard crash / power loss: re-open a new core adapter without
    /// calling save() on the previous instance.
    pub fn restart_core_unlocked_without_save(&self) {
        let mut adapter = LocalCoreAdapter::new(self.storage_root.clone())
            .expect("LocalCoreAdapter::new (restart without save)");
        adapter.set_master_key(Some(self.master_password.clone()));

        let unlock = RpcRequest::new(
            "vault:unlock".to_string(),
            json!({"password": self.vault_password.clone()}),
        );
        match adapter.handle(&unlock) {
            RpcResponse::Success { .. } => {}
            other => panic!("vault:unlock failed on restart without save: {other:?}"),
        }

        let mut guard = self.adapter.lock().expect("adapter lock");
        *guard = Box::new(adapter);
    }
}

pub fn catalog_list(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    path: Option<&str>,
) -> CatalogListResponse {
    let path_val = match path {
        std::option::Option::None => serde_json::Value::Null,
        Some("/") => serde_json::Value::Null,
        Some(p) => serde_json::Value::String(p.to_string()),
    };

    let mut a = adapter.lock().expect("adapter lock");
    let res = a.handle(&RpcRequest::new(
        "catalog:list".to_string(),
        json!({"path": path_val, "include_hidden": null}),
    ));
    let RpcResponse::Success { result, .. } = res else {
        panic!("catalog:list failed: {res:?}");
    };
    serde_json::from_value::<CatalogListResponse>(result).expect("parse CatalogListResponse")
}

pub fn catalog_find_child(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    parent_path: Option<&str>,
    name: &str,
) -> Option<u64> {
    let list = catalog_list(adapter, parent_path);
    list.items
        .iter()
        .find(|it| it.name == name)
        .map(|it| it.node_id)
}

pub fn catalog_download(adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>, node_id: u64) -> Vec<u8> {
    let mut a = adapter.lock().expect("adapter lock");
    let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": node_id}));
    match a.handle_with_stream(&req, None) {
        RpcReply::Stream(mut out) => {
            let mut buf = Vec::new();
            out.reader
                .read_to_end(&mut buf)
                .expect("read download stream");
            buf
        }
        RpcReply::Json(r) => panic!("expected stream reply for catalog:download, got JSON: {r:?}"),
    }
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    let digest = h.finalize();

    let mut out = String::with_capacity(64);
    for b in digest {
        use std::fmt::Write as _;
        let _ = write!(&mut out, "{:02x}", b);
    }
    out
}

pub fn deterministic_bytes(seed: u64, len: usize) -> Vec<u8> {
    use rand::{RngCore as _, SeedableRng as _};
    let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
    let mut out = vec![0u8; len];
    rng.fill_bytes(&mut out);
    out
}

pub fn require_fuse_driver(test_name: &str) -> bool {
    match detect_fuse_driver() {
        FuseDriverStatus::Available => true,
        other => {
            if std::env::var("CHROMVOID_REQUIRE_FUSE").ok().as_deref() == Some("1") {
                panic!("FUSE driver required for {test_name}, got {other:?}");
            }
            eprintln!("SKIP {test_name}: FUSE driver not available ({other:?})");
            false
        }
    }
}

pub fn skip_fuse_mount_error(test_name: &str, err: &str) -> bool {
    if std::env::var("CHROMVOID_REQUIRE_FUSE").ok().as_deref() == Some("1") {
        return false;
    }

    eprintln!("SKIP {test_name}: FUSE mount unavailable ({err})");
    true
}

pub fn acquire_fuse_test_guard(test_name: &str) -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|_| panic!("failed to acquire FUSE test lock for {test_name}"))
}

#[cfg(target_os = "macos")]
pub fn finder_delete_file(path: &std::path::Path) -> std::process::Output {
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

    std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .arg("--")
        .arg(path.as_os_str())
        .output()
        .expect("run osascript finder delete")
}

#[cfg(target_os = "macos")]
pub fn finder_list_items(path: &std::path::Path) -> std::process::Output {
    let script = [
        "on run argv",
        "set p to item 1 of argv",
        "with timeout of 15 seconds",
        "tell application \"Finder\"",
        "set targetFolder to POSIX file p as alias",
        "set itemNames to name of every item of targetFolder",
        "set AppleScript's text item delimiters to linefeed",
        "return itemNames as text",
        "end tell",
        "end timeout",
        "end run",
    ]
    .join("\n");

    std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .arg("--")
        .arg(path.as_os_str())
        .output()
        .expect("run osascript finder list")
}

#[cfg(target_os = "macos")]
pub fn finder_duplicate_with_replace(
    source_path: &std::path::Path,
    destination_folder_path: &std::path::Path,
) -> std::process::Output {
    let script = [
        "on run argv",
        "set srcPath to item 1 of argv",
        "set dstFolderPath to item 2 of argv",
        "with timeout of 20 seconds",
        "tell application \"Finder\"",
        "set srcItem to POSIX file srcPath as alias",
        "set dstFolder to POSIX file dstFolderPath as alias",
        "duplicate srcItem to dstFolder with replacing",
        "end tell",
        "end timeout",
        "end run",
    ]
    .join("\n");

    std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .arg("--")
        .arg(source_path.as_os_str())
        .arg(destination_folder_path.as_os_str())
        .output()
        .expect("run osascript finder duplicate with replacing")
}

#[cfg(target_os = "macos")]
pub fn finder_output_detail(out: &std::process::Output) -> String {
    format!(
        "stdout={:?} stderr={:?}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
}

#[cfg(target_os = "macos")]
pub fn finder_automation_unavailable(stderr: &str) -> bool {
    stderr.contains("-1743")
        || stderr.contains("-1712")
        || stderr.contains("-4960")
        || stderr.contains("Not authorized")
        || stderr.contains("AppleEvent timed out")
        || stderr.contains("not allowed assistive access")
        || stderr.contains("Application isn’t running")
}

#[cfg(target_os = "macos")]
pub fn host_trash_candidates(filename: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();

    if let Some(home) = std::env::var_os("HOME") {
        out.push(PathBuf::from(home).join(".Trash").join(filename));
    }

    let uid = unsafe { libc::getuid() };
    out.push(
        PathBuf::from("/.Trashes")
            .join(uid.to_string())
            .join(filename),
    );
    out.push(PathBuf::from("/.Trashes").join(filename));

    out
}
