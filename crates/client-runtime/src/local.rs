#[cfg(debug_assertions)]
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
#[cfg(debug_assertions)]
use std::sync::{Mutex, OnceLock};

use chromvoid_core::catalog::CatalogMediaInfo;
#[cfg(target_os = "android")]
use chromvoid_core::crypto::keystore::AndroidKeystore;
#[cfg(debug_assertions)]
use chromvoid_core::crypto::keystore::InMemoryKeystore;
#[cfg(target_os = "ios")]
use chromvoid_core::crypto::keystore::IosKeystore;
#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    all(target_os = "linux", not(target_env = "musl"))
))]
use chromvoid_core::crypto::keystore::KeyringKeystore;
use chromvoid_core::crypto::keystore::Keystore;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    CatalogMediaInspectSnapshot, RpcInputStream, RpcReply, RpcRouter, WalletBalanceExecution,
    WalletBalanceSnapshot, WalletHistoryExecution, WalletHistorySnapshot,
};
use chromvoid_core::storage::Storage;
use chromvoid_core::vault::{VaultRekeyProgress, VaultRekeyRequest};
use chromvoid_core::wallet::WalletRuntimeConfig;
use chromvoid_core::wallet::bitcoin::BitcoinChainProfile;
use chromvoid_core::wallet::ethereum::{ETHEREUM_NATIVE_TRANSFER_CAPABILITY, EthereumChainProfile};
use chromvoid_core::wallet::evm::EVM_CLEAR_SIGNING_CAPABILITY;
use chromvoid_core::wallet::solana::{SOLANA_NATIVE_TRANSFER_CAPABILITY, SolanaChainProfile};
use chromvoid_core::wallet::ton::TonChainProfile;
use serde_json::Value;

use super::esplora::EsploraProvider;
use super::ethereum_rpc::EthereumRpcProvider;
use super::solana_rpc::SolanaRpcProvider;
use super::ton_center::TonCenterProvider;

const DEFAULT_BTC_ESPLORA_URL: &str = "https://blockstream.info/api/";
/// Public mainnet JSON-RPC without an API key; override with `CHROMVOID_ETH_RPC_URL`.
const DEFAULT_ETH_RPC_URL: &str = "https://ethereum-rpc.publicnode.com";
/// Public Blockscout instance used for Ethereum address history; override with
/// `CHROMVOID_ETH_INDEXER_URL`.
const DEFAULT_ETH_INDEXER_URL: &str = "https://eth.blockscout.com";
/// Public mainnet-beta JSON-RPC without an API key; override with `CHROMVOID_SOL_RPC_URL`.
const DEFAULT_SOL_RPC_URL: &str = "https://api.mainnet-beta.solana.com";

pub struct LocalCoreAdapter {
    router: RpcRouter,
    pub(crate) storage_root: PathBuf,
    pub(crate) keystore: Arc<dyn Keystore>,
}

pub(crate) struct LocalCommandOutcome {
    pub response: RpcResponse,
    pub storage_reset_started: bool,
}

#[cfg(debug_assertions)]
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

fn platform_keystore(storage_root: &std::path::Path) -> Result<Arc<dyn Keystore>, String> {
    if std::env::var_os("CHROMVOID_TEST_INMEMORY_KEYSTORE").is_some() {
        #[cfg(debug_assertions)]
        {
            return Ok(test_keystore_for_storage(storage_root)?);
        }
        #[cfg(not(debug_assertions))]
        {
            return Err("Test keystore is unavailable in release builds".into());
        }
    }
    #[cfg(target_os = "android")]
    {
        Ok(Arc::new(AndroidKeystore::new()))
    }
    #[cfg(any(
        target_os = "macos",
        target_os = "windows",
        all(target_os = "linux", not(target_env = "musl"))
    ))]
    {
        KeyringKeystore::for_storage_path(storage_root)
            .map(|key| Arc::new(key) as Arc<dyn Keystore>)
            .map_err(|e| format!("keystore init failed: {e}"))
    }
    #[cfg(target_os = "ios")]
    {
        let _ = storage_root;
        IosKeystore::new()
            .map(|key| Arc::new(key) as Arc<dyn Keystore>)
            .map_err(|e| format!("keystore init failed: {e}"))
    }
    #[cfg(not(any(
        target_os = "android",
        target_os = "macos",
        target_os = "windows",
        target_os = "ios",
        all(target_os = "linux", not(target_env = "musl"))
    )))]
    {
        let _ = storage_root;
        Err("Platform keystore is unavailable".into())
    }
}

impl LocalCoreAdapter {
    pub fn with_storage_mutation_guard(
        mut self,
        guard: chromvoid_core::rpc::StorageMutationGuard,
    ) -> Self {
        self.router = self.router.with_storage_mutation_guard(guard);
        self
    }

    pub fn storage_mutation_guard(&self) -> chromvoid_core::rpc::StorageMutationGuard {
        self.router.storage_mutation_guard()
    }

    pub fn ensure_storage_mutation_allowed(&self) -> Result<(), RpcResponse> {
        self.router.ensure_storage_mutation_allowed()
    }

    /// Isolated native integration fixture: real wallet crypto/storage, no HTTP providers.
    /// The ABI exposing this debug-only bootstrap must restrict it to the test host.
    #[cfg(debug_assertions)]
    pub fn with_offline_wallet_fixture(mut self) -> Self {
        self.router = self
            .router
            .with_wallet_runtime_config(WalletRuntimeConfig::with_wallet_enabled(true))
            .with_wallet_chain_profile(Arc::new(BitcoinChainProfile::unavailable()))
            .with_wallet_chain_profile(Arc::new(TonChainProfile::unavailable()))
            .with_wallet_chain_profile(Arc::new(EthereumChainProfile::unavailable()))
            .with_wallet_chain_profile(Arc::new(SolanaChainProfile::unavailable()));
        self
    }

    /// Synthetic history/status fixture; balance, fee estimate and broadcast calls stay unavailable.
    #[cfg(debug_assertions)]
    pub fn with_wallet_history_fixture(self) -> Self {
        let mut adapter = self.with_offline_wallet_fixture();
        adapter.router = adapter
            .router
            .with_wallet_chain_profile(Arc::new(TonChainProfile::new(Arc::new(
                super::wallet_history_fixture::HistoryProvider::default(),
            ))));
        adapter
    }

    /// Offline quote/sign/submit fixture: the first synthetic submission has an unknown outcome.
    #[cfg(debug_assertions)]
    pub fn with_wallet_send_fixture(self) -> Self {
        let mut adapter = self.with_offline_wallet_fixture();
        adapter.router = adapter
            .router
            .with_wallet_chain_profile(Arc::new(TonChainProfile::new(Arc::new(
                super::wallet_send_fixture::SendProvider::default(),
            ))));
        adapter
    }

    pub fn new(storage_root: PathBuf) -> Result<Self, String> {
        let keystore = platform_keystore(&storage_root)?;
        Self::new_with_keystore(storage_root, keystore)
    }

    /// Test adapter whose in-memory keystore is shared by every adapter opened on the same root.
    #[cfg(any(test, feature = "test-support"))]
    pub fn new_with_test_keystore(storage_root: PathBuf) -> Result<Self, String> {
        let keystore = test_keystore_for_storage(&storage_root)?;
        Self::new_with_keystore(storage_root, keystore)
    }

    /// Isolated blank-target native restore tests must never replace the platform pepper.
    #[cfg(debug_assertions)]
    pub fn new_with_restore_test_store(storage_root: PathBuf) -> Result<Self, String> {
        Self::new_with_keystore(storage_root, Arc::new(InMemoryKeystore::new()))
    }

    pub(crate) fn new_with_keystore(
        storage_root: PathBuf,
        keystore: Arc<dyn Keystore>,
    ) -> Result<Self, String> {
        #[cfg(any(test, feature = "test-support"))]
        fast_test_kdf();
        let storage = Storage::new(&storage_root).map_err(|e| e.to_string())?;
        let router = RpcRouter::new(storage).with_keystore(keystore.clone());
        let wallet_runtime_config = wallet_runtime_config_from_lookup(wallet_compile_time_env);
        // Blocking HTTP clients must be constructed outside any caller's Tokio runtime.
        let router = std::thread::spawn(move || {
            let mut router = router.with_wallet_runtime_config(wallet_runtime_config.clone());
            let provider = ton_center_provider_from_env().map_or_else(
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
            let ethereum_provider =
                if wallet_runtime_config.capability_enabled(ETHEREUM_NATIVE_TRANSFER_CAPABILITY) {
                    EthereumRpcProvider::mainnet_from_url(
                        &eth_rpc_url_from_env(),
                        &eth_indexer_url_from_env(),
                    )
                    .map_or_else(
                        |error| {
                            eprintln!("[chromvoid] Ethereum provider disabled: {error}");
                            EthereumChainProfile::unavailable()
                        },
                        |provider| EthereumChainProfile::new(Arc::new(provider)),
                    )
                } else {
                    EthereumChainProfile::unavailable()
                };
            router = router.with_wallet_chain_profile(Arc::new(ethereum_provider));
            let solana_provider =
                if wallet_runtime_config.capability_enabled(SOLANA_NATIVE_TRANSFER_CAPABILITY) {
                    SolanaRpcProvider::mainnet_from_url(&sol_rpc_url_from_env()).map_or_else(
                        |error| {
                            eprintln!("[chromvoid] Solana provider disabled: {error}");
                            SolanaChainProfile::unavailable()
                        },
                        |provider| SolanaChainProfile::new(Arc::new(provider)),
                    )
                } else {
                    SolanaChainProfile::unavailable()
                };
            router = router.with_wallet_chain_profile(Arc::new(solana_provider));
            router
        })
        .join()
        .expect("Wallet provider initialization thread panicked");

        Ok(Self {
            router,
            storage_root,
            keystore,
        })
    }
}

/// Unit tests and dependent test-support fixtures must select the same KDF before deriving
/// any keys: the parameters are not stored with a vault. This also keeps the full desktop
/// KDF in an unoptimized build from outlasting the tests' deadlines.
#[cfg(any(test, feature = "test-support"))]
fn fast_test_kdf() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        // SAFETY: set once, before this adapter derives a key; test-support dependents use
        // this constructor too. The variable is read only by Core's KDF
        // through `std::env`, which serializes with this write.
        unsafe { std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1") };
    });
}

fn wallet_runtime_config_from_lookup(
    compile_time_lookup: impl Fn(&str) -> Option<String>,
) -> WalletRuntimeConfig {
    let mut config = WalletRuntimeConfig::with_wallet_enabled(true);
    if parse_wallet_env_bool(compile_time_lookup("CHROMVOID_BUILD_WALLET_ETHEREUM").as_deref()) {
        config
            .enabled_capabilities
            .insert(ETHEREUM_NATIVE_TRANSFER_CAPABILITY.to_string());
        config
            .enabled_capabilities
            .insert(EVM_CLEAR_SIGNING_CAPABILITY.to_string());
    }
    if parse_wallet_env_bool(compile_time_lookup("CHROMVOID_BUILD_WALLET_SOLANA").as_deref()) {
        config
            .enabled_capabilities
            .insert(SOLANA_NATIVE_TRANSFER_CAPABILITY.to_string());
    }
    config
}

fn wallet_compile_time_env(name: &str) -> Option<String> {
    match name {
        "CHROMVOID_TON_API_URL" => option_env!("CHROMVOID_TON_API_URL"),
        "CHROMVOID_BTC_ESPLORA_URL" => option_env!("CHROMVOID_BTC_ESPLORA_URL"),
        "CHROMVOID_BUILD_WALLET_ETHEREUM" => option_env!("CHROMVOID_BUILD_WALLET_ETHEREUM"),
        "CHROMVOID_ETH_RPC_URL" => option_env!("CHROMVOID_ETH_RPC_URL"),
        "CHROMVOID_ETH_INDEXER_URL" => option_env!("CHROMVOID_ETH_INDEXER_URL"),
        "CHROMVOID_BUILD_WALLET_SOLANA" => option_env!("CHROMVOID_BUILD_WALLET_SOLANA"),
        "CHROMVOID_SOL_RPC_URL" => option_env!("CHROMVOID_SOL_RPC_URL"),
        _ => None,
    }
    .map(ToOwned::to_owned)
}

/// Toncenter-compatible base for the TON provider; unset keeps the public Toncenter v3
/// API. Override with `CHROMVOID_TON_API_URL` (runtime, then compile time), for example
/// `https://<host>/wallet-proxy/ton` for the backend wallet proxy.
fn ton_api_url_from_env() -> Option<String> {
    ton_api_url_from_sources(
        std::env::var("CHROMVOID_TON_API_URL").ok(),
        wallet_compile_time_env("CHROMVOID_TON_API_URL"),
    )
}

fn ton_api_url_from_sources(
    runtime_value: Option<String>,
    compile_time_value: Option<String>,
) -> Option<String> {
    runtime_value
        .filter(|value| !value.trim().is_empty())
        .or_else(|| compile_time_value.filter(|value| !value.trim().is_empty()))
}

fn ton_center_provider_from_env() -> Result<TonCenterProvider, String> {
    match ton_api_url_from_env() {
        Some(url) => TonCenterProvider::mainnet_from_url(&url),
        None => TonCenterProvider::mainnet(),
    }
}

fn eth_rpc_url_from_env() -> String {
    eth_rpc_url_from_sources(
        std::env::var("CHROMVOID_ETH_RPC_URL").ok(),
        wallet_compile_time_env("CHROMVOID_ETH_RPC_URL"),
    )
}

fn eth_rpc_url_from_sources(
    runtime_value: Option<String>,
    compile_time_value: Option<String>,
) -> String {
    runtime_value
        .filter(|value| !value.trim().is_empty())
        .or_else(|| compile_time_value.filter(|value| !value.trim().is_empty()))
        .unwrap_or_else(|| DEFAULT_ETH_RPC_URL.to_string())
}

fn eth_indexer_url_from_env() -> String {
    eth_indexer_url_from_sources(
        std::env::var("CHROMVOID_ETH_INDEXER_URL").ok(),
        wallet_compile_time_env("CHROMVOID_ETH_INDEXER_URL"),
    )
}

fn eth_indexer_url_from_sources(
    runtime_value: Option<String>,
    compile_time_value: Option<String>,
) -> String {
    runtime_value
        .filter(|value| !value.trim().is_empty())
        .or_else(|| compile_time_value.filter(|value| !value.trim().is_empty()))
        .unwrap_or_else(|| DEFAULT_ETH_INDEXER_URL.to_string())
}

fn sol_rpc_url_from_env() -> String {
    sol_rpc_url_from_sources(
        std::env::var("CHROMVOID_SOL_RPC_URL").ok(),
        wallet_compile_time_env("CHROMVOID_SOL_RPC_URL"),
    )
}

fn sol_rpc_url_from_sources(
    runtime_value: Option<String>,
    compile_time_value: Option<String>,
) -> String {
    runtime_value
        .filter(|value| !value.trim().is_empty())
        .or_else(|| compile_time_value.filter(|value| !value.trim().is_empty()))
        .unwrap_or_else(|| DEFAULT_SOL_RPC_URL.to_string())
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
        DEFAULT_BTC_ESPLORA_URL, btc_esplora_url_from_sources, wallet_runtime_config_from_lookup,
    };
    use chromvoid_core::wallet::ethereum::ETHEREUM_NATIVE_TRANSFER_CAPABILITY;
    use chromvoid_core::wallet::solana::SOLANA_NATIVE_TRANSFER_CAPABILITY;

    fn lookup<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |name| {
            pairs
                .iter()
                .find_map(|(key, value)| (*key == name).then(|| (*value).to_string()))
        }
    }

    #[test]
    fn wallet_runtime_config_is_always_enabled() {
        let config = wallet_runtime_config_from_lookup(lookup(&[]));

        assert!(config.wallet_enabled);
    }

    #[test]
    fn wallet_feature_capabilities_are_opt_in() {
        let defaults = wallet_runtime_config_from_lookup(lookup(&[]));
        assert!(!defaults.capability_enabled(ETHEREUM_NATIVE_TRANSFER_CAPABILITY));
        assert!(!defaults.capability_enabled(SOLANA_NATIVE_TRANSFER_CAPABILITY));

        let build_enabled = wallet_runtime_config_from_lookup(lookup(&[(
            "CHROMVOID_BUILD_WALLET_ETHEREUM",
            "true",
        )]));
        assert!(build_enabled.capability_enabled(ETHEREUM_NATIVE_TRANSFER_CAPABILITY));
        assert!(!build_enabled.capability_enabled(SOLANA_NATIVE_TRANSFER_CAPABILITY));

        let solana_build_enabled =
            wallet_runtime_config_from_lookup(lookup(&[("CHROMVOID_BUILD_WALLET_SOLANA", "true")]));
        assert!(solana_build_enabled.capability_enabled(SOLANA_NATIVE_TRANSFER_CAPABILITY));
        assert!(!solana_build_enabled.capability_enabled(ETHEREUM_NATIVE_TRANSFER_CAPABILITY));
    }

    #[test]
    fn ton_provider_keeps_public_toncenter_unless_overridden() {
        assert_eq!(super::ton_api_url_from_sources(None, None), None);
        assert_eq!(
            super::ton_api_url_from_sources(Some("  ".to_string()), None),
            None
        );
        assert_eq!(
            super::ton_api_url_from_sources(
                Some("https://proxy.example/wallet-proxy/ton".to_string()),
                Some("https://build.example/ton".to_string()),
            ),
            Some("https://proxy.example/wallet-proxy/ton".to_string())
        );
        assert_eq!(
            super::ton_api_url_from_sources(None, Some("https://build.example/ton".to_string())),
            Some("https://build.example/ton".to_string())
        );
        assert!(
            super::TonCenterProvider::mainnet_from_url("https://proxy.example/wallet-proxy/ton")
                .is_ok()
        );
        assert!(super::TonCenterProvider::mainnet_from_url("").is_err());
    }

    #[test]
    fn solana_provider_defaults_to_public_mainnet_rpc_and_prefers_runtime_override() {
        assert_eq!(
            super::sol_rpc_url_from_sources(None, None),
            super::DEFAULT_SOL_RPC_URL
        );
        assert_eq!(
            super::sol_rpc_url_from_sources(
                Some("  ".to_string()),
                Some("https://build.example/sol".to_string())
            ),
            "https://build.example/sol"
        );
        assert_eq!(
            super::sol_rpc_url_from_sources(
                Some("https://runtime.example/sol".to_string()),
                Some("https://build.example/sol".to_string())
            ),
            "https://runtime.example/sol"
        );
    }

    #[test]
    fn ethereum_provider_defaults_to_public_mainnet_rpc_and_prefers_runtime_override() {
        assert_eq!(
            super::eth_rpc_url_from_sources(None, None),
            super::DEFAULT_ETH_RPC_URL
        );
        assert_eq!(
            super::eth_rpc_url_from_sources(
                Some("  ".to_string()),
                Some("https://build.example/rpc".to_string())
            ),
            "https://build.example/rpc"
        );
        assert_eq!(
            super::eth_rpc_url_from_sources(
                Some("https://runtime.example/rpc".to_string()),
                Some("https://build.example/rpc".to_string())
            ),
            "https://runtime.example/rpc"
        );
    }

    #[test]
    fn ethereum_indexer_defaults_to_public_blockscout_and_prefers_runtime_override() {
        assert_eq!(
            super::eth_indexer_url_from_sources(None, None),
            super::DEFAULT_ETH_INDEXER_URL
        );
        assert_eq!(
            super::eth_indexer_url_from_sources(
                Some(String::new()),
                Some("https://build.example/indexer".to_string())
            ),
            "https://build.example/indexer"
        );
        assert_eq!(
            super::eth_indexer_url_from_sources(
                Some("https://runtime.example/indexer".to_string()),
                Some("https://build.example/indexer".to_string())
            ),
            "https://runtime.example/indexer"
        );
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

impl LocalCoreAdapter {
    pub fn is_unlocked(&self) -> bool {
        self.router.is_unlocked()
    }

    pub fn master_is_configured(&self) -> Result<bool, RpcResponse> {
        self.router.master_is_configured()
    }

    pub fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.router.handle(req)
    }

    /// Cooperative cancellation reaches Core before vault rekey or erase commits.
    /// Other commands retain their existing transaction and cancellation semantics.
    pub(crate) fn handle_cancellable(
        &mut self,
        req: &RpcRequest,
        cancel_requested: &dyn Fn() -> bool,
        on_storage_reset: &mut dyn FnMut(),
    ) -> LocalCommandOutcome {
        let mut storage_reset_started = false;
        let response = if req.v == chromvoid_core::rpc::types::PROTOCOL_VERSION
            && req.command == "vault:rekey"
        {
            self.router
                .handle_vault_rekey(&req.data, cancel_requested, &mut |_| {})
        } else if req.v == chromvoid_core::rpc::types::PROTOCOL_VERSION
            && req.command == "erase:execute"
        {
            self.router
                .handle_erase_execute_cancellable(&req.data, cancel_requested, &mut || {
                    storage_reset_started = true;
                    on_storage_reset();
                })
        } else {
            self.handle(req)
        };
        LocalCommandOutcome {
            response,
            storage_reset_started,
        }
    }

    pub fn prepare_local_backup(
        &mut self,
        master_password: String,
        cancel_requested: &dyn Fn() -> bool,
    ) -> Result<chromvoid_core::rpc::LocalBackupSnapshot, RpcResponse> {
        self.router
            .prepare_local_backup(master_password, cancel_requested)
    }

    pub fn prepare_local_restore(
        &mut self,
        input: chromvoid_core::rpc::LocalRestoreInput,
        master_password: String,
        cancel_requested: &dyn Fn() -> bool,
    ) -> Result<chromvoid_core::rpc::PreparedLocalRestore, RpcResponse> {
        self.router
            .prepare_local_restore(input, master_password, cancel_requested)
    }

    pub fn commit_local_restore(
        &mut self,
        prepared: chromvoid_core::rpc::PreparedLocalRestore,
        cancel_requested: &dyn Fn() -> bool,
    ) -> Result<serde_json::Value, RpcResponse> {
        self.router.commit_local_restore(prepared, cancel_requested)
    }

    pub fn prepare_credential_import(
        &self,
        bytes: &[u8],
        mode: chromvoid_core::credential_import::CredentialImportMode,
        source_password: Option<&str>,
    ) -> Result<chromvoid_core::credential_import::PreparedCredentialImport, RpcResponse> {
        self.router
            .prepare_credential_import(bytes, mode, source_password)
    }

    #[cfg(feature = "desktop")]
    pub fn resolve_env_runtime_for_spawn(
        &mut self,
        request: chromvoid_core::env_runtime::PrivateSpawnResolutionRequestV1,
    ) -> Option<
        chromvoid_core::env_runtime::EnvRuntimeResult<
            chromvoid_core::env_runtime::ResolvedEnvLeaseV1,
        >,
    > {
        Some(self.router.resolve_for_tauri_spawn(request))
    }

    pub fn rekey_vault(
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

    pub fn snapshot_catalog_media_inspect(
        &mut self,
        node_id: u64,
    ) -> Option<Result<CatalogMediaInspectSnapshot, RpcResponse>> {
        Some(
            self.router
                .snapshot_catalog_media_inspect(node_id)
                .map_err(|error| error.into_rpc_response()),
        )
    }

    pub fn commit_catalog_media_inspect(
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

    pub fn open_catalog_source_reader(
        &mut self,
        node_id: u64,
        expected_source_revision: u64,
    ) -> Result<chromvoid_core::rpc::CatalogSourceReader, RpcResponse> {
        self.router
            .open_catalog_source_reader(node_id, expected_source_revision)
    }

    pub fn snapshot_catalog_derivative_write(
        &mut self,
        request: CatalogDerivativeWriteRequest,
    ) -> Option<Result<CatalogDerivativeWriteSnapshot, RpcResponse>> {
        Some(
            self.router
                .snapshot_catalog_derivative_write(request)
                .map_err(|error| error.into_rpc_response()),
        )
    }

    pub fn commit_catalog_derivative_write(
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

    pub fn snapshot_wallet_balance(
        &mut self,
        data: &Value,
    ) -> Option<Result<Option<WalletBalanceSnapshot>, RpcResponse>> {
        Some(self.router.snapshot_wallet_balance_get(data))
    }

    pub fn commit_wallet_balance(
        &mut self,
        execution: WalletBalanceExecution,
    ) -> Option<RpcResponse> {
        Some(self.router.commit_wallet_balance_get(execution))
    }

    pub fn snapshot_wallet_history(
        &mut self,
        data: &Value,
    ) -> Option<Result<WalletHistorySnapshot, RpcResponse>> {
        Some(self.router.snapshot_wallet_transactions_sync(data))
    }

    pub fn commit_wallet_history(
        &mut self,
        execution: WalletHistoryExecution,
    ) -> Option<RpcResponse> {
        Some(self.router.commit_wallet_transactions_sync(execution))
    }

    pub fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        self.router.handle_with_stream(req, stream)
    }

    pub fn save(&mut self) -> Result<(), String> {
        self.router.save().map_err(|e| e.to_string())
    }

    pub fn take_events(&mut self) -> Vec<Value> {
        self.router.take_events()
    }

    pub fn set_master_key(&mut self, key: Option<String>) {
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

        let _adapter = LocalCoreAdapter::new_with_test_keystore(storage_root.clone())
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

    #[tokio::test]
    async fn partially_erased_locked_storage_revokes_generation_with_verifier_still_present() {
        use crate::session::{LocalSession, SessionError, SessionPhase};
        use chromvoid_core::storage::test_util::{
            FaultRule, StorageOperation, fault_injecting_storage,
        };
        use serde_json::json;
        let root = TempDir::new().unwrap();
        let storage_root = root.path().join("storage");
        let key = Arc::new(InMemoryKeystore::new());
        let mut adapter =
            LocalCoreAdapter::new_with_keystore(storage_root.clone(), key.clone()).unwrap();
        for (command, data) in [
            (
                "master:setup",
                json!({"master_password":"synthetic erase administrator"}),
            ),
            (
                "vault:unlock",
                json!({"password":"synthetic removed vault"}),
            ),
            (
                "catalog:createDir",
                json!({"name":"removed before cleanup error"}),
            ),
            ("vault:lock", json!({})),
        ] {
            assert!(adapter.handle(&RpcRequest::new(command, data)).is_ok());
        }
        drop(adapter);
        let (storage, _) = fault_injecting_storage(
            &storage_root,
            Some(FaultRule {
                operation: StorageOperation::RemoveArtifact,
                // Format and vault salt are removed before master salt and verifier.
                fail_on: 4,
            }),
        )
        .unwrap();
        let runtime = LocalSession::new(LocalCoreAdapter {
            router: RpcRouter::new(storage).with_keystore(key.clone()),
            storage_root: storage_root.clone(),
            keystore: key.clone(),
        })
        .unwrap();
        let generation = runtime.snapshot().unwrap().generation;
        let review = runtime
            .execute(1, generation, RpcRequest::new("erase:confirm", json!({})))
            .await
            .unwrap();
        let token = review.result().unwrap()["erase_token"].as_str().unwrap();
        let wrong_password = runtime
            .execute(
                2,
                generation,
                RpcRequest::new(
                    "erase:execute",
                    json!({
                        "erase_token":token, "master_password":"incorrect"
                    }),
                ),
            )
            .await
            .unwrap();
        assert_eq!(wrong_password.code(), Some("INVALID_MASTER_PASSWORD"));
        assert_eq!(runtime.snapshot().unwrap().generation, generation);
        let erased = runtime
            .execute(
                3,
                generation,
                RpcRequest::new(
                    "erase:execute",
                    json!({
                        "erase_token":token, "master_password":"synthetic erase administrator"
                    }),
                ),
            )
            .await;
        assert_eq!(erased.unwrap_err(), SessionError::Revoked);
        let current = runtime.snapshot().unwrap();
        assert_eq!(current.phase, SessionPhase::Locked);
        assert!(current.generation > generation);
        assert!(current.master_configured);
        assert!(storage_root.join("master.verify").exists());
        assert!(!storage_root.join("master.salt").exists());
        assert!(key.load_storage_pepper().unwrap().is_none());
        assert!(
            Storage::new(&storage_root)
                .unwrap()
                .list_chunks()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            runtime
                .execute(
                    4,
                    generation,
                    RpcRequest::new(
                        "master:setup",
                        json!({
                            "master_password":"stale request"
                        })
                    )
                )
                .await
                .unwrap_err(),
            SessionError::Revoked
        );
        runtime.close().unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let snapshot = runtime.snapshot().unwrap();
                if !snapshot.cleanup_pending {
                    break;
                }
                runtime.events(snapshot.sequence).await.unwrap();
            }
        })
        .await
        .unwrap();
    }
}
