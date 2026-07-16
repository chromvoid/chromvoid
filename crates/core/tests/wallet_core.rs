mod test_helpers;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use bip39::{Language, Mnemonic};
use chromvoid_core::rpc::types::{
    DerivedAccountMetaV1, ImportedAccountMetaV1, RpcRequest, RpcResponse, WalletAccountMeta,
    WalletAddressesDeriveResponse, WalletBalance, WalletConfirmStatus, WalletFeeTier,
    WalletNetwork, WalletPreview, WalletTransactionDirection,
};
use chromvoid_core::rpc::{execute_wallet_balance_snapshot, RpcRouter};
use chromvoid_core::storage::Storage;
use chromvoid_core::wallet::bitcoin::{
    BitcoinAddressStats, BitcoinAddressStatus, BitcoinBroadcastResult, BitcoinChainProfile,
    BitcoinFeeEstimates, BitcoinProvider, BitcoinProviderError, BitcoinTransactionStatus,
    BitcoinUtxo,
};
use chromvoid_core::wallet::ton::{
    TonBroadcastRequest, TonBroadcastResult, TonChainProfile, TonFeeEstimateRequest,
    TonHistoryRequest, TonHistoryTransaction, TonProvider, TonProviderAccount,
    TonProviderAccountState, TonProviderError, TonProviderSnapshot, TonRefreshRequest,
    TonRefreshResult,
};
use chromvoid_core::wallet::ton_v2::TON_CONNECT_CAPABILITY;
use chromvoid_core::wallet::{hex_string, parse_hex};
use chromvoid_core::wallet::{
    AllocatedAddressV1, WalletAddressDeriveInput, WalletAddressDeriveOutput, WalletBalanceInput,
    WalletBalanceOutput, WalletChainError, WalletChainProfile, WalletHdAccountMaterializeInput,
    WalletImportedAccountMaterializeInput, WalletPrepareInput, WalletPrepareOutput,
    WalletProfileAccountMaterialization, WalletProviderObservationOutcomeV1,
    WalletProviderObservationV1, WalletRefreshInput, WalletRefreshOutput, WalletRuntimeConfig,
    WalletSignInput, WalletSignedArtifact, WalletSubmitInput, WalletSubmitOutput,
    WalletTelemetryEvent, WalletTelemetryMetric, WalletTelemetrySink, WalletTxStatus,
};
use serde_json::{json, Value};
use tempfile::TempDir;
use test_helpers::*;

const TEST_NETWORK: &str = "testchain";
const MASTER_PASSWORD: &str = "correct horse battery staple";
const VALID_MNEMONIC: [&str; 12] = [
    "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon",
    "abandon", "abandon", "abandon", "about",
];
const TON_NATIVE_MNEMONIC: [&str; 24] = [
    "open", "price", "dish", "charge", "law", "skirt", "alien", "churn", "fire", "swap", "number",
    "brass", "outdoor", "diamond", "lesson", "april", "remain", "puzzle", "title", "elbow",
    "valley", "grant", "champion", "staff",
];
const VALID_BIP39_24_WORD_MNEMONIC: [&str; 24] = [
    "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon",
    "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon",
    "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "abandon", "art",
];

#[derive(Debug)]
struct TestChainProfile {
    hd_account_model: &'static str,
    submit_control: Option<Arc<TestSubmitControl>>,
}

impl TestChainProfile {
    fn utxo() -> Self {
        Self {
            hd_account_model: "utxo",
            submit_control: None,
        }
    }

    fn account_based() -> Self {
        Self {
            hd_account_model: "account",
            submit_control: None,
        }
    }

    fn replay_controlled(submit_control: Arc<TestSubmitControl>) -> Self {
        Self {
            hd_account_model: "utxo",
            submit_control: Some(submit_control),
        }
    }

    fn derived_account(
        &self,
        wallet_id: String,
        account_id: String,
        network: WalletNetwork,
        account_index: Option<u32>,
        account_model: &str,
        now: u64,
    ) -> WalletAccountMeta {
        let index = account_index.unwrap_or(0);
        WalletAccountMeta::Derived(DerivedAccountMetaV1 {
            account_id,
            wallet_id,
            network,
            wallet_mode: Some("multichain".to_string()),
            mnemonic_standard: "bip39".to_string(),
            account_model: account_model.to_string(),
            derivation_profile: "test-profile-v1".to_string(),
            wallet_contract: None,
            account_index,
            workchain: None,
            label: Some(format!("Test account {index}")),
            address: Some(format!("test-address-{index}")),
            raw_account: None,
            public_key: Some(format!("test-public-key-{index}")),
            derivation_path: Some(format!("m/test/{index}")),
            current_receive_address: Some(format!("test-receive-{index}-0")),
            current_receive_derivation_path: Some(format!("m/test/{index}/0/0")),
            next_receive_index: Some(1),
            next_change_index: Some(0),
            created_at: now,
            updated_at: now,
        })
    }

    fn imported_account(
        &self,
        wallet_id: String,
        account_id: String,
        network: WalletNetwork,
        label: String,
        now: u64,
    ) -> WalletAccountMeta {
        WalletAccountMeta::Imported(ImportedAccountMetaV1 {
            account_id,
            wallet_id,
            network,
            label: Some(label),
            address: "test-imported-address".to_string(),
            public_key: Some("test-imported-public-key".to_string()),
            curve: None,
            wallet_contract: None,
            workchain: None,
            raw_account: None,
            created_at: now,
            updated_at: now,
        })
    }
}

#[derive(Debug, Clone, Copy)]
enum TestSubmitOutcome {
    Pending,
    ProviderUnavailable,
    BroadcastUnknown,
    BroadcastRejected,
}

#[derive(Debug)]
struct TestSubmitControl {
    sign_calls: Mutex<usize>,
    submit_calls: Mutex<usize>,
    outcomes: Mutex<Vec<TestSubmitOutcome>>,
    submitted_artifacts: Mutex<Vec<String>>,
    submitted_metadata: Mutex<Vec<Option<Value>>>,
}

impl TestSubmitControl {
    fn new(outcomes: Vec<TestSubmitOutcome>) -> Self {
        Self {
            sign_calls: Mutex::new(0),
            submit_calls: Mutex::new(0),
            outcomes: Mutex::new(outcomes),
            submitted_artifacts: Mutex::new(Vec::new()),
            submitted_metadata: Mutex::new(Vec::new()),
        }
    }

    fn sign_calls(&self) -> usize {
        *self.sign_calls.lock().expect("sign calls")
    }

    fn submit_calls(&self) -> usize {
        *self.submit_calls.lock().expect("submit calls")
    }

    fn submitted_artifacts(&self) -> Vec<String> {
        self.submitted_artifacts
            .lock()
            .expect("submitted artifacts")
            .clone()
    }

    fn submitted_metadata(&self) -> Vec<Option<Value>> {
        self.submitted_metadata
            .lock()
            .expect("submitted metadata")
            .clone()
    }

    fn next_outcome(&self) -> TestSubmitOutcome {
        let mut outcomes = self.outcomes.lock().expect("outcomes");
        if outcomes.is_empty() {
            TestSubmitOutcome::Pending
        } else {
            outcomes.remove(0)
        }
    }

    fn record_sign(&self) {
        *self.sign_calls.lock().expect("sign calls") += 1;
    }

    fn record_submit(&self, artifact: String, metadata: Option<Value>) {
        *self.submit_calls.lock().expect("submit calls") += 1;
        self.submitted_artifacts
            .lock()
            .expect("submitted artifacts")
            .push(artifact);
        self.submitted_metadata
            .lock()
            .expect("submitted metadata")
            .push(metadata);
    }
}

impl WalletChainProfile for TestChainProfile {
    fn network(&self) -> &str {
        TEST_NETWORK
    }

    fn amount_unit(&self) -> &str {
        "testunit"
    }

    fn materialize_hd_account(
        &self,
        input: WalletHdAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        if input.mnemonic_entropy.is_empty() || input.wordlist != "english" {
            return Err(WalletChainError::invalid_input("invalid HD root material"));
        }
        let account_id = format!("account-test-{}", input.account_index);
        let account = self.derived_account(
            input.wallet_id,
            account_id.clone(),
            input.network,
            Some(input.account_index),
            self.hd_account_model,
            input.now,
        );
        Ok(WalletProfileAccountMaterialization {
            account,
            addresses: vec![AllocatedAddressV1 {
                account_id,
                purpose: "receive".to_string(),
                index: 0,
                address: format!("test-receive-{}-0", input.account_index),
                public_key: format!("test-receive-public-{}-0", input.account_index),
                derivation_path: format!("m/test/{}/0/0", input.account_index),
                created_at: input.now,
                last_observed_at: None,
            }],
        })
    }

    fn materialize_imported_account(
        &self,
        input: WalletImportedAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        if input.private_key.trim().is_empty() {
            return Err(WalletChainError::invalid_input("private key is required"));
        }
        let account = self.imported_account(
            input.wallet_id,
            input.account_id,
            input.network,
            input.label,
            input.now,
        );
        Ok(WalletProfileAccountMaterialization {
            account,
            addresses: Vec::new(),
        })
    }

    fn derive_address(
        &self,
        input: WalletAddressDeriveInput,
    ) -> Result<WalletAddressDeriveOutput, WalletChainError> {
        if !input.account.is_derived() {
            return Err(WalletChainError::unsupported_account_model(
                "imported accounts do not support address derivation",
            ));
        }
        let mut account = input.account;
        let index = if input.purpose == "receive" {
            account.next_receive_index().unwrap_or(0)
        } else {
            account.next_change_index().unwrap_or(0)
        };
        let derivation_path = format!(
            "m/test/{}/{}/{}",
            account.account_index().unwrap_or(0),
            input.purpose,
            index
        );
        let address = format!("test-{}-{index}", input.purpose);
        let public_key = format!("test-public-{}-{index}", input.purpose);
        if input.purpose == "receive" {
            account.set_next_receive_state(index + 1, address.clone(), derivation_path.clone());
        } else {
            account.set_next_change_index(index + 1);
        }
        account.set_updated_at(input.now);
        let allocated = AllocatedAddressV1 {
            account_id: account.account_id().to_string(),
            purpose: input.purpose.clone(),
            index,
            address: address.clone(),
            public_key: public_key.clone(),
            derivation_path: derivation_path.clone(),
            created_at: input.now,
            last_observed_at: None,
        };
        Ok(WalletAddressDeriveOutput {
            response: WalletAddressesDeriveResponse {
                account_id: account.account_id().to_string(),
                purpose: input.purpose,
                address,
                public_key,
                derivation_path,
                index,
            },
            account,
            address: allocated,
        })
    }

    fn balance(&self, input: WalletBalanceInput) -> Result<WalletBalanceOutput, WalletChainError> {
        if input.account.network().as_str() != TEST_NETWORK {
            return Err(WalletChainError::unsupported_chain("wrong test network"));
        }
        Ok(WalletBalanceOutput::from_balance(WalletBalance {
            spendable: "1000".to_string(),
            pending_in: "0".to_string(),
            pending_out: "0".to_string(),
            total: "1000".to_string(),
            amount_unit: self.amount_unit().to_string(),
        }))
    }

    fn prepare(&self, input: WalletPrepareInput) -> Result<WalletPrepareOutput, WalletChainError> {
        let amount = input.outputs.iter().try_fold(0u128, |sum, output| {
            output
                .amount
                .parse::<u128>()
                .map(|amount| sum.saturating_add(amount))
                .map_err(|_| WalletChainError::invalid_input("bad amount"))
        })?;
        let fee = match input.fee_tier {
            WalletFeeTier::Slow => 1,
            WalletFeeTier::Standard => 2,
            WalletFeeTier::Fast => 3,
        };
        Ok(WalletPrepareOutput {
            preview: WalletPreview {
                amount_unit: self.amount_unit().to_string(),
                outputs: input.outputs.clone(),
                estimated_fee: fee.to_string(),
                total_debit: amount.saturating_add(fee).to_string(),
                warnings: Vec::new(),
                ton: None,
                ethereum: None,
            },
            provider_snapshot: Some(json!({"test_nonce": 1})),
            canonical_payload: serde_json::to_string(&json!({
                "account_id": input.account.account_id(),
                "outputs": input.outputs,
                "fee": fee
            }))
            .expect("canonical payload"),
            materializations: Vec::new(),
        })
    }

    fn sign_prepared(
        &self,
        input: WalletSignInput,
    ) -> Result<WalletSignedArtifact, WalletChainError> {
        if let Some(control) = &self.submit_control {
            control.record_sign();
        }
        if input.provider_snapshot != Some(json!({"test_nonce": 1})) {
            return Err(WalletChainError::preparation_stale(
                "test provider snapshot changed",
            ));
        }
        Ok(WalletSignedArtifact {
            signed_artifact: zeroize::Zeroizing::new(format!(
                "signed-test-{}",
                input.preparation_id
            )),
            tx_hash: Some(format!("test-tx-{}", input.preparation_id)),
            message_ref: None,
            submit_metadata: self
                .submit_control
                .as_ref()
                .map(|_| json!({"test_submit_nonce": 42})),
        })
    }

    fn submit_signed(
        &self,
        input: WalletSubmitInput,
    ) -> Result<WalletSubmitOutput, WalletChainError> {
        if let Some(control) = &self.submit_control {
            let metadata = input.signed_artifact.submit_metadata.clone();
            control.record_submit(input.signed_artifact.signed_artifact.to_string(), metadata);
            if input
                .signed_artifact
                .submit_metadata
                .as_ref()
                .and_then(|metadata| metadata.get("test_submit_nonce"))
                .and_then(Value::as_u64)
                != Some(42)
            {
                return Err(WalletChainError::internal(
                    "test signed artifact missing submit metadata",
                ));
            }
            match control.next_outcome() {
                TestSubmitOutcome::Pending => {}
                TestSubmitOutcome::ProviderUnavailable => {
                    return Err(WalletChainError::provider_unavailable());
                }
                TestSubmitOutcome::BroadcastUnknown => {
                    return Err(WalletChainError::broadcast_unknown(
                        "test provider outcome unknown",
                    ));
                }
                TestSubmitOutcome::BroadcastRejected => {
                    return Err(WalletChainError::broadcast_rejected(
                        "test provider rejected broadcast",
                    ));
                }
            }
        }
        Ok(WalletSubmitOutput {
            status: WalletConfirmStatus::Pending,
            tx_hash: input.signed_artifact.tx_hash,
            message_ref: input.signed_artifact.message_ref,
        })
    }

    fn refresh(&self, input: WalletRefreshInput) -> Result<WalletRefreshOutput, WalletChainError> {
        Ok(WalletRefreshOutput {
            tx_hash: input.transaction.tx_hash,
            observations: vec![WalletProviderObservationV1 {
                source_id: "testchain:primary".to_string(),
                independence_group: "testchain:primary".to_string(),
                observed_at: input.now,
                outcome: WalletProviderObservationOutcomeV1::Confirmed,
                block_ref: None,
                confirmations: None,
                reason: None,
            }],
        })
    }
}

#[derive(Debug, Default)]
struct RecordingWalletTelemetrySink {
    events: Mutex<Vec<WalletTelemetryEvent>>,
}

impl RecordingWalletTelemetrySink {
    fn events(&self) -> Vec<WalletTelemetryEvent> {
        self.events.lock().expect("events").clone()
    }
}

impl WalletTelemetrySink for RecordingWalletTelemetrySink {
    fn record(&self, event: WalletTelemetryEvent) {
        self.events.lock().expect("events").push(event);
    }
}

#[derive(Debug)]
struct MockTonProvider {
    snapshot: Mutex<TonProviderSnapshot>,
    snapshot_available: AtomicBool,
    fee_estimates: Mutex<Vec<TonFeeEstimateRequest>>,
    broadcasts: Mutex<Vec<TonBroadcastRequest>>,
    refreshes: Mutex<Vec<TonRefreshRequest>>,
    history: Mutex<Vec<TonHistoryTransaction>>,
    destination_state: Mutex<TonProviderAccountState>,
}

impl MockTonProvider {
    fn new() -> Self {
        Self {
            snapshot: Mutex::new(TonProviderSnapshot {
                seqno: 7,
                account_state: TonProviderAccountState::Active,
                balance: 2_000_000_000,
                estimated_fee: Some(5_000_000),
            }),
            snapshot_available: AtomicBool::new(true),
            fee_estimates: Mutex::new(Vec::new()),
            broadcasts: Mutex::new(Vec::new()),
            refreshes: Mutex::new(Vec::new()),
            history: Mutex::new(Vec::new()),
            destination_state: Mutex::new(TonProviderAccountState::Active),
        }
    }

    fn set_seqno(&self, seqno: u32) {
        self.snapshot.lock().expect("snapshot").seqno = seqno;
    }

    fn set_balance(&self, balance: u128) {
        self.snapshot.lock().expect("snapshot").balance = balance;
    }

    fn set_snapshot_available(&self, available: bool) {
        self.snapshot_available.store(available, Ordering::Relaxed);
    }

    fn set_estimated_fee(&self, estimated_fee: Option<u128>) {
        self.snapshot.lock().expect("snapshot").estimated_fee = estimated_fee;
    }

    fn broadcasts(&self) -> Vec<TonBroadcastRequest> {
        self.broadcasts.lock().expect("broadcasts").clone()
    }

    fn fee_estimates(&self) -> Vec<TonFeeEstimateRequest> {
        self.fee_estimates.lock().expect("fee_estimates").clone()
    }

    fn set_account_state(&self, account_state: TonProviderAccountState) {
        self.snapshot.lock().expect("snapshot").account_state = account_state;
    }

    fn set_destination_state(&self, destination_state: TonProviderAccountState) {
        *self.destination_state.lock().expect("destination_state") = destination_state;
    }

    fn set_history(&self, history: Vec<TonHistoryTransaction>) {
        *self.history.lock().expect("history") = history;
    }
}

impl TonProvider for MockTonProvider {
    fn snapshot(
        &self,
        _account: &TonProviderAccount,
    ) -> Result<TonProviderSnapshot, TonProviderError> {
        if !self.snapshot_available.load(Ordering::Relaxed) {
            return Err(TonProviderError::unavailable("TON provider unavailable"));
        }
        Ok(self.snapshot.lock().expect("snapshot").clone())
    }

    fn account_state(&self, _address: &str) -> Result<TonProviderAccountState, TonProviderError> {
        Ok(*self.destination_state.lock().expect("destination_state"))
    }

    fn estimate_transfer_fee(
        &self,
        request: TonFeeEstimateRequest,
    ) -> Result<u128, TonProviderError> {
        self.fee_estimates
            .lock()
            .expect("fee_estimates")
            .push(request);
        let snapshot = self.snapshot.lock().expect("snapshot");
        Ok(snapshot.estimated_fee.unwrap_or(
            if snapshot.account_state == TonProviderAccountState::Uninitialized {
                10_000_000
            } else {
                5_000_000
            },
        ))
    }

    fn broadcast(
        &self,
        request: TonBroadcastRequest,
    ) -> Result<TonBroadcastResult, TonProviderError> {
        self.broadcasts
            .lock()
            .expect("broadcasts")
            .push(request.clone());
        Ok(TonBroadcastResult {
            status: WalletConfirmStatus::Pending,
            tx_hash: Some(format!("ton-tx-{}", request.seqno)),
            message_ref: Some(request.message_hash),
        })
    }

    fn refresh(&self, request: TonRefreshRequest) -> Result<TonRefreshResult, TonProviderError> {
        self.refreshes.lock().expect("refreshes").push(request);
        Ok(TonRefreshResult {
            status: WalletTxStatus::Confirmed,
            tx_hash: Some("ton-confirmed-hash".to_string()),
            found: true,
        })
    }

    fn history(
        &self,
        _request: TonHistoryRequest,
    ) -> Result<Vec<TonHistoryTransaction>, TonProviderError> {
        Ok(self.history.lock().expect("history").clone())
    }
}

#[derive(Debug)]
struct MockBitcoinProvider {
    address_statuses: Mutex<HashMap<String, BitcoinAddressStatus>>,
    address_status_calls: Mutex<usize>,
    utxos: Mutex<HashMap<String, Vec<BitcoinUtxo>>>,
    broadcasts: Mutex<Vec<String>>,
    tx_statuses: Mutex<HashMap<String, BitcoinTransactionStatus>>,
    address_status_delay_ms: AtomicU64,
}

impl MockBitcoinProvider {
    fn new() -> Self {
        Self {
            address_statuses: Mutex::new(HashMap::new()),
            address_status_calls: Mutex::new(0),
            utxos: Mutex::new(HashMap::new()),
            broadcasts: Mutex::new(Vec::new()),
            tx_statuses: Mutex::new(HashMap::new()),
            address_status_delay_ms: AtomicU64::new(0),
        }
    }

    fn fund_address(&self, address: &str, value: u64) {
        self.address_statuses.lock().expect("statuses").insert(
            address.to_string(),
            BitcoinAddressStatus {
                chain_stats: BitcoinAddressStats {
                    funded_txo_sum: value,
                    spent_txo_sum: 0,
                    tx_count: 1,
                },
                mempool_stats: BitcoinAddressStats {
                    funded_txo_sum: 0,
                    spent_txo_sum: 0,
                    tx_count: 0,
                },
            },
        );
        self.utxos.lock().expect("utxos").insert(
            address.to_string(),
            vec![BitcoinUtxo {
                txid: "1111111111111111111111111111111111111111111111111111111111111111"
                    .to_string(),
                vout: 0,
                value,
                address: address.to_string(),
                script_pubkey: String::new(),
                confirmed: true,
                confirmations: 10,
                block_height: Some(91),
            }],
        );
    }

    fn broadcasts(&self) -> Vec<String> {
        self.broadcasts.lock().expect("broadcasts").clone()
    }

    fn address_status_calls(&self) -> usize {
        *self
            .address_status_calls
            .lock()
            .expect("address status calls")
    }

    fn set_address_status_delay_ms(&self, delay_ms: u64) {
        self.address_status_delay_ms
            .store(delay_ms, Ordering::SeqCst);
    }
}

impl BitcoinProvider for MockBitcoinProvider {
    fn tip_height(&self) -> Result<Option<u64>, BitcoinProviderError> {
        Ok(Some(100))
    }

    fn address_status(&self, address: &str) -> Result<BitcoinAddressStatus, BitcoinProviderError> {
        let delay_ms = self.address_status_delay_ms.load(Ordering::SeqCst);
        if delay_ms > 0 {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        }
        *self
            .address_status_calls
            .lock()
            .expect("address status calls") += 1;
        Ok(self
            .address_statuses
            .lock()
            .expect("statuses")
            .get(address)
            .cloned()
            .unwrap_or(BitcoinAddressStatus {
                chain_stats: BitcoinAddressStats {
                    funded_txo_sum: 0,
                    spent_txo_sum: 0,
                    tx_count: 0,
                },
                mempool_stats: BitcoinAddressStats {
                    funded_txo_sum: 0,
                    spent_txo_sum: 0,
                    tx_count: 0,
                },
            }))
    }

    fn address_utxos(&self, address: &str) -> Result<Vec<BitcoinUtxo>, BitcoinProviderError> {
        Ok(self
            .utxos
            .lock()
            .expect("utxos")
            .get(address)
            .cloned()
            .unwrap_or_default())
    }

    fn fee_estimates(&self) -> Result<BitcoinFeeEstimates, BitcoinProviderError> {
        Ok(BitcoinFeeEstimates {
            slow_sat_vb: 2,
            standard_sat_vb: 5,
            fast_sat_vb: 10,
        })
    }

    fn broadcast_raw_tx(
        &self,
        raw_tx_hex: &str,
    ) -> Result<BitcoinBroadcastResult, BitcoinProviderError> {
        self.broadcasts
            .lock()
            .expect("broadcasts")
            .push(raw_tx_hex.to_string());
        let bytes =
            parse_hex(raw_tx_hex).map_err(|error| BitcoinProviderError::rejected(error.message))?;
        let tx: ::bitcoin::Transaction = ::bitcoin::consensus::encode::deserialize(&bytes)
            .map_err(|error| {
                BitcoinProviderError::rejected(format!("signed transaction parse failed: {error}"))
            })?;
        let txid = tx.compute_txid().to_string();
        self.tx_statuses.lock().expect("tx statuses").insert(
            txid.clone(),
            BitcoinTransactionStatus {
                confirmed: false,
                block_height: None,
                confirmations: 0,
            },
        );
        Ok(BitcoinBroadcastResult { txid })
    }

    fn transaction_status(
        &self,
        txid: &str,
    ) -> Result<Option<BitcoinTransactionStatus>, BitcoinProviderError> {
        Ok(self
            .tx_statuses
            .lock()
            .expect("tx statuses")
            .get(txid)
            .cloned())
    }
}

fn wallet_config_enabled() -> WalletRuntimeConfig {
    WalletRuntimeConfig::with_wallet_enabled(true)
}

fn wallet_config_disabled() -> WalletRuntimeConfig {
    WalletRuntimeConfig::with_wallet_enabled(false)
}

fn create_base_wallet_router() -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    (
        router.with_wallet_runtime_config(wallet_config_enabled()),
        temp_dir,
    )
}

fn create_profile_wallet_router() -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    (
        router
            .with_wallet_runtime_config(wallet_config_enabled())
            .with_wallet_chain_profile(Arc::new(TestChainProfile::utxo())),
        temp_dir,
    )
}

fn create_account_based_profile_wallet_router() -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    (
        router
            .with_wallet_runtime_config(wallet_config_enabled())
            .with_wallet_chain_profile(Arc::new(TestChainProfile::account_based())),
        temp_dir,
    )
}

fn create_profile_wallet_router_with_master() -> (RpcRouter, TempDir) {
    let (mut router, temp_dir) = create_profile_wallet_router();
    setup_master(&mut router);
    (router, temp_dir)
}

fn create_replay_controlled_wallet_router_with_master(
    submit_control: Arc<TestSubmitControl>,
) -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TestChainProfile::replay_controlled(
            submit_control,
        )));
    setup_master(&mut router);
    (router, temp_dir)
}

fn create_ton_wallet_router(wallet_enabled: bool) -> (RpcRouter, Arc<MockTonProvider>, TempDir) {
    let (router, temp_dir) = create_test_router();
    let provider = Arc::new(MockTonProvider::new());
    let mut router = router
        .with_wallet_runtime_config(if wallet_enabled {
            wallet_config_enabled()
        } else {
            wallet_config_disabled()
        })
        .with_wallet_chain_profile(Arc::new(TonChainProfile::new(provider.clone())));
    setup_master(&mut router);
    (router, provider, temp_dir)
}

fn create_unavailable_ton_wallet_router() -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TonChainProfile::unavailable()));
    setup_master(&mut router);
    (router, temp_dir)
}

fn create_bitcoin_wallet_router() -> (RpcRouter, Arc<MockBitcoinProvider>, TempDir) {
    let (router, temp_dir) = create_test_router();
    let provider = Arc::new(MockBitcoinProvider::new());
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(BitcoinChainProfile::new(provider.clone())));
    setup_master(&mut router);
    (router, provider, temp_dir)
}

fn create_unavailable_bitcoin_wallet_router() -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(BitcoinChainProfile::unavailable()));
    setup_master(&mut router);
    (router, temp_dir)
}

fn rpc(router: &mut RpcRouter, command: &str, data: serde_json::Value) -> RpcResponse {
    router.handle(&RpcRequest::new(command, data))
}

fn setup_master(router: &mut RpcRouter) {
    let setup = rpc(
        router,
        "master:setup",
        json!({"master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&setup);
}

fn wallet_status_network<'a>(
    result: &'a serde_json::Value,
    network: &str,
) -> &'a serde_json::Value {
    result
        .get("networks")
        .and_then(|value| value.as_array())
        .and_then(|networks| {
            networks.iter().find(|status| {
                status.get("network").and_then(|value| value.as_str()) == Some(network)
            })
        })
        .expect("wallet network status")
}

fn valid_mnemonic_json() -> serde_json::Value {
    serde_json::Value::Array(
        VALID_MNEMONIC
            .iter()
            .map(|word| serde_json::Value::String((*word).to_string()))
            .collect(),
    )
}

fn ton_native_mnemonic_json() -> serde_json::Value {
    serde_json::Value::Array(
        TON_NATIVE_MNEMONIC
            .iter()
            .map(|word| serde_json::Value::String((*word).to_string()))
            .collect(),
    )
}

fn valid_bip39_24_word_mnemonic_json() -> serde_json::Value {
    serde_json::Value::Array(
        VALID_BIP39_24_WORD_MNEMONIC
            .iter()
            .map(|word| serde_json::Value::String((*word).to_string()))
            .collect(),
    )
}

fn create_hd_wallet(router: &mut RpcRouter) -> (String, String) {
    let response = rpc(
        router,
        "wallet:hd:create",
        json!({
            "label": "Main wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "bip39_passphrase": "secret passphrase",
            "supported_networks": [TEST_NETWORK]
        }),
    );
    assert_rpc_ok(&response);
    let result = response.result().expect("hd create result");
    let wallet_id = result
        .get("wallet_id")
        .and_then(|value| value.as_str())
        .expect("wallet_id")
        .to_string();
    let account_id = result
        .get("accounts")
        .and_then(|value| value.as_array())
        .and_then(|accounts| accounts.first())
        .and_then(|account| account.get("account_id"))
        .and_then(|value| value.as_str())
        .expect("account_id")
        .to_string();
    (wallet_id, account_id)
}

fn first_wallet_transaction(router: &mut RpcRouter) -> Value {
    let response = rpc(router, "wallet:transactions:list", json!({}));
    assert_rpc_ok(&response);
    response
        .result()
        .and_then(|result| result.get("transactions"))
        .and_then(Value::as_array)
        .and_then(|transactions| transactions.first())
        .cloned()
        .expect("wallet transaction")
}

fn create_ton_hd_wallet(router: &mut RpcRouter) -> (String, String, String) {
    let response = rpc(
        router,
        "wallet:hd:create",
        json!({
            "label": "TON wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "bip39_passphrase": "secret passphrase",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_ok(&response);
    let result = response.result().expect("hd create result");
    let wallet_id = result
        .get("wallet_id")
        .and_then(|value| value.as_str())
        .expect("wallet_id")
        .to_string();
    let account = result
        .get("accounts")
        .and_then(|value| value.as_array())
        .and_then(|accounts| accounts.first())
        .expect("ton account");
    let account_id = account
        .get("account_id")
        .and_then(|value| value.as_str())
        .expect("account_id")
        .to_string();
    let address = account
        .get("address")
        .and_then(|value| value.as_str())
        .expect("address")
        .to_string();
    (wallet_id, account_id, address)
}

fn create_bitcoin_hd_wallet(router: &mut RpcRouter) -> (String, String) {
    let response = rpc(
        router,
        "wallet:hd:create",
        json!({
            "label": "BTC wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["bitcoin"]
        }),
    );
    assert_rpc_ok(&response);
    let result = response.result().expect("hd create result");
    let wallet_id = result
        .get("wallet_id")
        .and_then(Value::as_str)
        .expect("wallet_id")
        .to_string();
    let account = result
        .get("accounts")
        .and_then(Value::as_array)
        .and_then(|accounts| accounts.first())
        .expect("bitcoin account");
    assert_eq!(
        account.get("network").and_then(Value::as_str),
        Some("bitcoin")
    );
    assert_eq!(
        account.get("account_model").and_then(Value::as_str),
        Some("utxo")
    );
    assert_eq!(
        account.get("derivation_profile").and_then(Value::as_str),
        Some("bitcoin_bip84_account")
    );
    (
        wallet_id,
        account
            .get("account_id")
            .and_then(Value::as_str)
            .expect("account_id")
            .to_string(),
    )
}

fn test_bitcoin_wif() -> String {
    let private_key = ::bitcoin::PrivateKey::new(
        ::bitcoin::secp256k1::SecretKey::from_slice(&[1u8; 32]).expect("secret key"),
        ::bitcoin::Network::Bitcoin,
    );
    private_key.to_wif()
}

fn test_uncompressed_bitcoin_wif() -> String {
    let private_key = ::bitcoin::PrivateKey {
        compressed: false,
        ..::bitcoin::PrivateKey::new(
            ::bitcoin::secp256k1::SecretKey::from_slice(&[1u8; 32]).expect("secret key"),
            ::bitcoin::Network::Bitcoin,
        )
    };
    private_key.to_wif()
}

#[test]
fn wallet_core_status_and_capabilities_are_truthful() {
    let (mut disabled_router, _temp_dir) = create_test_router();
    unlock_vault(&mut disabled_router, "pw");
    let disabled_status = rpc(&mut disabled_router, "wallet:status", json!({}));
    assert_rpc_ok(&disabled_status);
    let disabled_result = disabled_status.result().expect("disabled status");
    assert_eq!(disabled_result["enabled"], false);
    assert_eq!(disabled_result["disabled_reason"], "Wallet domain disabled");

    let disabled_mnemonic = rpc(
        &mut disabled_router,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode": "multichain", "mnemonic_standard": "bip39", "word_count": 12}),
    );
    assert_rpc_error(&disabled_mnemonic, "WALLET_DISABLED");
    let disabled_cancel = rpc(
        &mut disabled_router,
        "wallet:transaction:cancel",
        json!({"preparation_id": "preparation-disabled"}),
    );
    assert_rpc_error(&disabled_cancel, "WALLET_DISABLED");
    let disabled_address_derive = rpc(
        &mut disabled_router,
        "wallet:addresses:derive",
        json!({"account_id": "account-disabled", "purpose": "receive"}),
    );
    assert_rpc_error(&disabled_address_derive, "WALLET_DISABLED");

    let (mut router, _temp_dir) = create_base_wallet_router();
    unlock_vault(&mut router, "pw");
    let enabled_status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&enabled_status);
    let enabled_result = enabled_status.result().expect("enabled status");
    assert_eq!(enabled_result["enabled"], true);
    assert!(enabled_result.get("disabled_reason").is_none());
    assert_eq!(enabled_result["networks"], json!([]));

    let capabilities = rpc(&mut router, "core:capabilities", json!({}));
    assert_rpc_ok(&capabilities);
    let features = capabilities
        .result()
        .and_then(|result| result.get("features"))
        .and_then(|value| value.as_array())
        .expect("features");
    assert!(features
        .iter()
        .any(|feature| feature == "wallet_domain_base_v1"));
    assert!(!features
        .iter()
        .any(|feature| feature == "wallet_core_btc_eth_v1"));
}

#[test]
fn wallet_status_reports_ton_provider_ready() {
    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");

    let status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&status);
    let result = status.result().expect("status result");
    let ton = wallet_status_network(result, "ton");

    assert_eq!(ton["enabled"], true);
    assert_eq!(ton["provider_status"], "ready");
    assert_eq!(ton["broadcast_enabled"], true);
    assert!(ton.get("disabled_reason").is_none());
    let capabilities = ton["capabilities"].as_array().expect("capabilities");
    assert!(capabilities.iter().any(|capability| {
        capability["id"] == "ton_native_transfer" && capability["state"] == "ready"
    }));
    assert!(capabilities.iter().any(|capability| {
        capability["id"] == "ton_connect_v1" && capability["state"] == "disabled"
    }));
}

#[test]
fn wallet_status_does_not_overclaim_unimplemented_capabilities() {
    let (router, temp_dir) = create_test_router();
    let provider = Arc::new(MockTonProvider::new());
    let mut config = wallet_config_enabled();
    config
        .enabled_capabilities
        .insert(TON_CONNECT_CAPABILITY.to_string());
    let mut router = router
        .with_wallet_runtime_config(config)
        .with_wallet_chain_profile(Arc::new(TonChainProfile::new(provider)));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");

    let status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&status);
    let ton = wallet_status_network(status.result().expect("status result"), "ton");
    let ton_connect = ton["capabilities"]
        .as_array()
        .expect("capabilities")
        .iter()
        .find(|capability| capability["id"] == TON_CONNECT_CAPABILITY)
        .expect("TON Connect capability");

    assert_eq!(ton_connect["state"], "unavailable");
    assert_eq!(
        ton_connect["disabled_reason"],
        "Wallet capability is not implemented in this build"
    );
    drop(temp_dir);
}

#[test]
fn wallet_status_reports_ton_provider_unavailable() {
    let (mut router, _temp_dir) = create_unavailable_ton_wallet_router();
    unlock_vault(&mut router, "pw");

    let status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&status);
    let result = status.result().expect("status result");
    let ton = wallet_status_network(result, "ton");

    assert_eq!(ton["enabled"], true);
    assert_eq!(ton["provider_status"], "unavailable");
    assert_eq!(ton["broadcast_enabled"], false);
    assert_eq!(ton["disabled_reason"], "Wallet provider unavailable");
}

#[test]
fn wallet_status_reports_bitcoin_provider_unavailable_without_blocking_local_hd_create() {
    let (mut router, _temp_dir) = create_unavailable_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");

    let status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&status);
    let result = status.result().expect("status result");
    let bitcoin = wallet_status_network(result, "bitcoin");
    assert_eq!(bitcoin["enabled"], true);
    assert_eq!(bitcoin["provider_status"], "unavailable");
    assert_eq!(bitcoin["broadcast_enabled"], false);

    let (_wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);
    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    let account = accounts
        .result()
        .and_then(|result| result.get("accounts"))
        .and_then(Value::as_array)
        .and_then(|accounts| {
            accounts.iter().find(|account| {
                account.get("account_id").and_then(Value::as_str) == Some(account_id.as_str())
            })
        })
        .expect("bitcoin account");
    assert_eq!(
        account.get("next_receive_index").and_then(Value::as_u64),
        Some(0)
    );
    assert!(account.get("current_receive_address").is_none());
}

#[test]
fn wallet_core_bitcoin_hd_create_does_not_query_ready_provider() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");

    let (_wallet_id, _account_id) = create_bitcoin_hd_wallet(&mut router);

    assert_eq!(provider.address_status_calls(), 0);
}

#[test]
fn generated_bitcoin_wallet_does_not_require_recovery_discovery() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let generated = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({
            "wallet_mode": "multichain",
            "mnemonic_standard": "bip39",
            "word_count": 12,
            "wordlist": "english"
        }),
    );
    assert_rpc_ok(&generated);
    let draft_id = generated.result().unwrap()["mnemonic_draft_id"]
        .as_str()
        .expect("draft id");
    let created = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "New BTC wallet",
            "wallet_mode": "multichain",
            "mnemonic_draft_id": draft_id,
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["bitcoin"]
        }),
    );
    assert_rpc_ok(&created);

    let wallets = rpc(&mut router, "wallet:list", json!({}));
    assert_rpc_ok(&wallets);
    assert!(wallets.result().unwrap()["wallets"][0]
        .get("bitcoin_discovery_pending")
        .is_none());
    assert_eq!(provider.address_status_calls(), 0);
}

#[test]
fn bitcoin_balance_runs_gap_discovery_only_when_requested() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (wallet_id, first_account_id) = create_bitcoin_hd_wallet(&mut router);
    let second = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "bitcoin"}),
    );
    assert_rpc_ok(&second);

    let balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": first_account_id}),
    );

    assert_rpc_ok(&balance);
    assert_eq!(provider.address_status_calls(), 0);
    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(accounts.result().unwrap()["cached_balances"], json!([]));

    let wallets = rpc(&mut router, "wallet:list", json!({}));
    assert_rpc_ok(&wallets);
    assert_eq!(
        wallets.result().unwrap()["wallets"][0]["bitcoin_discovery_pending"],
        true
    );

    let discovery = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": first_account_id, "discover_addresses": true}),
    );

    assert_rpc_ok(&discovery);
    assert_eq!(provider.address_status_calls(), 40);
    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(
        accounts.result().unwrap()["cached_balances"][0]["account_id"],
        first_account_id
    );

    let wallets = rpc(&mut router, "wallet:list", json!({}));
    assert_rpc_ok(&wallets);
    assert!(wallets.result().unwrap()["wallets"][0]
        .get("bitcoin_discovery_pending")
        .is_none());
}

#[test]
fn bitcoin_balance_network_task_does_not_hold_the_rpc_router_or_cache_stale_result() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);
    provider.set_address_status_delay_ms(5);
    let snapshot = router
        .snapshot_wallet_balance_get(&json!({"account_id": account_id, "discover_addresses": true}))
        .expect("balance snapshot")
        .expect("bitcoin split balance");

    let balance_worker = std::thread::spawn(move || execute_wallet_balance_snapshot(snapshot));
    let derived = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id, "purpose": "receive"}),
    );

    assert_rpc_ok(&derived);
    let response = router.commit_wallet_balance_get(balance_worker.join().expect("balance task"));
    assert_rpc_ok(&response);
    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(accounts.result().unwrap()["cached_balances"], json!([]));
}

#[test]
fn multichain_wallet_lazily_adds_a_newly_enabled_network() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TestChainProfile::utxo()))
        .with_wallet_chain_profile(Arc::new(TonChainProfile::unavailable()));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let (wallet_id, _account_id) = create_hd_wallet(&mut router);

    let derived = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "ton"}),
    );
    assert_rpc_ok(&derived);

    let wallets = rpc(&mut router, "wallet:list", json!({}));
    assert_rpc_ok(&wallets);
    let wallet = wallets
        .result()
        .and_then(|result| result.get("wallets"))
        .and_then(Value::as_array)
        .and_then(|wallets| wallets.first())
        .expect("wallet");
    assert_eq!(wallet["supported_networks"], json!([TEST_NETWORK, "ton"]));

    let accounts = rpc(
        &mut router,
        "wallet:accounts:list",
        json!({"wallet_id": wallet_id}),
    );
    assert_rpc_ok(&accounts);
    assert!(accounts.result().unwrap()["accounts"]
        .as_array()
        .expect("accounts")
        .iter()
        .any(|account| account["network"] == "ton"));
}

#[test]
fn bitcoin_address_derivation_allocates_bip84_receive_and_imported_rejects_derivation() {
    let (mut router, _temp_dir) = create_unavailable_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);

    let derived = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id.clone(), "purpose": "receive"}),
    );
    assert_rpc_ok(&derived);
    let result = derived.result().expect("derive result");
    assert_eq!(
        result.get("purpose").and_then(Value::as_str),
        Some("receive")
    );
    assert_eq!(result.get("index").and_then(Value::as_u64), Some(0));
    assert!(result
        .get("address")
        .and_then(Value::as_str)
        .is_some_and(|address| address.starts_with("bc1q")));
    assert_eq!(
        result.get("derivation_path").and_then(Value::as_str),
        Some("m/84'/0'/0'/0/0")
    );

    let imported = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Imported BTC",
            "network": "bitcoin",
            "curve": "secp256k1",
            "encoding": "wif",
            "private_key": test_bitcoin_wif()
        }),
    );
    assert_rpc_ok(&imported);
    let imported_account_id = imported
        .result()
        .and_then(|result| result.get("account_id"))
        .and_then(Value::as_str)
        .expect("imported account id");
    let imported_derive = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": imported_account_id, "purpose": "receive"}),
    );
    assert_rpc_error(&imported_derive, "UNSUPPORTED_ACCOUNT_MODEL");
}

#[test]
fn bitcoin_import_rejects_uncompressed_wif() {
    let (mut router, _temp_dir) = create_unavailable_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");

    let imported = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Uncompressed BTC",
            "network": "bitcoin",
            "curve": "secp256k1",
            "encoding": "wif",
            "private_key": test_uncompressed_bitcoin_wif()
        }),
    );

    assert_rpc_error(&imported, "INVALID_INPUT");
}

#[test]
fn bitcoin_address_derivation_hard_blocks_at_gap_limit() {
    let (mut router, _temp_dir) = create_unavailable_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);

    for _ in 0..20 {
        let derived = rpc(
            &mut router,
            "wallet:addresses:derive",
            json!({"account_id": account_id, "purpose": "receive"}),
        );
        assert_rpc_ok(&derived);
    }

    let blocked = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id, "purpose": "receive"}),
    );
    assert_rpc_error(&blocked, "ADDRESS_GAP_LIMIT_REACHED");
}

#[test]
fn wallet_core_safe_list_style_commands_remain_read_only_when_wallet_absent() {
    let (mut router, _temp_dir) = create_base_wallet_router();
    unlock_vault(&mut router, "pw");

    let wallet_list = rpc(&mut router, "wallet:list", json!({}));
    assert_rpc_ok(&wallet_list);
    assert_eq!(
        wallet_list
            .result()
            .and_then(|result| result.get("wallets"))
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(0)
    );

    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(
        accounts
            .result()
            .and_then(|result| result.get("accounts"))
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(0)
    );

    let transactions = rpc(&mut router, "wallet:transactions:list", json!({}));
    assert_rpc_ok(&transactions);
    assert_eq!(
        transactions
            .result()
            .and_then(|result| result.get("transactions"))
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(0)
    );
}

#[test]
fn wallet_core_hd_generate_mnemonic_returns_real_bip39_words() {
    let (mut router, _temp_dir) = create_base_wallet_router();
    unlock_vault(&mut router, "pw");

    let response = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode": "multichain", "mnemonic_standard": "bip39", "word_count": 12}),
    );
    assert_rpc_ok(&response);
    let result = response.result().expect("mnemonic result");
    let words = result
        .get("mnemonic")
        .and_then(|value| value.as_array())
        .expect("mnemonic words")
        .iter()
        .map(|word| word.as_str().expect("word"))
        .collect::<Vec<_>>();
    assert_eq!(words.len(), 12);
    let phrase = words.join(" ");
    Mnemonic::parse_in_normalized(Language::English, &phrase).expect("valid bip39 mnemonic");
    assert!(result["mnemonic_draft_id"]
        .as_str()
        .is_some_and(|draft_id| draft_id.starts_with("mnemonic-draft-")));
    assert_eq!(result["wordlist"], "english");
    assert_eq!(result["wallet_mode"], "multichain");
    assert_eq!(result["mnemonic_standard"], "bip39");
    assert!(result["expires_at"]
        .as_u64()
        .is_some_and(|expires_at| expires_at > 0));

    let invalid = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode": "multichain", "mnemonic_standard": "bip39", "word_count": 13}),
    );
    assert_rpc_error(&invalid, "INVALID_INPUT");
}

#[test]
fn wallet_core_hd_create_idempotency_survives_router_restart() {
    let (router, temp_dir, keystore) = create_test_router_with_keystore();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TestChainProfile::utxo()));
    unlock_vault(&mut router, "pw");

    let generated = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode": "multichain", "mnemonic_standard": "bip39", "word_count": 12}),
    );
    assert_rpc_ok(&generated);
    let draft_id = generated.result().unwrap()["mnemonic_draft_id"]
        .as_str()
        .expect("draft id")
        .to_string();

    let payload = json!({
        "label": "Draft wallet",
        "wallet_mode": "multichain",
        "mnemonic_draft_id": draft_id,
        "wordlist": "english",
        "mnemonic_standard": "bip39",
        "supported_networks": [TEST_NETWORK],
        "client_request_id": "create-from-draft"
    });
    let created = rpc(&mut router, "wallet:hd:create", payload.clone());
    assert_rpc_ok(&created);
    let wallet_id = created.result().unwrap()["wallet_id"]
        .as_str()
        .expect("wallet id")
        .to_string();

    drop(router);
    let storage = Storage::new(temp_dir.path()).expect("reopen wallet storage");
    let mut router = RpcRouter::new(storage)
        .with_keystore(keystore)
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TestChainProfile::utxo()));
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let retry = rpc(&mut router, "wallet:hd:create", payload);
    assert_rpc_ok(&retry);
    assert_eq!(retry.result().unwrap()["wallet_id"], wallet_id);

    let reuse = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Draft wallet again",
            "wallet_mode": "multichain",
            "mnemonic_draft_id": draft_id,
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": [TEST_NETWORK]
        }),
    );
    assert_rpc_error(&reuse, "INVALID_INPUT");
}

#[test]
fn wallet_core_hd_create_requires_explicit_mode_standard_and_single_source() {
    let (mut router, _temp_dir) = create_profile_wallet_router();
    unlock_vault(&mut router, "pw");

    let missing_mode = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Missing mode",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": [TEST_NETWORK]
        }),
    );
    assert_rpc_error(&missing_mode, "INVALID_INPUT");

    let generated = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode": "multichain", "mnemonic_standard": "bip39", "word_count": 12}),
    );
    assert_rpc_ok(&generated);
    let draft_id = generated.result().unwrap()["mnemonic_draft_id"]
        .as_str()
        .expect("draft id");
    let two_sources = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Two sources",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "mnemonic_draft_id": draft_id,
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": [TEST_NETWORK]
        }),
    );
    assert_rpc_error(&two_sources, "INVALID_INPUT");
}

#[test]
fn wallet_core_unknown_networks_fail_closed() {
    let (mut router, _temp_dir) = create_base_wallet_router();
    unlock_vault(&mut router, "pw");

    let hd = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Main wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["unknown"]
        }),
    );
    assert_rpc_error(&hd, "UNSUPPORTED_CHAIN");

    let imported = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Imported",
            "network": "unknown",
            "curve": "test",
            "private_key": "secret",
            "encoding": "raw"
        }),
    );
    assert_rpc_error(&imported, "UNSUPPORTED_CHAIN");
}

#[test]
fn wallet_core_rejects_unknown_request_fields() {
    let (mut router, _temp_dir) = create_profile_wallet_router_with_master();
    unlock_vault(&mut router, "pw");
    let (wallet_id, account_id) = create_hd_wallet(&mut router);

    for (command, payload) in [
        ("wallet:list", json!({"unexpected": true})),
        (
            "wallet:hd:create",
            json!({
                "label": "Extra wallet",
                "wallet_mode": "multichain",
                "mnemonic": valid_mnemonic_json(),
                "wordlist": "english",
                "mnemonic_standard": "bip39",
                "supported_networks": [TEST_NETWORK],
                "unexpected": true
            }),
        ),
        (
            "wallet:import:create",
            json!({
                "label": "Imported",
                "network": TEST_NETWORK,
                "curve": "test",
                "private_key": "secret",
                "encoding": "raw",
                "unexpected": true
            }),
        ),
        (
            "wallet:accounts:list",
            json!({"wallet_id": wallet_id, "unexpected": true}),
        ),
        (
            "wallet:addresses:derive",
            json!({"account_id": account_id, "purpose": "receive", "index": 99}),
        ),
        (
            "wallet:transaction:confirm",
            json!({"preparation_id": "prep-missing", "accepted_warnings": [], "unexpected": true}),
        ),
        ("wallet:transactions:list", json!({"unexpected": true})),
        (
            "wallet:transactions:sync",
            json!({"account_id": account_id, "unexpected": true}),
        ),
        (
            "wallet:transactions:refresh",
            json!({"tx_ref": "tx-missing", "unexpected": true}),
        ),
        (
            "wallet:backup:export",
            json!({"wallet_id": "wallet-missing", "master_password": MASTER_PASSWORD, "unexpected": true}),
        ),
    ] {
        let response = rpc(&mut router, command, payload);
        assert_rpc_error(&response, "INVALID_INPUT");
    }
}

#[test]
fn wallet_core_hd_create_backup_and_hidden_shard_use_profile_contract() {
    let (mut router, _temp_dir) = create_profile_wallet_router_with_master();
    unlock_vault(&mut router, "pw");
    let (wallet_id, account_id) = create_hd_wallet(&mut router);

    let root = list_dir(&mut router, "/");
    assert_rpc_ok(&root);
    let names = get_item_names(&get_items(&root));
    assert!(!names.iter().any(|name| name == ".wallet"));

    let direct_wallet = list_dir(&mut router, "/.wallet");
    assert_rpc_error(&direct_wallet, "ACCESS_DENIED");

    let accounts = rpc(
        &mut router,
        "wallet:accounts:list",
        json!({"wallet_id": wallet_id}),
    );
    assert_rpc_ok(&accounts);
    let account = accounts
        .result()
        .and_then(|result| result.get("accounts"))
        .and_then(|value| value.as_array())
        .and_then(|accounts| accounts.first())
        .expect("account");
    assert_eq!(account["account_id"], account_id);
    assert_eq!(account["network"], TEST_NETWORK);

    let wrong_password = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": account["wallet_id"], "master_password": "wrong"}),
    );
    assert_rpc_error(&wrong_password, "EXPORT_REAUTH_FAILED");

    let backup = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": account["wallet_id"], "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&backup);
    let backup_result = backup.result().expect("backup result");
    let exported = backup_result
        .get("mnemonic")
        .and_then(|value| value.as_array())
        .expect("mnemonic")
        .iter()
        .map(|word| word.as_str().expect("word"))
        .collect::<Vec<_>>();
    assert_eq!(exported, VALID_MNEMONIC);
    assert_eq!(backup_result["wordlist"], "english");
    assert_eq!(backup_result["wallet_mode"], "multichain");
    assert_eq!(backup_result["bip39_passphrase"], "secret passphrase");
}

#[test]
fn wallet_core_addresses_derive_rejects_imported_and_account_based_accounts() {
    let (mut imported_router, _temp_dir) = create_profile_wallet_router();
    unlock_vault(&mut imported_router, "pw");
    let imported = rpc(
        &mut imported_router,
        "wallet:import:create",
        json!({
            "label": "Imported",
            "network": TEST_NETWORK,
            "curve": "test",
            "private_key": "secret",
            "encoding": "raw"
        }),
    );
    assert_rpc_ok(&imported);
    let imported_account_id = imported
        .result()
        .and_then(|result| result.get("account_id"))
        .and_then(|value| value.as_str())
        .expect("imported account_id")
        .to_string();
    let imported_derive = rpc(
        &mut imported_router,
        "wallet:addresses:derive",
        json!({"account_id": imported_account_id, "purpose": "receive"}),
    );
    assert_rpc_error(&imported_derive, "UNSUPPORTED_ACCOUNT_MODEL");

    let (mut account_router, _temp_dir) = create_account_based_profile_wallet_router();
    unlock_vault(&mut account_router, "pw");
    let (_wallet_id, account_id) = create_hd_wallet(&mut account_router);
    let account_based_derive = rpc(
        &mut account_router,
        "wallet:addresses:derive",
        json!({"account_id": account_id, "purpose": "receive"}),
    );
    assert_rpc_error(&account_based_derive, "UNSUPPORTED_ACCOUNT_MODEL");
}

#[test]
fn wallet_core_base_orchestrates_profile_account_balance_and_transactions() {
    let (mut router, _temp_dir) = create_profile_wallet_router_with_master();
    unlock_vault(&mut router, "pw");
    let (wallet_id, account_id) = create_hd_wallet(&mut router);

    let derived = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": TEST_NETWORK}),
    );
    assert_rpc_ok(&derived);
    assert_eq!(
        derived
            .result()
            .and_then(|result| result.get("account_id"))
            .and_then(|value| value.as_str()),
        Some("account-test-1")
    );

    let address = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id, "purpose": "receive"}),
    );
    assert_rpc_ok(&address);
    assert_eq!(
        address
            .result()
            .and_then(|result| result.get("index"))
            .and_then(|value| value.as_u64()),
        Some(1)
    );

    let balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": "account-test-0"}),
    );
    assert_rpc_ok(&balance);
    assert_eq!(
        balance
            .result()
            .and_then(|result| result.get("balance"))
            .and_then(|value| value.get("amount_unit"))
            .and_then(|value| value.as_str()),
        Some("testunit")
    );

    let bad_balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": "account-test-0", "freshness": "live"}),
    );
    assert_rpc_error(&bad_balance, "INVALID_INPUT");

    for payload in [
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "1"}],
            "fee_policy": {"tier": "standard"},
            "unsigned_tx": "raw"
        }),
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "1"}],
            "fee_policy": {"tier": "standard"},
            "memo": "not allowed"
        }),
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "1.5"}],
            "fee_policy": {"tier": "standard"}
        }),
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "1"}],
            "fee_policy": {"tier": "standard", "max_fee": "1"}
        }),
    ] {
        let response = rpc(&mut router, "wallet:transaction:prepare", payload);
        assert_rpc_error(&response, "INVALID_INPUT");
    }

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "10"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let preparation_id = prepared
        .result()
        .and_then(|result| result.get("preparation_id"))
        .and_then(|value| value.as_str())
        .expect("preparation_id")
        .to_string();

    let sibling_prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient-two", "amount": "11"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&sibling_prepared);
    let sibling_preparation_id = sibling_prepared
        .result()
        .and_then(|result| result.get("preparation_id"))
        .and_then(|value| value.as_str())
        .expect("sibling preparation_id")
        .to_string();

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id.clone(),
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let tx_ref = confirmed
        .result()
        .and_then(|result| result.get("tx_ref"))
        .and_then(|value| value.as_str())
        .expect("tx_ref")
        .to_string();
    assert_eq!(
        confirmed
            .result()
            .and_then(|result| result.get("status"))
            .and_then(|value| value.as_str()),
        Some("pending")
    );

    let superseded = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": sibling_preparation_id,
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&superseded, "PREPARATION_STALE");

    let retry = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id.clone(),
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&retry);
    assert_eq!(
        retry
            .result()
            .and_then(|result| result.get("tx_ref"))
            .and_then(|value| value.as_str()),
        Some(tx_ref.as_str())
    );

    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx_ref}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(
        refreshed
            .result()
            .and_then(|result| result.get("status"))
            .and_then(|value| value.as_str()),
        Some("confirmed")
    );

    let second_prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient-three", "amount": "12"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&second_prepared);
    let second_confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": second_prepared.result().unwrap()["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&second_confirmed);

    let first_page = rpc(
        &mut router,
        "wallet:transactions:list",
        json!({"wallet_id": wallet_id.clone(), "account_id": "account-test-0", "limit": 1}),
    );
    assert_rpc_ok(&first_page);
    let next_cursor = first_page.result().unwrap()["next_cursor"]
        .as_str()
        .expect("next cursor")
        .to_string();
    assert_eq!(
        first_page.result().unwrap()["transactions"]
            .as_array()
            .map(Vec::len),
        Some(1)
    );
    let second_page = rpc(
        &mut router,
        "wallet:transactions:list",
        json!({"wallet_id": wallet_id, "account_id": "account-test-0", "limit": 1, "cursor": next_cursor}),
    );
    assert_rpc_ok(&second_page);
    assert_eq!(
        second_page.result().unwrap()["transactions"]
            .as_array()
            .map(Vec::len),
        Some(1)
    );
}

#[test]
fn wallet_balance_cache_persists_across_router_restart() {
    let (router, temp_dir, keystore) = create_test_router_with_keystore();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TestChainProfile::utxo()));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_hd_wallet(&mut router);

    let balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&balance);
    let expected = balance.result().expect("balance result").clone();

    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(accounts.result().unwrap()["cached_balances"][0], expected);

    drop(router);
    let storage = Storage::new(temp_dir.path()).expect("reopen wallet storage");
    let mut reopened = RpcRouter::new(storage)
        .with_keystore(keystore)
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TestChainProfile::utxo()));
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));

    let accounts = rpc(&mut reopened, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(accounts.result().unwrap()["cached_balances"][0], expected);
}

#[test]
fn ton_transaction_history_sync_is_idempotent_and_persists_in_the_journal() {
    let (router, temp_dir, keystore) = create_test_router_with_keystore();
    let provider = Arc::new(MockTonProvider::new());
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TonChainProfile::new(provider.clone())));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let (wallet_id, account_id, _address) = create_ton_hd_wallet(&mut router);
    provider.set_history(vec![
        TonHistoryTransaction {
            tx_hash: "ton-incoming-hash".to_string(),
            message_ref: Some("ton-incoming-message".to_string()),
            status: WalletTxStatus::Confirmed,
            direction: WalletTransactionDirection::Incoming,
            counterparty: Some("EQ-source".to_string()),
            amount: 2_500_000_000,
            fee: 1_500,
            created_at: 1_710_000_000_000,
        },
        TonHistoryTransaction {
            tx_hash: "ton-outgoing-hash".to_string(),
            message_ref: Some("ton-outgoing-message".to_string()),
            status: WalletTxStatus::Confirmed,
            direction: WalletTransactionDirection::Outgoing,
            counterparty: Some("EQ-destination".to_string()),
            amount: 1_000_000_000,
            fee: 2_000,
            created_at: 1_710_000_100_000,
        },
    ]);

    for _ in 0..2 {
        let synced = rpc(
            &mut router,
            "wallet:transactions:sync",
            json!({"account_id": account_id, "limit": 50}),
        );
        assert_rpc_ok(&synced);
        assert_eq!(synced.result().unwrap()["synced_count"], 2);
    }

    let cached = rpc(
        &mut router,
        "wallet:transactions:list",
        json!({"wallet_id": wallet_id, "account_id": account_id}),
    );
    assert_rpc_ok(&cached);
    let transactions = cached.result().unwrap()["transactions"]
        .as_array()
        .expect("cached transactions");
    assert_eq!(
        transactions.len(),
        2,
        "repeat sync must not duplicate entries"
    );
    assert_eq!(transactions[0]["tx_hash"], "ton-outgoing-hash");
    assert_eq!(transactions[0]["direction"], "outgoing");
    assert_eq!(transactions[0]["counterparty"], "EQ-destination");
    assert_eq!(transactions[0]["amount"], "1000000000");
    assert_eq!(transactions[1]["direction"], "incoming");

    drop(router);
    let storage = Storage::new(temp_dir.path()).expect("reopen wallet storage");
    let mut reopened = RpcRouter::new(storage)
        .with_keystore(keystore)
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TonChainProfile::new(provider)));
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));

    let persisted = rpc(
        &mut reopened,
        "wallet:transactions:list",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&persisted);
    assert_eq!(
        persisted.result().unwrap()["transactions"]
            .as_array()
            .map(Vec::len),
        Some(2)
    );
}

#[test]
fn failed_live_balance_preserves_the_last_cached_snapshot() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, _address) = create_ton_hd_wallet(&mut router);

    let first = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&first);
    provider.set_balance(3_000_000_000);
    let second = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&second);
    let expected = second.result().expect("updated balance").clone();

    provider.set_snapshot_available(false);
    let failed = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id}),
    );
    assert_rpc_error(&failed, "PROVIDER_UNAVAILABLE");

    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(accounts.result().unwrap()["cached_balances"][0], expected);
}

#[test]
fn wallet_core_spend_authorization_requires_scoped_successful_reauth() {
    let (mut router, _temp_dir) = create_profile_wallet_router_with_master();
    unlock_vault(&mut router, "pw");
    let (wallet_id, account_id) = create_hd_wallet(&mut router);

    let empty_scope = rpc(
        &mut router,
        "wallet:spendAuthorization:create",
        json!({"master_password": MASTER_PASSWORD, "duration_ms": 60_000}),
    );
    assert_rpc_error(&empty_scope, "INVALID_INPUT");

    let wrong_password = rpc(
        &mut router,
        "wallet:spendAuthorization:create",
        json!({"wallet_id": wallet_id, "master_password": "wrong", "duration_ms": 60_000}),
    );
    assert_rpc_error(&wrong_password, "SPEND_REAUTH_FAILED");

    let mismatched_scope = rpc(
        &mut router,
        "wallet:spendAuthorization:create",
        json!({"account_id": account_id, "network": "other-network", "master_password": MASTER_PASSWORD, "duration_ms": 60_000}),
    );
    assert_rpc_error(&mismatched_scope, "INVALID_INPUT");
}

#[test]
fn bitcoin_prepare_confirm_signs_p2wpkh_transaction_with_mocked_provider() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);

    let receive = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id.clone(), "purpose": "receive"}),
    );
    assert_rpc_ok(&receive);
    let receive_address = receive
        .result()
        .and_then(|result| result.get("address"))
        .and_then(Value::as_str)
        .expect("receive address")
        .to_string();
    provider.fund_address(&receive_address, 50_000);

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "bitcoin",
            "outputs": [{"address": receive_address, "amount": "1000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let preview = prepared.result().unwrap()["preview"].clone();
    assert_eq!(preview["amount_unit"], "satoshi");
    assert!(preview.get("ton").is_none());
    let preparation_id = prepared.result().unwrap()["preparation_id"]
        .as_str()
        .expect("preparation_id")
        .to_string();

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let result = confirmed.result().expect("confirm result");
    assert_eq!(
        result.get("network").and_then(Value::as_str),
        Some("bitcoin")
    );
    assert_eq!(
        result.get("status").and_then(Value::as_str),
        Some("pending")
    );
    assert!(result
        .get("tx_hash")
        .and_then(Value::as_str)
        .is_some_and(|tx_hash| tx_hash.len() == 64));
    assert_eq!(provider.broadcasts().len(), 1);
}

#[test]
fn bitcoin_balance_and_prepare_are_scoped_to_requested_account() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (wallet_id, first_account_id) = create_bitcoin_hd_wallet(&mut router);
    let second = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "bitcoin"}),
    );
    assert_rpc_ok(&second);
    let second_account_id = second.result().unwrap()["account_id"]
        .as_str()
        .expect("second account id")
        .to_string();

    let first_receive = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": first_account_id, "purpose": "receive"}),
    );
    assert_rpc_ok(&first_receive);
    let first_address = first_receive.result().unwrap()["address"]
        .as_str()
        .expect("first address")
        .to_string();
    let second_receive = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": second_account_id, "purpose": "receive"}),
    );
    assert_rpc_ok(&second_receive);
    let second_address = second_receive.result().unwrap()["address"]
        .as_str()
        .expect("second address")
        .to_string();
    provider.fund_address(&first_address, 10_000);
    provider.fund_address(&second_address, 20_000);

    let first_balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": first_account_id}),
    );
    assert_rpc_ok(&first_balance);
    assert_eq!(
        first_balance.result().unwrap()["balance"]["spendable"],
        "10000"
    );

    let second_balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": second_account_id}),
    );
    assert_rpc_ok(&second_balance);
    assert_eq!(
        second_balance.result().unwrap()["balance"]["spendable"],
        "20000"
    );

    let cross_account_spend = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": first_account_id,
            "network": "bitcoin",
            "outputs": [{"address": first_address, "amount": "15000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&cross_account_spend, "INSUFFICIENT_FUNDS");
}

#[test]
fn wallet_core_rebroadcast_replays_broadcasting_artifact_without_resigning() {
    let submit_control = Arc::new(TestSubmitControl::new(vec![
        TestSubmitOutcome::ProviderUnavailable,
        TestSubmitOutcome::Pending,
    ]));
    let (mut router, _temp_dir) =
        create_replay_controlled_wallet_router_with_master(submit_control.clone());
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_hd_wallet(&mut router);

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "10"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let preparation_id = prepared.result().unwrap()["preparation_id"]
        .as_str()
        .expect("preparation_id")
        .to_string();

    let first_confirm = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&first_confirm, "PROVIDER_UNAVAILABLE");
    assert_eq!(submit_control.sign_calls(), 1);
    assert_eq!(submit_control.submit_calls(), 1);

    let broadcasting = first_wallet_transaction(&mut router);
    assert_eq!(broadcasting["status"], "broadcasting");
    let tx_ref = broadcasting["tx_ref"].as_str().expect("tx_ref").to_string();

    let blocked_prepare = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": TEST_NETWORK,
            "outputs": [{"address": "second-recipient", "amount": "1"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&blocked_prepare, "BROADCAST_UNKNOWN");

    let confirm_retry = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": []
        }),
    );
    assert_rpc_ok(&confirm_retry);
    assert_eq!(confirm_retry.result().unwrap()["tx_ref"], tx_ref);
    assert_eq!(
        confirm_retry.result().unwrap()["status"],
        "broadcast_unknown"
    );
    assert_eq!(submit_control.sign_calls(), 1);
    assert_eq!(submit_control.submit_calls(), 1);

    let retry = rpc(
        &mut router,
        "wallet:transaction:rebroadcast",
        json!({
            "tx_ref": tx_ref,
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&retry);
    assert_eq!(retry.result().unwrap()["tx_ref"], tx_ref);
    assert_eq!(retry.result().unwrap()["status"], "pending");
    assert_eq!(submit_control.sign_calls(), 1);
    assert_eq!(submit_control.submit_calls(), 2);
    let artifacts = submit_control.submitted_artifacts();
    assert_eq!(artifacts.len(), 2);
    assert_eq!(artifacts[0], artifacts[1]);
    assert_eq!(
        submit_control.submitted_metadata(),
        vec![
            Some(json!({"test_submit_nonce": 42})),
            Some(json!({"test_submit_nonce": 42}))
        ]
    );

    let pending = first_wallet_transaction(&mut router);
    assert_eq!(pending["tx_ref"], tx_ref);
    assert_eq!(pending["status"], "pending");
}

#[test]
fn wallet_core_confirm_persists_broadcast_unknown_and_blocks_new_prepare() {
    let submit_control = Arc::new(TestSubmitControl::new(vec![
        TestSubmitOutcome::BroadcastUnknown,
    ]));
    let (mut router, _temp_dir) =
        create_replay_controlled_wallet_router_with_master(submit_control.clone());
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_hd_wallet(&mut router);

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "10"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().unwrap()["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    assert_eq!(confirmed.result().unwrap()["status"], "broadcast_unknown");
    assert_eq!(submit_control.sign_calls(), 1);
    assert_eq!(submit_control.submit_calls(), 1);

    let transaction = first_wallet_transaction(&mut router);
    assert_eq!(transaction["status"], "broadcast_unknown");

    let blocked_prepare = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": TEST_NETWORK,
            "outputs": [{"address": "second-recipient", "amount": "1"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&blocked_prepare, "BROADCAST_UNKNOWN");
}

#[test]
fn wallet_core_confirm_persists_rejected_submit_as_failed() {
    let submit_control = Arc::new(TestSubmitControl::new(vec![
        TestSubmitOutcome::BroadcastRejected,
    ]));
    let (mut router, _temp_dir) =
        create_replay_controlled_wallet_router_with_master(submit_control.clone());
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_hd_wallet(&mut router);

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "10"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().unwrap()["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&confirmed, "BROADCAST_REJECTED");
    assert_eq!(submit_control.sign_calls(), 1);
    assert_eq!(submit_control.submit_calls(), 1);

    let transaction = first_wallet_transaction(&mut router);
    assert_eq!(transaction["status"], "failed");
}

#[test]
fn wallet_core_wallet_enabled_flag_controls_ton_network_access() {
    let (mut disabled_router, _provider, _temp_dir) = create_ton_wallet_router(false);
    unlock_vault(&mut disabled_router, "pw");
    let disabled = rpc(
        &mut disabled_router,
        "wallet:hd:create",
        json!({
            "label": "TON wallet",
            "wallet_mode": "ton_only",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "ton_native",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_error(&disabled, "WALLET_DISABLED");

    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let capabilities = rpc(&mut router, "core:capabilities", json!({}));
    assert_rpc_ok(&capabilities);
    let features = capabilities
        .result()
        .and_then(|result| result.get("features"))
        .and_then(|value| value.as_array())
        .expect("features");
    assert!(features
        .iter()
        .any(|feature| feature == "wallet_core_ton_v1"));
}

#[test]
fn wallet_core_ton_hd_create_and_derive_materialize_v5r1_accounts() {
    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);

    let accounts = rpc(
        &mut router,
        "wallet:accounts:list",
        json!({"wallet_id": wallet_id}),
    );
    assert_rpc_ok(&accounts);
    let account = accounts
        .result()
        .and_then(|result| result.get("accounts"))
        .and_then(|value| value.as_array())
        .and_then(|accounts| accounts.first())
        .expect("account");
    assert_eq!(account["kind"], "derived");
    assert_eq!(account["account_id"], account_id);
    assert_eq!(account["network"], "ton");
    assert_eq!(account["wallet_mode"], "multichain");
    assert_eq!(account["mnemonic_standard"], "bip39");
    assert_eq!(account["account_model"], "account");
    assert_eq!(account["derivation_profile"], "ton_bip39_v5r1_account");
    assert_eq!(account["wallet_contract"], "wallet_v5r1");
    assert_eq!(account["account_index"], 0);
    assert_eq!(account["workchain"], 0);
    assert_eq!(account["address"], address);
    assert_eq!(
        account["address"],
        "EQDH8Qz1Ktvw4QIuZN1b4klqpKTT8A6LMNXtRbSZGk6M1SIk"
    );
    assert_eq!(
        account["public_key"],
        "713e419c78f1fcaa494bb2cea38878f19656d4a5dd59b0c86caf03e2dd01abd9"
    );
    assert_eq!(
        account["raw_account"],
        "0:c7f10cf52adbf0e1022e64dd5be2496aa4a4d3f00e8b30d5ed45b4991a4e8cd5"
    );
    assert!(address.starts_with("EQ"));
    assert!(account["raw_account"]
        .as_str()
        .is_some_and(|raw| raw.starts_with("0:")));
    assert_eq!(account["derivation_path"], "ton_bip39_v5r1_account/0");

    let derived = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "ton"}),
    );
    assert_rpc_ok(&derived);
    let second_account_id = derived
        .result()
        .and_then(|result| result.get("account_id"))
        .and_then(|value| value.as_str())
        .expect("second account id")
        .to_string();
    let accounts = rpc(
        &mut router,
        "wallet:accounts:list",
        json!({"wallet_id": wallet_id}),
    );
    assert_rpc_ok(&accounts);
    let accounts = accounts
        .result()
        .and_then(|result| result.get("accounts"))
        .and_then(|value| value.as_array())
        .expect("accounts");
    assert_eq!(accounts.len(), 2);
    let second = accounts
        .iter()
        .find(|account| account["account_id"] == second_account_id)
        .expect("second account");
    assert_eq!(second["account_index"], 1);
    assert_ne!(second["address"], address);
    assert_eq!(
        second["address"],
        "EQBTlLXAnJ3wjFJxGpGKem-JLpGxCjHVEM4PRbzxiDPgKHLp"
    );
    assert_eq!(
        second["public_key"],
        "a689e0a2033777b4affd3f223b1f61cd2b56a887f3be9e89f139f08bf6a5dba5"
    );
    assert_eq!(
        second["raw_account"],
        "0:5394b5c09c9df08c52711a918a7a6f892e91b10a31d510ce0f45bcf18833e028"
    );
}

#[test]
fn wallet_core_ton_native_create_export_and_reference_vector_match() {
    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let phrase = TON_NATIVE_MNEMONIC.join(" ");
    assert!(
        Mnemonic::parse_in_normalized(Language::English, &phrase).is_err(),
        "fixture must prove TON-native flow does not require BIP39 checksum"
    );

    let response = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Native TON wallet",
            "wallet_mode": "ton_only",
            "mnemonic": ton_native_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "ton_native",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_ok(&response);
    let result = response.result().expect("hd create result");
    let wallet_id = result["wallet_id"].as_str().expect("wallet_id").to_string();
    let account = result["accounts"]
        .as_array()
        .and_then(|accounts| accounts.first())
        .expect("ton account");
    assert_eq!(account["network"], "ton");
    assert_eq!(account["wallet_mode"], "ton_only");
    assert_eq!(account["mnemonic_standard"], "ton_native");
    assert_eq!(account["derivation_profile"], "ton_native_v5r1_account");
    assert_eq!(account["derivation_path"], "ton_native_v5r1_account/0");
    assert_eq!(
        account["public_key"],
        "0cce79e60d25fde965e249096617e3ef212541ddeb5b3336cc3853e4499da196"
    );
    assert_eq!(
        account["raw_account"],
        "0:faacca366088f20c15bf52d0808c46ad6b01f976d86df01e907d448e058cedd7"
    );

    let export = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": wallet_id.clone(), "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&export);
    let export = export.result().expect("export result");
    assert_eq!(export["wallet_mode"], "ton_only");
    assert_eq!(export["mnemonic_standard"], "ton_native");
    assert_eq!(export["bip39_passphrase"], serde_json::Value::Null);
    let exported_words = export["mnemonic"]
        .as_array()
        .expect("exported words")
        .iter()
        .map(|word| word.as_str().expect("word"))
        .collect::<Vec<_>>();
    assert_eq!(exported_words, TON_NATIVE_MNEMONIC);

    let derive = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "ton"}),
    );
    assert_rpc_error(&derive, "UNSUPPORTED_ACCOUNT_MODEL");
}

#[test]
fn wallet_core_ton_native_rejects_bip39_passphrase_cross_network_and_seed_mismatch() {
    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");

    let with_passphrase = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Bad native TON wallet",
            "wallet_mode": "ton_only",
            "mnemonic": ton_native_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "ton_native",
            "bip39_passphrase": "not allowed",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_error(&with_passphrase, "INVALID_INPUT");

    let cross_network = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Bad native TON wallet",
            "wallet_mode": "ton_only",
            "mnemonic": ton_native_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "ton_native",
            "supported_networks": ["ton", "bitcoin"]
        }),
    );
    assert_rpc_error(&cross_network, "INVALID_INPUT");

    let seed_mismatch = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Bad native TON wallet",
            "wallet_mode": "ton_only",
            "mnemonic": valid_bip39_24_word_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "ton_native",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_error(&seed_mismatch, "INVALID_INPUT");
}

#[test]
fn wallet_core_ton_import_requires_ed25519_and_materializes_account() {
    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let bad_curve = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Bad TON",
            "network": "ton",
            "curve": "secp256k1",
            "private_key": "00",
            "encoding": "hex"
        }),
    );
    assert_rpc_error(&bad_curve, "INVALID_INPUT");

    let imported = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Imported TON",
            "network": "ton",
            "curve": "ed25519",
            "private_key": hex_string(&[7u8; 32]),
            "encoding": "hex"
        }),
    );
    assert_rpc_ok(&imported);
    let account_id = imported
        .result()
        .and_then(|result| result.get("account_id"))
        .and_then(|value| value.as_str())
        .expect("account_id")
        .to_string();
    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    let account = accounts
        .result()
        .and_then(|result| result.get("accounts"))
        .and_then(|value| value.as_array())
        .and_then(|accounts| accounts.first())
        .expect("imported account");
    assert_eq!(account["kind"], "imported");
    assert_eq!(account["account_id"], account_id);
    assert_eq!(account["curve"], "ed25519");
    assert_eq!(account["wallet_contract"], "wallet_v5r1");
    assert_eq!(account["workchain"], 0);
    assert!(account["raw_account"]
        .as_str()
        .is_some_and(|raw| raw.starts_with("0:")));
}

#[test]
fn wallet_core_ton_balance_prepare_confirm_and_refresh_use_provider_snapshot() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);

    let balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&balance);
    assert_eq!(balance.result().unwrap()["network"], "ton");
    assert_eq!(
        balance.result().unwrap()["balance"]["spendable"],
        "2000000000"
    );
    assert_eq!(
        balance.result().unwrap()["balance"]["amount_unit"],
        "nanoton"
    );

    let bad_payload = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1", "payload": "raw-cell"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&bad_payload, "UNSUPPORTED_TON_PAYLOAD");

    let bad_asset = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1", "asset": "jetton"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&bad_asset, "UNSUPPORTED_ASSET");

    let bad_provider_surface = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1"}],
            "fee_policy": {"tier": "standard"},
            "ton_connect": {"method": "sendTransaction"}
        }),
    );
    assert_rpc_error(&bad_provider_surface, "UNSUPPORTED_PROVIDER_SURFACE");

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1000000000", "comment": "hello"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let result = prepared.result().expect("prepared");
    assert_eq!(result["preview"]["amount_unit"], "nanoton");
    assert_eq!(result["preview"]["estimated_fee"], "5000000");
    assert_eq!(result["preview"]["total_debit"], "1005000000");
    assert_eq!(result["preview"]["outputs"][0]["comment"], "hello");
    assert_eq!(result["preview"]["ton"]["wallet_contract"], "wallet_v5r1");
    assert_eq!(result["preview"]["ton"]["seqno"], 7);
    assert_eq!(result["preview"]["ton"]["account_state"], "active");
    assert_eq!(result["preview"]["ton"]["message_mode"], 3);
    assert_eq!(
        result["preview"]["ton"]["sender_state_init_included"],
        false
    );
    assert_eq!(result["preview"]["ton"]["destination_state"], "active");
    assert!(result["preview"]["ton"]["valid_until"]
        .as_u64()
        .is_some_and(|valid_until| valid_until > 0));
    let fee_estimates = provider.fee_estimates();
    assert_eq!(fee_estimates.len(), 1);
    assert!(!fee_estimates[0].body_boc_base64.is_empty());
    assert_eq!(fee_estimates[0].init_code_boc_base64, None);
    assert_eq!(fee_estimates[0].init_data_boc_base64, None);
    let preparation_id = result
        .get("preparation_id")
        .and_then(|value| value.as_str())
        .expect("preparation_id")
        .to_string();

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    assert_eq!(confirmed.result().unwrap()["status"], "pending");
    assert_eq!(confirmed.result().unwrap()["tx_hash"], "ton-tx-7");
    let broadcasts = provider.broadcasts();
    assert_eq!(broadcasts.len(), 1);
    assert_eq!(broadcasts[0].seqno, 7);
    assert!(!broadcasts[0].message_hash.is_empty());
    assert!(!broadcasts[0].signed_message_boc_base64.is_empty());

    let transactions = rpc(&mut router, "wallet:transactions:list", json!({}));
    assert_rpc_ok(&transactions);
    let tx = transactions
        .result()
        .and_then(|result| result.get("transactions"))
        .and_then(|value| value.as_array())
        .and_then(|transactions| transactions.first())
        .expect("tx");
    assert_eq!(tx["network"], "ton");
    assert_eq!(tx["amount_unit"], "nanoton");
    assert_eq!(tx["amount"], "1000000000");
    assert_eq!(tx["fee"], "5000000");
    assert_eq!(tx["valid_until"], result["preview"]["ton"]["valid_until"]);
    assert_eq!(tx["message_ref"], broadcasts[0].message_hash);

    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(refreshed.result().unwrap()["status"], "confirmed");
    assert_eq!(refreshed.result().unwrap()["tx_hash"], "ton-confirmed-hash");
}

#[test]
fn wallet_core_ton_confirm_rejects_stale_seqno() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1000000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let preparation_id = prepared
        .result()
        .and_then(|result| result.get("preparation_id"))
        .and_then(|value| value.as_str())
        .expect("preparation_id")
        .to_string();
    provider.set_seqno(8);
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&confirmed, "PREPARATION_STALE");
    assert!(provider.broadcasts().is_empty());
}

#[test]
fn wallet_core_ton_confirm_rejects_increased_fee_estimate() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1000000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    provider.set_estimated_fee(Some(6_000_000));

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().unwrap()["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );

    assert_rpc_error(&confirmed, "PREPARATION_STALE");
    assert!(provider.broadcasts().is_empty());
}

#[test]
fn wallet_core_ton_confirm_rejects_stale_sender_state() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1000000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    provider.set_account_state(TonProviderAccountState::Uninitialized);

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().unwrap()["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&confirmed, "PREPARATION_STALE");
    assert!(provider.broadcasts().is_empty());
}

#[test]
fn wallet_core_ton_confirm_rejects_stale_destination_state() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1000000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    provider.set_destination_state(TonProviderAccountState::Uninitialized);

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().unwrap()["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&confirmed, "PREPARATION_STALE");
    assert!(provider.broadcasts().is_empty());
}

#[test]
fn wallet_core_ton_prepare_marks_uninitialized_sender_state_init_and_deploy_fee_fallback() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    provider.set_account_state(TonProviderAccountState::Uninitialized);
    provider.set_seqno(0);
    provider.set_estimated_fee(None);
    provider.set_balance(20_000_000);

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "10000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let result = prepared.result().expect("prepared");
    assert_eq!(result["preview"]["estimated_fee"], "10000000");
    assert_eq!(result["preview"]["total_debit"], "20000000");
    assert_eq!(result["preview"]["ton"]["seqno"], 0);
    assert_eq!(result["preview"]["ton"]["account_state"], "uninitialized");
    assert_eq!(result["preview"]["ton"]["sender_state_init_included"], true);
    let fee_estimates = provider.fee_estimates();
    assert_eq!(fee_estimates.len(), 1);
    assert!(fee_estimates[0].init_code_boc_base64.is_some());
    assert!(fee_estimates[0].init_data_boc_base64.is_some());

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": result["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let broadcasts = provider.broadcasts();
    assert_eq!(broadcasts.len(), 1);
    assert_eq!(broadcasts[0].seqno, 0);
}

#[test]
fn wallet_transaction_quote_returns_exact_ton_max_without_creating_a_preparation() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    provider.set_balance(2_000_000_000);
    provider.set_estimated_fee(Some(5_000_000));

    let quoted = rpc(
        &mut router,
        "wallet:transaction:quote",
        json!({
            "account_id": account_id.clone(),
            "network": "ton",
            "outputs": [{"address": address.clone(), "amount": "1000000000", "comment": null}],
            "fee_policy": {"tier": "standard"},
            "max_output_index": 0
        }),
    );
    assert_rpc_ok(&quoted);
    let quote = quoted.result().expect("quote result");
    assert_eq!(quote["spendable"], "2000000000");
    assert_eq!(quote["max_amount"], "1995000000");
    assert_eq!(quote["max_preview"]["estimated_fee"], "5000000");
    assert_eq!(quote["current_preview"]["total_debit"], "1005000000");
    assert!(quote.get("preparation_id").is_none());

    let transactions = rpc(
        &mut router,
        "wallet:transactions:list",
        json!({"account_id": account_id.clone()}),
    );
    assert_rpc_ok(&transactions);
    assert_eq!(
        transactions.result().unwrap()["transactions"]
            .as_array()
            .map(Vec::len),
        Some(0)
    );

    provider.set_balance(3_000_000_000);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1995000000", "comment": null}],
            "fee_policy": {"tier": "standard"},
            "maximize_output_index": 0
        }),
    );
    assert_rpc_ok(&prepared);
    assert_eq!(
        prepared.result().unwrap()["preview"]["outputs"][0]["amount"],
        "2995000000"
    );
}

#[test]
fn wallet_address_book_crud_is_canonical_and_rejects_duplicates() {
    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, _account_id, address) = create_ton_hd_wallet(&mut router);

    let created = rpc(
        &mut router,
        "wallet:addressBook:create",
        json!({"label": "  Savings  ", "network": "ton", "address": address}),
    );
    assert_rpc_ok(&created);
    let entry = created.result().unwrap()["entry"].clone();
    let entry_id = entry["entry_id"].as_str().expect("entry id").to_string();
    assert_eq!(entry["label"], "Savings");

    let duplicate = rpc(
        &mut router,
        "wallet:addressBook:create",
        json!({"label": "Duplicate", "network": "ton", "address": entry["address"]}),
    );
    assert_rpc_error(&duplicate, "INVALID_INPUT");

    let updated = rpc(
        &mut router,
        "wallet:addressBook:update",
        json!({
            "entry_id": entry_id.clone(),
            "label": "Long-term savings",
            "network": "ton",
            "address": entry["address"]
        }),
    );
    assert_rpc_ok(&updated);
    assert_eq!(
        updated.result().unwrap()["entry"]["label"],
        "Long-term savings"
    );

    let listed = rpc(&mut router, "wallet:addressBook:list", json!({}));
    assert_rpc_ok(&listed);
    assert_eq!(
        listed.result().unwrap()["entries"].as_array().map(Vec::len),
        Some(1)
    );

    let deleted = rpc(
        &mut router,
        "wallet:addressBook:delete",
        json!({"entry_id": entry_id}),
    );
    assert_rpc_ok(&deleted);
    assert_eq!(deleted.result().unwrap()["entry_id"], entry_id);

    let empty = rpc(&mut router, "wallet:addressBook:list", json!({}));
    assert_rpc_ok(&empty);
    assert_eq!(
        empty.result().unwrap()["entries"].as_array().map(Vec::len),
        Some(0)
    );
}

#[test]
fn wallet_core_ton_prepare_warns_for_bounceable_uninitialized_destination() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    provider.set_destination_state(TonProviderAccountState::Uninitialized);

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let result = prepared.result().expect("prepared");
    assert_eq!(
        result["preview"]["warnings"][0]["code"],
        "destination_uninitialized_bounceable"
    );
    assert_eq!(
        result["preview"]["ton"]["destination_state"],
        "uninitialized"
    );

    let rejected = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": result["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&rejected, "PREPARATION_STALE");
    assert!(provider.broadcasts().is_empty());

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": result["preparation_id"],
            "accepted_warnings": ["destination_uninitialized_bounceable"],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    assert_eq!(provider.broadcasts().len(), 1);
}

#[test]
fn wallet_core_ton_raw_destination_is_non_bounceable_without_warning() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, _address) = create_ton_hd_wallet(&mut router);
    provider.set_destination_state(TonProviderAccountState::Uninitialized);
    let raw_address = "0:c7f10cf52adbf0e1022e64dd5be2496aa4a4d3f00e8b30d5ed45b4991a4e8cd5";

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": raw_address, "amount": "1000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let result = prepared.result().expect("prepared");
    assert_eq!(result["preview"]["warnings"].as_array().unwrap().len(), 0);
    assert_eq!(
        result["preview"]["outputs"][0]["address"],
        "UQDH8Qz1Ktvw4QIuZN1b4klqpKTT8A6LMNXtRbSZGk6M1X_h"
    );
}

#[test]
fn wallet_core_ton_prepare_rejects_testnet_bad_checksum_and_foreign_workchain() {
    let (mut router, _provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, _address) = create_ton_hd_wallet(&mut router);
    for destination in [
        "kQDH8Qz1Ktvw4QIuZN1b4klqpKTT8A6LMNXtRbSZGk6M1Zmu",
        "EQDH8Qz1Ktvw4QIuZN1b4klqpKTT8A6LMNXtRbSZGk6M1SIA",
        "-1:c7f10cf52adbf0e1022e64dd5be2496aa4a4d3f00e8b30d5ed45b4991a4e8cd5",
    ] {
        let prepared = rpc(
            &mut router,
            "wallet:transaction:prepare",
            json!({
                "account_id": account_id,
                "network": "ton",
                "outputs": [{"address": destination, "amount": "1000"}],
                "fee_policy": {"tier": "standard"}
            }),
        );
        assert_rpc_error(&prepared, "INVALID_ADDRESS");
    }
}

#[test]
fn wallet_core_ton_prepare_insufficient_funds_includes_fee() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id, address) = create_ton_hd_wallet(&mut router);
    provider.set_balance(1_000_000_000);

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ton",
            "outputs": [{"address": address, "amount": "1000000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&prepared, "INSUFFICIENT_FUNDS");
}

#[test]
fn wallet_core_telemetry_records_command_status_and_duration_without_secrets() {
    let sink = Arc::new(RecordingWalletTelemetrySink::default());
    let (router, _temp_dir) = create_profile_wallet_router_with_master();
    let mut router = router.with_wallet_telemetry_sink(sink.clone());
    unlock_vault(&mut router, "pw");

    let status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&status);
    let bad_prepare = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": "missing",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "1"}],
            "fee_policy": {"tier": "standard"},
            "memo": "secret memo"
        }),
    );
    assert_rpc_error(&bad_prepare, "INVALID_INPUT");

    let (wallet_id, _account_id) = create_hd_wallet(&mut router);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": "account-test-0",
            "network": TEST_NETWORK,
            "outputs": [{"address": "recipient", "amount": "10"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let preparation_id = prepared
        .result()
        .and_then(|result| result.get("preparation_id"))
        .and_then(|value| value.as_str())
        .expect("preparation_id")
        .to_string();
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let exported = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": wallet_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&exported);
    let events = sink.events();
    assert!(events.iter().any(|event| {
        event.metric == WalletTelemetryMetric::WalletCommandTotal
            && event.wallet_command == "wallet:transaction:prepare"
            && event.status == "error"
            && event.error_code.as_deref() == Some("INVALID_INPUT")
    }));
    assert!(events.iter().any(|event| {
        event.metric == WalletTelemetryMetric::WalletPrepareDurationMs
            && event.wallet_command == "wallet:transaction:prepare"
            && event.status == "success"
            && event.duration_ms.is_some()
    }));
    assert!(events.iter().any(|event| {
        event.metric == WalletTelemetryMetric::WalletConfirmDurationMs
            && event.wallet_command == "wallet:transaction:confirm"
            && event.status == "success"
            && event
                .network
                .as_ref()
                .is_some_and(|network| network.as_str() == TEST_NETWORK)
    }));
    assert!(events.iter().any(|event| {
        event.metric == WalletTelemetryMetric::WalletExportTotal
            && event.wallet_command == "wallet:backup:export"
            && event.status == "success"
    }));
    assert!(events.iter().any(|event| {
        event.metric == WalletTelemetryMetric::WalletStatusTotal
            && event.wallet_command == "wallet:status"
    }));

    let debug = format!("{events:?}");
    for secret in [
        "abandon",
        "secret passphrase",
        MASTER_PASSWORD,
        "secret memo",
        "canonical_payload",
    ] {
        assert!(
            !debug.contains(secret),
            "{secret} leaked in telemetry {debug}"
        );
    }
}

#[test]
fn bitcoin_quote_max_uses_all_utxos_without_change_and_preserves_other_outputs() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);
    let receive = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id.clone(), "purpose": "receive"}),
    );
    assert_rpc_ok(&receive);
    let address = receive.result().unwrap()["address"]
        .as_str()
        .expect("receive address")
        .to_string();
    provider.fund_address(&address, 50_000);

    let quoted = rpc(
        &mut router,
        "wallet:transaction:quote",
        json!({
            "account_id": account_id,
            "network": "bitcoin",
            "outputs": [
                {"address": address.clone(), "amount": "1000", "comment": null},
                {"address": address, "amount": null, "comment": null}
            ],
            "fee_policy": {"tier": "standard"},
            "max_output_index": 1
        }),
    );
    assert_rpc_ok(&quoted);
    let quote = quoted.result().expect("bitcoin quote");
    let max_amount = quote["max_amount"]
        .as_str()
        .expect("max amount")
        .parse::<u64>()
        .expect("max amount integer");
    let fee = quote["max_preview"]["estimated_fee"]
        .as_str()
        .expect("fee")
        .parse::<u64>()
        .expect("fee integer");
    assert_eq!(max_amount + 1_000 + fee, 50_000);
    assert_eq!(quote["max_preview"]["outputs"][0]["amount"], "1000");
    assert_eq!(
        quote["max_preview"]["outputs"][1]["amount"],
        max_amount.to_string()
    );
    assert_eq!(quote["max_preview"]["total_debit"], "50000");
}
