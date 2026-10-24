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
    BitcoinAddressStats, BitcoinAddressStatus, BitcoinAddressTransaction, BitcoinBroadcastResult,
    BitcoinChainProfile, BitcoinFeeEstimates, BitcoinProvider, BitcoinProviderError,
    BitcoinTransactionIo, BitcoinTransactionStatus, BitcoinUtxo,
};
use chromvoid_core::wallet::ethereum::{
    keccak256, EthereumAccountSnapshot, EthereumAddressTransaction, EthereumChainHead,
    EthereumChainProfile, EthereumFeeEstimate, EthereumProvider, EthereumProviderError,
    EthereumTransactionLookup, EthereumTransactionReceipt, ETHEREUM_NATIVE_TRANSFER_CAPABILITY,
};
use chromvoid_core::wallet::solana::{
    SolanaBlockhash, SolanaChainProfile, SolanaProvider, SolanaProviderError, SolanaSignatureInfo,
    SolanaSignatureStatus, SolanaTransactionDetails, SOLANA_NATIVE_TRANSFER_CAPABILITY,
};
use chromvoid_core::wallet::ton::{
    TonBroadcastRequest, TonBroadcastResult, TonChainProfile, TonFeeEstimateRequest,
    TonHistoryRequest, TonHistoryTransaction, TonProvider, TonProviderAccount,
    TonProviderAccountState, TonProviderError, TonProviderPublicKey, TonProviderSnapshot,
    TonRefreshRequest, TonRefreshResult,
};
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
        input.root.bip39_seed()?;
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
                solana: None,
            },
            provider_snapshot: Some(json!({"test_nonce": 1})),
            canonical_payload: serde_json::to_string(&json!({
                "account_id": input.account.account_id(),
                "outputs": input.outputs,
                "fee": fee
            }))
            .expect("canonical payload"),
            materializations: Vec::new(),
            valid_until: None,
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
    public_key: Mutex<TonProviderPublicKey>,
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
            public_key: Mutex::new(None),
        }
    }

    fn set_public_key(&self, public_key: TonProviderPublicKey) {
        *self.public_key.lock().expect("public_key") = public_key;
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

    fn public_key(
        &self,
        _account: &TonProviderAccount,
    ) -> Result<TonProviderPublicKey, TonProviderError> {
        Ok(*self.public_key.lock().expect("public_key"))
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
    address_transactions: Mutex<HashMap<String, Vec<BitcoinAddressTransaction>>>,
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
            address_transactions: Mutex::new(HashMap::new()),
        }
    }

    fn set_address_transactions(
        &self,
        address: &str,
        transactions: Vec<BitcoinAddressTransaction>,
    ) {
        self.address_transactions
            .lock()
            .expect("address transactions")
            .insert(address.to_string(), transactions);
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

    fn address_transactions(
        &self,
        address: &str,
        _after_txid: Option<&str>,
    ) -> Result<Vec<BitcoinAddressTransaction>, BitcoinProviderError> {
        Ok(self
            .address_transactions
            .lock()
            .expect("address transactions")
            .get(address)
            .cloned()
            .unwrap_or_default())
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
        json!({"wallet_mode": "multichain", "mnemonic_standard": "rotation", "word_count": 12}),
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
    assert_eq!(
        capabilities.len(),
        1,
        "only the native transfer capability is declared"
    );
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
    // A restored wallet leaves its receive address to discovery (the phrase may already
    // have used addresses), so nothing is allocated locally and no provider call happens.
    assert_eq!(
        account.get("next_receive_index").and_then(Value::as_u64),
        Some(0)
    );
    assert!(account
        .get("current_receive_address")
        .and_then(Value::as_str)
        .is_none());
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
            "mnemonic_standard": "rotation",
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
            "mnemonic_standard": "rotation",
            "bip39_passphrase": "secret",
            "supported_networks": ["bitcoin"]
        }),
    );
    assert_rpc_ok(&created);
    // A generated wallet cannot have history, so the first receive address is allocated at
    // creation (index 0) without any provider call: no client shows "no address yet".
    let account = &created.result().unwrap()["accounts"][0];
    assert_eq!(account["next_receive_index"], 1);
    assert!(account["current_receive_address"]
        .as_str()
        .is_some_and(|address| address.starts_with("bc1q")));

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
    // 20 receive + 20 change gap probes, then one status read for the freshly allocated
    // receive address (index 0) the balance scan now covers.
    assert_eq!(provider.address_status_calls(), 41);
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
        json!({"wallet_mode": "multichain", "mnemonic_standard": "rotation", "word_count": 12}),
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
    assert_eq!(result["mnemonic_standard"], "rotation");
    assert!(result["expires_at"]
        .as_u64()
        .is_some_and(|expires_at| expires_at > 0));

    // New wallets have exactly one shape; other standards and lengths are restore-only.
    for request in [
        json!({"wallet_mode": "multichain", "mnemonic_standard": "rotation", "word_count": 24}),
        json!({"wallet_mode": "multichain", "mnemonic_standard": "bip39", "word_count": 12}),
        json!({"wallet_mode": "ton_only", "mnemonic_standard": "rotation", "word_count": 12}),
        json!({"wallet_mode": "ton_only", "mnemonic_standard": "ton_native", "word_count": 24}),
    ] {
        let invalid = rpc(&mut router, "wallet:hd:generateMnemonic", request);
        assert_rpc_error(&invalid, "INVALID_INPUT");
    }
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
        json!({"wallet_mode": "multichain", "mnemonic_standard": "rotation", "word_count": 12}),
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
        "mnemonic_standard": "rotation",
        "bip39_passphrase": "secret",
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
        json!({"wallet_mode": "multichain", "mnemonic_standard": "rotation", "word_count": 12}),
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

fn bitcoin_io(address: Option<&str>, value: u64) -> BitcoinTransactionIo {
    BitcoinTransactionIo {
        address: address.map(str::to_string),
        value,
    }
}

#[test]
fn bitcoin_transaction_history_sync_folds_address_pages_into_account_entries() {
    let (mut router, provider, _temp_dir) = create_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);
    let receive = derive_receive_address(&mut router, &account_id);
    let change = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id, "purpose": "change"}),
    );
    assert_rpc_ok(&change);
    let change = change.result().expect("change")["address"]
        .as_str()
        .expect("change address")
        .to_string();

    let incoming = BitcoinAddressTransaction {
        txid: "btc-incoming".to_string(),
        confirmed: true,
        block_height: Some(90),
        block_time: Some(1_710_000_000),
        fee: 500,
        inputs: vec![bitcoin_io(Some("bc1-sender"), 200_000)],
        outputs: vec![
            bitcoin_io(Some(&receive), 150_000),
            bitcoin_io(Some("bc1-sender"), 49_500),
        ],
    };
    // Spends the received output; the change lands on our change address, so the same txid is
    // returned by both address pages and must be folded once.
    let outgoing = BitcoinAddressTransaction {
        txid: "btc-outgoing".to_string(),
        confirmed: true,
        block_height: Some(98),
        block_time: Some(1_710_000_100),
        fee: 1_000,
        inputs: vec![bitcoin_io(Some(&receive), 150_000)],
        outputs: vec![
            bitcoin_io(Some("bc1-recipient"), 60_000),
            bitcoin_io(Some(&change), 89_000),
        ],
    };
    provider.set_address_transactions(&receive, vec![outgoing.clone(), incoming]);
    provider.set_address_transactions(&change, vec![outgoing]);

    for _ in 0..2 {
        let synced = rpc(
            &mut router,
            "wallet:transactions:sync",
            json!({"account_id": account_id, "limit": 50}),
        );
        assert_rpc_ok(&synced);
        let synced = synced.result().expect("synced");
        assert_eq!(
            synced["synced_count"], 2,
            "txid shared by two addresses counts once"
        );
        assert_eq!(synced["network"], "bitcoin");
    }

    let listed = rpc(
        &mut router,
        "wallet:transactions:list",
        json!({"wallet_id": wallet_id, "account_id": account_id}),
    );
    assert_rpc_ok(&listed);
    let transactions = listed.result().expect("listed")["transactions"]
        .as_array()
        .cloned()
        .expect("transactions");
    assert_eq!(
        transactions.len(),
        2,
        "repeat sync must not duplicate entries"
    );
    let sent = &transactions[0];
    assert_eq!(sent["tx_hash"], "btc-outgoing");
    assert_eq!(sent["direction"], "outgoing");
    assert_eq!(sent["counterparty"], "bc1-recipient");
    assert_eq!(sent["amount"], "60000");
    assert_eq!(sent["fee"], "1000");
    assert_eq!(sent["amount_unit"], "satoshi");
    assert_eq!(sent["status"], "pending", "3 confirmations out of 6");
    assert_eq!(sent["created_at"], 1_710_000_100_000_u64);
    let received = &transactions[1];
    assert_eq!(received["tx_hash"], "btc-incoming");
    assert_eq!(received["direction"], "incoming");
    assert_eq!(received["counterparty"], "bc1-sender");
    assert_eq!(received["amount"], "150000");
    assert_eq!(received["fee"], "0");
    assert_eq!(received["status"], "confirmed");
}

#[test]
fn bitcoin_transaction_history_sync_fails_closed_without_provider() {
    let (mut router, _temp_dir) = create_unavailable_bitcoin_wallet_router();
    unlock_vault(&mut router, "pw");
    let (_wallet_id, account_id) = create_bitcoin_hd_wallet(&mut router);

    let failed = rpc(
        &mut router,
        "wallet:transactions:sync",
        json!({"account_id": account_id}),
    );
    assert_rpc_error(&failed, "PROVIDER_UNAVAILABLE");
}

struct MockEthereumProvider {
    transactions: Mutex<Vec<EthereumAddressTransaction>>,
    history_calls: Mutex<Vec<(String, u32)>>,
    snapshots: Mutex<HashMap<String, EthereumAccountSnapshot>>,
    snapshot_calls: Mutex<Vec<String>>,
    broadcasts: Mutex<Vec<String>>,
    receipt: Mutex<Option<EthereumTransactionReceipt>>,
    lookup: Mutex<Option<EthereumTransactionLookup>>,
    head: Mutex<EthereumChainHead>,
}

impl MockEthereumProvider {
    fn new() -> Self {
        Self {
            transactions: Mutex::new(Vec::new()),
            history_calls: Mutex::new(Vec::new()),
            snapshots: Mutex::new(HashMap::new()),
            snapshot_calls: Mutex::new(Vec::new()),
            broadcasts: Mutex::new(Vec::new()),
            receipt: Mutex::new(None),
            lookup: Mutex::new(None),
            head: Mutex::new(EthereumChainHead {
                latest_block_number: 100,
                finalized_block_number: Some(90),
            }),
        }
    }

    fn set_history(&self, transactions: Vec<EthereumAddressTransaction>) {
        *self.transactions.lock().expect("transactions") = transactions;
    }

    fn history_calls(&self) -> Vec<(String, u32)> {
        self.history_calls.lock().expect("history calls").clone()
    }

    fn set_snapshot(&self, address: &str, balance: &str, pending_nonce: u64) {
        self.snapshots.lock().expect("snapshots").insert(
            address.to_lowercase(),
            EthereumAccountSnapshot {
                balance: balance.to_string(),
                pending_nonce,
            },
        );
    }

    fn snapshot_calls(&self) -> Vec<String> {
        self.snapshot_calls.lock().expect("snapshot calls").clone()
    }

    fn set_receipt(&self, receipt: Option<EthereumTransactionReceipt>) {
        *self.receipt.lock().expect("receipt") = receipt;
    }

    fn set_lookup(&self, lookup: Option<EthereumTransactionLookup>) {
        *self.lookup.lock().expect("lookup") = lookup;
    }

    fn set_head(&self, latest_block_number: u64, finalized_block_number: Option<u64>) {
        *self.head.lock().expect("head") = EthereumChainHead {
            latest_block_number,
            finalized_block_number,
        };
    }

    fn broadcasts(&self) -> Vec<String> {
        self.broadcasts.lock().expect("broadcasts").clone()
    }
}

impl EthereumProvider for MockEthereumProvider {
    fn chain_id(&self) -> Result<u64, EthereumProviderError> {
        Ok(1)
    }

    fn account_snapshot(
        &self,
        address: &str,
    ) -> Result<EthereumAccountSnapshot, EthereumProviderError> {
        self.snapshot_calls
            .lock()
            .expect("snapshot calls")
            .push(address.to_lowercase());
        Ok(self
            .snapshots
            .lock()
            .expect("snapshots")
            .get(&address.to_lowercase())
            .cloned()
            .unwrap_or(EthereumAccountSnapshot {
                balance: "0".to_string(),
                pending_nonce: 0,
            }))
    }

    fn code_at(&self, _address: &str) -> Result<Vec<u8>, EthereumProviderError> {
        Ok(Vec::new())
    }

    fn fee_estimate(
        &self,
        _tier: WalletFeeTier,
    ) -> Result<EthereumFeeEstimate, EthereumProviderError> {
        Ok(EthereumFeeEstimate {
            max_fee_per_gas: "2000000000".to_string(),
            max_priority_fee_per_gas: "100000000".to_string(),
            base_fee_per_gas: "1000000000".to_string(),
        })
    }

    fn broadcast_raw_transaction(&self, raw_tx: &str) -> Result<String, EthereumProviderError> {
        self.broadcasts
            .lock()
            .expect("broadcasts")
            .push(raw_tx.to_string());
        let bytes = parse_hex(raw_tx.trim_start_matches("0x"))
            .map_err(|error| EthereumProviderError::rejected(error.message))?;
        Ok(format!("0x{}", hex_string(&keccak256(&bytes))))
    }

    fn transaction_receipt(
        &self,
        _tx_hash: &str,
    ) -> Result<Option<EthereumTransactionReceipt>, EthereumProviderError> {
        Ok(self.receipt.lock().expect("receipt").clone())
    }

    fn transaction_by_hash(
        &self,
        _tx_hash: &str,
    ) -> Result<Option<EthereumTransactionLookup>, EthereumProviderError> {
        Ok(self.lookup.lock().expect("lookup").clone())
    }

    fn chain_head(&self) -> Result<EthereumChainHead, EthereumProviderError> {
        Ok(self.head.lock().expect("head").clone())
    }

    fn address_transactions(
        &self,
        address: &str,
        limit: u32,
    ) -> Result<Vec<EthereumAddressTransaction>, EthereumProviderError> {
        self.history_calls
            .lock()
            .expect("history calls")
            .push((address.to_string(), limit));
        Ok(self.transactions.lock().expect("transactions").clone())
    }
}

fn ethereum_wallet_config() -> WalletRuntimeConfig {
    let mut config = wallet_config_enabled();
    config
        .enabled_capabilities
        .insert(ETHEREUM_NATIVE_TRANSFER_CAPABILITY.to_string());
    config
}

fn create_ethereum_wallet_router() -> (RpcRouter, Arc<MockEthereumProvider>, TempDir) {
    let (router, temp_dir) = create_test_router();
    let provider = Arc::new(MockEthereumProvider::new());
    let mut router = router
        .with_wallet_runtime_config(ethereum_wallet_config())
        .with_wallet_chain_profile(Arc::new(EthereumChainProfile::new(provider.clone())));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    (router, provider, temp_dir)
}

/// Restores the BIP39 test phrase as an Ethereum wallet and returns `(wallet_id, account)`.
fn ethereum_hd_restore(router: &mut RpcRouter) -> (String, Value) {
    let created = rpc(
        router,
        "wallet:hd:create",
        json!({
            "label": "ETH wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["ethereum"]
        }),
    );
    assert_rpc_ok(&created);
    let result = created.result().expect("created").clone();
    assert_eq!(result["accounts"].as_array().map(Vec::len), Some(1));
    (
        result["wallet_id"].as_str().expect("wallet_id").to_string(),
        result["accounts"][0].clone(),
    )
}

/// MetaMask-compatible `m/44'/60'/0'/0/<index>` address of the BIP39 test phrase, derived
/// independently of the profile (BIP32 secp256k1 + keccak256 of the uncompressed key).
fn independent_ethereum_address(words: &[&str], account_index: u32) -> String {
    use std::str::FromStr as _;
    let mnemonic =
        Mnemonic::parse_in_normalized(Language::English, &words.join(" ")).expect("mnemonic");
    let master =
        ::bitcoin::bip32::Xpriv::new_master(::bitcoin::Network::Bitcoin, &mnemonic.to_seed(""))
            .expect("master");
    let path =
        ::bitcoin::bip32::DerivationPath::from_str(&format!("m/44'/60'/0'/0/{account_index}"))
            .expect("path");
    let secp = ::bitcoin::secp256k1::Secp256k1::new();
    let child = master.derive_priv(&secp, &path).expect("child");
    let public_key = child.private_key.public_key(&secp).serialize_uncompressed();
    format!("0x{}", hex_string(&keccak256(&public_key[1..])[12..]))
}

fn wallet_accounts_by_index(router: &mut RpcRouter, wallet_id: &str, network: &str) -> Vec<Value> {
    let accounts = rpc(
        router,
        "wallet:accounts:list",
        json!({"wallet_id": wallet_id}),
    );
    assert_rpc_ok(&accounts);
    let mut accounts = accounts.result().expect("accounts")["accounts"]
        .as_array()
        .cloned()
        .expect("accounts array")
        .into_iter()
        .filter(|account| account["network"] == network)
        .collect::<Vec<_>>();
    accounts.sort_by_key(|account| account["account_index"].as_u64());
    accounts
}

fn wallet_summary(router: &mut RpcRouter, wallet_id: &str) -> Value {
    let wallets = rpc(router, "wallet:list", json!({}));
    assert_rpc_ok(&wallets);
    wallets.result().expect("wallets")["wallets"]
        .as_array()
        .expect("wallets array")
        .iter()
        .find(|wallet| wallet["wallet_id"] == wallet_id)
        .cloned()
        .expect("wallet summary")
}

#[test]
fn ethereum_restore_discovers_used_accounts_with_a_gap_of_one() {
    let (mut router, provider, _temp_dir) = create_ethereum_wallet_router();
    let addresses = (0..4)
        .map(|index| independent_ethereum_address(&VALID_MNEMONIC, index))
        .collect::<Vec<_>>();
    // Index 0 has sent before, index 1 only holds a balance, index 2 is untouched and index 3
    // is used again: the gap of one stops discovery at index 2 (BIP44 account discovery).
    provider.set_snapshot(&addresses[0], "0", 3);
    provider.set_snapshot(&addresses[1], "5000000000000000", 0);
    provider.set_snapshot(&addresses[3], "1", 1);

    let (wallet_id, account) = ethereum_hd_restore(&mut router);
    assert_eq!(account["address"], addresses[0]);
    // T-233-005: restore is offline; the used accounts are discovered by a later live call.
    assert!(provider.snapshot_calls().is_empty());
    assert_eq!(
        wallet_summary(&mut router, &wallet_id)["account_discovery_pending"],
        json!(["ethereum"])
    );
    let account_id = account["account_id"].as_str().expect("account_id");

    let plain = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&plain);
    assert_eq!(
        provider.snapshot_calls(),
        vec![addresses[0].clone()],
        "a plain balance read never discovers"
    );
    assert_eq!(
        wallet_accounts_by_index(&mut router, &wallet_id, "ethereum").len(),
        1
    );

    let discovered = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id, "discover_addresses": true}),
    );
    assert_rpc_ok(&discovered);
    assert_eq!(
        discovered.result().expect("balance")["balance"]["spendable"],
        "0"
    );
    // Probes for indices 0, 1 and 2 (the first unused one), then the balance read itself.
    assert_eq!(
        provider.snapshot_calls()[1..],
        [
            addresses[0].clone(),
            addresses[1].clone(),
            addresses[2].clone(),
            addresses[0].clone()
        ]
    );
    let accounts = wallet_accounts_by_index(&mut router, &wallet_id, "ethereum");
    assert_eq!(
        accounts.len(),
        2,
        "index 3 sits behind the gap and is not materialized"
    );
    assert_eq!(accounts[0]["account_id"], account_id);
    assert_eq!(accounts[1]["account_index"], 1);
    assert_eq!(accounts[1]["address"], addresses[1]);
    assert_eq!(accounts[1]["derivation_path"], "m/44'/60'/0'/0/1");
    assert_eq!(accounts[1]["label"], "Ethereum account 2");
    assert!(
        wallet_summary(&mut router, &wallet_id)
            .get("account_discovery_pending")
            .is_none(),
        "discovery is marked done for the network"
    );

    // Running discovery again re-probes but never duplicates accounts.
    let again = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id, "discover_addresses": true}),
    );
    assert_rpc_ok(&again);
    assert_eq!(provider.snapshot_calls().len(), 1 + 4 + 4);
    assert_eq!(
        wallet_accounts_by_index(&mut router, &wallet_id, "ethereum").len(),
        2
    );

    // The explicit derive continues after the discovered accounts.
    let derived = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "ethereum"}),
    );
    assert_rpc_ok(&derived);
    let accounts = wallet_accounts_by_index(&mut router, &wallet_id, "ethereum");
    assert_eq!(accounts[2]["account_index"], 2);
    assert_eq!(accounts[2]["address"], addresses[2]);
}

#[test]
fn ethereum_generated_wallet_and_imported_account_skip_restore_discovery() {
    let (mut router, provider, _temp_dir) = create_ethereum_wallet_router();
    let generated = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({
            "wallet_mode": "multichain",
            "mnemonic_standard": "rotation",
            "word_count": 12,
            "wordlist": "english"
        }),
    );
    assert_rpc_ok(&generated);
    let created = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "New ETH wallet",
            "wallet_mode": "multichain",
            "mnemonic_draft_id": generated.result().expect("draft")["mnemonic_draft_id"],
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "supported_networks": ["ethereum"]
        }),
    );
    assert_rpc_ok(&created);
    let wallet_id = created.result().expect("created")["wallet_id"]
        .as_str()
        .expect("wallet_id")
        .to_string();
    // A phrase Core generated cannot have history: nothing is pending.
    assert!(wallet_summary(&mut router, &wallet_id)
        .get("account_discovery_pending")
        .is_none());
    assert!(provider.snapshot_calls().is_empty());

    let imported = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Imported EOA",
            "network": "ethereum",
            "curve": "secp256k1",
            "private_key": "0000000000000000000000000000000000000000000000000000000000000001",
            "encoding": "hex"
        }),
    );
    assert_rpc_ok(&imported);
    let account_id = imported.result().expect("imported")["account_id"].clone();
    let rejected = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id, "discover_addresses": true}),
    );
    assert_rpc_error(&rejected, "UNSUPPORTED_ACCOUNT_MODEL");
}

#[test]
fn ethereum_restore_discovery_fails_closed_without_provider() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(ethereum_wallet_config())
        .with_wallet_chain_profile(Arc::new(EthereumChainProfile::unavailable()));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let (wallet_id, account) = ethereum_hd_restore(&mut router);
    let account_id = account["account_id"].as_str().expect("account_id");

    let failed = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id, "discover_addresses": true}),
    );
    assert_rpc_error(&failed, "PROVIDER_UNAVAILABLE");
    // FR-234-004a / T-233-005 spirit: the wallet exists with index 0 and discovery stays due.
    assert_eq!(
        wallet_accounts_by_index(&mut router, &wallet_id, "ethereum").len(),
        1
    );
    assert_eq!(
        wallet_summary(&mut router, &wallet_id)["account_discovery_pending"],
        json!(["ethereum"])
    );
}

#[test]
fn ethereum_refresh_confirms_only_when_receipt_lookup_and_finality_agree() {
    let (mut router, provider, _temp_dir) = create_ethereum_wallet_router();
    let imported = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Imported EOA",
            "network": "ethereum",
            "curve": "secp256k1",
            "private_key": "0000000000000000000000000000000000000000000000000000000000000001",
            "encoding": "hex"
        }),
    );
    assert_rpc_ok(&imported);
    let account_id = imported.result().expect("imported")["account_id"]
        .as_str()
        .expect("account_id")
        .to_string();
    provider.set_snapshot(
        "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
        "1000000000000000000",
        7,
    );
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "ethereum",
            "outputs": [{"address": "0x1111111111111111111111111111111111111111", "amount": "1000000000000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().expect("prepared")["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    assert_eq!(confirmed.result().expect("confirmed")["status"], "pending");
    assert_eq!(provider.broadcasts().len(), 1);
    let tx = first_wallet_transaction(&mut router);
    let refresh = |router: &mut RpcRouter| {
        let refreshed = rpc(
            router,
            "wallet:transactions:refresh",
            json!({"tx_ref": tx["tx_ref"]}),
        );
        assert_rpc_ok(&refreshed);
        refreshed.result().expect("refreshed")["status"]
            .as_str()
            .expect("status")
            .to_string()
    };

    // Neither source knows the hash yet: a single provider's silence is not terminal.
    assert_eq!(refresh(&mut router), "pending");
    // Mempool presence from the transaction lookup keeps it pending.
    provider.set_lookup(Some(EthereumTransactionLookup { block_number: None }));
    assert_eq!(refresh(&mut router), "pending");
    // The receipt says mined and finalized (checkpoint 150 >= block 100) but the transaction
    // lookup does not place it in that block: still pending (T-233-017 disagreement).
    provider.set_head(200, Some(150));
    provider.set_receipt(Some(EthereumTransactionReceipt {
        block_number: 100,
        failed: false,
    }));
    assert_eq!(refresh(&mut router), "pending");
    provider.set_lookup(None);
    assert_eq!(refresh(&mut router), "pending");
    // Both agree on block 100 but the finalized checkpoint is behind it: pending.
    provider.set_lookup(Some(EthereumTransactionLookup {
        block_number: Some(100),
    }));
    provider.set_head(120, Some(99));
    assert_eq!(refresh(&mut router), "pending");
    // Without a finalized tag, fewer than 64 canonical blocks is still pending.
    provider.set_head(150, None);
    assert_eq!(refresh(&mut router), "pending");
    // Finalized checkpoint covers the block and both sources agree: confirmed.
    provider.set_head(200, Some(150));
    assert_eq!(refresh(&mut router), "confirmed");
    // A later provider glitch (both sources missing) never demotes a finalized transaction.
    provider.set_receipt(None);
    provider.set_lookup(None);
    assert_eq!(refresh(&mut router), "confirmed");
    assert_eq!(provider.broadcasts().len(), 1, "refresh never re-submits");
}

#[test]
fn ethereum_refresh_marks_reverted_receipt_failed_only_at_finality() {
    let (mut router, provider, _temp_dir) = create_ethereum_wallet_router();
    let imported = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Imported EOA",
            "network": "ethereum",
            "curve": "secp256k1",
            "private_key": "0000000000000000000000000000000000000000000000000000000000000002",
            "encoding": "hex"
        }),
    );
    assert_rpc_ok(&imported);
    let account = imported.result().expect("imported").clone();
    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    let address = accounts.result().expect("accounts")["accounts"][0]["address"]
        .as_str()
        .expect("address")
        .to_string();
    provider.set_snapshot(&address, "1000000000000000000", 0);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account["account_id"],
            "network": "ethereum",
            "outputs": [{"address": "0x1111111111111111111111111111111111111111", "amount": "1"}],
            "fee_policy": {"tier": "fast"}
        }),
    );
    assert_rpc_ok(&prepared);
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().expect("prepared")["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let tx = first_wallet_transaction(&mut router);
    provider.set_receipt(Some(EthereumTransactionReceipt {
        block_number: 100,
        failed: true,
    }));
    provider.set_lookup(Some(EthereumTransactionLookup {
        block_number: Some(100),
    }));
    provider.set_head(110, None);
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(
        refreshed.result().expect("refreshed")["status"],
        "pending",
        "a revert can still be reorged before finality"
    );
    provider.set_head(163, None);
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(refreshed.result().expect("refreshed")["status"], "failed");
}

#[test]
fn ethereum_transaction_history_sync_maps_indexer_transactions() {
    let (router, _temp_dir) = create_test_router();
    let provider = Arc::new(MockEthereumProvider::new());
    let mut config = wallet_config_enabled();
    config
        .enabled_capabilities
        .insert(ETHEREUM_NATIVE_TRANSFER_CAPABILITY.to_string());
    let mut router = router
        .with_wallet_runtime_config(config)
        .with_wallet_chain_profile(Arc::new(EthereumChainProfile::new(provider.clone())));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let created = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "ETH wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["ethereum"]
        }),
    );
    assert_rpc_ok(&created);
    let account = created.result().expect("created")["accounts"][0].clone();
    let account_id = account["account_id"]
        .as_str()
        .expect("account_id")
        .to_string();
    let address = account["address"].as_str().expect("address").to_string();
    let hash = |byte: &str| format!("0x{}", byte.repeat(32));
    provider.set_history(vec![
        EthereumAddressTransaction {
            hash: hash("aa"),
            from: address.to_uppercase().replace("0X", "0x"),
            to: Some("0x1111111111111111111111111111111111111111".to_string()),
            value: "1000000000000000".to_string(),
            fee: "42000000000000".to_string(),
            block_number: Some(19_000_001),
            timestamp: Some(1_710_000_100_000),
            failed: false,
        },
        EthereumAddressTransaction {
            hash: hash("bb"),
            from: "0x2222222222222222222222222222222222222222".to_string(),
            to: Some(address.clone()),
            value: "5000000000000000000".to_string(),
            fee: "31500000000000".to_string(),
            block_number: Some(19_000_000),
            timestamp: Some(1_710_000_000_000),
            failed: false,
        },
        EthereumAddressTransaction {
            hash: hash("cc"),
            from: address.clone(),
            to: None,
            value: "0".to_string(),
            fee: "1".to_string(),
            block_number: None,
            timestamp: None,
            failed: true,
        },
    ]);

    for _ in 0..2 {
        let synced = rpc(
            &mut router,
            "wallet:transactions:sync",
            json!({"account_id": account_id, "limit": 200}),
        );
        assert_rpc_ok(&synced);
        assert_eq!(synced.result().expect("synced")["synced_count"], 3);
    }
    assert_eq!(
        provider.history_calls(),
        vec![(address.clone(), 25), (address, 25)],
        "the indexer is asked for at most one page of 25 per sync"
    );

    let listed = rpc(
        &mut router,
        "wallet:transactions:list",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&listed);
    let transactions = listed.result().expect("listed")["transactions"]
        .as_array()
        .cloned()
        .expect("transactions");
    assert_eq!(transactions.len(), 3);
    let by_hash = |suffix: &str| {
        transactions
            .iter()
            .find(|entry| entry["tx_hash"] == hash(suffix))
            .cloned()
            .expect("entry")
    };
    let sent = by_hash("aa");
    assert_eq!(sent["direction"], "outgoing");
    assert_eq!(
        sent["counterparty"],
        "0x1111111111111111111111111111111111111111"
    );
    assert_eq!(sent["amount"], "1000000000000000");
    assert_eq!(sent["fee"], "42000000000000");
    assert_eq!(sent["amount_unit"], "wei");
    assert_eq!(sent["status"], "confirmed");
    assert_eq!(sent["created_at"], 1_710_000_100_000_u64);
    let received = by_hash("bb");
    assert_eq!(received["direction"], "incoming");
    assert_eq!(
        received["counterparty"],
        "0x2222222222222222222222222222222222222222"
    );
    assert_eq!(received["amount"], "5000000000000000000");
    assert_eq!(received["fee"], "0");
    assert_eq!(received["status"], "confirmed");
    let failed = by_hash("cc");
    assert_eq!(failed["status"], "failed");
    assert_eq!(failed["direction"], "outgoing");
    assert!(failed["counterparty"].is_null());
}

#[test]
fn ethereum_transaction_history_sync_fails_closed_without_provider() {
    let (router, _temp_dir) = create_test_router();
    let mut config = wallet_config_enabled();
    config
        .enabled_capabilities
        .insert(ETHEREUM_NATIVE_TRANSFER_CAPABILITY.to_string());
    let mut router = router
        .with_wallet_runtime_config(config)
        .with_wallet_chain_profile(Arc::new(EthereumChainProfile::unavailable()));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let created = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "ETH wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["ethereum"]
        }),
    );
    assert_rpc_ok(&created);
    let account_id = created.result().expect("created")["accounts"][0]["account_id"]
        .as_str()
        .expect("account_id")
        .to_string();

    let failed = rpc(
        &mut router,
        "wallet:transactions:sync",
        json!({"account_id": account_id}),
    );
    assert_rpc_error(&failed, "PROVIDER_UNAVAILABLE");
}

#[test]
fn solana_transaction_history_sync_reconciles_sent_transaction_and_incoming_transfer() {
    let (mut router, provider, _temp_dir) = create_solana_wallet_router();
    let (account_id, address) = solana_import(&mut router, [5u8; 32]);
    provider.set_balance(&address, 1_000_000_000);
    let destination = bitcoin::base58::encode(&[11u8; 32]);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "solana",
            "outputs": [{"address": destination, "amount": "100000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let preparation_id = prepared.result().expect("prepared")["preparation_id"]
        .as_str()
        .expect("preparation_id")
        .to_string();
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": ["destination_not_rent_exempt"],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let sent = first_wallet_transaction(&mut router);
    assert_eq!(sent["status"], "pending");
    let signature = sent["tx_hash"].as_str().expect("signature").to_string();
    let sent_tx_ref = sent["tx_ref"].as_str().expect("tx_ref").to_string();

    let sender = "3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E";
    provider.set_history(
        &address,
        vec![
            SolanaSignatureInfo {
                signature: signature.clone(),
                slot: Some(48),
                block_time: Some(1_710_000_100),
                failed: false,
                finalized: true,
            },
            SolanaSignatureInfo {
                signature: "sol-incoming".to_string(),
                slot: Some(40),
                block_time: Some(1_710_000_000),
                failed: false,
                finalized: false,
            },
            SolanaSignatureInfo {
                signature: "sol-unknown".to_string(),
                slot: Some(30),
                block_time: None,
                failed: false,
                finalized: true,
            },
        ],
        vec![
            (
                signature.as_str(),
                SolanaTransactionDetails {
                    slot: Some(48),
                    block_time: Some(1_710_000_100),
                    fee: 5_000,
                    failed: false,
                    account_keys: vec![
                        address.clone(),
                        destination.clone(),
                        "11111111111111111111111111111111".to_string(),
                    ],
                    pre_balances: vec![1_000_000_000, 0, 1],
                    post_balances: vec![999_895_000, 100_000, 1],
                },
            ),
            (
                "sol-incoming",
                SolanaTransactionDetails {
                    slot: Some(40),
                    block_time: Some(1_710_000_000),
                    fee: 5_000,
                    failed: false,
                    account_keys: vec![sender.to_string(), address.clone()],
                    pre_balances: vec![10_000_000, 750_000_000],
                    post_balances: vec![9_745_000, 1_000_000_000],
                },
            ),
        ],
    );

    for _ in 0..2 {
        let synced = rpc(
            &mut router,
            "wallet:transactions:sync",
            json!({"account_id": account_id}),
        );
        assert_rpc_ok(&synced);
        assert_eq!(synced.result().expect("synced")["synced_count"], 3);
    }

    let listed = rpc(
        &mut router,
        "wallet:transactions:list",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&listed);
    let transactions = listed.result().expect("listed")["transactions"]
        .as_array()
        .cloned()
        .expect("transactions");
    assert_eq!(
        transactions.len(),
        3,
        "the journal's own send is reconciled, not duplicated"
    );
    let reconciled = transactions
        .iter()
        .find(|entry| entry["tx_hash"] == signature)
        .expect("sent entry");
    assert_eq!(reconciled["tx_ref"], sent_tx_ref);
    assert_eq!(reconciled["status"], "confirmed");
    assert_eq!(reconciled["direction"], "outgoing");
    assert_eq!(reconciled["counterparty"], destination);
    assert_eq!(reconciled["amount"], "100000");
    assert_eq!(reconciled["fee"], "5000");
    assert_eq!(reconciled["amount_unit"], "lamport");
    assert_eq!(
        reconciled["created_at"], sent["created_at"],
        "the local broadcast timestamp wins for journal entries"
    );
    let incoming = transactions
        .iter()
        .find(|entry| entry["tx_hash"] == "sol-incoming")
        .expect("incoming entry");
    assert_eq!(incoming["direction"], "incoming");
    assert_eq!(incoming["counterparty"], sender);
    assert_eq!(incoming["amount"], "250000000");
    assert_eq!(incoming["fee"], "0");
    assert_eq!(incoming["status"], "pending", "confirmed is not finality");
    assert_eq!(incoming["created_at"], 1_710_000_000_000_u64);
    let unknown = transactions
        .iter()
        .find(|entry| entry["tx_hash"] == "sol-unknown")
        .expect("unknown entry");
    assert_eq!(unknown["direction"], "unknown");
    assert_eq!(unknown["amount"], "0");
    assert_eq!(unknown["status"], "confirmed");
}

#[test]
fn solana_transaction_history_sync_fails_closed_without_provider() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(solana_wallet_config())
        .with_wallet_chain_profile(Arc::new(SolanaChainProfile::unavailable()));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let (account_id, _address) = solana_import(&mut router, [8u8; 32]);

    let failed = rpc(
        &mut router,
        "wallet:transactions:sync",
        json!({"account_id": account_id}),
    );
    assert_rpc_error(&failed, "PROVIDER_UNAVAILABLE");
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
fn wallet_core_ton_hd_create_and_derive_materialize_wallet_tg_accounts() {
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
    assert_eq!(account["derivation_profile"], "ton_bip39_wallet_tg_account");
    assert_eq!(account["wallet_contract"], "wallet_tg");
    assert_eq!(account["account_index"], 0);
    assert_eq!(account["workchain"], 0);
    assert_eq!(account["address"], address);
    assert_eq!(
        account["address"],
        "EQC-Ip06mEnUpcEN-VCDk3MIKwbnv6QhOLh4yGJHyZi0HcrD"
    );
    assert_eq!(
        account["public_key"],
        "713e419c78f1fcaa494bb2cea38878f19656d4a5dd59b0c86caf03e2dd01abd9"
    );
    assert_eq!(
        account["raw_account"],
        "0:be229d3a9849d4a5c10df950839373082b06e7bfa42138b878c86247c998b41d"
    );
    assert!(address.starts_with("EQ"));
    assert!(account["raw_account"]
        .as_str()
        .is_some_and(|raw| raw.starts_with("0:")));
    assert_eq!(account["derivation_path"], "ton_bip39_wallet_tg_account/0");

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
        "EQB3xvkX-7EsVx-pEehSDkFaRBG81ozJQmsBYoRnO6n3hIt6"
    );
    assert_eq!(
        second["public_key"],
        "a689e0a2033777b4affd3f223b1f61cd2b56a887f3be9e89f139f08bf6a5dba5"
    );
    assert_eq!(
        second["raw_account"],
        "0:77c6f917fbb12c571fa911e8520e415a4411bcd68cc9426b016284673ba9f784"
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
    assert_eq!(
        account["derivation_profile"],
        "ton_native_wallet_tg_account"
    );
    assert_eq!(account["derivation_path"], "ton_native_wallet_tg_account/0");
    assert_eq!(
        account["public_key"],
        "0cce79e60d25fde965e249096617e3ef212541ddeb5b3336cc3853e4499da196"
    );
    assert_eq!(
        account["raw_account"],
        "0:4db8722d6cf73788e0e9462b167e92357ae9ada6835ae974f0af56872622b39f"
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
    assert_eq!(account["wallet_contract"], "wallet_tg");
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
    assert_eq!(result["preview"]["ton"]["wallet_contract"], "wallet_tg");
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

fn json_words(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .expect("word array")
        .iter()
        .map(|word| word.as_str().expect("word").to_string())
        .collect()
}

#[test]
fn wallet_core_ton_rotation_wallet_create_export_rotate_and_promote() {
    let (mut router, provider, _temp_dir) = create_ton_wallet_router(true);
    unlock_vault(&mut router, "pw");

    let generated = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode": "multichain", "mnemonic_standard": "rotation", "word_count": 12, "wordlist": "english"}),
    );
    assert_rpc_ok(&generated);
    let generated = generated.result().expect("generated");
    let initial_words = json_words(&generated["mnemonic"]);
    assert_eq!(initial_words.len(), 12);

    // TON-only is a restore path: a Telegram Wallet phrase is imported by its words.
    let created = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Rotation wallet",
            "wallet_mode": "ton_only",
            "mnemonic": initial_words,
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_ok(&created);
    let created = created.result().expect("created");
    let wallet_id = created["wallet_id"]
        .as_str()
        .expect("wallet id")
        .to_string();
    let account = &created["accounts"][0];
    let account_id = account["account_id"]
        .as_str()
        .expect("account id")
        .to_string();
    let address = account["address"].as_str().expect("address").to_string();
    let anchor_public_key = account["public_key"]
        .as_str()
        .expect("public key")
        .to_string();
    assert_eq!(account["mnemonic_standard"], "rotation");
    assert_eq!(
        account["derivation_profile"],
        "ton_rotation_wallet_tg_account"
    );
    assert_eq!(account["wallet_contract"], "wallet_tg");

    let export = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": wallet_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&export);
    let export = export.result().expect("export");
    assert_eq!(export["mnemonic_standard"], "rotation");
    assert_eq!(json_words(&export["mnemonic"]), initial_words);

    // Rotate: the chain still reports the anchor key (initial form).
    let anchor_key_bytes: [u8; 32] = chromvoid_core::wallet::parse_hex(&anchor_public_key)
        .expect("hex")
        .try_into()
        .expect("32 bytes");
    provider.set_public_key(Some(anchor_key_bytes));
    let rotated = rpc(
        &mut router,
        "wallet:ton:rotateKey",
        json!({"account_id": account_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&rotated);
    let rotated = rotated.result().expect("rotated");
    assert_eq!(rotated["status"], "pending");
    assert_eq!(rotated["seqno"], 7);
    assert_eq!(rotated["mnemonic_standard"], "rotation");
    let rotated_words = json_words(&rotated["mnemonic"]);
    assert_eq!(rotated_words.len(), 24);
    assert_eq!(&rotated_words[..12], initial_words.as_slice());
    let new_public_key = rotated["new_public_key"]
        .as_str()
        .expect("new key")
        .to_string();
    assert_eq!(new_public_key.len(), 64);
    assert_ne!(new_public_key, anchor_public_key);
    let broadcasts = provider.broadcasts();
    assert_eq!(broadcasts.len(), 1);
    assert_eq!(broadcasts[0].seqno, 7);
    assert_eq!(broadcasts[0].account.address, address);

    // While the rotation is pending and unconfirmed, the phrase on disk stays the old one and
    // a second rotation is refused.
    let export = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": wallet_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&export);
    assert_eq!(
        json_words(&export.result().expect("export")["mnemonic"]),
        initial_words
    );
    let again = rpc(
        &mut router,
        "wallet:ton:rotateKey",
        json!({"account_id": account_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_error(&again, "INVALID_INPUT");

    // The chain now reports the new key: export promotes the pending half.
    let new_key_bytes: [u8; 32] = chromvoid_core::wallet::parse_hex(&new_public_key)
        .expect("hex")
        .try_into()
        .expect("32 bytes");
    provider.set_public_key(Some(new_key_bytes));
    provider.set_seqno(8);
    let export = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": wallet_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&export);
    assert_eq!(
        json_words(&export.result().expect("export")["mnemonic"]),
        rotated_words
    );

    // A transfer after the rotation is signed with the new key and accepted for broadcast.
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

    // Restoring from the 24-word phrase yields the same account address.
    let restored = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Restored rotation wallet",
            "wallet_mode": "ton_only",
            "mnemonic": rotated_words,
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_ok(&restored);
    let restored = restored.result().expect("restored");
    assert_eq!(restored["accounts"][0]["address"], address);
    assert_eq!(restored["accounts"][0]["public_key"], anchor_public_key);
}

#[test]
fn wallet_core_multichain_rotation_root_passphrase_is_optional_and_matches_bip39_derivation() {
    let (router, _temp_dir) = create_test_router();
    let ton_provider = Arc::new(MockTonProvider::new());
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TonChainProfile::new(ton_provider.clone())))
        .with_wallet_chain_profile(Arc::new(BitcoinChainProfile::new(Arc::new(
            MockBitcoinProvider::new(),
        ))));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let anchor: Vec<String> =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
            .split(' ')
            .map(str::to_string)
            .collect();

    // The default universal wallet has no passphrase: the 12 anchor words open every network,
    // exactly like the same words imported into any BIP39 multichain wallet.
    let without_passphrase = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Telegram + all (no passphrase)",
            "wallet_mode": "multichain",
            "mnemonic": anchor,
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "supported_networks": ["ton", "bitcoin"]
        }),
    );
    assert_rpc_ok(&without_passphrase);
    let without_passphrase = without_passphrase.result().expect("created");
    let bare_bitcoin_account = without_passphrase["accounts"]
        .as_array()
        .expect("accounts")
        .iter()
        .find(|account| account["network"] == "bitcoin")
        .expect("bitcoin account")["account_id"]
        .as_str()
        .expect("id")
        .to_string();
    let bare_receive_address = derive_receive_address(&mut router, &bare_bitcoin_account);
    let bare_export = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": without_passphrase["wallet_id"], "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&bare_export);
    let bare_export = bare_export.result().expect("export");
    assert_eq!(json_words(&bare_export["mnemonic"]), anchor);
    assert!(bare_export["bip39_passphrase"].is_null());
    // An empty passphrase from a client form is the same as no passphrase at all.
    let ton_only_empty_passphrase = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "TON only (empty passphrase)",
            "wallet_mode": "ton_only",
            "mnemonic": anchor,
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "bip39_passphrase": "",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_ok(&ton_only_empty_passphrase);
    let ton_only_with_passphrase = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "TON only",
            "wallet_mode": "ton_only",
            "mnemonic": anchor,
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "bip39_passphrase": "secret",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_error(&ton_only_with_passphrase, "INVALID_INPUT");

    let created = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Telegram + all",
            "wallet_mode": "multichain",
            "mnemonic": anchor,
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "bip39_passphrase": "secret",
            "supported_networks": ["ton", "bitcoin"]
        }),
    );
    assert_rpc_ok(&created);
    let created = created.result().expect("created");
    let wallet_id = created["wallet_id"]
        .as_str()
        .expect("wallet id")
        .to_string();
    let accounts = created["accounts"].as_array().expect("accounts");
    let ton = accounts
        .iter()
        .find(|account| account["network"] == "ton")
        .expect("ton account");
    let bitcoin = accounts
        .iter()
        .find(|account| account["network"] == "bitcoin")
        .expect("bitcoin account");
    assert_eq!(ton["wallet_mode"], "multichain");
    assert_eq!(ton["mnemonic_standard"], "rotation");
    assert_eq!(ton["derivation_profile"], "ton_rotation_wallet_tg_account");
    assert_eq!(ton["wallet_contract"], "wallet_tg");
    // The TON account ignores the passphrase: it must match the ton_only rotation identity.
    let ton_only = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "TON only",
            "wallet_mode": "ton_only",
            "mnemonic": anchor,
            "wordlist": "english",
            "mnemonic_standard": "rotation",
            "supported_networks": ["ton"]
        }),
    );
    assert_rpc_ok(&ton_only);
    assert_eq!(
        ton_only.result().expect("ton only")["accounts"][0]["address"],
        ton["address"]
    );
    let receive_address =
        derive_receive_address(&mut router, bitcoin["account_id"].as_str().expect("id"));

    // The Bitcoin account equals a plain BIP39 wallet built from the same 12 words + passphrase.
    let bip39_same = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "BIP39 twin",
            "wallet_mode": "multichain",
            "mnemonic": anchor,
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "bip39_passphrase": "secret",
            "supported_networks": ["bitcoin"]
        }),
    );
    assert_rpc_ok(&bip39_same);
    let twin_account = bip39_same.result().expect("twin")["accounts"][0]["account_id"]
        .as_str()
        .expect("id")
        .to_string();
    assert_eq!(
        derive_receive_address(&mut router, &twin_account),
        receive_address
    );
    let bip39_bare = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "BIP39 bare",
            "wallet_mode": "multichain",
            "mnemonic": anchor,
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["bitcoin"]
        }),
    );
    assert_rpc_ok(&bip39_bare);
    let bare_account = bip39_bare.result().expect("bare")["accounts"][0]["account_id"]
        .as_str()
        .expect("id")
        .to_string();
    let bare_twin_address = derive_receive_address(&mut router, &bare_account);
    assert_ne!(
        bare_twin_address, receive_address,
        "a passphrase must open a different Bitcoin account"
    );
    assert_eq!(
        bare_twin_address, bare_receive_address,
        "without a passphrase the rotation root equals the plain BIP39 wallet"
    );

    let export = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": wallet_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&export);
    let export = export.result().expect("export");
    assert_eq!(export["mnemonic_standard"], "rotation");
    assert_eq!(export["wallet_mode"], "multichain");
    assert_eq!(export["bip39_passphrase"], "secret");
    assert_eq!(json_words(&export["mnemonic"]), anchor);

    // Key rotation keeps the passphrase and the Bitcoin derivation intact.
    let anchor_key: [u8; 32] =
        chromvoid_core::wallet::parse_hex(ton["public_key"].as_str().expect("pk"))
            .expect("hex")
            .try_into()
            .expect("32 bytes");
    ton_provider.set_public_key(Some(anchor_key));
    let rotated = rpc(
        &mut router,
        "wallet:ton:rotateKey",
        json!({"account_id": ton["account_id"], "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&rotated);
    let rotated = rotated.result().expect("rotated");
    let new_key: [u8; 32] =
        chromvoid_core::wallet::parse_hex(rotated["new_public_key"].as_str().expect("pk"))
            .expect("hex")
            .try_into()
            .expect("32 bytes");
    ton_provider.set_public_key(Some(new_key));
    let export = rpc(
        &mut router,
        "wallet:backup:export",
        json!({"wallet_id": wallet_id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&export);
    let export = export.result().expect("export after rotation");
    assert_eq!(export["bip39_passphrase"], "secret");
    assert_eq!(json_words(&export["mnemonic"]).len(), 24);
    let accounts = rpc(
        &mut router,
        "wallet:accounts:list",
        json!({"wallet_id": wallet_id}),
    );
    assert_rpc_ok(&accounts);
    let bitcoin_after = accounts.result().expect("accounts")["accounts"]
        .as_array()
        .expect("accounts")
        .iter()
        .find(|account| account["network"] == "bitcoin")
        .cloned()
        .expect("bitcoin account");
    assert_eq!(bitcoin_after["account_id"], bitcoin["account_id"]);
    // The receive address allocated before the rotation is still the account's current one.
    assert_eq!(
        bitcoin_after["current_receive_address"], receive_address,
        "a TON key rotation must not touch the Bitcoin account"
    );
}

/// First receive address of a Bitcoin account (`wallet:addresses:derive` is deterministic for
/// the first call on a fresh account).
fn derive_receive_address(router: &mut RpcRouter, account_id: &str) -> String {
    let response = rpc(
        router,
        "wallet:addresses:derive",
        json!({"account_id": account_id, "purpose": "receive"}),
    );
    assert_rpc_ok(&response);
    response.result().expect("derived")["address"]
        .as_str()
        .expect("address")
        .to_string()
}

#[test]
fn wallet_core_address_detect_uses_every_registered_profile() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(TonChainProfile::new(Arc::new(
            MockTonProvider::new(),
        ))))
        .with_wallet_chain_profile(Arc::new(BitcoinChainProfile::new(Arc::new(
            MockBitcoinProvider::new(),
        ))))
        .with_wallet_chain_profile(Arc::new(SolanaChainProfile::new(Arc::new(
            MockSolanaProvider::new(),
        ))));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");

    let detect = |router: &mut RpcRouter, address: &str| {
        let response = rpc(router, "wallet:address:detect", json!({"address": address}));
        assert_rpc_ok(&response);
        response.result().expect("detect").clone()
    };

    let ton = detect(
        &mut router,
        "  EQC-Ip06mEnUpcEN-VCDk3MIKwbnv6QhOLh4yGJHyZi0HcrD ",
    );
    assert_eq!(ton["network"], "ton");
    assert_eq!(
        ton["address"],
        "EQC-Ip06mEnUpcEN-VCDk3MIKwbnv6QhOLh4yGJHyZi0HcrD"
    );
    assert_eq!(ton["candidates"], json!(["ton"]));
    assert!(ton["normalized_address"]
        .as_str()
        .is_some_and(|value| !value.is_empty()));

    let bitcoin = detect(&mut router, "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
    assert_eq!(bitcoin["network"], "bitcoin");
    assert_eq!(bitcoin["candidates"], json!(["bitcoin"]));
    let legacy = detect(&mut router, "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2");
    assert_eq!(legacy["network"], "bitcoin");
    assert_eq!(legacy["candidates"], json!(["bitcoin"]));

    // A base58 32-byte public key is Solana-only; other chains' encodings do not decode as one.
    let solana = detect(
        &mut router,
        " 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin ",
    );
    assert_eq!(solana["network"], "solana");
    assert_eq!(solana["candidates"], json!(["solana"]));
    assert_eq!(
        solana["normalized_address"],
        "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
    );

    // Ethereum is not registered on this router: a valid-looking address is simply unknown.
    let unknown = detect(&mut router, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
    assert!(unknown["network"].is_null() && unknown["normalized_address"].is_null());
    assert_eq!(unknown["candidates"], json!([]));
    let empty = detect(&mut router, "   ");
    assert_eq!(empty["address"], "");
    assert_eq!(empty["candidates"], json!([]));
    assert_rpc_error(
        &rpc(&mut router, "wallet:address:detect", json!({"addr": "x"})),
        "INVALID_INPUT",
    );
}

// ---------------------------------------------------------------------------------------------
// Solana (SPEC-234)
// ---------------------------------------------------------------------------------------------

const SOLANA_TEST_BLOCKHASH_BYTES: [u8; 32] = [7u8; 32];
const SOLANA_TEST_LAST_VALID_BLOCK_HEIGHT: u64 = 250;
const SOLANA_TEST_RENT_EXEMPT_MINIMUM: u64 = 890_880;
const SOLANA_TEST_FEE: u64 = 5_000;

struct MockSolanaProvider {
    balances: Mutex<HashMap<String, u64>>,
    block_height: Mutex<u64>,
    sends: Mutex<Vec<String>>,
    send_error: Mutex<Option<SolanaProviderError>>,
    status: Mutex<Option<SolanaSignatureStatus>>,
    signatures: Mutex<HashMap<String, Vec<SolanaSignatureInfo>>>,
    transactions: Mutex<HashMap<String, SolanaTransactionDetails>>,
    prioritization_fees: Mutex<Vec<u64>>,
    /// Provider methods in call order (`balance`, `signatures`, ...), for discovery counting.
    calls: Mutex<Vec<(&'static str, String)>>,
}

impl MockSolanaProvider {
    fn new() -> Self {
        Self {
            balances: Mutex::new(HashMap::new()),
            block_height: Mutex::new(100),
            sends: Mutex::new(Vec::new()),
            send_error: Mutex::new(None),
            status: Mutex::new(None),
            signatures: Mutex::new(HashMap::new()),
            transactions: Mutex::new(HashMap::new()),
            prioritization_fees: Mutex::new(vec![0, 0, 2_000, 5_000, 40_000]),
            calls: Mutex::new(Vec::new()),
        }
    }

    fn set_prioritization_fees(&self, fees: Vec<u64>) {
        *self.prioritization_fees.lock().expect("fees") = fees;
    }

    fn set_transaction(&self, signature: &str, details: SolanaTransactionDetails) {
        self.transactions
            .lock()
            .expect("transactions")
            .insert(signature.to_string(), details);
    }

    fn calls(&self) -> Vec<(&'static str, String)> {
        self.calls.lock().expect("calls").clone()
    }

    fn record(&self, method: &'static str, argument: &str) {
        self.calls
            .lock()
            .expect("calls")
            .push((method, argument.to_string()));
    }

    fn set_history(
        &self,
        address: &str,
        signatures: Vec<SolanaSignatureInfo>,
        transactions: Vec<(&str, SolanaTransactionDetails)>,
    ) {
        self.signatures
            .lock()
            .expect("signatures")
            .insert(address.to_string(), signatures);
        let mut known = self.transactions.lock().expect("transactions");
        for (signature, details) in transactions {
            known.insert(signature.to_string(), details);
        }
    }

    fn set_balance(&self, address: &str, lamports: u64) {
        self.balances
            .lock()
            .expect("balances")
            .insert(address.to_string(), lamports);
    }

    fn set_block_height(&self, height: u64) {
        *self.block_height.lock().expect("block height") = height;
    }

    fn set_send_error(&self, error: Option<SolanaProviderError>) {
        *self.send_error.lock().expect("send error") = error;
    }

    fn set_status(&self, status: Option<SolanaSignatureStatus>) {
        *self.status.lock().expect("status") = status;
    }

    fn sends(&self) -> Vec<String> {
        self.sends.lock().expect("sends").clone()
    }
}

impl SolanaProvider for MockSolanaProvider {
    fn balance(&self, address: &str) -> Result<u64, SolanaProviderError> {
        self.record("balance", address);
        Ok(self
            .balances
            .lock()
            .expect("balances")
            .get(address)
            .copied()
            .unwrap_or(0))
    }

    fn latest_blockhash(&self) -> Result<SolanaBlockhash, SolanaProviderError> {
        // A real node always hands out a blockhash that is valid for ~150 more block heights;
        // the fixed test height only applies while the mocked chain sits at its initial height.
        let block_height = *self.block_height.lock().expect("block height");
        Ok(SolanaBlockhash {
            blockhash: bitcoin::base58::encode(&SOLANA_TEST_BLOCKHASH_BYTES),
            last_valid_block_height: SOLANA_TEST_LAST_VALID_BLOCK_HEIGHT.max(block_height + 150),
        })
    }

    fn block_height(&self) -> Result<u64, SolanaProviderError> {
        Ok(*self.block_height.lock().expect("block height"))
    }

    fn minimum_balance_for_rent_exemption(
        &self,
        _data_len: u64,
    ) -> Result<u64, SolanaProviderError> {
        Ok(SOLANA_TEST_RENT_EXEMPT_MINIMUM)
    }

    fn fee_for_message(&self, _message_base64: &str) -> Result<u64, SolanaProviderError> {
        Ok(SOLANA_TEST_FEE)
    }

    fn recent_prioritization_fees(
        &self,
        _addresses: &[&str],
    ) -> Result<Vec<u64>, SolanaProviderError> {
        Ok(self.prioritization_fees.lock().expect("fees").clone())
    }

    fn send_transaction(&self, transaction_base64: &str) -> Result<String, SolanaProviderError> {
        self.sends
            .lock()
            .expect("sends")
            .push(transaction_base64.to_string());
        if let Some(error) = self.send_error.lock().expect("send error").clone() {
            return Err(error);
        }
        let bytes = solana_decode_base64(transaction_base64);
        Ok(bitcoin::base58::encode(&bytes[1..65]))
    }

    fn signature_status(
        &self,
        _signature: &str,
    ) -> Result<Option<SolanaSignatureStatus>, SolanaProviderError> {
        Ok(self.status.lock().expect("status").clone())
    }

    fn signatures_for_address(
        &self,
        address: &str,
        limit: u32,
        _before: Option<&str>,
    ) -> Result<Vec<SolanaSignatureInfo>, SolanaProviderError> {
        self.record("signatures", address);
        let mut signatures = self
            .signatures
            .lock()
            .expect("signatures")
            .get(address)
            .cloned()
            .unwrap_or_default();
        signatures.truncate(limit as usize);
        Ok(signatures)
    }

    fn transaction(
        &self,
        signature: &str,
    ) -> Result<Option<SolanaTransactionDetails>, SolanaProviderError> {
        Ok(self
            .transactions
            .lock()
            .expect("transactions")
            .get(signature)
            .cloned())
    }
}

fn solana_decode_base64(value: &str) -> Vec<u8> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .expect("base64 transaction")
}

fn solana_wallet_config() -> WalletRuntimeConfig {
    let mut config = wallet_config_enabled();
    config
        .enabled_capabilities
        .insert(SOLANA_NATIVE_TRANSFER_CAPABILITY.to_string());
    config
}

fn create_solana_wallet_router() -> (RpcRouter, Arc<MockSolanaProvider>, TempDir) {
    let (router, temp_dir) = create_test_router();
    let provider = Arc::new(MockSolanaProvider::new());
    let mut router = router
        .with_wallet_runtime_config(solana_wallet_config())
        .with_wallet_chain_profile(Arc::new(SolanaChainProfile::new(provider.clone())));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    (router, provider, temp_dir)
}

/// Independent SLIP-0010 Ed25519 derivation written against the spec text (HMAC-SHA512, key
/// `"ed25519 seed"`, `0x00 || k || index` per hardened step) so the profile's address can be
/// cross-checked without sharing code with it.
fn independent_slip10_ed25519(seed: &[u8], hardened_path: &[u32]) -> [u8; 32] {
    use hmac::{Hmac, Mac};
    let mut mac = Hmac::<sha2::Sha512>::new_from_slice(b"ed25519 seed").expect("hmac key");
    mac.update(seed);
    let master = mac.finalize().into_bytes();
    let mut key = [0u8; 32];
    let mut chain_code = [0u8; 32];
    key.copy_from_slice(&master[..32]);
    chain_code.copy_from_slice(&master[32..]);
    for index in hardened_path {
        let mut mac = Hmac::<sha2::Sha512>::new_from_slice(&chain_code).expect("hmac key");
        mac.update(&[0u8]);
        mac.update(&key);
        mac.update(&(index | 0x8000_0000).to_be_bytes());
        let digest = mac.finalize().into_bytes();
        key.copy_from_slice(&digest[..32]);
        chain_code.copy_from_slice(&digest[32..]);
    }
    key
}

fn independent_solana_address(words: &[&str], passphrase: &str, account_index: u32) -> String {
    let mnemonic =
        Mnemonic::parse_in_normalized(Language::English, &words.join(" ")).expect("mnemonic");
    let seed = mnemonic.to_seed(passphrase);
    let signing_seed = independent_slip10_ed25519(&seed, &[44, 501, account_index, 0]);
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&signing_seed);
    bitcoin::base58::encode(signing_key.verifying_key().as_bytes())
}

fn solana_keypair_base58(seed: [u8; 32]) -> String {
    bitcoin::base58::encode(&ed25519_dalek::SigningKey::from_bytes(&seed).to_keypair_bytes())
}

fn solana_hd_create(
    router: &mut RpcRouter,
    mnemonic_standard: &str,
    mnemonic: Value,
    passphrase: Option<&str>,
) -> (String, Value) {
    let mut request = json!({
        "label": "Solana wallet",
        "wallet_mode": "multichain",
        "mnemonic": mnemonic,
        "wordlist": "english",
        "mnemonic_standard": mnemonic_standard,
        "supported_networks": ["solana"]
    });
    if let Some(passphrase) = passphrase {
        request["bip39_passphrase"] = json!(passphrase);
    }
    let response = rpc(router, "wallet:hd:create", request);
    assert_rpc_ok(&response);
    let result = response.result().expect("hd create result").clone();
    let wallet_id = result["wallet_id"].as_str().expect("wallet_id").to_string();
    assert_eq!(result["accounts"].as_array().map(Vec::len), Some(1));
    (wallet_id, result["accounts"][0].clone())
}

fn solana_import(router: &mut RpcRouter, seed: [u8; 32]) -> (String, String) {
    let imported = rpc(
        router,
        "wallet:import:create",
        json!({
            "label": "Imported Solana",
            "network": "solana",
            "curve": "ed25519",
            "private_key": solana_keypair_base58(seed),
            "encoding": "base58_keypair"
        }),
    );
    assert_rpc_ok(&imported);
    let account_id = imported.result().expect("imported")["account_id"]
        .as_str()
        .expect("account_id")
        .to_string();
    let address = bitcoin::base58::encode(
        ed25519_dalek::SigningKey::from_bytes(&seed)
            .verifying_key()
            .as_bytes(),
    );
    (account_id, address)
}

#[test]
fn wallet_core_solana_hd_create_derives_phantom_path_and_matches_independent_slip10() {
    let (mut router, _provider, _temp_dir) = create_solana_wallet_router();
    let (wallet_id, account) = solana_hd_create(&mut router, "bip39", valid_mnemonic_json(), None);

    let expected = independent_solana_address(&VALID_MNEMONIC, "", 0);
    assert_eq!(account["kind"], "derived");
    assert_eq!(account["network"], "solana");
    assert_eq!(account["account_model"], "account");
    assert_eq!(account["mnemonic_standard"], "bip39");
    assert_eq!(account["derivation_profile"], "solana_bip44_account");
    assert_eq!(account["account_index"], 0);
    assert_eq!(account["derivation_path"], "m/44'/501'/0'/0'");
    assert_eq!(account["label"], "Solana account 1");
    assert_eq!(account["address"], expected);
    assert_eq!(account["public_key"], expected);
    assert!(account.get("wallet_contract").is_none());
    assert!(account.get("workchain").is_none());
    let address = account["address"].as_str().expect("address");
    assert_eq!(bitcoin::base58::decode(address).expect("base58").len(), 32);
    eprintln!("solana m/44'/501'/0'/0' for the BIP39 test phrase: {address}");

    // BIP39 passphrase changes the seed (and therefore the address).
    let (mut other_router, _other_provider, _other_temp_dir) = create_solana_wallet_router();
    let (_, passphrase_account) = solana_hd_create(
        &mut other_router,
        "bip39",
        valid_mnemonic_json(),
        Some("secret passphrase"),
    );
    assert_eq!(
        passphrase_account["address"],
        independent_solana_address(&VALID_MNEMONIC, "secret passphrase", 0)
    );
    assert_ne!(passphrase_account["address"], account["address"]);

    // wallet:accounts:derive materializes the next account index on the same root.
    let derived = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "solana"}),
    );
    assert_rpc_ok(&derived);
    let accounts = rpc(
        &mut router,
        "wallet:accounts:list",
        json!({"wallet_id": wallet_id}),
    );
    assert_rpc_ok(&accounts);
    let accounts = accounts.result().expect("accounts")["accounts"]
        .as_array()
        .cloned()
        .expect("accounts array");
    assert_eq!(accounts.len(), 2);
    let second = accounts
        .iter()
        .find(|account| account["account_index"] == 1)
        .expect("second account");
    assert_eq!(second["derivation_path"], "m/44'/501'/1'/0'");
    assert_eq!(second["label"], "Solana account 2");
    assert_eq!(
        second["address"],
        independent_solana_address(&VALID_MNEMONIC, "", 1)
    );

    let capabilities = rpc(&mut router, "core:capabilities", json!({}));
    assert_rpc_ok(&capabilities);
    assert!(capabilities.result().expect("capabilities")["features"]
        .as_array()
        .expect("features")
        .iter()
        .any(|feature| feature == "wallet_core_sol_v1"));
    let status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&status);
    let solana = wallet_status_network(status.result().expect("status"), "solana");
    assert_eq!(solana["enabled"], true);
    assert_eq!(solana["provider_status"], "ready");
    assert_eq!(solana["capabilities"][0]["id"], "solana_native_transfer");
    assert_eq!(solana["capabilities"][0]["state"], "ready");
}

#[test]
fn wallet_core_solana_rotation_root_uses_anchor_words_as_bip39_seed() {
    let (mut router, _provider, _temp_dir) = create_solana_wallet_router();
    let generated = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode": "multichain", "mnemonic_standard": "rotation", "word_count": 12, "wordlist": "english"}),
    );
    assert_rpc_ok(&generated);
    let words = json_words(&generated.result().expect("generated")["mnemonic"]);
    assert_eq!(words.len(), 12);
    let word_refs: Vec<&str> = words.iter().map(String::as_str).collect();

    let (_wallet_id, account) = solana_hd_create(
        &mut router,
        "rotation",
        json!(words),
        Some("secret passphrase"),
    );
    assert_eq!(account["mnemonic_standard"], "rotation");
    assert_eq!(account["derivation_profile"], "solana_bip44_account");
    assert_eq!(account["derivation_path"], "m/44'/501'/0'/0'");
    assert_eq!(
        account["address"],
        independent_solana_address(&word_refs, "secret passphrase", 0)
    );
}

#[test]
fn wallet_core_solana_import_requires_matching_base58_keypair() {
    let (mut router, _provider, _temp_dir) = create_solana_wallet_router();
    let seed = [3u8; 32];
    let (account_id, address) = solana_import(&mut router, seed);

    let accounts = rpc(&mut router, "wallet:accounts:list", json!({}));
    assert_rpc_ok(&accounts);
    let account = accounts.result().expect("accounts")["accounts"][0].clone();
    assert_eq!(account["kind"], "imported");
    assert_eq!(account["account_id"], account_id);
    assert_eq!(account["network"], "solana");
    assert_eq!(account["curve"], "ed25519");
    assert_eq!(account["address"], address);
    assert_eq!(account["public_key"], address);
    assert!(account.get("wallet_contract").is_none());

    let mut mismatched = ed25519_dalek::SigningKey::from_bytes(&seed).to_keypair_bytes();
    mismatched[63] ^= 0x01;
    let bad_public_half = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Mismatched",
            "network": "solana",
            "curve": "ed25519",
            "private_key": bitcoin::base58::encode(&mismatched),
            "encoding": "base58_keypair"
        }),
    );
    assert_rpc_error(&bad_public_half, "INVALID_INPUT");
    let bad_curve = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Wrong curve",
            "network": "solana",
            "curve": "secp256k1",
            "private_key": solana_keypair_base58(seed),
            "encoding": "base58_keypair"
        }),
    );
    assert_rpc_error(&bad_curve, "INVALID_INPUT");
    let bad_encoding = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Wrong encoding",
            "network": "solana",
            "curve": "ed25519",
            "private_key": solana_keypair_base58(seed),
            "encoding": "base64"
        }),
    );
    assert_rpc_error(&bad_encoding, "INVALID_INPUT");

    // VR-234-011: account-based Solana accounts never allocate addresses.
    let derive = rpc(
        &mut router,
        "wallet:addresses:derive",
        json!({"account_id": account_id, "purpose": "receive"}),
    );
    assert_rpc_error(&derive, "UNSUPPORTED_ACCOUNT_MODEL");
}

#[test]
fn wallet_core_solana_balance_prepare_confirm_and_refresh_sign_system_transfer() {
    let (mut router, provider, _temp_dir) = create_solana_wallet_router();
    let seed = [5u8; 32];
    let (account_id, address) = solana_import(&mut router, seed);
    provider.set_balance(&address, 1_000_000_000);
    let destination = bitcoin::base58::encode(&[11u8; 32]);

    let balance = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id}),
    );
    assert_rpc_ok(&balance);
    let balance = balance.result().expect("balance");
    assert_eq!(balance["network"], "solana");
    assert_eq!(balance["balance"]["spendable"], "1000000000");
    assert_eq!(balance["balance"]["total"], "1000000000");
    assert_eq!(balance["balance"]["pending_in"], "0");
    assert_eq!(balance["balance"]["pending_out"], "0");
    assert_eq!(balance["balance"]["amount_unit"], "lamport");

    let two_outputs = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "solana",
            "outputs": [
                {"address": destination, "amount": "1"},
                {"address": destination, "amount": "1"}
            ],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&two_outputs, "INVALID_INPUT");
    let decimal_amount = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "solana",
            "outputs": [{"address": destination, "amount": "0.5"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&decimal_amount, "INVALID_INPUT");
    let bad_destination = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "solana",
            "outputs": [{"address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", "amount": "1"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert!(!bad_destination.is_ok());
    let too_much = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "solana",
            "outputs": [{"address": destination, "amount": "1000000000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_error(&too_much, "INSUFFICIENT_FUNDS");

    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "solana",
            "outputs": [{"address": destination, "amount": "100000"}],
            "fee_policy": {"tier": "standard"}
        }),
    );
    assert_rpc_ok(&prepared);
    let result = prepared.result().expect("prepared");
    assert_eq!(result["network"], "solana");
    assert_eq!(result["preview"]["amount_unit"], "lamport");
    assert_eq!(result["preview"]["outputs"][0]["address"], destination);
    assert_eq!(result["preview"]["outputs"][0]["amount"], "100000");
    // Base fee 5 000 + ceil(1 000 CU × 2 000 µL (standard = median of the recent fees) / 10^6).
    assert_eq!(result["preview"]["estimated_fee"], "5002");
    assert_eq!(result["preview"]["total_debit"], "105002");
    // FR-234-010: the preparation window is bounded by the blockhash validity estimate
    // ((250 - 100) blocks × 400 ms = 60 s), well inside the generic 5-minute TTL.
    let expires_in_ms =
        result["expires_at"].as_u64().expect("expires_at") - chromvoid_core::wallet::now_ms();
    assert!(
        (50_000..=60_000).contains(&expires_in_ms),
        "expires in {expires_in_ms} ms"
    );
    assert_eq!(
        result["preview"]["warnings"][0]["code"],
        "destination_not_rent_exempt"
    );
    assert_eq!(
        result["preview"]["solana"]["recent_blockhash"],
        bitcoin::base58::encode(&SOLANA_TEST_BLOCKHASH_BYTES)
    );
    assert_eq!(
        result["preview"]["solana"]["last_valid_block_height"],
        SOLANA_TEST_LAST_VALID_BLOCK_HEIGHT
    );
    assert_eq!(
        result["preview"]["solana"]["destination_rent_exempt_minimum"],
        "890880"
    );
    assert!(result["preview"].get("ton").is_none());
    assert!(result["preview"].get("ethereum").is_none());
    let preparation_id = result["preparation_id"]
        .as_str()
        .expect("preparation_id")
        .to_string();

    // VR-234-010: the rent warning must be acknowledged.
    let unacknowledged = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&unacknowledged, "PREPARATION_STALE");

    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": preparation_id,
            "accepted_warnings": ["destination_not_rent_exempt"],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let confirmed = confirmed.result().expect("confirmed");
    assert_eq!(confirmed["status"], "pending");
    assert_eq!(confirmed["network"], "solana");
    let sends = provider.sends();
    assert_eq!(sends.len(), 1);
    let transaction = solana_decode_base64(&sends[0]);
    assert_eq!(transaction[0], 1, "exactly one signature");
    let signature = &transaction[1..65];
    assert_eq!(confirmed["tx_hash"], bitcoin::base58::encode(signature));
    let message = &transaction[65..];
    assert!(transaction.len() <= 1_232, "fits one packet");
    assert_eq!(
        &message[..3],
        &[1, 0, 2],
        "header: 1 signer, 0 ro signed, 2 ro unsigned programs"
    );
    assert_eq!(message[3], 4, "four account keys");
    assert_eq!(
        bitcoin::base58::encode(&message[4..36]),
        address,
        "fee payer first"
    );
    assert_eq!(&message[36..68], &[11u8; 32], "destination second");
    assert_eq!(
        bitcoin::base58::encode(&message[68..100]),
        "11111111111111111111111111111111",
        "System Program third"
    );
    assert_eq!(
        bitcoin::base58::encode(&message[100..132]),
        "ComputeBudget111111111111111111111111111111",
        "Compute Budget program last"
    );
    assert_eq!(&message[132..164], &SOLANA_TEST_BLOCKHASH_BYTES);
    assert_eq!(message[164], 3, "three instructions");
    // SetComputeUnitLimit(1_000) and SetComputeUnitPrice(2_000 µL) come before the transfer.
    assert_eq!(&message[165..173], &[3, 0, 5, 2, 0xe8, 0x03, 0, 0]);
    assert_eq!(
        &message[173..185],
        &[3, 0, 9, 3, 0xd0, 0x07, 0, 0, 0, 0, 0, 0]
    );
    assert_eq!(message[185], 2, "System Program index");
    assert_eq!(
        &message[186..189],
        &[2, 0, 1],
        "two account indexes: payer, destination"
    );
    assert_eq!(message[189], 12, "instruction data length");
    let data = &message[190..];
    assert_eq!(data.len(), 12);
    assert_eq!(u32::from_le_bytes(data[..4].try_into().expect("u32")), 2);
    assert_eq!(
        u64::from_le_bytes(data[4..].try_into().expect("u64")),
        100_000
    );
    ed25519_dalek::SigningKey::from_bytes(&seed)
        .verifying_key()
        .verify_strict(
            message,
            &ed25519_dalek::Signature::from_bytes(signature.try_into().expect("64 bytes")),
        )
        .expect("fee payer signature verifies over the message");

    let tx = first_wallet_transaction(&mut router);
    assert_eq!(tx["network"], "solana");
    assert_eq!(tx["amount_unit"], "lamport");
    assert_eq!(tx["amount"], "100000");
    assert_eq!(tx["fee"], "5002");
    assert_eq!(tx["status"], "pending");
    assert_eq!(tx["tx_hash"], confirmed["tx_hash"]);

    // A signature the provider does not see yet is not terminal while the blockhash is valid.
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(refreshed.result().expect("refreshed")["status"], "pending");

    // `confirmed` commitment is not finality (FR-234-016).
    provider.set_status(Some(SolanaSignatureStatus {
        finalized: false,
        failed: false,
        slot: Some(48),
    }));
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(refreshed.result().expect("refreshed")["status"], "pending");

    // A finalized status alone is not enough: `getTransaction` must know the signature too.
    provider.set_status(Some(SolanaSignatureStatus {
        finalized: true,
        failed: false,
        slot: Some(50),
    }));
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(
        refreshed.result().expect("refreshed")["status"],
        "pending",
        "one source confirmed, the other missing"
    );
    let details = |slot: u64, failed: bool| SolanaTransactionDetails {
        slot: Some(slot),
        block_time: Some(1_710_000_000),
        fee: 5_002,
        failed,
        account_keys: vec![address.clone(), destination.clone()],
        pre_balances: vec![1_000_000_000, 0],
        post_balances: vec![999_894_998, 100_000],
    };
    // The lookup knows the signature but in another slot: still pending.
    provider.set_transaction(
        tx["tx_hash"].as_str().expect("signature"),
        details(51, false),
    );
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(refreshed.result().expect("refreshed")["status"], "pending");
    provider.set_transaction(
        tx["tx_hash"].as_str().expect("signature"),
        details(50, false),
    );
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    let refreshed = refreshed.result().expect("refreshed");
    assert_eq!(refreshed["status"], "confirmed");
    assert_eq!(refreshed["tx_hash"], confirmed["tx_hash"]);
    assert_eq!(provider.sends().len(), 1, "refresh never re-submits");
}

#[test]
fn solana_restore_discovers_used_accounts_with_a_gap_of_one() {
    let (mut router, provider, _temp_dir) = create_solana_wallet_router();
    let addresses = (0..4)
        .map(|index| independent_solana_address(&VALID_MNEMONIC, "", index))
        .collect::<Vec<_>>();
    // Index 0 holds lamports, index 1 is empty but has history, index 2 is untouched and index
    // 3 is used again: the gap of one stops discovery at index 2.
    provider.set_balance(&addresses[0], 1_000_000);
    provider.set_history(
        &addresses[1],
        vec![SolanaSignatureInfo {
            signature: "sol-old".to_string(),
            slot: Some(10),
            block_time: None,
            failed: false,
            finalized: true,
        }],
        Vec::new(),
    );
    provider.set_balance(&addresses[3], 7);

    let (wallet_id, account) = solana_hd_create(&mut router, "bip39", valid_mnemonic_json(), None);
    assert_eq!(account["address"], addresses[0]);
    assert!(provider.calls().is_empty(), "restore is offline");
    assert_eq!(
        wallet_summary(&mut router, &wallet_id)["account_discovery_pending"],
        json!(["solana"])
    );
    let account_id = account["account_id"].as_str().expect("account_id");

    let discovered = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id, "discover_addresses": true}),
    );
    assert_rpc_ok(&discovered);
    assert_eq!(
        discovered.result().expect("balance")["balance"]["spendable"],
        "1000000"
    );
    // Index 0: balance is enough (1 call); index 1: empty balance, then one signature (2 calls);
    // index 2: empty balance, no signatures (2 calls) and the scan stops; then the balance read.
    assert_eq!(
        provider.calls(),
        vec![
            ("balance", addresses[0].clone()),
            ("balance", addresses[1].clone()),
            ("signatures", addresses[1].clone()),
            ("balance", addresses[2].clone()),
            ("signatures", addresses[2].clone()),
            ("balance", addresses[0].clone()),
        ]
    );
    let accounts = wallet_accounts_by_index(&mut router, &wallet_id, "solana");
    assert_eq!(
        accounts.len(),
        2,
        "index 3 sits behind the gap and is not materialized"
    );
    assert_eq!(accounts[1]["account_index"], 1);
    assert_eq!(accounts[1]["address"], addresses[1]);
    assert_eq!(accounts[1]["derivation_path"], "m/44'/501'/1'/0'");
    assert_eq!(accounts[1]["label"], "Solana account 2");
    assert!(wallet_summary(&mut router, &wallet_id)
        .get("account_discovery_pending")
        .is_none());

    // Discovery is idempotent and the explicit derive continues after it.
    let again = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account_id, "discover_addresses": true}),
    );
    assert_rpc_ok(&again);
    assert_eq!(provider.calls().len(), 12);
    assert_eq!(
        wallet_accounts_by_index(&mut router, &wallet_id, "solana").len(),
        2
    );
    let derived = rpc(
        &mut router,
        "wallet:accounts:derive",
        json!({"wallet_id": wallet_id, "network": "solana"}),
    );
    assert_rpc_ok(&derived);
    let accounts = wallet_accounts_by_index(&mut router, &wallet_id, "solana");
    assert_eq!(accounts[2]["account_index"], 2);
    assert_eq!(accounts[2]["address"], addresses[2]);
}

#[test]
fn solana_restore_discovery_fails_closed_without_provider() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(solana_wallet_config())
        .with_wallet_chain_profile(Arc::new(SolanaChainProfile::unavailable()));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let (wallet_id, account) = solana_hd_create(&mut router, "bip39", valid_mnemonic_json(), None);

    let failed = rpc(
        &mut router,
        "wallet:balance:get",
        json!({"account_id": account["account_id"], "discover_addresses": true}),
    );
    assert_rpc_error(&failed, "PROVIDER_UNAVAILABLE");
    // FR-234-004a: the wallet exists with index 0 and discovery stays due for later.
    assert_eq!(
        wallet_accounts_by_index(&mut router, &wallet_id, "solana").len(),
        1
    );
    assert_eq!(
        wallet_summary(&mut router, &wallet_id)["account_discovery_pending"],
        json!(["solana"])
    );
}

#[test]
fn solana_fee_tiers_map_to_compute_unit_prices() {
    let (mut router, provider, _temp_dir) = create_solana_wallet_router();
    let (account_id, address) = solana_import(&mut router, [14u8; 32]);
    provider.set_balance(&address, 1_000_000_000);
    provider.set_prioritization_fees(vec![100_000, 0, 250_000, 900_000, 20_000, 60_000_000]);
    let destination = bitcoin::base58::encode(&[15u8; 32]);
    let quote = |router: &mut RpcRouter, tier: &str| {
        let prepared = rpc(
            router,
            "wallet:transaction:prepare",
            json!({
                "account_id": account_id,
                "network": "solana",
                "outputs": [{"address": destination, "amount": "1000000"}],
                "fee_policy": {"tier": tier}
            }),
        );
        assert_rpc_ok(&prepared);
        let prepared = prepared.result().expect("prepared").clone();
        let cancelled = rpc(
            router,
            "wallet:transaction:cancel",
            json!({"preparation_id": prepared["preparation_id"]}),
        );
        assert_rpc_ok(&cancelled);
        prepared["preview"]["estimated_fee"]
            .as_str()
            .expect("fee")
            .to_string()
    };
    // Sorted sample: 0, 20 000, 100 000, 250 000, 900 000, 60 000 000 µL/CU.
    // slow = p25 = 20 000 → 20 lamports; standard = p50 = 100 000 → 100; fast = p75 =
    // 250 000 → 250 (all above their floors, below the cap).
    assert_eq!(quote(&mut router, "slow"), "5020");
    assert_eq!(quote(&mut router, "standard"), "5100");
    assert_eq!(quote(&mut router, "fast"), "5250");
    // A quiet network still pays the tier floors: 0 / 1 000 / 10 000 µL per CU.
    provider.set_prioritization_fees(Vec::new());
    assert_eq!(quote(&mut router, "slow"), "5000");
    assert_eq!(quote(&mut router, "standard"), "5001");
    assert_eq!(quote(&mut router, "fast"), "5010");
    // The cap bounds what a hostile provider can charge: 10 000 000 µL × 1 000 CU = 10 000.
    provider.set_prioritization_fees(vec![u64::MAX; 8]);
    assert_eq!(quote(&mut router, "fast"), "15000");
}

#[test]
fn wallet_core_solana_confirm_rejects_expired_blockhash_as_stale() {
    let (mut router, provider, _temp_dir) = create_solana_wallet_router();
    let (account_id, address) = solana_import(&mut router, [6u8; 32]);
    provider.set_balance(&address, 1_000_000_000);
    let prepared = rpc(
        &mut router,
        "wallet:transaction:prepare",
        json!({
            "account_id": account_id,
            "network": "solana",
            "outputs": [{"address": bitcoin::base58::encode(&[12u8; 32]), "amount": "1000000"}],
            "fee_policy": {"tier": "fast"}
        }),
    );
    assert_rpc_ok(&prepared);
    assert!(prepared.result().expect("prepared")["preview"]["warnings"]
        .as_array()
        .is_some_and(Vec::is_empty));
    provider.set_block_height(SOLANA_TEST_LAST_VALID_BLOCK_HEIGHT + 1);
    let stale = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().expect("prepared")["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_error(&stale, "PREPARATION_STALE");
    assert!(
        provider.sends().is_empty(),
        "nothing is broadcast for a stale blockhash"
    );
}

#[test]
fn wallet_core_solana_unknown_submit_persists_broadcast_unknown_until_blockhash_expires() {
    let (mut router, provider, _temp_dir) = create_solana_wallet_router();
    let (account_id, address) = solana_import(&mut router, [8u8; 32]);
    provider.set_balance(&address, 1_000_000_000);
    let destination = bitcoin::base58::encode(&[13u8; 32]);
    let prepare = |router: &mut RpcRouter| {
        rpc(
            router,
            "wallet:transaction:prepare",
            json!({
                "account_id": account_id,
                "network": "solana",
                "outputs": [{"address": destination, "amount": "1000000"}],
                "fee_policy": {"tier": "standard"}
            }),
        )
    };
    let prepared = prepare(&mut router);
    assert_rpc_ok(&prepared);
    provider.set_send_error(Some(SolanaProviderError::unknown(
        "socket closed mid-flight",
    )));
    let confirmed = rpc(
        &mut router,
        "wallet:transaction:confirm",
        json!({
            "preparation_id": prepared.result().expect("prepared")["preparation_id"],
            "accepted_warnings": [],
            "master_password": MASTER_PASSWORD
        }),
    );
    assert_rpc_ok(&confirmed);
    let confirmed = confirmed.result().expect("confirmed");
    assert_eq!(confirmed["status"], "broadcast_unknown");
    let sends = provider.sends();
    assert_eq!(sends.len(), 1);
    // FR-234-012: the reference is the locally computed signature even though broadcast is unknown.
    let transaction = solana_decode_base64(&sends[0]);
    assert_eq!(
        confirmed["tx_hash"],
        bitcoin::base58::encode(&transaction[1..65])
    );
    let tx = first_wallet_transaction(&mut router);
    assert_eq!(tx["status"], "broadcast_unknown");

    // FR-234-013: no blind independent prepare while the outcome is unresolved.
    assert_rpc_error(&prepare(&mut router), "BROADCAST_UNKNOWN");

    // FR-234-014: a single missing signature is not terminal while the blockhash is still valid.
    provider.set_send_error(None);
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(
        refreshed.result().expect("refreshed")["status"],
        "broadcast_unknown"
    );
    assert_eq!(provider.sends().len(), 1, "refresh never re-submits");

    // Once the network can no longer accept the blockhash the send has provably failed.
    provider.set_block_height(SOLANA_TEST_LAST_VALID_BLOCK_HEIGHT + 1);
    let refreshed = rpc(
        &mut router,
        "wallet:transactions:refresh",
        json!({"tx_ref": tx["tx_ref"]}),
    );
    assert_rpc_ok(&refreshed);
    assert_eq!(refreshed.result().expect("refreshed")["status"], "failed");
    assert_rpc_ok(&prepare(&mut router));
}

#[test]
fn wallet_core_solana_is_disabled_without_manifest_capability() {
    let (router, temp_dir) = create_test_router();
    let mut router = router
        .with_wallet_runtime_config(wallet_config_enabled())
        .with_wallet_chain_profile(Arc::new(SolanaChainProfile::new(Arc::new(
            MockSolanaProvider::new(),
        ))));
    setup_master(&mut router);
    unlock_vault(&mut router, "pw");
    let _keep = &temp_dir;

    let status = rpc(&mut router, "wallet:status", json!({}));
    assert_rpc_ok(&status);
    let solana = wallet_status_network(status.result().expect("status"), "solana");
    assert_eq!(solana["enabled"], false);
    assert_eq!(solana["broadcast_enabled"], false);
    assert_eq!(solana["capabilities"][0]["id"], "solana_native_transfer");
    assert_eq!(solana["capabilities"][0]["state"], "disabled");
    let capabilities = rpc(&mut router, "core:capabilities", json!({}));
    assert_rpc_ok(&capabilities);
    assert!(!capabilities.result().expect("capabilities")["features"]
        .as_array()
        .expect("features")
        .iter()
        .any(|feature| feature == "wallet_core_sol_v1"));

    // VR-234-001: no materialization without the build-time capability.
    let create = rpc(
        &mut router,
        "wallet:hd:create",
        json!({
            "label": "Solana wallet",
            "wallet_mode": "multichain",
            "mnemonic": valid_mnemonic_json(),
            "wordlist": "english",
            "mnemonic_standard": "bip39",
            "supported_networks": ["solana"]
        }),
    );
    assert_rpc_error(&create, "UNSUPPORTED_CHAIN");
    let import = rpc(
        &mut router,
        "wallet:import:create",
        json!({
            "label": "Imported Solana",
            "network": "solana",
            "curve": "ed25519",
            "private_key": solana_keypair_base58([9u8; 32]),
            "encoding": "base58_keypair"
        }),
    );
    assert_rpc_error(&import, "UNSUPPORTED_CHAIN");
}
