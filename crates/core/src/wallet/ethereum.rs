use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::str::FromStr;
use std::sync::Arc;

use bitcoin::bip32::{DerivationPath, Xpriv};
use bitcoin::secp256k1::{Message, PublicKey, Secp256k1, SecretKey};
use bitcoin::Network;
use serde::{Deserialize, Serialize};
use serde_json::json;
use zeroize::Zeroizing;

use crate::rpc::types::{
    DerivedAccountMetaV1, EthereumTransactionPreviewV1, ImportedAccountMetaV1, WalletAccountMeta,
    WalletBalance, WalletConfirmStatus, WalletFeeTier, WalletNetwork, WalletPreview,
    WalletProviderStatus, WalletTransactionOutput,
};

use super::{
    hex_string, parse_hex, AccountScheme, TonSigningState, WalletAddressDeriveInput,
    WalletAddressDeriveOutput, WalletBalanceInput, WalletBalanceOutput, WalletBalanceTask,
    WalletChainError, WalletChainProfile, WalletHdAccountMaterializeInput, WalletHistoryInput,
    WalletHistoryOutput, WalletHistoryTask, WalletHistoryTransaction,
    WalletImportedAccountMaterializeInput, WalletPrepareInput, WalletPrepareOutput,
    WalletProfileAccountMaterialization, WalletProviderObservationOutcomeV1,
    WalletProviderObservationV1, WalletRefreshInput, WalletRefreshOutput, WalletRoot,
    WalletRuntimeConfig, WalletSignInput, WalletSignedArtifact, WalletSubmitInput,
    WalletSubmitOutput, WalletTxStatus,
};
use crate::rpc::types::WalletTransactionDirection;

pub const ETHEREUM_NETWORK: &str = "ethereum";
pub const ETHEREUM_AMOUNT_UNIT: &str = "wei";
pub const ETHEREUM_DERIVATION_PROFILE: &str = "ethereum_eip44_account";
pub const ETHEREUM_NATIVE_TRANSFER_CAPABILITY: &str = "ethereum_native_transfer";
/// Most transactions one `wallet:transactions:sync` asks the indexer for (one page).
pub const ETHEREUM_HISTORY_PAGE_LIMIT: u32 = 25;
/// Most derived accounts (`m/44'/60'/0'/0/<i>`, `i < cap`) restore discovery materializes.
pub const ETHEREUM_ACCOUNT_DISCOVERY_CAP: u32 = 20;
/// Canonical-block depth that stands in for the `finalized` checkpoint when the node does not
/// serve it (SPEC-233 FR-233-019).
pub const ETHEREUM_FALLBACK_FINALITY_DEPTH: u64 = 64;
/// Reconciliation sources: the receipt is primary, the transaction lookup cross-checks it.
pub const ETHEREUM_RECEIPT_SOURCE_ID: &str = "ethereum:receipt";
pub const ETHEREUM_TRANSACTION_SOURCE_ID: &str = "ethereum:transaction";
const ETHEREUM_CHAIN_ID: u64 = 1;
const ETHEREUM_GAS_LIMIT: u64 = 21_000;
const ETHEREUM_PREPARED_KIND: &str = "ethereum_native_transfer_v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EthereumAccountSnapshot {
    pub balance: String,
    pub pending_nonce: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EthereumFeeEstimate {
    pub max_fee_per_gas: String,
    pub max_priority_fee_per_gas: String,
    pub base_fee_per_gas: String,
}

/// `eth_getTransactionReceipt`: the mined outcome of a transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EthereumTransactionReceipt {
    pub block_number: u64,
    /// Receipt `status == 0x0` (reverted).
    pub failed: bool,
}

/// `eth_getTransactionByHash`: whether the node knows the transaction and where it sits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EthereumTransactionLookup {
    /// `None` while the transaction waits in the mempool.
    pub block_number: Option<u64>,
}

/// Chain head used for confirmation depth.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EthereumChainHead {
    /// `eth_blockNumber`.
    pub latest_block_number: u64,
    /// `eth_getBlockByNumber("finalized")`; `None` when the node does not serve the tag, in
    /// which case [`ETHEREUM_FALLBACK_FINALITY_DEPTH`] canonical blocks stand in for it.
    pub finalized_block_number: Option<u64>,
}

/// One transaction from an address-history indexer. Quantities are decimal wei strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EthereumAddressTransaction {
    pub hash: String,
    pub from: String,
    /// `None` for contract creations.
    pub to: Option<String>,
    pub value: String,
    /// `gas_used × effective gas price`; `"0"` while pending.
    pub fee: String,
    pub block_number: Option<u64>,
    /// Block timestamp in milliseconds; `None` while pending.
    pub timestamp: Option<u64>,
    pub failed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EthereumProviderErrorKind {
    Unavailable,
    Rejected,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct EthereumProviderError {
    pub kind: EthereumProviderErrorKind,
    pub message: String,
}

impl EthereumProviderError {
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            kind: EthereumProviderErrorKind::Unavailable,
            message: message.into(),
        }
    }

    pub fn rejected(message: impl Into<String>) -> Self {
        Self {
            kind: EthereumProviderErrorKind::Rejected,
            message: message.into(),
        }
    }
}

pub trait EthereumProvider: Send + Sync {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }
    fn chain_id(&self) -> Result<u64, EthereumProviderError>;
    fn account_snapshot(
        &self,
        address: &str,
    ) -> Result<EthereumAccountSnapshot, EthereumProviderError>;
    fn code_at(&self, address: &str) -> Result<Vec<u8>, EthereumProviderError>;
    fn fee_estimate(
        &self,
        tier: WalletFeeTier,
    ) -> Result<EthereumFeeEstimate, EthereumProviderError>;
    fn broadcast_raw_transaction(&self, raw_tx: &str) -> Result<String, EthereumProviderError>;
    /// `eth_getTransactionReceipt`; `None` until the transaction is mined.
    fn transaction_receipt(
        &self,
        tx_hash: &str,
    ) -> Result<Option<EthereumTransactionReceipt>, EthereumProviderError>;
    /// `eth_getTransactionByHash`; `None` when the node does not know the transaction.
    fn transaction_by_hash(
        &self,
        tx_hash: &str,
    ) -> Result<Option<EthereumTransactionLookup>, EthereumProviderError>;
    /// `eth_blockNumber` plus the `finalized` checkpoint when the node serves it.
    fn chain_head(&self) -> Result<EthereumChainHead, EthereumProviderError>;
    /// Newest-first native transactions touching `address` (sent or received), at most `limit`.
    /// Plain JSON-RPC has no such query; providers without an indexer report `Unavailable`.
    fn address_transactions(
        &self,
        _address: &str,
        _limit: u32,
    ) -> Result<Vec<EthereumAddressTransaction>, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum transaction history unavailable",
        ))
    }
}

pub struct UnavailableEthereumProvider;

impl EthereumProvider for UnavailableEthereumProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Unavailable
    }

    fn chain_id(&self) -> Result<u64, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn account_snapshot(
        &self,
        _address: &str,
    ) -> Result<EthereumAccountSnapshot, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn code_at(&self, _address: &str) -> Result<Vec<u8>, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn fee_estimate(
        &self,
        _tier: WalletFeeTier,
    ) -> Result<EthereumFeeEstimate, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn broadcast_raw_transaction(&self, _raw_tx: &str) -> Result<String, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn transaction_receipt(
        &self,
        _tx_hash: &str,
    ) -> Result<Option<EthereumTransactionReceipt>, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn transaction_by_hash(
        &self,
        _tx_hash: &str,
    ) -> Result<Option<EthereumTransactionLookup>, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn chain_head(&self) -> Result<EthereumChainHead, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }

    fn address_transactions(
        &self,
        _address: &str,
        _limit: u32,
    ) -> Result<Vec<EthereumAddressTransaction>, EthereumProviderError> {
        Err(EthereumProviderError::unavailable(
            "Ethereum provider unavailable",
        ))
    }
}

#[derive(Clone)]
pub struct EthereumChainProfile {
    provider: Arc<dyn EthereumProvider>,
}

impl EthereumChainProfile {
    pub fn new(provider: Arc<dyn EthereumProvider>) -> Self {
        Self { provider }
    }

    pub fn unavailable() -> Self {
        Self::new(Arc::new(UnavailableEthereumProvider))
    }

    /// The live balance of the account plus, on request, restore discovery of the wallet's
    /// used derived accounts. Keys are derived here, on the router thread, so the task only
    /// carries public addresses to the network.
    fn create_balance_task(
        &self,
        mut input: WalletBalanceInput,
    ) -> Result<WalletBalanceTask, WalletChainError> {
        ensure_network(input.account.network())?;
        if self.provider.provider_status() != WalletProviderStatus::Ready {
            return Err(WalletChainError::provider_unavailable());
        }
        let address = account_address(&input.account)?.to_string();
        let discovery = input
            .discover_addresses
            .then(|| AccountDiscoveryPlan::for_wallet(&input))
            .transpose()?;
        input.secret = None;
        input.wallet_accounts.clear();
        let provider = self.provider.clone();
        Ok(Box::new(move || {
            let materializations = match discovery {
                Some(plan) => discover_accounts(provider.as_ref(), plan)?,
                None => Vec::new(),
            };
            let snapshot = provider
                .account_snapshot(&address)
                .map_err(provider_error)?;
            let balance = U256::parse(&snapshot.balance)?.to_decimal();
            Ok(WalletBalanceOutput {
                balance: WalletBalance {
                    spendable: balance.clone(),
                    pending_in: "0".to_string(),
                    pending_out: "0".to_string(),
                    total: balance,
                    amount_unit: ETHEREUM_AMOUNT_UNIT.to_string(),
                },
                materializations,
            })
        }))
    }
}

impl WalletChainProfile for EthereumChainProfile {
    fn network(&self) -> &str {
        ETHEREUM_NETWORK
    }

    fn amount_unit(&self) -> &str {
        ETHEREUM_AMOUNT_UNIT
    }

    fn normalize_address(&self, address: &str) -> Result<String, WalletChainError> {
        normalize_address(address)
    }

    fn capability_ids(&self) -> Vec<&'static str> {
        vec![
            ETHEREUM_NATIVE_TRANSFER_CAPABILITY,
            super::evm::EVM_CLEAR_SIGNING_CAPABILITY,
        ]
    }

    fn capability_implemented(&self, capability_id: &str) -> bool {
        capability_id != super::evm::EVM_CLEAR_SIGNING_CAPABILITY
    }

    fn provider_status(&self) -> WalletProviderStatus {
        self.provider.provider_status()
    }

    fn is_enabled(&self, config: &WalletRuntimeConfig) -> bool {
        config.wallet_enabled && config.capability_enabled(ETHEREUM_NATIVE_TRANSFER_CAPABILITY)
    }

    fn supports_restore_discovery(&self) -> bool {
        true
    }

    fn materialize_hd_account(
        &self,
        input: WalletHdAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        ensure_hd_input(&input)?;
        materialize_hd_account(&input)
    }

    fn materialize_imported_account(
        &self,
        input: WalletImportedAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        ensure_network(&input.network)?;
        if input.curve != "secp256k1" || input.encoding != "hex" {
            return Err(WalletChainError::invalid_input(
                "Ethereum imported account requires curve=secp256k1 and encoding=hex",
            ));
        }
        let secret = parse_secret_key(&input.private_key)?;
        let (address, public_key) = address_from_secret(&secret);
        Ok(WalletProfileAccountMaterialization {
            account: WalletAccountMeta::Imported(ImportedAccountMetaV1 {
                account_id: input.account_id,
                wallet_id: input.wallet_id,
                network: input.network,
                label: Some(input.label),
                address: address.clone(),
                public_key: Some(public_key),
                curve: Some("secp256k1".to_string()),
                wallet_contract: None,
                workchain: None,
                raw_account: Some(address),
                created_at: input.now,
                updated_at: input.now,
            }),
            addresses: Vec::new(),
        })
    }

    fn derive_address(
        &self,
        _input: WalletAddressDeriveInput,
    ) -> Result<WalletAddressDeriveOutput, WalletChainError> {
        Err(WalletChainError::unsupported_account_model(
            "Ethereum account-based profiles do not allocate addresses",
        ))
    }

    fn balance(&self, input: WalletBalanceInput) -> Result<WalletBalanceOutput, WalletChainError> {
        self.create_balance_task(input)?()
    }

    fn split_balance_task(
        &self,
        input: WalletBalanceInput,
    ) -> Result<Option<WalletBalanceTask>, WalletChainError> {
        self.create_balance_task(input).map(Some)
    }

    fn split_history_task(
        &self,
        input: WalletHistoryInput,
    ) -> Result<Option<WalletHistoryTask>, WalletChainError> {
        ensure_network(input.account.network())?;
        if self.provider.provider_status() != WalletProviderStatus::Ready {
            return Err(WalletChainError::provider_unavailable());
        }
        let address = normalize_address(account_address(&input.account)?)?;
        let limit = input.limit.clamp(1, ETHEREUM_HISTORY_PAGE_LIMIT);
        let provider = self.provider.clone();
        Ok(Some(Box::new(move || {
            let transactions = provider
                .address_transactions(&address, limit)
                .map_err(provider_error)?
                .into_iter()
                .take(limit as usize)
                .map(|transaction| history_transaction(&address, transaction, input.now))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(WalletHistoryOutput { transactions })
        })))
    }

    fn prepare(&self, input: WalletPrepareInput) -> Result<WalletPrepareOutput, WalletChainError> {
        if input.outputs.len() != 1 {
            return Err(WalletChainError::invalid_input(
                "Ethereum v1 requires exactly one output",
            ));
        }
        if input.maximize_output_index.is_some_and(|index| index != 0) {
            return Err(WalletChainError::invalid_input(
                "max output index is out of range",
            ));
        }
        let output = &input.outputs[0];
        if output.comment.is_some() {
            return Err(WalletChainError::invalid_input(
                "Ethereum native transfer does not accept comment",
            ));
        }
        let from = account_address(&input.account)?.to_string();
        let to = normalize_address(&output.address)?;
        let requested_value = input
            .maximize_output_index
            .is_none()
            .then(|| U256::parse(&output.amount))
            .transpose()?;
        if !self
            .provider
            .code_at(&to)
            .map_err(provider_error)?
            .is_empty()
        {
            return Err(WalletChainError::unsupported_provider_surface(
                "Ethereum native transfer v1 does not send to contract code",
            ));
        }
        let chain_id = self.provider.chain_id().map_err(provider_error)?;
        if chain_id != ETHEREUM_CHAIN_ID {
            return Err(WalletChainError::unsupported_chain(
                "Ethereum provider chain id must be 1",
            ));
        }
        let snapshot = self
            .provider
            .account_snapshot(&from)
            .map_err(provider_error)?;
        let fee = self
            .provider
            .fee_estimate(input.fee_tier.clone())
            .map_err(provider_error)?;
        let max_fee_per_gas = U256::parse(&fee.max_fee_per_gas)?;
        let max_priority_fee_per_gas = U256::parse(&fee.max_priority_fee_per_gas)?;
        let base_fee_per_gas = U256::parse(&fee.base_fee_per_gas)?;
        if max_fee_per_gas.cmp(&base_fee_per_gas) == Ordering::Less
            || max_priority_fee_per_gas.cmp(&max_fee_per_gas) == Ordering::Greater
        {
            return Err(WalletChainError::provider_unavailable());
        }
        let max_fee = max_fee_per_gas.checked_mul_u64(ETHEREUM_GAS_LIMIT)?;
        let balance = U256::parse(&snapshot.balance)?;
        let value = if input.maximize_output_index.is_some() {
            balance
                .checked_sub(max_fee)
                .ok_or_else(WalletChainError::insufficient_funds)?
        } else {
            requested_value.expect("non-max Ethereum value")
        };
        if !value.is_nonzero() {
            return Err(if input.maximize_output_index.is_some() {
                WalletChainError::insufficient_funds()
            } else {
                WalletChainError::invalid_input(
                    "Ethereum transfer amount must be greater than zero",
                )
            });
        }
        let total = value.checked_add(max_fee)?;
        if balance.cmp(&total) == Ordering::Less {
            return Err(WalletChainError::insufficient_funds());
        }
        let payload = EthereumPreparedPayloadV1 {
            kind: ETHEREUM_PREPARED_KIND.to_string(),
            account_id: input.account.account_id().to_string(),
            from: from.clone(),
            to: to.clone(),
            value: value.to_decimal(),
            nonce: snapshot.pending_nonce,
            chain_id,
            gas_limit: ETHEREUM_GAS_LIMIT,
            fee_tier: input.fee_tier,
            max_fee_per_gas: max_fee_per_gas.to_decimal(),
            max_priority_fee_per_gas: max_priority_fee_per_gas.to_decimal(),
            base_fee_per_gas: base_fee_per_gas.to_decimal(),
        };
        Ok(WalletPrepareOutput {
            preview: WalletPreview {
                amount_unit: ETHEREUM_AMOUNT_UNIT.to_string(),
                outputs: vec![WalletTransactionOutput {
                    address: to,
                    amount: payload.value.clone(),
                    comment: None,
                }],
                estimated_fee: max_fee.to_decimal(),
                total_debit: total.to_decimal(),
                warnings: Vec::new(),
                ton: None,
                ethereum: Some(EthereumTransactionPreviewV1 {
                    nonce: payload.nonce,
                    chain_id,
                    gas_limit: ETHEREUM_GAS_LIMIT,
                    max_fee_per_gas: payload.max_fee_per_gas.clone(),
                    max_priority_fee_per_gas: payload.max_priority_fee_per_gas.clone(),
                }),
                solana: None,
            },
            provider_snapshot: Some(json!({
                "balance": snapshot.balance,
                "pending_nonce": snapshot.pending_nonce,
                "base_fee_per_gas": payload.base_fee_per_gas,
            })),
            canonical_payload: serde_json::to_string(&payload).map_err(|error| {
                WalletChainError::internal(format!(
                    "Ethereum payload serialization failed: {error}"
                ))
            })?,
            materializations: Vec::new(),
            valid_until: None,
        })
    }

    fn sign_prepared(
        &self,
        input: WalletSignInput,
    ) -> Result<WalletSignedArtifact, WalletChainError> {
        let payload: EthereumPreparedPayloadV1 = serde_json::from_str(&input.canonical_payload)
            .map_err(|error| {
                WalletChainError::preparation_stale(format!(
                    "Ethereum preparation payload is invalid: {error}"
                ))
            })?;
        if payload.kind != ETHEREUM_PREPARED_KIND
            || payload.account_id != input.account.account_id()
            || payload.from != account_address(&input.account)?
            || payload.chain_id != ETHEREUM_CHAIN_ID
            || payload.gas_limit != ETHEREUM_GAS_LIMIT
        {
            return Err(WalletChainError::preparation_stale(
                "Ethereum preparation/account contract mismatch",
            ));
        }
        if self.provider.chain_id().map_err(provider_error)? != payload.chain_id
            || !self
                .provider
                .code_at(&payload.to)
                .map_err(provider_error)?
                .is_empty()
        {
            return Err(WalletChainError::preparation_stale(
                "Ethereum chain or recipient code changed",
            ));
        }
        let snapshot = self
            .provider
            .account_snapshot(&payload.from)
            .map_err(provider_error)?;
        if snapshot.pending_nonce != payload.nonce {
            return Err(WalletChainError::preparation_stale(
                "Ethereum pending nonce changed",
            ));
        }
        let current_fee = self
            .provider
            .fee_estimate(payload.fee_tier.clone())
            .map_err(provider_error)?;
        if U256::parse(&payload.max_fee_per_gas)?.cmp(&U256::parse(&current_fee.base_fee_per_gas)?)
            == Ordering::Less
        {
            return Err(WalletChainError::preparation_stale(
                "Ethereum max fee is below current base fee",
            ));
        }
        let total = U256::parse(&payload.value)?.checked_add(
            U256::parse(&payload.max_fee_per_gas)?.checked_mul_u64(payload.gas_limit)?,
        )?;
        if U256::parse(&snapshot.balance)?.cmp(&total) == Ordering::Less {
            return Err(WalletChainError::insufficient_funds());
        }
        let secret = secret_for_account(&input.account, &input.signing_secret)?;
        let (derived_address, _) = address_from_secret(&secret);
        if derived_address != payload.from {
            return Err(WalletChainError::internal(
                "Ethereum signing material does not match account",
            ));
        }
        let (raw, tx_hash) = sign_eip1559(&payload, &secret)?;
        Ok(WalletSignedArtifact {
            signed_artifact: Zeroizing::new(raw),
            tx_hash: Some(tx_hash),
            message_ref: None,
            submit_metadata: None,
        })
    }

    fn submit_signed(
        &self,
        input: WalletSubmitInput,
    ) -> Result<WalletSubmitOutput, WalletChainError> {
        let expected_hash = input
            .signed_artifact
            .tx_hash
            .clone()
            .ok_or_else(|| WalletChainError::internal("Ethereum artifact missing tx hash"))?;
        match self
            .provider
            .broadcast_raw_transaction(&input.signed_artifact.signed_artifact)
        {
            Ok(provider_hash) if normalize_hash(&provider_hash)? == expected_hash => {
                Ok(WalletSubmitOutput {
                    status: WalletConfirmStatus::Pending,
                    tx_hash: Some(expected_hash),
                    message_ref: None,
                })
            }
            Ok(_) => Err(WalletChainError::broadcast_unknown(
                "Ethereum provider returned a mismatched transaction hash",
            )),
            Err(error) if error.kind == EthereumProviderErrorKind::Unknown => {
                Ok(WalletSubmitOutput {
                    status: WalletConfirmStatus::BroadcastUnknown,
                    tx_hash: Some(expected_hash),
                    message_ref: None,
                })
            }
            Err(error) => Err(provider_error(error)),
        }
    }

    /// Reconciliation with two provider sources (SPEC-233 FR-233-019): the receipt decides the
    /// outcome, `eth_getTransactionByHash` must place the transaction in the same block, and
    /// the chain head must have finalized that block (or buried it under
    /// [`ETHEREUM_FALLBACK_FINALITY_DEPTH`] canonical blocks) before it counts as
    /// `confirmed`/`failed`. Any disagreement keeps the journal `pending`; a transaction both
    /// sources miss is reported as not found by both, which never becomes terminal on its own.
    fn refresh(&self, input: WalletRefreshInput) -> Result<WalletRefreshOutput, WalletChainError> {
        let tx_hash = input.transaction.tx_hash.as_deref().ok_or_else(|| {
            WalletChainError::invalid_input("Ethereum transaction missing tx_hash")
        })?;
        let receipt = self
            .provider
            .transaction_receipt(tx_hash)
            .map_err(provider_error)?;
        let lookup = self
            .provider
            .transaction_by_hash(tx_hash)
            .map_err(provider_error)?;
        let head = receipt
            .as_ref()
            .map(|_| self.provider.chain_head().map_err(provider_error))
            .transpose()?;
        let (receipt_view, lookup_view) = reconcile_sources(receipt, lookup, head);
        let observation = |source_id: &str, view: SourceView| WalletProviderObservationV1 {
            source_id: source_id.to_string(),
            independence_group: self.reconciliation_independence_group(),
            observed_at: input.now,
            outcome: view.outcome,
            block_ref: view.block_number.map(|block| block.to_string()),
            confirmations: view.confirmations,
            reason: view.reason.map(str::to_string),
        };
        Ok(WalletRefreshOutput {
            tx_hash: Some(tx_hash.to_string()),
            observations: vec![
                observation(ETHEREUM_RECEIPT_SOURCE_ID, receipt_view),
                observation(ETHEREUM_TRANSACTION_SOURCE_ID, lookup_view),
            ],
        })
    }
}

/// What one reconciliation source concluded about a transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SourceView {
    outcome: WalletProviderObservationOutcomeV1,
    block_number: Option<u64>,
    confirmations: Option<u32>,
    reason: Option<&'static str>,
}

impl SourceView {
    fn new(outcome: WalletProviderObservationOutcomeV1, block_number: Option<u64>) -> Self {
        Self {
            outcome,
            block_number,
            confirmations: None,
            reason: None,
        }
    }
}

/// Folds the receipt (primary), the transaction lookup (secondary) and the chain head into one
/// view per source. `head` is only consulted when a receipt exists.
fn reconcile_sources(
    receipt: Option<EthereumTransactionReceipt>,
    lookup: Option<EthereumTransactionLookup>,
    head: Option<EthereumChainHead>,
) -> (SourceView, SourceView) {
    use WalletProviderObservationOutcomeV1 as Outcome;
    let lookup_view = match &lookup {
        Some(EthereumTransactionLookup {
            block_number: Some(block),
        }) => SourceView::new(Outcome::Pending, Some(*block)),
        Some(EthereumTransactionLookup { block_number: None }) => {
            SourceView::new(Outcome::Pending, None)
        }
        None => SourceView::new(Outcome::NotFound, None),
    };
    let Some(receipt) = receipt else {
        return (SourceView::new(Outcome::NotFound, None), lookup_view);
    };
    let block = receipt.block_number;
    let confirmations = head.as_ref().map(|head| {
        u32::try_from(
            head.latest_block_number
                .checked_sub(block)
                .map_or(0, |depth| depth.saturating_add(1)),
        )
        .unwrap_or(u32::MAX)
    });
    let finalized = head
        .as_ref()
        .is_some_and(|head| match head.finalized_block_number {
            Some(finalized) => finalized >= block,
            None => u64::from(confirmations.unwrap_or(0)) >= ETHEREUM_FALLBACK_FINALITY_DEPTH,
        });
    let agrees = lookup
        .as_ref()
        .is_some_and(|lookup| lookup.block_number == Some(block));
    let mut receipt_view = SourceView::new(Outcome::Pending, Some(block));
    receipt_view.confirmations = confirmations;
    if !agrees {
        receipt_view.reason = Some("transaction lookup does not match the receipt block");
        return (receipt_view, lookup_view);
    }
    let mut lookup_view = SourceView::new(Outcome::Pending, Some(block));
    lookup_view.confirmations = confirmations;
    if !finalized {
        if receipt.failed {
            receipt_view.reason = Some("transaction reverted; awaiting finality");
        }
        return (receipt_view, lookup_view);
    }
    let outcome = if receipt.failed {
        Outcome::Failed
    } else {
        Outcome::Confirmed
    };
    receipt_view.outcome = outcome;
    lookup_view.outcome = outcome;
    if receipt.failed {
        receipt_view.reason = Some("transaction reverted");
    }
    (receipt_view, lookup_view)
}

/// Restore discovery input, prepared on the router thread: every candidate account of the
/// derivation profile up to [`ETHEREUM_ACCOUNT_DISCOVERY_CAP`] with its public address.
struct AccountDiscoveryPlan {
    wallet_id: String,
    network: WalletNetwork,
    existing_indices: BTreeSet<u32>,
    candidates: Vec<AccountCandidate>,
    now: u64,
}

struct AccountCandidate {
    account_index: u32,
    address: String,
    public_key: String,
}

impl AccountDiscoveryPlan {
    fn for_wallet(input: &WalletBalanceInput) -> Result<Self, WalletChainError> {
        let WalletAccountMeta::Derived(meta) = &input.account else {
            return Err(WalletChainError::unsupported_account_model(
                "Ethereum restore discovery requires a derived account",
            ));
        };
        let root = input
            .secret
            .as_ref()
            .and_then(super::SecretPayloadV1::wallet_root)
            .ok_or_else(|| {
                WalletChainError::internal("Ethereum discovery requires HD secret material")
            })?;
        let hd_input = hd_input_for_account(meta, root)?;
        ensure_hd_input(&hd_input)?;
        let master = hd_master(&hd_input)?;
        let candidates = (0..ETHEREUM_ACCOUNT_DISCOVERY_CAP)
            .map(|account_index| {
                let secret = derive_account_secret(&master, account_index)?;
                let (address, public_key) = address_from_secret(&secret);
                Ok(AccountCandidate {
                    account_index,
                    address,
                    public_key,
                })
            })
            .collect::<Result<Vec<_>, WalletChainError>>()?;
        Ok(Self {
            wallet_id: meta.wallet_id.clone(),
            network: meta.network.clone(),
            existing_indices: input
                .wallet_accounts
                .iter()
                .filter(|account| account.network() == &meta.network)
                .filter_map(WalletAccountMeta::account_index)
                .collect(),
            candidates,
            now: input.now,
        })
    }
}

/// BIP44-style account discovery with a gap of one: probe `m/44'/60'/0'/0/<i>` from index 0,
/// keep going while the account has ever sent (nonce > 0) or holds a balance, and stop at the
/// first unused index or at the cap. Accounts the wallet already has are never re-created;
/// index 0 exists before discovery runs and is always kept.
fn discover_accounts(
    provider: &dyn EthereumProvider,
    plan: AccountDiscoveryPlan,
) -> Result<Vec<WalletProfileAccountMaterialization>, WalletChainError> {
    let mut discovered = Vec::new();
    for candidate in plan.candidates {
        let snapshot = provider
            .account_snapshot(&candidate.address)
            .map_err(provider_error)?;
        let used = snapshot.pending_nonce > 0 || U256::parse(&snapshot.balance)?.is_nonzero();
        if !used {
            break;
        }
        if plan.existing_indices.contains(&candidate.account_index) {
            continue;
        }
        discovered.push(WalletProfileAccountMaterialization {
            account: derived_account_meta(
                plan.wallet_id.clone(),
                plan.network.clone(),
                candidate.account_index,
                candidate.address,
                candidate.public_key,
                plan.now,
            ),
            addresses: Vec::new(),
        });
    }
    Ok(discovered)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct EthereumPreparedPayloadV1 {
    kind: String,
    account_id: String,
    from: String,
    to: String,
    value: String,
    nonce: u64,
    chain_id: u64,
    gas_limit: u64,
    fee_tier: WalletFeeTier,
    max_fee_per_gas: String,
    max_priority_fee_per_gas: String,
    base_fee_per_gas: String,
}

fn ensure_network(network: &WalletNetwork) -> Result<(), WalletChainError> {
    if network.as_str() != ETHEREUM_NETWORK {
        return Err(WalletChainError::unsupported_chain(
            "Ethereum profile supports mainnet only",
        ));
    }
    Ok(())
}

fn ensure_hd_input(input: &WalletHdAccountMaterializeInput) -> Result<(), WalletChainError> {
    ensure_network(&input.network)?;
    if input.scheme != AccountScheme::EthereumEip44Account {
        return Err(WalletChainError::unsupported_account_model(
            "Ethereum HD account scheme mismatch",
        ));
    }
    input.scheme.ensure_compatible(&input.root)
}

fn materialize_hd_account(
    input: &WalletHdAccountMaterializeInput,
) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
    let secret = derive_hd_secret(input)?;
    let (address, public_key) = address_from_secret(&secret);
    Ok(WalletProfileAccountMaterialization {
        account: derived_account_meta(
            input.wallet_id.clone(),
            input.network.clone(),
            input.account_index,
            address,
            public_key,
            input.now,
        ),
        addresses: Vec::new(),
    })
}

fn derived_account_meta(
    wallet_id: String,
    network: WalletNetwork,
    account_index: u32,
    address: String,
    public_key: String,
    now: u64,
) -> WalletAccountMeta {
    let mut meta = super::derived_account_meta(
        wallet_id,
        network,
        AccountScheme::EthereumEip44Account,
        account_index,
        now,
    );
    meta.label = Some(format!("Ethereum account {}", account_index + 1));
    meta.address = Some(address.clone());
    meta.raw_account = Some(address);
    meta.public_key = Some(public_key);
    meta.derivation_path = Some(format!("m/44'/60'/0'/0/{account_index}"));
    WalletAccountMeta::Derived(meta)
}

fn derive_hd_secret(
    input: &WalletHdAccountMaterializeInput,
) -> Result<SecretKey, WalletChainError> {
    derive_account_secret(&hd_master(input)?, input.account_index)
}

fn hd_master(input: &WalletHdAccountMaterializeInput) -> Result<Xpriv, WalletChainError> {
    let seed = input.root.bip39_seed()?;
    Xpriv::new_master(Network::Bitcoin, seed.as_ref()).map_err(|error| {
        WalletChainError::invalid_input(format!("Ethereum BIP32 root failed: {error}"))
    })
}

fn derive_account_secret(
    master: &Xpriv,
    account_index: u32,
) -> Result<SecretKey, WalletChainError> {
    let path = DerivationPath::from_str(&format!("m/44'/60'/0'/0/{account_index}"))
        .map_err(|error| WalletChainError::invalid_input(format!("invalid EIP44 path: {error}")))?;
    Ok(master
        .derive_priv(&Secp256k1::new(), &path)
        .map_err(|error| {
            WalletChainError::invalid_input(format!("Ethereum key derivation failed: {error}"))
        })?
        .private_key)
}

fn hd_input_for_account(
    meta: &DerivedAccountMetaV1,
    (root, ton_signing): (WalletRoot, Option<TonSigningState>),
) -> Result<WalletHdAccountMaterializeInput, WalletChainError> {
    Ok(WalletHdAccountMaterializeInput {
        wallet_id: meta.wallet_id.clone(),
        network: meta.network.clone(),
        account_index: meta.account_index.unwrap_or(0),
        root,
        ton_signing,
        scheme: AccountScheme::from_str(&meta.derivation_profile)?,
        now: meta.updated_at,
    })
}

fn secret_for_account(
    account: &WalletAccountMeta,
    payload: &super::SecretPayloadV1,
) -> Result<SecretKey, WalletChainError> {
    match account {
        WalletAccountMeta::Imported(_) => {
            let super::SecretPayloadV1::ImportedKey {
                network,
                curve,
                private_key,
                encoding,
            } = payload
            else {
                return Err(WalletChainError::internal(
                    "Ethereum imported account secret mismatch",
                ));
            };
            ensure_network(network)?;
            if curve != "secp256k1" || encoding != "hex" {
                return Err(WalletChainError::invalid_input(
                    "Ethereum imported key metadata mismatch",
                ));
            }
            parse_secret_key(private_key)
        }
        WalletAccountMeta::Derived(meta) => {
            let root = payload.wallet_root().ok_or_else(|| {
                WalletChainError::internal("Ethereum derived account requires HD root")
            })?;
            if meta.account_index.is_none() {
                return Err(WalletChainError::invalid_input(
                    "Ethereum account_index missing",
                ));
            }
            let input = hd_input_for_account(meta, root)?;
            ensure_hd_input(&input)?;
            derive_hd_secret(&input)
        }
    }
}

fn parse_secret_key(value: &str) -> Result<SecretKey, WalletChainError> {
    let bytes = Zeroizing::new(parse_hex(value.trim_start_matches("0x"))?);
    SecretKey::from_slice(&bytes).map_err(|error| {
        WalletChainError::invalid_input(format!("invalid Ethereum secp256k1 key: {error}"))
    })
}

fn address_from_secret(secret: &SecretKey) -> (String, String) {
    let public_key = PublicKey::from_secret_key(&Secp256k1::new(), secret);
    let uncompressed = public_key.serialize_uncompressed();
    let digest = keccak256(&uncompressed[1..]);
    (
        format!("0x{}", hex_string(&digest[12..])),
        format!("0x{}", hex_string(&uncompressed)),
    )
}

fn account_address(account: &WalletAccountMeta) -> Result<&str, WalletChainError> {
    match account {
        WalletAccountMeta::Imported(meta) => Ok(&meta.address),
        WalletAccountMeta::Derived(meta) => meta
            .address
            .as_deref()
            .ok_or_else(|| WalletChainError::invalid_input("Ethereum account missing address")),
    }
}

fn normalize_address(address: &str) -> Result<String, WalletChainError> {
    let raw = address.trim().strip_prefix("0x").unwrap_or(address.trim());
    let bytes = parse_hex(raw).map_err(|error| WalletChainError::invalid_address(error.message))?;
    if bytes.len() != 20 {
        return Err(WalletChainError::invalid_address(
            "Ethereum address must contain 20 bytes",
        ));
    }
    Ok(format!("0x{}", hex_string(&bytes)))
}

fn normalize_hash(hash: &str) -> Result<String, WalletChainError> {
    let raw = hash.trim().strip_prefix("0x").unwrap_or(hash.trim());
    let bytes = parse_hex(raw)?;
    if bytes.len() != 32 {
        return Err(WalletChainError::broadcast_unknown(
            "Ethereum provider returned invalid transaction hash",
        ));
    }
    Ok(format!("0x{}", hex_string(&bytes)))
}

fn provider_error(error: EthereumProviderError) -> WalletChainError {
    match error.kind {
        EthereumProviderErrorKind::Unavailable => WalletChainError::provider_unavailable(),
        EthereumProviderErrorKind::Rejected => WalletChainError::broadcast_rejected(error.message),
        EthereumProviderErrorKind::Unknown => WalletChainError::broadcast_unknown(error.message),
    }
}

/// Folds an indexer transaction into the account's view: direction by comparing the normalized
/// `from`/`to` with the account address, `value` as the amount, the fee only on sends (the
/// receiver pays nothing), `status` from the receipt and `created_at` from the block timestamp.
fn history_transaction(
    address: &str,
    transaction: EthereumAddressTransaction,
    now: u64,
) -> Result<WalletHistoryTransaction, WalletChainError> {
    let from = normalize_address(&transaction.from)?;
    let to = transaction
        .to
        .as_deref()
        .map(normalize_address)
        .transpose()?;
    let (direction, counterparty, fee) = if from == address {
        (
            WalletTransactionDirection::Outgoing,
            to,
            U256::parse(&transaction.fee)?.to_decimal(),
        )
    } else if to.as_deref() == Some(address) {
        (
            WalletTransactionDirection::Incoming,
            Some(from),
            "0".to_string(),
        )
    } else {
        (WalletTransactionDirection::Unknown, None, "0".to_string())
    };
    let status = if transaction.failed {
        WalletTxStatus::Failed
    } else if transaction.block_number.is_some() {
        WalletTxStatus::Confirmed
    } else {
        WalletTxStatus::Pending
    };
    Ok(WalletHistoryTransaction {
        tx_hash: normalize_hash(&transaction.hash)?,
        message_ref: None,
        status,
        direction,
        counterparty,
        amount: U256::parse(&transaction.value)?.to_decimal(),
        fee,
        created_at: transaction.timestamp.unwrap_or(now),
    })
}

fn sign_eip1559(
    payload: &EthereumPreparedPayloadV1,
    secret: &SecretKey,
) -> Result<(String, String), WalletChainError> {
    let to = parse_hex(payload.to.trim_start_matches("0x"))?;
    let value = U256::parse(&payload.value)?;
    let max_fee = U256::parse(&payload.max_fee_per_gas)?;
    let max_priority = U256::parse(&payload.max_priority_fee_per_gas)?;
    let signing_fields = vec![
        rlp_u64(payload.chain_id),
        rlp_u64(payload.nonce),
        rlp_bytes(max_priority.minimal_bytes()),
        rlp_bytes(max_fee.minimal_bytes()),
        rlp_u64(payload.gas_limit),
        rlp_bytes(&to),
        rlp_bytes(value.minimal_bytes()),
        rlp_bytes(&[]),
        rlp_list(&[]),
    ];
    let signing_payload = [vec![2u8], rlp_list(&signing_fields)].concat();
    let digest = keccak256(&signing_payload);
    let signature = Secp256k1::new().sign_ecdsa_recoverable(&Message::from_digest(digest), secret);
    let (recovery_id, compact) = signature.serialize_compact();
    let signed_fields = vec![
        rlp_u64(payload.chain_id),
        rlp_u64(payload.nonce),
        rlp_bytes(max_priority.minimal_bytes()),
        rlp_bytes(max_fee.minimal_bytes()),
        rlp_u64(payload.gas_limit),
        rlp_bytes(&to),
        rlp_bytes(value.minimal_bytes()),
        rlp_bytes(&[]),
        rlp_list(&[]),
        rlp_u64(recovery_id.to_i32() as u64),
        rlp_bytes(trim_zeros(&compact[..32])),
        rlp_bytes(trim_zeros(&compact[32..])),
    ];
    let raw = [vec![2u8], rlp_list(&signed_fields)].concat();
    let tx_hash = keccak256(&raw);
    Ok((
        format!("0x{}", hex_string(&raw)),
        format!("0x{}", hex_string(&tx_hash)),
    ))
}

fn trim_zeros(bytes: &[u8]) -> &[u8] {
    let first = bytes
        .iter()
        .position(|byte| *byte != 0)
        .unwrap_or(bytes.len());
    &bytes[first..]
}

fn rlp_u64(value: u64) -> Vec<u8> {
    if value == 0 {
        return rlp_bytes(&[]);
    }
    rlp_bytes(trim_zeros(&value.to_be_bytes()))
}

fn rlp_bytes(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() == 1 && bytes[0] < 0x80 {
        return bytes.to_vec();
    }
    let mut out = rlp_prefix(bytes.len(), 0x80, 0xb7);
    out.extend_from_slice(bytes);
    out
}

fn rlp_list(items: &[Vec<u8>]) -> Vec<u8> {
    let payload = items.concat();
    let mut out = rlp_prefix(payload.len(), 0xc0, 0xf7);
    out.extend_from_slice(&payload);
    out
}

fn rlp_prefix(length: usize, short_offset: u8, long_offset: u8) -> Vec<u8> {
    if length <= 55 {
        return vec![short_offset + length as u8];
    }
    let encoded_length = length.to_be_bytes();
    let encoded = trim_zeros(&encoded_length);
    let mut out = vec![long_offset + encoded.len() as u8];
    out.extend_from_slice(encoded);
    out
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct U256([u8; 32]);

impl U256 {
    fn parse(value: &str) -> Result<Self, WalletChainError> {
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(WalletChainError::invalid_input(
                "Ethereum amount must be an unsigned wei integer",
            ));
        }
        let mut out = [0u8; 32];
        for digit in value.bytes().map(|byte| byte - b'0') {
            let mut carry = digit as u16;
            for byte in out.iter_mut().rev() {
                let next = (*byte as u16) * 10 + carry;
                *byte = next as u8;
                carry = next >> 8;
            }
            if carry != 0 {
                return Err(WalletChainError::invalid_input(
                    "Ethereum amount exceeds uint256",
                ));
            }
        }
        Ok(Self(out))
    }

    fn is_nonzero(self) -> bool {
        self.0.iter().any(|byte| *byte != 0)
    }

    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }

    fn checked_add(self, other: Self) -> Result<Self, WalletChainError> {
        let mut out = [0u8; 32];
        let mut carry = 0u16;
        for index in (0..32).rev() {
            let sum = self.0[index] as u16 + other.0[index] as u16 + carry;
            out[index] = sum as u8;
            carry = sum >> 8;
        }
        if carry != 0 {
            return Err(WalletChainError::invalid_input("Ethereum uint256 overflow"));
        }
        Ok(Self(out))
    }

    fn checked_sub(self, other: Self) -> Option<Self> {
        if self.cmp(&other) == Ordering::Less {
            return None;
        }
        let mut out = [0u8; 32];
        let mut borrow = 0i16;
        for index in (0..32).rev() {
            let difference = self.0[index] as i16 - other.0[index] as i16 - borrow;
            if difference < 0 {
                out[index] = (difference + 256) as u8;
                borrow = 1;
            } else {
                out[index] = difference as u8;
                borrow = 0;
            }
        }
        Some(Self(out))
    }

    fn checked_mul_u64(self, multiplier: u64) -> Result<Self, WalletChainError> {
        let mut result = Self([0u8; 32]);
        let mut addend = self;
        let mut factor = multiplier;
        while factor > 0 {
            if factor & 1 == 1 {
                result = result.checked_add(addend)?;
            }
            factor >>= 1;
            if factor > 0 {
                addend = addend.checked_add(addend)?;
            }
        }
        Ok(result)
    }

    fn minimal_bytes(&self) -> &[u8] {
        trim_zeros(&self.0)
    }

    fn to_decimal(self) -> String {
        if !self.is_nonzero() {
            return "0".to_string();
        }
        let mut value = self.0;
        let mut digits = Vec::new();
        while value.iter().any(|byte| *byte != 0) {
            let mut remainder = 0u16;
            for byte in &mut value {
                let current = (remainder << 8) | *byte as u16;
                *byte = (current / 10) as u8;
                remainder = current % 10;
            }
            digits.push((b'0' + remainder as u8) as char);
        }
        digits.iter().rev().collect()
    }
}

pub fn keccak256(input: &[u8]) -> [u8; 32] {
    const RATE: usize = 136;
    let mut state = [0u64; 25];
    let mut chunks = input.chunks_exact(RATE);
    for chunk in &mut chunks {
        absorb(&mut state, chunk);
        keccak_f1600(&mut state);
    }
    let remainder = chunks.remainder();
    let mut block = [0u8; RATE];
    block[..remainder.len()].copy_from_slice(remainder);
    block[remainder.len()] = 0x01;
    block[RATE - 1] |= 0x80;
    absorb(&mut state, &block);
    keccak_f1600(&mut state);
    let mut output = [0u8; 32];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = (state[index / 8] >> ((index % 8) * 8)) as u8;
    }
    output
}

fn absorb(state: &mut [u64; 25], block: &[u8]) {
    for (index, chunk) in block.chunks_exact(8).enumerate() {
        state[index] ^= u64::from_le_bytes(chunk.try_into().expect("eight-byte chunk"));
    }
}

fn keccak_f1600(state: &mut [u64; 25]) {
    const ROUND: [u64; 24] = [
        0x0000000000000001,
        0x0000000000008082,
        0x800000000000808a,
        0x8000000080008000,
        0x000000000000808b,
        0x0000000080000001,
        0x8000000080008081,
        0x8000000000008009,
        0x000000000000008a,
        0x0000000000000088,
        0x0000000080008009,
        0x000000008000000a,
        0x000000008000808b,
        0x800000000000008b,
        0x8000000000008089,
        0x8000000000008003,
        0x8000000000008002,
        0x8000000000000080,
        0x000000000000800a,
        0x800000008000000a,
        0x8000000080008081,
        0x8000000000008080,
        0x0000000080000001,
        0x8000000080008008,
    ];
    const ROTATION: [u32; 24] = [
        1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
    ];
    const PILN: [usize; 24] = [
        10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
    ];
    for round in ROUND {
        let mut bc = [0u64; 5];
        for x in 0..5 {
            bc[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
        }
        for x in 0..5 {
            let t = bc[(x + 4) % 5] ^ bc[(x + 1) % 5].rotate_left(1);
            for y in (0..25).step_by(5) {
                state[y + x] ^= t;
            }
        }
        let mut t = state[1];
        for index in 0..24 {
            let target = PILN[index];
            bc[0] = state[target];
            state[target] = t.rotate_left(ROTATION[index]);
            t = bc[0];
        }
        for y in (0..25).step_by(5) {
            bc.copy_from_slice(&state[y..y + 5]);
            for x in 0..5 {
                state[y + x] = bc[x] ^ ((!bc[(x + 1) % 5]) & bc[(x + 2) % 5]);
            }
        }
        state[0] ^= round;
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    struct MockProvider {
        broadcasts: Mutex<Vec<String>>,
        fee_tiers: Mutex<Vec<WalletFeeTier>>,
    }

    impl EthereumProvider for MockProvider {
        fn chain_id(&self) -> Result<u64, EthereumProviderError> {
            Ok(1)
        }

        fn account_snapshot(
            &self,
            _address: &str,
        ) -> Result<EthereumAccountSnapshot, EthereumProviderError> {
            Ok(EthereumAccountSnapshot {
                balance: "1000000000000000000".to_string(),
                pending_nonce: 7,
            })
        }

        fn code_at(&self, _address: &str) -> Result<Vec<u8>, EthereumProviderError> {
            Ok(Vec::new())
        }

        fn fee_estimate(
            &self,
            tier: WalletFeeTier,
        ) -> Result<EthereumFeeEstimate, EthereumProviderError> {
            self.fee_tiers.lock().expect("fee tiers").push(tier);
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
            Ok(None)
        }

        fn transaction_by_hash(
            &self,
            _tx_hash: &str,
        ) -> Result<Option<EthereumTransactionLookup>, EthereumProviderError> {
            Ok(None)
        }

        fn chain_head(&self) -> Result<EthereumChainHead, EthereumProviderError> {
            Ok(EthereumChainHead {
                latest_block_number: 100,
                finalized_block_number: None,
            })
        }
    }

    fn receipt(block_number: u64, failed: bool) -> Option<EthereumTransactionReceipt> {
        Some(EthereumTransactionReceipt {
            block_number,
            failed,
        })
    }

    fn lookup(block_number: Option<u64>) -> Option<EthereumTransactionLookup> {
        Some(EthereumTransactionLookup { block_number })
    }

    fn head(latest: u64, finalized: Option<u64>) -> Option<EthereumChainHead> {
        Some(EthereumChainHead {
            latest_block_number: latest,
            finalized_block_number: finalized,
        })
    }

    #[test]
    fn anchor_root_address_matches_bip39_with_the_same_passphrase() {
        let words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
            .split_whitespace()
            .map(str::to_string)
            .collect::<Vec<_>>();
        let address = |standard: &str, passphrase: Option<&str>| {
            let payload = super::super::SecretPayloadV1::hd_root_v2(
                standard,
                "00000000000000000000000000000000".to_string(),
                "english".to_string(),
                Some(words.clone()),
                passphrase.map(str::to_string),
            );
            let (root, ton_signing) = payload.wallet_root().expect("wallet root");
            let materialized = EthereumChainProfile::unavailable()
                .materialize_hd_account(WalletHdAccountMaterializeInput {
                    wallet_id: "wallet".to_string(),
                    network: WalletNetwork::from(ETHEREUM_NETWORK),
                    account_index: 0,
                    root,
                    ton_signing,
                    scheme: AccountScheme::EthereumEip44Account,
                    now: 1,
                })
                .expect("materialized account");
            let WalletAccountMeta::Derived(meta) = materialized.account else {
                panic!("derived account expected");
            };
            meta.address.expect("account address")
        };
        for passphrase in [None, Some("passphrase")] {
            assert_eq!(
                address("rotation", passphrase),
                address("bip39", passphrase)
            );
        }
        assert_ne!(address("bip39", None), address("bip39", Some("passphrase")));
    }

    #[test]
    fn reconciliation_requires_receipt_lookup_and_finality_to_agree() {
        use WalletProviderObservationOutcomeV1 as Outcome;
        // Finalized checkpoint covers the block and the lookup agrees: confirmed by both.
        let (primary, secondary) =
            reconcile_sources(receipt(100, false), lookup(Some(100)), head(120, Some(100)));
        assert_eq!(primary.outcome, Outcome::Confirmed);
        assert_eq!(secondary.outcome, Outcome::Confirmed);
        assert_eq!(primary.block_number, Some(100));
        assert_eq!(primary.confirmations, Some(21));
        // A reverted receipt at finality is a terminal failure.
        let (primary, _) =
            reconcile_sources(receipt(100, true), lookup(Some(100)), head(120, Some(100)));
        assert_eq!(primary.outcome, Outcome::Failed);
        // Before finality (checkpoint behind the block) everything stays pending.
        let (primary, secondary) =
            reconcile_sources(receipt(100, true), lookup(Some(100)), head(120, Some(99)));
        assert_eq!(primary.outcome, Outcome::Pending);
        assert_eq!(secondary.outcome, Outcome::Pending);
        // Without the finalized tag the fallback is 64 canonical blocks.
        let (primary, _) =
            reconcile_sources(receipt(100, false), lookup(Some(100)), head(162, None));
        assert_eq!(primary.outcome, Outcome::Pending);
        assert_eq!(primary.confirmations, Some(63));
        let (primary, _) =
            reconcile_sources(receipt(100, false), lookup(Some(100)), head(163, None));
        assert_eq!(primary.outcome, Outcome::Confirmed);
        assert_eq!(primary.confirmations, Some(64));
        // The receipt claims finality but the lookup misses the transaction: not confirmed.
        let (primary, secondary) =
            reconcile_sources(receipt(100, false), None, head(200, Some(150)));
        assert_eq!(primary.outcome, Outcome::Pending);
        assert!(primary.reason.is_some());
        assert_eq!(secondary.outcome, Outcome::NotFound);
        // The lookup places the transaction in another block (reorg in flight): pending.
        let (primary, secondary) =
            reconcile_sources(receipt(100, false), lookup(Some(101)), head(200, Some(150)));
        assert_eq!(primary.outcome, Outcome::Pending);
        assert_eq!(secondary.outcome, Outcome::Pending);
        assert_eq!(secondary.block_number, Some(101));
        // No receipt yet: the lookup alone reports mempool presence; both missing is not found.
        let (primary, secondary) = reconcile_sources(None, lookup(None), None);
        assert_eq!(primary.outcome, Outcome::NotFound);
        assert_eq!(secondary.outcome, Outcome::Pending);
        let (primary, secondary) = reconcile_sources(None, None, None);
        assert_eq!(primary.outcome, Outcome::NotFound);
        assert_eq!(secondary.outcome, Outcome::NotFound);
    }

    #[test]
    fn keccak_matches_ethereum_empty_vector() {
        assert_eq!(
            hex_string(&keccak256(b"")),
            "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
        );
    }

    #[test]
    fn u256_decimal_round_trip_and_overflow() {
        let max = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        assert_eq!(U256::parse(max).expect("uint256").to_decimal(), max);
        assert!(U256::parse(&(max.to_string() + "0")).is_err());
    }

    #[test]
    fn history_transaction_maps_direction_fee_and_status() {
        let ours = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
        let other = "0x1111111111111111111111111111111111111111";
        let hash = format!("0x{}", "ab".repeat(32));
        let outgoing = history_transaction(
            ours,
            EthereumAddressTransaction {
                hash: hash.clone(),
                from: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf".to_string(),
                to: Some(other.to_string()),
                value: "1000000000000000".to_string(),
                fee: "42000000000000".to_string(),
                block_number: Some(100),
                timestamp: Some(1_710_000_000_000),
                failed: false,
            },
            7,
        )
        .expect("outgoing");
        assert_eq!(outgoing.direction, WalletTransactionDirection::Outgoing);
        assert_eq!(outgoing.counterparty.as_deref(), Some(other));
        assert_eq!(outgoing.amount, "1000000000000000");
        assert_eq!(outgoing.fee, "42000000000000");
        assert_eq!(outgoing.status, WalletTxStatus::Confirmed);
        assert_eq!(outgoing.created_at, 1_710_000_000_000);
        assert_eq!(outgoing.tx_hash, hash);

        let incoming = history_transaction(
            ours,
            EthereumAddressTransaction {
                hash: hash.clone(),
                from: other.to_string(),
                to: Some(ours.to_string()),
                value: "5".to_string(),
                fee: "42000000000000".to_string(),
                block_number: None,
                timestamp: None,
                failed: false,
            },
            7,
        )
        .expect("incoming");
        assert_eq!(incoming.direction, WalletTransactionDirection::Incoming);
        assert_eq!(incoming.counterparty.as_deref(), Some(other));
        assert_eq!(incoming.fee, "0");
        assert_eq!(incoming.status, WalletTxStatus::Pending);
        assert_eq!(incoming.created_at, 7);

        let failed = history_transaction(
            ours,
            EthereumAddressTransaction {
                hash,
                from: ours.to_string(),
                to: None,
                value: "0".to_string(),
                fee: "1".to_string(),
                block_number: Some(1),
                timestamp: Some(1),
                failed: true,
            },
            7,
        )
        .expect("failed");
        assert_eq!(failed.status, WalletTxStatus::Failed);
        assert_eq!(failed.counterparty, None);
        assert!(history_transaction(
            ours,
            EthereumAddressTransaction {
                hash: "0x12".to_string(),
                from: ours.to_string(),
                to: None,
                value: "0".to_string(),
                fee: "0".to_string(),
                block_number: None,
                timestamp: None,
                failed: false,
            },
            7,
        )
        .is_err());
    }

    #[test]
    fn private_key_one_matches_known_ethereum_address() {
        let mut bytes = [0u8; 32];
        bytes[31] = 1;
        let secret = SecretKey::from_slice(&bytes).expect("secret");
        assert_eq!(
            address_from_secret(&secret).0,
            "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"
        );
    }

    #[test]
    fn ethereum_profile_is_manifest_gated_and_signs_type_two_transaction() {
        let provider = Arc::new(MockProvider {
            broadcasts: Mutex::new(Vec::new()),
            fee_tiers: Mutex::new(Vec::new()),
        });
        let profile = EthereumChainProfile::new(provider.clone());
        let mut config = WalletRuntimeConfig::with_wallet_enabled(true);
        assert!(!profile.is_enabled(&config));
        config
            .enabled_capabilities
            .insert(ETHEREUM_NATIVE_TRANSFER_CAPABILITY.to_string());
        assert!(profile.is_enabled(&config));

        let account = profile
            .materialize_imported_account(WalletImportedAccountMaterializeInput {
                wallet_id: "wallet".to_string(),
                account_id: "account".to_string(),
                network: WalletNetwork::from(ETHEREUM_NETWORK),
                label: "Ethereum".to_string(),
                curve: "secp256k1".to_string(),
                private_key: "0000000000000000000000000000000000000000000000000000000000000001"
                    .to_string(),
                encoding: "hex".to_string(),
                now: 1,
            })
            .expect("materialize")
            .account;
        let prepared = profile
            .prepare(WalletPrepareInput {
                account: account.clone(),
                wallet_accounts: vec![account.clone()],
                allocated_addresses: Vec::new(),
                live_preparations: Vec::new(),
                secret: None,
                outputs: vec![WalletTransactionOutput {
                    address: "0x1111111111111111111111111111111111111111".to_string(),
                    amount: "1000000000000000".to_string(),
                    comment: None,
                }],
                fee_tier: WalletFeeTier::Fast,
                maximize_output_index: None,
                now: 1,
            })
            .expect("prepare");
        let max_prepared = profile
            .prepare(WalletPrepareInput {
                account: account.clone(),
                wallet_accounts: vec![account.clone()],
                allocated_addresses: Vec::new(),
                live_preparations: Vec::new(),
                secret: None,
                outputs: vec![WalletTransactionOutput {
                    address: "0x1111111111111111111111111111111111111111".to_string(),
                    amount: "1".to_string(),
                    comment: None,
                }],
                fee_tier: WalletFeeTier::Standard,
                maximize_output_index: Some(0),
                now: 1,
            })
            .expect("prepare max");
        assert_eq!(max_prepared.preview.outputs[0].amount, "999958000000000000");
        assert_eq!(max_prepared.preview.estimated_fee, "42000000000000");
        assert_eq!(max_prepared.preview.total_debit, "1000000000000000000");
        let signed = profile
            .sign_prepared(WalletSignInput {
                account: account.clone(),
                preparation_id: "preparation".to_string(),
                canonical_payload: Zeroizing::new(prepared.canonical_payload),
                provider_snapshot: prepared.provider_snapshot,
                signing_secret: super::super::SecretPayloadV1::ImportedKey {
                    network: WalletNetwork::from(ETHEREUM_NETWORK),
                    curve: "secp256k1".to_string(),
                    private_key: "0000000000000000000000000000000000000000000000000000000000000001"
                        .to_string(),
                    encoding: "hex".to_string(),
                },
            })
            .expect("sign");
        assert!(signed.signed_artifact.starts_with("0x02"));
        let tx_hash = signed.tx_hash.clone().expect("tx hash");
        let submitted = profile
            .submit_signed(WalletSubmitInput {
                account,
                preparation_id: "preparation".to_string(),
                signed_artifact: signed,
            })
            .expect("submit");
        assert_eq!(submitted.status, WalletConfirmStatus::Pending);
        assert_eq!(submitted.tx_hash.as_deref(), Some(tx_hash.as_str()));
        assert_eq!(provider.broadcasts.lock().expect("broadcasts").len(), 1);
        assert_eq!(
            *provider.fee_tiers.lock().expect("fee tiers"),
            vec![
                WalletFeeTier::Fast,
                WalletFeeTier::Standard,
                WalletFeeTier::Fast
            ]
        );
    }
}
