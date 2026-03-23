use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

#[cfg(target_os = "android")]
use chromvoid_core::crypto::keystore::AndroidKeystore;
#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    target_os = "ios",
    all(target_os = "linux", not(target_env = "musl"))
))]
use chromvoid_core::crypto::keystore::KeyringKeystore;
use chromvoid_core::crypto::keystore::{InMemoryKeystore, Keystore};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use serde_json::Value;

use super::types::{CoreAdapter, CoreMode};

pub struct LocalCoreAdapter {
    router: RpcRouter,
}

fn test_keystore_for_storage(storage_root: &std::path::Path) -> Arc<InMemoryKeystore> {
    static TEST_KEYSTORES: OnceLock<Mutex<HashMap<String, Arc<InMemoryKeystore>>>> =
        OnceLock::new();

    let key = std::fs::canonicalize(storage_root)
        .unwrap_or_else(|_| storage_root.to_path_buf())
        .to_string_lossy()
        .to_string();
    let keystores = TEST_KEYSTORES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = keystores.lock().expect("test keystore map poisoned");
    guard
        .entry(key)
        .or_insert_with(|| Arc::new(InMemoryKeystore::new()))
        .clone()
}

#[cfg_attr(not(target_os = "ios"), allow(dead_code))]
fn clear_orphaned_storage_if_pepper_missing(
    storage: &Storage,
    keystore: &dyn Keystore,
) -> Result<bool, String> {
    let has_chunks = storage.has_any_chunk().map_err(|e| e.to_string())?;
    if !has_chunks {
        return Ok(false);
    }

    let has_pepper = keystore
        .load_storage_pepper()
        .map_err(|e| format!("keystore check failed: {e}"))?
        .is_some();
    if has_pepper {
        return Ok(false);
    }

    storage
        .erase_all()
        .map_err(|e| format!("failed to erase orphaned storage: {e}"))?;
    let _ = keystore.delete_storage_pepper();
    Ok(true)
}

impl LocalCoreAdapter {
    pub fn new(storage_root: PathBuf) -> Result<Self, String> {
        let storage = Storage::new(&storage_root).map_err(|e| e.to_string())?;
        let router = if std::env::var_os("CHROMVOID_TEST_INMEMORY_KEYSTORE").is_some() {
            let ks = test_keystore_for_storage(&storage_root);
            RpcRouter::new(storage).with_keystore(ks)
        } else {
            #[cfg(target_os = "android")]
            {
                RpcRouter::new(storage).with_keystore(Arc::new(AndroidKeystore::new()))
            }
            #[cfg(any(
                target_os = "macos",
                target_os = "windows",
                target_os = "ios",
                all(target_os = "linux", not(target_env = "musl"))
            ))]
            {
                let ks = KeyringKeystore::for_storage_path(&storage_root)
                    .map_err(|e| format!("keystore init failed: {e}"))?;
                #[cfg(target_os = "ios")]
                {
                    if clear_orphaned_storage_if_pepper_missing(&storage, &ks)? {
                        eprintln!(
                            "[chromvoid] iOS storage reset: chunks existed without storage pepper; \
                             local storage was erased"
                        );
                    }
                }
                RpcRouter::new(storage).with_keystore(Arc::new(ks))
            }
            #[cfg(not(any(
                target_os = "android",
                target_os = "macos",
                target_os = "windows",
                target_os = "ios",
                all(target_os = "linux", not(target_env = "musl"))
            )))]
            {
                let ks = test_keystore_for_storage(&storage_root);
                RpcRouter::new(storage).with_keystore(ks)
            }
        };

        Ok(Self { router })
    }
}

impl CoreAdapter for LocalCoreAdapter {
    fn mode(&self) -> CoreMode {
        CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        self.router.is_unlocked()
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.router.handle(req)
    }

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply {
        self.router.handle_with_stream(req, stream)
    }

    fn save(&mut self) -> Result<(), String> {
        self.router.save().map_err(|e| e.to_string())
    }

    fn take_events(&mut self) -> Vec<Value> {
        self.router.take_events()
    }

    fn set_master_key(&mut self, key: Option<String>) {
        self.router.set_master_key(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample_chunk_name() -> &'static str {
        "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef"
    }

    #[test]
    fn clears_orphaned_storage_when_pepper_missing() {
        let tmp = TempDir::new().expect("temp dir");
        let storage = Storage::new(tmp.path()).expect("storage");
        storage
            .write_chunk(sample_chunk_name(), b"test")
            .expect("chunk write");
        let ks = InMemoryKeystore::new();

        let erased = clear_orphaned_storage_if_pepper_missing(&storage, &ks).expect("clear");
        assert!(erased);
        assert!(!storage.has_any_chunk().expect("has_any_chunk"));
    }

    #[test]
    fn keeps_storage_when_pepper_exists() {
        let tmp = TempDir::new().expect("temp dir");
        let storage = Storage::new(tmp.path()).expect("storage");
        storage
            .write_chunk(sample_chunk_name(), b"test")
            .expect("chunk write");
        let ks = InMemoryKeystore::new();
        ks.store_storage_pepper([7u8; 32]).expect("store pepper");

        let erased = clear_orphaned_storage_if_pepper_missing(&storage, &ks).expect("clear");
        assert!(!erased);
        assert!(storage.has_any_chunk().expect("has_any_chunk"));
    }
}
