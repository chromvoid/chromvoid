mod test_helpers;

use chromvoid_core::license::{BuildPolicy, LicenseStore};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, WalletBalance};
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::wallet::{
    BitcoinPrepareSnapshot, BitcoinUtxo, EthereumPrepareSnapshot, WalletBroadcastOutcome,
    WalletProvider, WalletProviderError, WalletRuntimeConfig, WalletTxStatus,
};
use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;
use test_helpers::*;

#[derive(Clone)]
struct MockWalletProvider {
    inner: Arc<Mutex<MockWalletProviderState>>,
}

#[derive(Clone)]
struct MockWalletProviderState {
    bitcoin_utxos: Vec<BitcoinUtxo>,
    bitcoin_fee: u128,
    ethereum_balance: u128,
    ethereum_nonce: u64,
    ethereum_fee: u128,
    outcome: WalletBroadcastOutcome,
    status: WalletTxStatus,
    used_addresses: BTreeSet<String>,
}

impl Default for MockWalletProviderState {
    fn default() -> Self {
        Self {
            bitcoin_utxos: vec![BitcoinUtxo {
                outpoint: "txid:0".to_string(),
                address: "bc1qmock".to_string(),
                amount: 100_000,
            }],
            bitcoin_fee: 210,
            ethereum_balance: 100_000,
            ethereum_nonce: 7,
            ethereum_fee: 21_000,
            outcome: WalletBroadcastOutcome::Accepted,
            status: WalletTxStatus::Confirmed,
            used_addresses: BTreeSet::new(),
        }
    }
}

impl MockWalletProvider {
    fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MockWalletProviderState::default())),
        }
    }

    fn with_outcome(self, outcome: WalletBroadcastOutcome) -> Self {
        self.inner.lock().unwrap().outcome = outcome;
        self
    }
}

impl WalletProvider for MockWalletProvider {
    fn bitcoin_balance(&self, _addresses: &[String]) -> Result<WalletBalance, WalletProviderError> {
        let state = self.inner.lock().unwrap();
        let spendable: u128 = state.bitcoin_utxos.iter().map(|utxo| utxo.amount).sum();
        Ok(balance(spendable, "satoshi"))
    }

    fn bitcoin_prepare(
        &self,
        _addresses: &[String],
        _outputs: &[chromvoid_core::rpc::types::WalletTransactionOutput],
        _fee_tier: &chromvoid_core::rpc::types::WalletFeeTier,
    ) -> Result<BitcoinPrepareSnapshot, WalletProviderError> {
        let state = self.inner.lock().unwrap();
        Ok(BitcoinPrepareSnapshot {
            utxos: state.bitcoin_utxos.clone(),
            fee: state.bitcoin_fee,
        })
    }

    fn bitcoin_broadcast(
        &self,
        _tx_hash: &str,
        _signed_payload: &str,
    ) -> Result<WalletBroadcastOutcome, WalletProviderError> {
        Ok(self.inner.lock().unwrap().outcome.clone())
    }

    fn bitcoin_transaction_status(
        &self,
        _tx_hash: &str,
    ) -> Result<WalletTxStatus, WalletProviderError> {
        Ok(self.inner.lock().unwrap().status.clone())
    }

    fn ethereum_balance(&self, _address: &str) -> Result<WalletBalance, WalletProviderError> {
        let state = self.inner.lock().unwrap();
        Ok(balance(state.ethereum_balance, "wei"))
    }

    fn ethereum_prepare(
        &self,
        _address: &str,
        _outputs: &[chromvoid_core::rpc::types::WalletTransactionOutput],
        _fee_tier: &chromvoid_core::rpc::types::WalletFeeTier,
    ) -> Result<EthereumPrepareSnapshot, WalletProviderError> {
        let state = self.inner.lock().unwrap();
        Ok(EthereumPrepareSnapshot {
            balance: state.ethereum_balance,
            nonce: state.ethereum_nonce,
            estimated_fee: state.ethereum_fee,
        })
    }

    fn ethereum_broadcast(
        &self,
        _tx_hash: &str,
        _signed_payload: &str,
    ) -> Result<WalletBroadcastOutcome, WalletProviderError> {
        Ok(self.inner.lock().unwrap().outcome.clone())
    }

    fn ethereum_transaction_status(
        &self,
        _tx_hash: &str,
    ) -> Result<WalletTxStatus, WalletProviderError> {
        Ok(self.inner.lock().unwrap().status.clone())
    }

    fn address_used(
        &self,
        _network: chromvoid_core::rpc::types::WalletNetwork,
        address: &str,
    ) -> Result<bool, WalletProviderError> {
        Ok(self.inner.lock().unwrap().used_addresses.contains(address))
    }
}

fn balance(amount: u128, unit: &str) -> WalletBalance {
    WalletBalance {
        spendable: amount.to_string(),
        pending_in: "0".to_string(),
        pending_out: "0".to_string(),
        total: amount.to_string(),
        amount_unit: unit.to_string(),
    }
}

fn wallet_config() -> WalletRuntimeConfig {
    WalletRuntimeConfig {
        wallet_phase1_enabled: true,
        wallet_core_broadcast_enabled: true,
    }
}

fn wallet_config_without_broadcast() -> WalletRuntimeConfig {
    WalletRuntimeConfig {
        wallet_phase1_enabled: true,
        wallet_core_broadcast_enabled: false,
    }
}

fn create_wallet_router(provider: Option<MockWalletProvider>) -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    let router = router.with_wallet_runtime_config(wallet_config());
    let router = match provider {
        Some(provider) => router.with_wallet_provider(Arc::new(provider)),
        None => router,
    };
    (router, temp_dir)
}

fn rpc(router: &mut RpcRouter, command: &str, data: serde_json::Value) -> RpcResponse {
    router.handle(&RpcRequest::new(command, data))
}

fn assert_rpc_error_message(response: &RpcResponse, expected_code: &str, expected_message: &str) {
    assert_rpc_error(response, expected_code);
    assert_eq!(response.error_message(), Some(expected_message));
}

fn hd_create(router: &mut RpcRouter) -> serde_json::Value {
    let response = rpc(
        router,
        "wallet:hd:create",
        serde_json::json!({
            "label": "Main wallet",
            "mnemonic": ["able", "acid", "agent", "album", "alpha", "anchor", "apple", "april", "arena", "asset", "august", "auto"],
            "wordlist": "english",
            "supported_networks": ["bitcoin", "ethereum"]
        }),
    );
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}

fn first_account(result: &serde_json::Value, network: &str) -> String {
    result
        .get("accounts")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .find(|account| account.get("network").and_then(|v| v.as_str()) == Some(network))
        .unwrap()
        .get("account_id")
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

#[test]
fn wallet_locked_and_disabled_flags_fail_closed() {
    let (mut router, _temp_dir) = create_test_router();
    let response = rpc(&mut router, "wallet:status", serde_json::json!({}));
    assert_rpc_error(&response, "VAULT_REQUIRED");

    unlock_vault(&mut router, "pw");
    let response = rpc(&mut router, "wallet:status", serde_json::json!({}));
    assert_rpc_error(&response, "PROVIDER_DISABLED");
}

#[test]
fn wallet_confirm_requires_broadcast_flag() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_without_broadcast())
        .with_wallet_provider(Arc::new(MockWalletProvider::new()));
    unlock_vault(&mut router, "pw");

    let response = rpc(
        &mut router,
        "wallet:transaction:confirm",
        serde_json::json!({"preparation_id": "prep-missing", "accepted_warnings": []}),
    );

    assert_rpc_error(&response, "PROVIDER_DISABLED");
}

#[test]
fn wallet_pro_guard_blocks_when_license_store_is_free() {
    let (router, temp_dir) = create_test_router();
    let license_dir = TempDir::new().unwrap();
    let mut router = router
        .with_wallet_runtime_config(wallet_config())
        .with_license_store(LicenseStore::new(
            license_dir.path().to_path_buf(),
            BuildPolicy::Enforce,
        ));
    unlock_vault(&mut router, "pw");

    let response = rpc(&mut router, "wallet:status", serde_json::json!({}));
    assert_rpc_error(&response, "PRO_REQUIRED");
    drop(temp_dir);
}

#[test]
fn wallet_hd_create_is_lazy_and_generic_wallet_path_stays_denied() {
    let (mut router, _temp_dir) = create_wallet_router(Some(MockWalletProvider::new()));
    unlock_vault(&mut router, "pw");

    let created = hd_create(&mut router);
    assert_eq!(
        created.get("accounts").unwrap().as_array().unwrap().len(),
        2
    );

    let status = rpc(&mut router, "wallet:status", serde_json::json!({}));
    assert_rpc_ok(&status);
    assert_eq!(
        status
            .result()
            .unwrap()
            .get("wallet_count")
            .and_then(|v| v.as_u64()),
        Some(1)
    );

    let accounts = rpc(&mut router, "wallet:accounts:list", serde_json::json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(
        accounts
            .result()
            .unwrap()
            .get("accounts")
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        2
    );

    let denied = list_dir(&mut router, "/.wallet");
    assert_rpc_error(&denied, "ACCESS_DENIED");
}

#[test]
fn wallet_address_derivation_is_bitcoin_only_and_advances_cursor() {
    let (mut router, _temp_dir) = create_wallet_router(Some(MockWalletProvider::new()));
    unlock_vault(&mut router, "pw");
    let created = hd_create(&mut router);
    let btc_account = first_account(&created, "bitcoin");
    let eth_account = first_account(&created, "ethereum");

    let first = rpc(
        &mut router,
        "wallet:addresses:derive",
        serde_json::json!({"account_id": btc_account, "purpose": "receive"}),
    );
    assert_rpc_ok(&first);
    assert_eq!(
        first
            .result()
            .unwrap()
            .get("index")
            .and_then(|v| v.as_u64()),
        Some(1)
    );

    let second = rpc(
        &mut router,
        "wallet:addresses:derive",
        serde_json::json!({"account_id": first_account(&created, "bitcoin"), "purpose": "receive"}),
    );
    assert_rpc_ok(&second);
    assert_ne!(
        first.result().unwrap().get("address"),
        second.result().unwrap().get("address")
    );

    let rejected = rpc(
        &mut router,
        "wallet:addresses:derive",
        serde_json::json!({"account_id": eth_account, "purpose": "receive"}),
    );
    assert_rpc_error(&rejected, "UNSUPPORTED_ACCOUNT_MODEL");
}

#[test]
fn wallet_export_requires_master_password_and_rejects_imported_wallet_export() {
    let (mut router, _temp_dir) = create_wallet_router(Some(MockWalletProvider::new()));
    unlock_vault(&mut router, "pw");
    assert_rpc_ok(&rpc(
        &mut router,
        "master:setup",
        serde_json::json!({"master_password": "master-password"}),
    ));
    let created = hd_create(&mut router);
    let wallet_id = created
        .get("wallet_id")
        .unwrap()
        .as_str()
        .unwrap()
        .to_string();

    let wrong = rpc(
        &mut router,
        "wallet:backup:export",
        serde_json::json!({"wallet_id": wallet_id, "master_password": "bad-password"}),
    );
    assert_rpc_error(&wrong, "EXPORT_REAUTH_FAILED");
    assert_eq!(wrong.error_message(), Some("Invalid master password"));

    let exported = rpc(
        &mut router,
        "wallet:backup:export",
        serde_json::json!({"wallet_id": created.get("wallet_id").unwrap(), "master_password": "master-password"}),
    );
    assert_rpc_ok(&exported);
    assert_eq!(
        exported
            .result()
            .unwrap()
            .get("export_kind")
            .and_then(|v| v.as_str()),
        Some("mnemonic")
    );

    let imported = rpc(
        &mut router,
        "wallet:import:create",
        serde_json::json!({
            "label": "Imported ETH",
            "network": "ethereum",
            "curve": "secp256k1",
            "private_key": "0x1111",
            "encoding": "hex"
        }),
    );
    assert_rpc_ok(&imported);
    let imported_wallet_id = imported.result().unwrap().get("wallet_id").unwrap();
    let rejected = rpc(
        &mut router,
        "wallet:backup:export",
        serde_json::json!({"wallet_id": imported_wallet_id, "master_password": "master-password"}),
    );
    assert_rpc_error(&rejected, "UNSUPPORTED_EXPORT_KIND");
}

#[test]
fn wallet_provider_unavailable_is_typed_for_live_balance() {
    let (mut router, _temp_dir) = create_wallet_router(None);
    unlock_vault(&mut router, "pw");
    let created = hd_create(&mut router);
    let account_id = first_account(&created, "bitcoin");

    let response = rpc(
        &mut router,
        "wallet:balance:get",
        serde_json::json!({"account_id": account_id}),
    );
    assert_rpc_error_message(
        &response,
        "PROVIDER_UNAVAILABLE",
        "Wallet provider unavailable",
    );
}

#[test]
fn wallet_error_contracts_remain_stable_across_typed_boundary() {
    let (mut router, _temp_dir) = create_wallet_router(Some(MockWalletProvider::new()));
    unlock_vault(&mut router, "pw");

    let invalid = rpc(
        &mut router,
        "wallet:accounts:list",
        serde_json::json!({"wallet_id": 7}),
    );
    assert_rpc_error(&invalid, "EMPTY_PAYLOAD");
    assert!(invalid
        .error_message()
        .is_some_and(|message| message.starts_with("Invalid wallet payload:")));

    let unsupported = rpc(
        &mut router,
        "wallet:import:create",
        serde_json::json!({
            "label": "Unsupported",
            "network": "ton",
            "curve": "ed25519",
            "private_key": "secret",
            "encoding": "hex"
        }),
    );
    assert_rpc_error_message(
        &unsupported,
        "UNSUPPORTED_CHAIN",
        "Unsupported wallet network: ton",
    );

    let missing_wallet = rpc(
        &mut router,
        "wallet:accounts:derive",
        serde_json::json!({"wallet_id": "wallet-missing", "network": "bitcoin"}),
    );
    assert_rpc_error_message(&missing_wallet, "WALLET_NOT_FOUND", "Wallet not found");

    let missing_account = rpc(
        &mut router,
        "wallet:addresses:derive",
        serde_json::json!({"account_id": "account-missing", "purpose": "receive"}),
    );
    assert_rpc_error_message(&missing_account, "ACCOUNT_NOT_FOUND", "Account not found");

    let missing_preparation = rpc(
        &mut router,
        "wallet:transaction:confirm",
        serde_json::json!({"preparation_id": "prep-missing", "accepted_warnings": []}),
    );
    assert_rpc_error_message(
        &missing_preparation,
        "PREPARATION_NOT_FOUND",
        "Preparation not found",
    );

    let missing_transaction = rpc(
        &mut router,
        "wallet:transactions:refresh",
        serde_json::json!({"tx_ref": "tx-missing"}),
    );
    assert_rpc_error_message(
        &missing_transaction,
        "NODE_NOT_FOUND",
        "Transaction not found",
    );
}

#[test]
fn wallet_prepare_confirm_records_broadcast_unknown_and_refresh_reconciles() {
    let provider = MockWalletProvider::new().with_outcome(WalletBroadcastOutcome::Unknown);
    let (mut router, _temp_dir) = create_wallet_router(Some(provider));
    unlock_vault(&mut router, "pw");
    let created = hd_create(&mut router);
    let account_id = first_account(&created, "bitcoin");

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        serde_json::json!({
            "account_id": account_id,
            "network": "bitcoin",
            "outputs": [{"address": "bc1qrecipient", "amount": "10000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let preparation_id = prepared
        .result()
        .unwrap()
        .get("preparation_id")
        .unwrap()
        .as_str()
        .unwrap()
        .to_string();

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        serde_json::json!({"preparation_id": preparation_id, "accepted_warnings": []}),
    );
    assert_rpc_ok(&confirmed);
    assert_eq!(
        confirmed
            .result()
            .unwrap()
            .get("status")
            .and_then(|v| v.as_str()),
        Some("broadcast_unknown")
    );
    assert!(confirmed
        .result()
        .unwrap()
        .get("tx_hash")
        .and_then(|v| v.as_str())
        .is_some());

    let retry = rpc(
        &mut router,
        "wallet:transaction:confirm",
        serde_json::json!({
            "preparation_id": prepared.result().unwrap().get("preparation_id").unwrap(),
            "accepted_warnings": []
        }),
    );
    assert_rpc_error(&retry, "PREPARATION_NOT_FOUND");

    let listed = rpc(
        &mut router,
        "wallet:transactions:list",
        serde_json::json!({}),
    );
    assert_rpc_ok(&listed);
    let tx_ref = listed
        .result()
        .unwrap()
        .get("transactions")
        .unwrap()
        .as_array()
        .unwrap()[0]
        .get("tx_ref")
        .unwrap()
        .clone();

    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        serde_json::json!({"tx_ref": tx_ref}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(
        refreshed
            .result()
            .unwrap()
            .get("status")
            .and_then(|v| v.as_str()),
        Some("confirmed")
    );
}

#[test]
fn wallet_rejects_out_of_scope_network_and_ethereum_multi_output() {
    let (mut router, _temp_dir) = create_wallet_router(Some(MockWalletProvider::new()));
    unlock_vault(&mut router, "pw");
    let unsupported = rpc(
        &mut router,
        "wallet:hd:create",
        serde_json::json!({
            "label": "Bad wallet",
            "mnemonic": ["able", "acid", "agent", "album", "alpha", "anchor", "apple", "april", "arena", "asset", "august", "auto"],
            "wordlist": "english",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_error_message(
        &unsupported,
        "UNSUPPORTED_CHAIN",
        "Unsupported wallet network: ton",
    );

    let created = hd_create(&mut router);
    let eth_account = first_account(&created, "ethereum");
    let rejected = rpc(
        &mut router,
        "wallet:transaction:prepare",
        serde_json::json!({
            "account_id": eth_account,
            "network": "ethereum",
            "outputs": [
                {"address": "0x1111111111111111111111111111111111111111", "amount": "1"},
                {"address": "0x2222222222222222222222222222222222222222", "amount": "1"}
            ],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&rejected, "INVALID_INPUT");
}
