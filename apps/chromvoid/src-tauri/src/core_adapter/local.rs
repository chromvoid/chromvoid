use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use chromvoid_core::catalog::CatalogMediaInfo;
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
use chromvoid_core::license::{BuildPolicy, LicenseStore};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    CatalogMediaInspectSnapshot, RpcInputStream, RpcReply, RpcRouter,
};
use chromvoid_core::storage::Storage;
use chromvoid_core::vault::{VaultRekeyProgress, VaultRekeyRequest};
use chromvoid_core::wallet::WalletRuntimeConfig;
use serde_json::Value;

use super::types::{CoreAdapter, CoreMode};

pub struct LocalCoreAdapter {
    router: RpcRouter,
}

fn test_keystore_for_storage(
    storage_root: &std::path::Path,
) -> Result<Arc<InMemoryKeystore>, String> {
    static TEST_KEYSTORES: OnceLock<Mutex<HashMap<String, Arc<InMemoryKeystore>>>> =
        OnceLock::new();

    let key = std::fs::canonicalize(storage_root)
        .unwrap_or_else(|_| storage_root.to_path_buf())
        .to_string_lossy()
        .to_string();
    let keystores = TEST_KEYSTORES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = keystores
        .lock()
        .map_err(|_| "test keystore map poisoned".to_string())?;
    Ok(guard
        .entry(key)
        .or_insert_with(|| Arc::new(InMemoryKeystore::new()))
        .clone())
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
        let license_root = storage_root.join(".device-license");
        Self::new_with_license_store(storage_root, license_root, BuildPolicy::default_for_build())
    }

    pub fn new_with_license_store(
        storage_root: PathBuf,
        license_root: PathBuf,
        build_policy: BuildPolicy,
    ) -> Result<Self, String> {
        let license_store = LicenseStore::new(license_root, build_policy);
        Self::new_with_license_store_instance(storage_root, license_store)
    }

    #[cfg(test)]
    pub(crate) fn new_with_test_license_store(
        storage_root: PathBuf,
        license_store: LicenseStore,
    ) -> Result<Self, String> {
        Self::new_with_license_store_instance(storage_root, license_store)
    }

    fn new_with_license_store_instance(
        storage_root: PathBuf,
        license_store: LicenseStore,
    ) -> Result<Self, String> {
        let storage = Storage::new(&storage_root).map_err(|e| e.to_string())?;
        let router = if std::env::var_os("CHROMVOID_TEST_INMEMORY_KEYSTORE").is_some() {
            let ks = test_keystore_for_storage(&storage_root)?;
            RpcRouter::new(storage)
                .with_keystore(ks)
                .with_license_store(license_store)
        } else {
            #[cfg(target_os = "android")]
            {
                RpcRouter::new(storage)
                    .with_keystore(Arc::new(AndroidKeystore::new()))
                    .with_license_store(license_store)
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
                RpcRouter::new(storage)
                    .with_keystore(Arc::new(ks))
                    .with_license_store(license_store)
            }
            #[cfg(not(any(
                target_os = "android",
                target_os = "macos",
                target_os = "windows",
                target_os = "ios",
                all(target_os = "linux", not(target_env = "musl"))
            )))]
            {
                let ks = test_keystore_for_storage(&storage_root)?;
                RpcRouter::new(storage)
                    .with_keystore(ks)
                    .with_license_store(license_store)
            }
        };
        let router = router.with_wallet_runtime_config(wallet_runtime_config_from_env());

        Ok(Self { router })
    }
}

fn wallet_runtime_config_from_env() -> WalletRuntimeConfig {
    WalletRuntimeConfig {
        wallet_phase1_enabled: env_flag("CHROMVOID_WALLET_PHASE1_ENABLED"),
        wallet_core_broadcast_enabled: env_flag("CHROMVOID_WALLET_CORE_BROADCAST_ENABLED"),
    }
}

fn env_flag(name: &str) -> bool {
    std::env::var(name)
        .map(|value| {
            matches!(
                value.as_str(),
                "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"
            )
        })
        .unwrap_or(false)
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

    fn rekey_vault(
        &mut self,
        request: VaultRekeyRequest,
        cancel_requested: &(dyn Fn() -> bool + Send + Sync),
        progress: &mut dyn FnMut(VaultRekeyProgress),
    ) -> Option<RpcResponse> {
        Some(self.router.handle_vault_rekey(
            &serde_json::json!({
                "current_password": request.current_password,
                "new_password": request.new_password,
            }),
            cancel_requested,
            progress,
        ))
    }

    fn snapshot_catalog_media_inspect(
        &mut self,
        node_id: u64,
    ) -> Option<Result<CatalogMediaInspectSnapshot, RpcResponse>> {
        Some(
            self.router
                .snapshot_catalog_media_inspect(node_id)
                .map_err(|error| error.into_rpc_response()),
        )
    }

    fn commit_catalog_media_inspect(
        &mut self,
        snapshot: &CatalogMediaInspectSnapshot,
        media_info: Option<CatalogMediaInfo>,
        media_inspected_revision: u64,
    ) -> Option<RpcResponse> {
        Some(
            self.router
                .commit_catalog_media_inspect(snapshot, media_info, media_inspected_revision)
                .map(RpcResponse::success)
                .unwrap_or_else(|error| error.into_rpc_response()),
        )
    }

    fn snapshot_catalog_derivative_write(
        &mut self,
        request: CatalogDerivativeWriteRequest,
    ) -> Option<Result<CatalogDerivativeWriteSnapshot, RpcResponse>> {
        Some(
            self.router
                .snapshot_catalog_derivative_write(request)
                .map_err(|error| error.into_rpc_response()),
        )
    }

    fn commit_catalog_derivative_write(
        &mut self,
        snapshot: &CatalogDerivativeWriteSnapshot,
        write_result: &CatalogDerivativeWriteResult,
    ) -> Option<RpcResponse> {
        Some(
            self.router
                .commit_catalog_derivative_write(snapshot, write_result)
                .map(RpcResponse::success)
                .unwrap_or_else(|error| error.into_rpc_response()),
        )
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
