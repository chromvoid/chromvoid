use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use chromvoid_core::catalog::CatalogMediaInfo;
#[cfg(target_os = "android")]
use chromvoid_core::crypto::keystore::AndroidKeystore;
use chromvoid_core::crypto::keystore::InMemoryKeystore;
#[cfg(target_os = "ios")]
use chromvoid_core::crypto::keystore::IosKeystore;
#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    all(target_os = "linux", not(target_env = "musl"))
))]
use chromvoid_core::crypto::keystore::KeyringKeystore;
use chromvoid_core::license::{BuildPolicy, LicenseStore};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    CatalogMediaInspectSnapshot, RpcInputStream, RpcReply, RpcRouter, WalletBalanceExecution,
    WalletBalanceSnapshot, WalletHistoryExecution, WalletHistorySnapshot,
};
use chromvoid_core::storage::Storage;
use chromvoid_core::vault::{VaultRekeyProgress, VaultRekeyRequest};
use chromvoid_core::wallet::bitcoin::BitcoinChainProfile;
use chromvoid_core::wallet::ethereum::{EthereumChainProfile, ETHEREUM_NATIVE_TRANSFER_CAPABILITY};
use chromvoid_core::wallet::evm::EVM_CLEAR_SIGNING_CAPABILITY;
use chromvoid_core::wallet::ton::TonChainProfile;
use chromvoid_core::wallet::ton_v2::{
    TON_CONNECT_CAPABILITY, TON_CONTRACT_RAW_CACHE_CAPABILITY, TON_JETTON_CAPABILITY,
    TON_LEGACY_RESTORE_CAPABILITY,
};
use chromvoid_core::wallet::WalletRuntimeConfig;
use serde_json::Value;

use super::esplora::EsploraProvider;
use super::ton_center::TonCenterProvider;
use super::types::{CoreAdapter, CoreMode};

const DEFAULT_BTC_ESPLORA_URL: &str = "https://blockstream.info/api/";

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
                all(target_os = "linux", not(target_env = "musl"))
            ))]
            {
                let ks = KeyringKeystore::for_storage_path(&storage_root)
                    .map_err(|e| format!("keystore init failed: {e}"))?;
                RpcRouter::new(storage)
                    .with_keystore(Arc::new(ks))
                    .with_license_store(license_store)
            }
            #[cfg(target_os = "ios")]
            {
                let ks = IosKeystore::new().map_err(|e| format!("keystore init failed: {e}"))?;
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
        let wallet_runtime_config = wallet_runtime_config_from_env();
        let mut router = router.with_wallet_runtime_config(wallet_runtime_config.clone());
        if wallet_runtime_config.wallet_enabled {
            let provider = TonCenterProvider::mainnet().map_or_else(
                |error| {
                    eprintln!("[chromvoid] TON provider disabled: {error}");
                    TonChainProfile::unavailable()
                },
                |provider| TonChainProfile::new(Arc::new(provider)),
            );
            router = router.with_wallet_chain_profile(Arc::new(provider));
            let bitcoin_provider = EsploraProvider::mainnet_from_url(&btc_esplora_url_from_env())
                .map_or_else(
                    |error| {
                        eprintln!("[chromvoid] Bitcoin provider disabled: {error}");
                        BitcoinChainProfile::unavailable()
                    },
                    |provider| BitcoinChainProfile::new(Arc::new(provider)),
                );
            router = router.with_wallet_chain_profile(Arc::new(bitcoin_provider));
            router =
                router.with_wallet_chain_profile(Arc::new(EthereumChainProfile::unavailable()));
        }

        Ok(Self { router })
    }
}

fn wallet_runtime_config_from_env() -> WalletRuntimeConfig {
    wallet_runtime_config_from_sources(|name| std::env::var(name).ok(), wallet_compile_time_env)
}

#[cfg(test)]
fn wallet_runtime_config_from_lookup(
    lookup: impl Fn(&str) -> Option<String>,
) -> WalletRuntimeConfig {
    wallet_runtime_config_from_sources(lookup, |_| None)
}

fn wallet_runtime_config_from_sources(
    runtime_lookup: impl Fn(&str) -> Option<String>,
    compile_time_lookup: impl Fn(&str) -> Option<String>,
) -> WalletRuntimeConfig {
    let wallet_enabled = parse_wallet_env_bool(
        runtime_lookup("CHROMVOID_WALLET_ENABLED")
            .or_else(|| compile_time_lookup("CHROMVOID_WALLET_ENABLED"))
            .as_deref(),
    );
    let mut config = WalletRuntimeConfig::with_wallet_enabled(wallet_enabled);
    if parse_wallet_env_bool(compile_time_lookup("CHROMVOID_BUILD_WALLET_ETHEREUM").as_deref()) {
        config
            .enabled_capabilities
            .insert(ETHEREUM_NATIVE_TRANSFER_CAPABILITY.to_string());
        config
            .enabled_capabilities
            .insert(EVM_CLEAR_SIGNING_CAPABILITY.to_string());
    }
    for (build_key, capability) in [
        ("CHROMVOID_BUILD_TON_CONNECT", TON_CONNECT_CAPABILITY),
        ("CHROMVOID_BUILD_TON_JETTONS", TON_JETTON_CAPABILITY),
        (
            "CHROMVOID_BUILD_TON_LEGACY_RESTORE",
            TON_LEGACY_RESTORE_CAPABILITY,
        ),
        (
            "CHROMVOID_BUILD_TON_CONTRACT_RAW_CACHE",
            TON_CONTRACT_RAW_CACHE_CAPABILITY,
        ),
    ] {
        if parse_wallet_env_bool(compile_time_lookup(build_key).as_deref()) {
            config.enabled_capabilities.insert(capability.to_string());
        }
    }
    config
}

fn wallet_compile_time_env(name: &str) -> Option<String> {
    match name {
        "CHROMVOID_WALLET_ENABLED" => option_env!("CHROMVOID_WALLET_ENABLED"),
        "CHROMVOID_BTC_ESPLORA_URL" => option_env!("CHROMVOID_BTC_ESPLORA_URL"),
        "CHROMVOID_BUILD_WALLET_ETHEREUM" => option_env!("CHROMVOID_BUILD_WALLET_ETHEREUM"),
        "CHROMVOID_BUILD_TON_CONNECT" => option_env!("CHROMVOID_BUILD_TON_CONNECT"),
        "CHROMVOID_BUILD_TON_JETTONS" => option_env!("CHROMVOID_BUILD_TON_JETTONS"),
        "CHROMVOID_BUILD_TON_LEGACY_RESTORE" => {
            option_env!("CHROMVOID_BUILD_TON_LEGACY_RESTORE")
        }
        "CHROMVOID_BUILD_TON_CONTRACT_RAW_CACHE" => {
            option_env!("CHROMVOID_BUILD_TON_CONTRACT_RAW_CACHE")
        }
        _ => None,
    }
    .map(ToOwned::to_owned)
}

fn btc_esplora_url_from_env() -> String {
    btc_esplora_url_from_sources(
        std::env::var("CHROMVOID_BTC_ESPLORA_URL").ok(),
        wallet_compile_time_env("CHROMVOID_BTC_ESPLORA_URL"),
    )
}

fn btc_esplora_url_from_sources(
    runtime_value: Option<String>,
    compile_time_value: Option<String>,
) -> String {
    runtime_value
        .filter(|value| !value.trim().is_empty())
        .or_else(|| compile_time_value.filter(|value| !value.trim().is_empty()))
        .unwrap_or_else(|| DEFAULT_BTC_ESPLORA_URL.to_string())
}

fn parse_wallet_env_bool(value: Option<&str>) -> bool {
    value
        .and_then(|value| value.parse::<bool>().ok())
        .unwrap_or(false)
}

#[cfg(test)]
mod wallet_runtime_config_tests {
    use super::{
        btc_esplora_url_from_sources, wallet_runtime_config_from_lookup,
        wallet_runtime_config_from_sources, DEFAULT_BTC_ESPLORA_URL,
    };
    use chromvoid_core::wallet::ethereum::ETHEREUM_NATIVE_TRANSFER_CAPABILITY;
    use chromvoid_core::wallet::ton_v2::TON_CONNECT_CAPABILITY;

    fn lookup<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name| {
            pairs
                .iter()
                .find_map(|(key, value)| (*key == name).then(|| (*value).to_string()))
        }
    }

    #[test]
    fn wallet_runtime_config_defaults_closed() {
        let config = wallet_runtime_config_from_lookup(lookup(&[]));

        assert!(!config.wallet_enabled);
    }

    #[test]
    fn wallet_runtime_config_accepts_only_strict_true() {
        let config =
            wallet_runtime_config_from_lookup(lookup(&[("CHROMVOID_WALLET_ENABLED", "true")]));

        assert!(config.wallet_enabled);
    }

    #[test]
    fn wallet_runtime_config_invalid_values_fail_closed() {
        let config =
            wallet_runtime_config_from_lookup(lookup(&[("CHROMVOID_WALLET_ENABLED", "1")]));

        assert!(!config.wallet_enabled);
    }

    #[test]
    fn wallet_runtime_config_uses_compile_time_fallback() {
        let config = wallet_runtime_config_from_sources(
            lookup(&[]),
            lookup(&[("CHROMVOID_WALLET_ENABLED", "true")]),
        );

        assert!(config.wallet_enabled);
    }

    #[test]
    fn wallet_runtime_config_runtime_source_overrides_compile_time_fallback() {
        let config = wallet_runtime_config_from_sources(
            lookup(&[("CHROMVOID_WALLET_ENABLED", "false")]),
            lookup(&[("CHROMVOID_WALLET_ENABLED", "true")]),
        );

        assert!(!config.wallet_enabled);
    }

    #[test]
    fn wallet_feature_capabilities_are_compile_time_only_and_default_off() {
        let runtime_only = wallet_runtime_config_from_sources(
            lookup(&[
                ("CHROMVOID_WALLET_ENABLED", "true"),
                ("CHROMVOID_BUILD_WALLET_ETHEREUM", "true"),
                ("CHROMVOID_BUILD_TON_CONNECT", "true"),
            ]),
            lookup(&[]),
        );
        assert!(!runtime_only.capability_enabled(ETHEREUM_NATIVE_TRANSFER_CAPABILITY));
        assert!(!runtime_only.capability_enabled(TON_CONNECT_CAPABILITY));

        let build_enabled = wallet_runtime_config_from_sources(
            lookup(&[("CHROMVOID_WALLET_ENABLED", "true")]),
            lookup(&[
                ("CHROMVOID_BUILD_WALLET_ETHEREUM", "true"),
                ("CHROMVOID_BUILD_TON_CONNECT", "true"),
            ]),
        );
        assert!(build_enabled.capability_enabled(ETHEREUM_NATIVE_TRANSFER_CAPABILITY));
        assert!(build_enabled.capability_enabled(TON_CONNECT_CAPABILITY));
    }

    #[test]
    fn bitcoin_provider_defaults_to_public_mainnet_esplora() {
        let url = btc_esplora_url_from_sources(None, None);

        assert_eq!(url, DEFAULT_BTC_ESPLORA_URL);
    }

    #[test]
    fn bitcoin_provider_prefers_runtime_override() {
        let url = btc_esplora_url_from_sources(
            Some("https://runtime.example/api/".to_string()),
            Some("https://build.example/api/".to_string()),
        );

        assert_eq!(url, "https://runtime.example/api/");
    }

    #[test]
    fn bitcoin_provider_uses_compile_time_override_before_default() {
        let url = btc_esplora_url_from_sources(
            Some("  ".to_string()),
            Some("https://build.example/api/".to_string()),
        );

        assert_eq!(url, "https://build.example/api/");
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

    #[cfg(desktop)]
    fn resolve_env_runtime_for_spawn(
        &mut self,
        request: chromvoid_core::env_runtime::PrivateSpawnResolutionRequestV1,
    ) -> Option<
        chromvoid_core::env_runtime::EnvRuntimeResult<
            chromvoid_core::env_runtime::ResolvedEnvLeaseV1,
        >,
    > {
        Some(self.router.resolve_for_tauri_spawn(request))
    }

    fn rekey_vault(
        &mut self,
        request: VaultRekeyRequest,
        cancel_requested: &(dyn Fn() -> bool + Send + Sync),
        progress: &mut dyn FnMut(VaultRekeyProgress),
    ) -> Option<RpcResponse> {
        Some(self.router.handle_vault_rekey(
            &serde_json::json!({
                "current_password": request.current_password.as_str(),
                "new_password": request.new_password.as_str(),
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

    fn snapshot_wallet_balance(
        &mut self,
        data: &Value,
    ) -> Option<Result<Option<WalletBalanceSnapshot>, RpcResponse>> {
        Some(self.router.snapshot_wallet_balance_get(data))
    }

    fn commit_wallet_balance(&mut self, execution: WalletBalanceExecution) -> Option<RpcResponse> {
        Some(self.router.commit_wallet_balance_get(execution))
    }

    fn snapshot_wallet_history(
        &mut self,
        data: &Value,
    ) -> Option<Result<WalletHistorySnapshot, RpcResponse>> {
        Some(self.router.snapshot_wallet_transactions_sync(data))
    }

    fn commit_wallet_history(&mut self, execution: WalletHistoryExecution) -> Option<RpcResponse> {
        Some(self.router.commit_wallet_transactions_sync(execution))
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
    fn adapter_startup_preserves_existing_chunks() {
        let tmp = TempDir::new().expect("temp dir");
        let storage_root = tmp.path().join("storage");
        let storage = Storage::new(&storage_root).expect("storage");
        storage
            .write_chunk(sample_chunk_name(), b"test")
            .expect("chunk write");
        drop(storage);

        let license_store = LicenseStore::new(tmp.path().join("license"), BuildPolicy::Bypass);
        let _adapter =
            LocalCoreAdapter::new_with_test_license_store(storage_root.clone(), license_store)
                .expect("adapter startup");

        let reopened = Storage::new(storage_root).expect("reopen storage");
        assert!(reopened.has_any_chunk().expect("has_any_chunk"));
        assert_eq!(
            reopened
                .read_chunk(sample_chunk_name())
                .expect("read preserved chunk"),
            b"test"
        );
    }
}
