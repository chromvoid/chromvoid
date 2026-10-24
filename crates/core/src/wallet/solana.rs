//! Solana mainnet-beta chain profile (SPEC-234): native SOL only.
//!
//! Derived accounts follow the Phantom-compatible SLIP-0010 path `m/44'/501'/<index>'/0'`,
//! imported accounts are base58 Ed25519 keypairs, and sends are Core-built legacy messages with
//! two Compute Budget instructions (unit limit, unit price for the fee tier) and a single System
//! Program transfer signed locally. The provider is an untrusted source of blockhash, fee, rent
//! and status data (FR-234-017); Core never signs provider-built bytes.

use std::collections::BTreeSet;
use std::str::FromStr;
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use bitcoin::base58;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use zeroize::Zeroizing;

use crate::rpc::types::{
    DerivedAccountMetaV1, ImportedAccountMetaV1, SolanaTransactionPreviewV1, WalletAccountMeta,
    WalletBalance, WalletConfirmStatus, WalletFeeTier, WalletNetwork, WalletPreview,
    WalletProviderStatus, WalletTransactionOutput, WalletWarning,
};

use super::slip10::slip10_ed25519_derive;
use super::{
    parse_hex, AccountScheme, TonSigningState, WalletAddressDeriveInput, WalletAddressDeriveOutput,
    WalletBalanceInput, WalletBalanceOutput, WalletBalanceTask, WalletChainError,
    WalletChainProfile, WalletHdAccountMaterializeInput, WalletHistoryInput, WalletHistoryOutput,
    WalletHistoryTask, WalletHistoryTransaction, WalletImportedAccountMaterializeInput,
    WalletPrepareInput, WalletPrepareOutput, WalletProfileAccountMaterialization,
    WalletProviderObservationOutcomeV1, WalletProviderObservationV1, WalletRefreshInput,
    WalletRefreshOutput, WalletRoot, WalletRuntimeConfig, WalletSignInput, WalletSignedArtifact,
    WalletSubmitInput, WalletSubmitOutput, WalletTxStatus,
};
use crate::rpc::types::WalletTransactionDirection;

pub const SOLANA_NETWORK: &str = "solana";
pub const SOLANA_AMOUNT_UNIT: &str = "lamport";
pub const SOLANA_DERIVATION_PROFILE: &str = "solana_bip44_account";
pub const SOLANA_NATIVE_TRANSFER_CAPABILITY: &str = "solana_native_transfer";
/// Warning raised when the destination system account stays below the rent-exempt minimum.
pub const SOLANA_DESTINATION_NOT_RENT_EXEMPT_WARNING: &str = "destination_not_rent_exempt";
/// Base58 System Program id (`11111111111111111111111111111111`, all-zero key).
pub const SOLANA_SYSTEM_PROGRAM_ID: &str = "11111111111111111111111111111111";
/// Base fee charged per signature; used when the provider cannot quote a fee.
pub const SOLANA_DEFAULT_SIGNATURE_FEE_LAMPORTS: u64 = 5_000;
/// Most signatures one `wallet:transactions:sync` fetches (each costs a `getTransaction`).
pub const SOLANA_HISTORY_PAGE_LIMIT: u32 = 25;
/// Most derived accounts (`m/44'/501'/<i>'/0'`, `i < cap`) restore discovery materializes.
pub const SOLANA_ACCOUNT_DISCOVERY_CAP: u32 = 20;
/// Base58 Compute Budget program id.
pub const SOLANA_COMPUTE_BUDGET_PROGRAM_ID: &str = "ComputeBudget111111111111111111111111111111";
/// Compute unit limit requested for a native transfer: the two Compute Budget instructions and
/// the System transfer cost 150 CU each (450 CU), so this leaves about 2x headroom while
/// keeping `units × price` small.
pub const SOLANA_TRANSFER_COMPUTE_UNIT_LIMIT: u32 = 1_000;
/// Upper bound on the compute unit price (micro-lamports per CU) regardless of what the
/// provider reports: 10 000 lamports at the transfer unit limit.
pub const SOLANA_MAX_COMPUTE_UNIT_PRICE: u64 = 10_000_000;
/// Estimated wall-clock per block height used to bound preparation validity by
/// `last_valid_block_height` (FR-234-010); deliberately on the short side.
pub const SOLANA_BLOCK_TIME_ESTIMATE_MS: u64 = 400;
/// Reconciliation sources: signature status is primary, `getTransaction` cross-checks it.
pub const SOLANA_SIGNATURE_STATUS_SOURCE_ID: &str = "solana:signature_status";
pub const SOLANA_TRANSACTION_SOURCE_ID: &str = "solana:transaction";

const SOLANA_PREPARED_KIND: &str = "solana_native_transfer_v1";
const SOLANA_SLIP10_PURPOSE: u32 = 44;
const SOLANA_SLIP10_COIN: u32 = 501;
const SOLANA_SLIP10_CHANGE: u32 = 0;
const SYSTEM_PROGRAM_KEY: [u8; 32] = [0u8; 32];
/// `SystemInstruction::Transfer` discriminant (bincode `u32` little-endian).
const SYSTEM_TRANSFER_INSTRUCTION: u32 = 2;
/// `ComputeBudgetInstruction::SetComputeUnitLimit(u32)` / `SetComputeUnitPrice(u64)` tags.
const COMPUTE_BUDGET_SET_UNIT_LIMIT: u8 = 2;
const COMPUTE_BUDGET_SET_UNIT_PRICE: u8 = 3;
/// Largest serialized transaction a Solana packet carries.
const MAX_TRANSACTION_BYTES: usize = 1_232;
const PUBKEY_LEN: usize = 32;
const SIGNATURE_LEN: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolanaBlockhash {
    pub blockhash: String,
    pub last_valid_block_height: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolanaSignatureStatus {
    /// `confirmationStatus == "finalized"`; anything weaker keeps the journal pending (FR-234-016).
    pub finalized: bool,
    /// The transaction landed with an explicit `err`.
    pub failed: bool,
    pub slot: Option<u64>,
}

/// One entry of `getSignaturesForAddress`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolanaSignatureInfo {
    pub signature: String,
    pub slot: Option<u64>,
    /// Block time in seconds when the node knows it.
    pub block_time: Option<u64>,
    pub failed: bool,
    pub finalized: bool,
}

/// The parts of `getTransaction` the profile needs to compute the account's lamport delta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolanaTransactionDetails {
    pub slot: Option<u64>,
    pub block_time: Option<u64>,
    pub fee: u64,
    pub failed: bool,
    /// Static and lookup-table account keys in message order (the fee payer first).
    pub account_keys: Vec<String>,
    pub pre_balances: Vec<u64>,
    pub post_balances: Vec<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SolanaProviderErrorKind {
    Unavailable,
    Rejected,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct SolanaProviderError {
    pub kind: SolanaProviderErrorKind,
    pub message: String,
}

impl SolanaProviderError {
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            kind: SolanaProviderErrorKind::Unavailable,
            message: message.into(),
        }
    }

    pub fn rejected(message: impl Into<String>) -> Self {
        Self {
            kind: SolanaProviderErrorKind::Rejected,
            message: message.into(),
        }
    }

    pub fn unknown(message: impl Into<String>) -> Self {
        Self {
            kind: SolanaProviderErrorKind::Unknown,
            message: message.into(),
        }
    }
}

/// Blocking Solana JSON-RPC surface consumed by the profile. All amounts are lamports.
pub trait SolanaProvider: Send + Sync {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }
    /// `getBalance` in lamports.
    fn balance(&self, address: &str) -> Result<u64, SolanaProviderError>;
    /// `getLatestBlockhash`.
    fn latest_blockhash(&self) -> Result<SolanaBlockhash, SolanaProviderError>;
    /// `getBlockHeight`.
    fn block_height(&self) -> Result<u64, SolanaProviderError>;
    /// `getMinimumBalanceForRentExemption` for `data_len` bytes (0 for system accounts).
    fn minimum_balance_for_rent_exemption(&self, data_len: u64)
        -> Result<u64, SolanaProviderError>;
    /// `getFeeForMessage` for a base64 legacy message; implementations fall back to
    /// [`SOLANA_DEFAULT_SIGNATURE_FEE_LAMPORTS`] when the node returns `null`.
    fn fee_for_message(&self, message_base64: &str) -> Result<u64, SolanaProviderError>;
    /// `getRecentPrioritizationFees` for transactions locking `addresses`: the per-slot minimum
    /// compute unit prices (micro-lamports) of recent slots, in any order.
    fn recent_prioritization_fees(
        &self,
        addresses: &[&str],
    ) -> Result<Vec<u64>, SolanaProviderError>;
    /// `sendTransaction` for a base64 signed transaction; returns the base58 signature.
    fn send_transaction(&self, transaction_base64: &str) -> Result<String, SolanaProviderError>;
    /// `getSignatureStatuses` with `searchTransactionHistory: true`; `None` when unknown.
    fn signature_status(
        &self,
        signature: &str,
    ) -> Result<Option<SolanaSignatureStatus>, SolanaProviderError>;
    /// `getSignaturesForAddress`, newest first, at most `limit`; `before` continues a page.
    fn signatures_for_address(
        &self,
        _address: &str,
        _limit: u32,
        _before: Option<&str>,
    ) -> Result<Vec<SolanaSignatureInfo>, SolanaProviderError> {
        Err(SolanaProviderError::unavailable(
            "Solana transaction history unavailable",
        ))
    }
    /// `getTransaction` (jsonParsed, `maxSupportedTransactionVersion: 0`); `None` when the node
    /// does not have the transaction.
    fn transaction(
        &self,
        _signature: &str,
    ) -> Result<Option<SolanaTransactionDetails>, SolanaProviderError> {
        Err(SolanaProviderError::unavailable(
            "Solana transaction history unavailable",
        ))
    }
}

pub struct UnavailableSolanaProvider;

impl UnavailableSolanaProvider {
    fn error<T>() -> Result<T, SolanaProviderError> {
        Err(SolanaProviderError::unavailable(
            "Solana provider unavailable",
        ))
    }
}

impl SolanaProvider for UnavailableSolanaProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Unavailable
    }

    fn balance(&self, _address: &str) -> Result<u64, SolanaProviderError> {
        Self::error()
    }

    fn latest_blockhash(&self) -> Result<SolanaBlockhash, SolanaProviderError> {
        Self::error()
    }

    fn block_height(&self) -> Result<u64, SolanaProviderError> {
        Self::error()
    }

    fn minimum_balance_for_rent_exemption(
        &self,
        _data_len: u64,
    ) -> Result<u64, SolanaProviderError> {
        Self::error()
    }

    fn fee_for_message(&self, _message_base64: &str) -> Result<u64, SolanaProviderError> {
        Self::error()
    }

    fn recent_prioritization_fees(
        &self,
        _addresses: &[&str],
    ) -> Result<Vec<u64>, SolanaProviderError> {
        Self::error()
    }

    fn send_transaction(&self, _transaction_base64: &str) -> Result<String, SolanaProviderError> {
        Self::error()
    }

    fn signature_status(
        &self,
        _signature: &str,
    ) -> Result<Option<SolanaSignatureStatus>, SolanaProviderError> {
        Self::error()
    }

    fn signatures_for_address(
        &self,
        _address: &str,
        _limit: u32,
        _before: Option<&str>,
    ) -> Result<Vec<SolanaSignatureInfo>, SolanaProviderError> {
        Self::error()
    }

    fn transaction(
        &self,
        _signature: &str,
    ) -> Result<Option<SolanaTransactionDetails>, SolanaProviderError> {
        Self::error()
    }
}

#[derive(Clone)]
pub struct SolanaChainProfile {
    provider: Arc<dyn SolanaProvider>,
}

impl SolanaChainProfile {
    pub fn new(provider: Arc<dyn SolanaProvider>) -> Self {
        Self { provider }
    }

    pub fn unavailable() -> Self {
        Self::new(Arc::new(UnavailableSolanaProvider))
    }

    /// The live balance of the account plus, on request, restore discovery of the wallet's
    /// used derived accounts. SLIP-0010 has no public derivation, so every candidate key is
    /// derived here, on the router thread, and the task only carries public addresses.
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
            let lamports = provider.balance(&address).map_err(provider_error)?;
            Ok(WalletBalanceOutput {
                balance: WalletBalance {
                    spendable: lamports.to_string(),
                    pending_in: "0".to_string(),
                    pending_out: "0".to_string(),
                    total: lamports.to_string(),
                    amount_unit: SOLANA_AMOUNT_UNIT.to_string(),
                },
                materializations,
            })
        }))
    }
}

impl WalletChainProfile for SolanaChainProfile {
    fn network(&self) -> &str {
        SOLANA_NETWORK
    }

    fn amount_unit(&self) -> &str {
        SOLANA_AMOUNT_UNIT
    }

    fn normalize_address(&self, address: &str) -> Result<String, WalletChainError> {
        normalize_address(address)
    }

    fn capability_ids(&self) -> Vec<&'static str> {
        vec![SOLANA_NATIVE_TRANSFER_CAPABILITY]
    }

    fn provider_status(&self) -> WalletProviderStatus {
        self.provider.provider_status()
    }

    fn is_enabled(&self, config: &WalletRuntimeConfig) -> bool {
        config.wallet_enabled && config.capability_enabled(SOLANA_NATIVE_TRANSFER_CAPABILITY)
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
        let signing_key = parse_imported_key(&input.curve, &input.private_key, &input.encoding)?;
        let address = address_from_signing_key(&signing_key);
        Ok(WalletProfileAccountMaterialization {
            account: WalletAccountMeta::Imported(ImportedAccountMetaV1 {
                account_id: input.account_id,
                wallet_id: input.wallet_id,
                network: input.network,
                label: Some(input.label),
                address: address.clone(),
                public_key: Some(address.clone()),
                curve: Some("ed25519".to_string()),
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
            "Solana account-based profiles do not allocate addresses",
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
        let limit = input.limit.clamp(1, SOLANA_HISTORY_PAGE_LIMIT);
        let provider = self.provider.clone();
        Ok(Some(Box::new(move || {
            let signatures = provider
                .signatures_for_address(&address, limit, None)
                .map_err(provider_error)?;
            let mut transactions = Vec::with_capacity(signatures.len());
            for info in signatures.into_iter().take(limit as usize) {
                let details = provider
                    .transaction(&info.signature)
                    .map_err(provider_error)?;
                transactions.push(history_transaction(&address, info, details, input.now));
            }
            Ok(WalletHistoryOutput { transactions })
        })))
    }

    fn prepare(&self, input: WalletPrepareInput) -> Result<WalletPrepareOutput, WalletChainError> {
        if input.outputs.len() != 1 {
            return Err(WalletChainError::invalid_input(
                "Solana v1 requires exactly one output",
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
                "Solana native transfer does not accept comment",
            ));
        }
        let from = account_address(&input.account)?.to_string();
        let to = normalize_address(&output.address)?;
        let requested_lamports = input
            .maximize_output_index
            .is_none()
            .then(|| parse_lamports(&output.amount))
            .transpose()?;
        let balance = self.provider.balance(&from).map_err(provider_error)?;
        let blockhash = self.provider.latest_blockhash().map_err(provider_error)?;
        let blockhash_bytes = decode_blockhash(&blockhash.blockhash)?;
        // FR-234-010: the preparation is only worth keeping while the blockhash can still be
        // accepted; estimate that window from the remaining block heights.
        let block_height = self.provider.block_height().map_err(provider_error)?;
        let remaining_blocks = blockhash
            .last_valid_block_height
            .checked_sub(block_height)
            .ok_or_else(|| {
                WalletChainError::provider_unavailable_with_message(
                    "Solana provider returned an already expired blockhash",
                )
            })?;
        let valid_until = input
            .now
            .saturating_add(remaining_blocks.saturating_mul(SOLANA_BLOCK_TIME_ESTIMATE_MS));
        let rent_exempt_minimum = self
            .provider
            .minimum_balance_for_rent_exemption(0)
            .map_err(provider_error)?;
        let destination_balance = self.provider.balance(&to).map_err(provider_error)?;
        let recent_fees = self
            .provider
            .recent_prioritization_fees(&fee_accounts(&from, &to))
            .map_err(provider_error)?;
        let compute_budget = ComputeBudget {
            unit_limit: SOLANA_TRANSFER_COMPUTE_UNIT_LIMIT,
            unit_price: compute_unit_price_for_tier(&input.fee_tier, &recent_fees),
        };
        // The base fee depends on signatures only, not on the amount or the compute budget
        // instructions, so a transfer-only placeholder message quotes it; the priority fee is
        // deterministic from the compute budget and is added locally.
        let quote_message = build_transfer_message(
            &from,
            &to,
            &blockhash_bytes,
            requested_lamports.unwrap_or(0),
            None,
        )?;
        let base_fee = self
            .provider
            .fee_for_message(&BASE64_STANDARD.encode(&quote_message))
            .map_err(provider_error)?;
        let priority_fee = compute_budget.priority_fee_lamports();
        let fee = base_fee
            .checked_add(priority_fee)
            .ok_or_else(|| WalletChainError::invalid_input("Solana fee overflow"))?;
        let lamports = match requested_lamports {
            Some(lamports) => lamports,
            None => balance
                .checked_sub(fee)
                .ok_or_else(WalletChainError::insufficient_funds)?,
        };
        if lamports == 0 {
            return Err(if input.maximize_output_index.is_some() {
                WalletChainError::insufficient_funds()
            } else {
                WalletChainError::invalid_input("Solana transfer amount must be greater than zero")
            });
        }
        let total = lamports
            .checked_add(fee)
            .ok_or_else(|| WalletChainError::invalid_input("Solana amount overflow"))?;
        if balance < total {
            return Err(WalletChainError::insufficient_funds());
        }
        let mut warnings = Vec::new();
        if destination_balance.saturating_add(lamports) < rent_exempt_minimum {
            warnings.push(WalletWarning {
                code: SOLANA_DESTINATION_NOT_RENT_EXEMPT_WARNING.to_string(),
                message: "Destination balance stays below rent-exempt minimum".to_string(),
            });
        }
        let payload = SolanaPreparedPayloadV1 {
            kind: SOLANA_PREPARED_KIND.to_string(),
            account_id: input.account.account_id().to_string(),
            from,
            to: to.clone(),
            lamports: lamports.to_string(),
            fee: fee.to_string(),
            fee_tier: input.fee_tier,
            recent_blockhash: blockhash.blockhash.clone(),
            last_valid_block_height: blockhash.last_valid_block_height,
            compute_unit_limit: compute_budget.unit_limit,
            compute_unit_price: compute_budget.unit_price,
        };
        Ok(WalletPrepareOutput {
            preview: WalletPreview {
                amount_unit: SOLANA_AMOUNT_UNIT.to_string(),
                outputs: vec![WalletTransactionOutput {
                    address: to,
                    amount: lamports.to_string(),
                    comment: None,
                }],
                estimated_fee: fee.to_string(),
                total_debit: total.to_string(),
                warnings,
                ton: None,
                ethereum: None,
                solana: Some(SolanaTransactionPreviewV1 {
                    recent_blockhash: blockhash.blockhash.clone(),
                    last_valid_block_height: blockhash.last_valid_block_height,
                    destination_rent_exempt_minimum: rent_exempt_minimum.to_string(),
                }),
            },
            provider_snapshot: Some(json!({
                "balance": balance.to_string(),
                "destination_pre_balance": destination_balance.to_string(),
                "fee_estimate": fee.to_string(),
                "base_fee": base_fee.to_string(),
                "priority_fee": priority_fee.to_string(),
                "compute_unit_limit": compute_budget.unit_limit,
                "compute_unit_price": compute_budget.unit_price.to_string(),
                "recent_blockhash": blockhash.blockhash,
                "last_valid_block_height": blockhash.last_valid_block_height,
                "block_height": block_height,
                "destination_rent_exempt_minimum": rent_exempt_minimum.to_string(),
            })),
            canonical_payload: serde_json::to_string(&payload).map_err(|error| {
                WalletChainError::internal(format!("Solana payload serialization failed: {error}"))
            })?,
            materializations: Vec::new(),
            valid_until: Some(valid_until),
        })
    }

    fn sign_prepared(
        &self,
        input: WalletSignInput,
    ) -> Result<WalletSignedArtifact, WalletChainError> {
        let payload: SolanaPreparedPayloadV1 = serde_json::from_str(&input.canonical_payload)
            .map_err(|error| {
                WalletChainError::preparation_stale(format!(
                    "Solana preparation payload is invalid: {error}"
                ))
            })?;
        if payload.kind != SOLANA_PREPARED_KIND
            || payload.account_id != input.account.account_id()
            || payload.from != account_address(&input.account)?
        {
            return Err(WalletChainError::preparation_stale(
                "Solana preparation/account mismatch",
            ));
        }
        let lamports = parse_lamports(&payload.lamports)?;
        let fee = parse_lamports(&payload.fee)?;
        let blockhash_bytes = decode_blockhash(&payload.recent_blockhash)?;
        ensure_blockhash_valid(
            self.provider.as_ref(),
            payload.last_valid_block_height,
            "Solana recent blockhash expired before signing",
        )?;
        let balance = self
            .provider
            .balance(&payload.from)
            .map_err(provider_error)?;
        let total = lamports
            .checked_add(fee)
            .ok_or_else(|| WalletChainError::invalid_input("Solana amount overflow"))?;
        if balance < total {
            return Err(WalletChainError::insufficient_funds());
        }
        let signing_key = signing_key_for_account(&input.account, &input.signing_secret)?;
        if address_from_signing_key(&signing_key) != payload.from {
            return Err(WalletChainError::internal(
                "Solana signing material does not match account",
            ));
        }
        let message = Zeroizing::new(build_transfer_message(
            &payload.from,
            &payload.to,
            &blockhash_bytes,
            lamports,
            Some(ComputeBudget {
                unit_limit: payload.compute_unit_limit,
                unit_price: payload.compute_unit_price,
            }),
        )?);
        let signature = signing_key.sign(&message).to_bytes();
        let mut transaction = Zeroizing::new(Vec::with_capacity(1 + SIGNATURE_LEN + message.len()));
        push_shortvec_len(&mut transaction, 1);
        transaction.extend_from_slice(&signature);
        transaction.extend_from_slice(&message);
        Ok(WalletSignedArtifact {
            signed_artifact: Zeroizing::new(BASE64_STANDARD.encode(transaction.as_slice())),
            // FR-234-012: the base58 fee-payer signature is the tx reference, known before broadcast.
            tx_hash: Some(base58::encode(&signature)),
            message_ref: None,
            submit_metadata: Some(json!({
                "recent_blockhash": payload.recent_blockhash,
                "last_valid_block_height": payload.last_valid_block_height,
            })),
        })
    }

    fn submit_signed(
        &self,
        input: WalletSubmitInput,
    ) -> Result<WalletSubmitOutput, WalletChainError> {
        let expected_signature = input
            .signed_artifact
            .tx_hash
            .clone()
            .ok_or_else(|| WalletChainError::internal("Solana artifact missing signature"))?;
        if let Some(last_valid_block_height) =
            last_valid_block_height(input.signed_artifact.submit_metadata.as_ref())
        {
            ensure_blockhash_valid(
                self.provider.as_ref(),
                last_valid_block_height,
                "Solana recent blockhash expired before broadcast",
            )?;
        }
        match self
            .provider
            .send_transaction(&input.signed_artifact.signed_artifact)
        {
            Ok(signature) if signature.trim() == expected_signature => Ok(WalletSubmitOutput {
                status: WalletConfirmStatus::Pending,
                tx_hash: Some(expected_signature),
                message_ref: None,
            }),
            Ok(_) => Err(WalletChainError::broadcast_unknown(
                "Solana provider returned a mismatched transaction signature",
            )),
            Err(error) if error.kind == SolanaProviderErrorKind::Unknown => {
                Ok(WalletSubmitOutput {
                    status: WalletConfirmStatus::BroadcastUnknown,
                    tx_hash: Some(expected_signature),
                    message_ref: None,
                })
            }
            Err(error) => Err(provider_error(error)),
        }
    }

    /// Reconciliation with two provider sources (FR-234-014/016): `getSignatureStatuses` is
    /// primary and only a `finalized` status can confirm; before a terminal outcome is written
    /// `getTransaction` must agree on the slot and on `meta.err`, otherwise the journal stays
    /// pending. A signature neither source knows stays unresolved while the blockhash is valid
    /// and becomes `failed` only once the network can no longer accept it.
    fn refresh(&self, input: WalletRefreshInput) -> Result<WalletRefreshOutput, WalletChainError> {
        use WalletProviderObservationOutcomeV1 as Outcome;
        let signature =
            input.transaction.tx_hash.as_deref().ok_or_else(|| {
                WalletChainError::invalid_input("Solana transaction missing tx_hash")
            })?;
        let status = self
            .provider
            .signature_status(signature)
            .map_err(provider_error)?;
        let (primary, secondary) = match status {
            Some(status) if status.failed || status.finalized => {
                let details = self
                    .provider
                    .transaction(signature)
                    .map_err(provider_error)?;
                reconcile_terminal_status(&status, details.as_ref())
            }
            Some(status) => (SourceView::new(Outcome::Pending, status.slot, None), None),
            // A missing signature is not terminal on its own (FR-234-014); it only becomes a
            // failure once the network can no longer accept the blockhash and the transaction
            // lookup misses it as well.
            None => match last_valid_block_height(input.submit_metadata.as_ref()) {
                Some(last_valid_block_height)
                    if self.provider.block_height().map_err(provider_error)?
                        > last_valid_block_height =>
                {
                    let details = self
                        .provider
                        .transaction(signature)
                        .map_err(provider_error)?;
                    match details {
                        None => (
                            SourceView::new(
                                Outcome::Failed,
                                None,
                                Some("recent blockhash expired without a visible transaction"),
                            ),
                            Some(SourceView::new(Outcome::NotFound, None, None)),
                        ),
                        Some(details) => (
                            SourceView::new(
                                Outcome::Unknown,
                                None,
                                Some("signature status missing while the transaction is known"),
                            ),
                            Some(SourceView::new(Outcome::Pending, details.slot, None)),
                        ),
                    }
                }
                _ => (SourceView::new(Outcome::Unknown, None, None), None),
            },
        };
        let observation = |source_id: &str, view: SourceView| WalletProviderObservationV1 {
            source_id: source_id.to_string(),
            independence_group: self.reconciliation_independence_group(),
            observed_at: input.now,
            outcome: view.outcome,
            block_ref: view.slot.map(|slot| slot.to_string()),
            confirmations: None,
            reason: view.reason.map(str::to_string),
        };
        let mut observations = vec![observation(SOLANA_SIGNATURE_STATUS_SOURCE_ID, primary)];
        if let Some(secondary) = secondary {
            observations.push(observation(SOLANA_TRANSACTION_SOURCE_ID, secondary));
        }
        Ok(WalletRefreshOutput {
            tx_hash: Some(signature.to_string()),
            observations,
        })
    }
}

/// What one reconciliation source concluded about a signature.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SourceView {
    outcome: WalletProviderObservationOutcomeV1,
    slot: Option<u64>,
    reason: Option<&'static str>,
}

impl SourceView {
    fn new(
        outcome: WalletProviderObservationOutcomeV1,
        slot: Option<u64>,
        reason: Option<&'static str>,
    ) -> Self {
        Self {
            outcome,
            slot,
            reason,
        }
    }
}

/// Cross-checks a terminal signature status (finalized or failed) against `getTransaction`:
/// both must report the same slot (when both know it) and the same error state, otherwise the
/// primary view is downgraded to pending and the disagreement is recorded.
fn reconcile_terminal_status(
    status: &SolanaSignatureStatus,
    details: Option<&SolanaTransactionDetails>,
) -> (SourceView, Option<SourceView>) {
    use WalletProviderObservationOutcomeV1 as Outcome;
    let Some(details) = details else {
        return (
            SourceView::new(
                Outcome::Pending,
                status.slot,
                Some("transaction lookup does not know the finalized signature"),
            ),
            Some(SourceView::new(Outcome::NotFound, None, None)),
        );
    };
    let same_slot = match (status.slot, details.slot) {
        (Some(status_slot), Some(details_slot)) => status_slot == details_slot,
        _ => true,
    };
    if !same_slot || details.failed != status.failed {
        return (
            SourceView::new(
                Outcome::Pending,
                status.slot,
                Some("transaction lookup disagrees with the signature status"),
            ),
            Some(SourceView::new(Outcome::Pending, details.slot, None)),
        );
    }
    let (outcome, reason) = if status.failed {
        (Outcome::Failed, Some("transaction landed with an error"))
    } else {
        (Outcome::Confirmed, None)
    };
    (
        SourceView::new(outcome, status.slot, reason),
        Some(SourceView::new(outcome, details.slot.or(status.slot), None)),
    )
}

/// Restore discovery input, prepared on the router thread: every candidate account of the
/// derivation profile up to [`SOLANA_ACCOUNT_DISCOVERY_CAP`] with its public address.
struct AccountDiscoveryPlan {
    wallet_id: String,
    network: WalletNetwork,
    existing_indices: BTreeSet<u32>,
    candidates: Vec<(u32, String)>,
    now: u64,
}

impl AccountDiscoveryPlan {
    fn for_wallet(input: &WalletBalanceInput) -> Result<Self, WalletChainError> {
        let WalletAccountMeta::Derived(meta) = &input.account else {
            return Err(WalletChainError::unsupported_account_model(
                "Solana restore discovery requires a derived account",
            ));
        };
        let root = input
            .secret
            .as_ref()
            .and_then(super::SecretPayloadV1::wallet_root)
            .ok_or_else(|| {
                WalletChainError::internal("Solana discovery requires HD secret material")
            })?;
        let hd_input = hd_input_for_account(meta, root)?;
        ensure_hd_input(&hd_input)?;
        let seed = hd_seed(&hd_input)?;
        let candidates = (0..SOLANA_ACCOUNT_DISCOVERY_CAP)
            .map(|account_index| {
                let signing_key = signing_key_from_seed(seed.as_slice(), account_index)?;
                Ok((account_index, address_from_signing_key(&signing_key)))
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

/// BIP44-style account discovery with a gap of one: probe `m/44'/501'/<i>'/0'` from index 0,
/// keep going while the account holds lamports or has at least one signature in its history,
/// and stop at the first unused index or at the cap. Accounts the wallet already has are never
/// re-created; index 0 exists before discovery runs and is always kept.
fn discover_accounts(
    provider: &dyn SolanaProvider,
    plan: AccountDiscoveryPlan,
) -> Result<Vec<WalletProfileAccountMaterialization>, WalletChainError> {
    let mut discovered = Vec::new();
    for (account_index, address) in plan.candidates {
        let used = provider.balance(&address).map_err(provider_error)? > 0
            || !provider
                .signatures_for_address(&address, 1, None)
                .map_err(provider_error)?
                .is_empty();
        if !used {
            break;
        }
        if plan.existing_indices.contains(&account_index) {
            continue;
        }
        discovered.push(WalletProfileAccountMaterialization {
            account: derived_account_meta(
                plan.wallet_id.clone(),
                plan.network.clone(),
                account_index,
                address,
                plan.now,
            ),
            addresses: Vec::new(),
        });
    }
    Ok(discovered)
}

/// Compute Budget instructions prepended to the transfer for the selected fee tier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ComputeBudget {
    unit_limit: u32,
    /// Micro-lamports per compute unit.
    unit_price: u64,
}

impl ComputeBudget {
    /// Lamports the runtime charges on top of the base fee: `ceil(limit × price / 10^6)`.
    fn priority_fee_lamports(self) -> u64 {
        let micro = u128::from(self.unit_limit) * u128::from(self.unit_price);
        u64::try_from(micro.div_ceil(1_000_000)).unwrap_or(u64::MAX)
    }
}

/// Fee tier → compute unit price (micro-lamports per CU) from the recent prioritization fees:
/// `slow` takes the 25th percentile, `standard` the median and `fast` the 75th percentile of the
/// per-slot minimums, each with its own floor (0 / 1 000 / 10 000) and the common cap
/// [`SOLANA_MAX_COMPUTE_UNIT_PRICE`]. An empty sample yields the floor.
fn compute_unit_price_for_tier(tier: &WalletFeeTier, recent_fees: &[u64]) -> u64 {
    let (percentile, floor) = match tier {
        WalletFeeTier::Slow => (25, 0),
        WalletFeeTier::Standard => (50, 1_000),
        WalletFeeTier::Fast => (75, 10_000),
    };
    let mut sorted = recent_fees.to_vec();
    sorted.sort_unstable();
    let sampled = if sorted.is_empty() {
        0
    } else {
        sorted[(sorted.len() - 1) * percentile / 100]
    };
    sampled.max(floor).min(SOLANA_MAX_COMPUTE_UNIT_PRICE)
}

/// Accounts a transfer write-locks, passed to `getRecentPrioritizationFees`.
fn fee_accounts<'a>(from: &'a str, to: &'a str) -> Vec<&'a str> {
    if from == to {
        vec![from]
    } else {
        vec![from, to]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SolanaPreparedPayloadV1 {
    kind: String,
    account_id: String,
    from: String,
    to: String,
    lamports: String,
    fee: String,
    fee_tier: WalletFeeTier,
    recent_blockhash: String,
    last_valid_block_height: u64,
    compute_unit_limit: u32,
    /// Micro-lamports per compute unit.
    compute_unit_price: u64,
}

fn ensure_network(network: &WalletNetwork) -> Result<(), WalletChainError> {
    if network.as_str() != SOLANA_NETWORK {
        return Err(WalletChainError::unsupported_chain(
            "Solana profile supports mainnet-beta only",
        ));
    }
    Ok(())
}

fn ensure_hd_input(input: &WalletHdAccountMaterializeInput) -> Result<(), WalletChainError> {
    ensure_network(&input.network)?;
    if input.scheme != AccountScheme::SolanaBip44Account {
        return Err(WalletChainError::unsupported_account_model(
            "Solana HD account scheme mismatch",
        ));
    }
    input.scheme.ensure_compatible(&input.root)
}

fn derivation_path(account_index: u32) -> String {
    format!("m/44'/501'/{account_index}'/0'")
}

fn materialize_hd_account(
    input: &WalletHdAccountMaterializeInput,
) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
    let signing_key = derive_hd_signing_key(input)?;
    let address = address_from_signing_key(&signing_key);
    Ok(WalletProfileAccountMaterialization {
        account: derived_account_meta(
            input.wallet_id.clone(),
            input.network.clone(),
            input.account_index,
            address,
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
    now: u64,
) -> WalletAccountMeta {
    let mut meta = super::derived_account_meta(
        wallet_id,
        network,
        AccountScheme::SolanaBip44Account,
        account_index,
        now,
    );
    meta.label = Some(format!("Solana account {}", account_index + 1));
    meta.address = Some(address.clone());
    meta.raw_account = Some(address.clone());
    meta.public_key = Some(address);
    meta.derivation_path = Some(derivation_path(account_index));
    WalletAccountMeta::Derived(meta)
}

fn derive_hd_signing_key(
    input: &WalletHdAccountMaterializeInput,
) -> Result<SigningKey, WalletChainError> {
    signing_key_from_seed(hd_seed(input)?.as_slice(), input.account_index)
}

fn hd_seed(
    input: &WalletHdAccountMaterializeInput,
) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
    input.root.bip39_seed()
}

fn signing_key_from_seed(seed: &[u8], account_index: u32) -> Result<SigningKey, WalletChainError> {
    let signing_seed = slip10_ed25519_derive(
        seed,
        &[
            SOLANA_SLIP10_PURPOSE,
            SOLANA_SLIP10_COIN,
            account_index,
            SOLANA_SLIP10_CHANGE,
        ],
    )?;
    Ok(SigningKey::from_bytes(&signing_seed))
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

fn signing_key_for_account(
    account: &WalletAccountMeta,
    payload: &super::SecretPayloadV1,
) -> Result<SigningKey, WalletChainError> {
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
                    "Solana imported account secret mismatch",
                ));
            };
            ensure_network(network)?;
            parse_imported_key(curve, private_key, encoding)
        }
        WalletAccountMeta::Derived(meta) => {
            let root = payload.wallet_root().ok_or_else(|| {
                WalletChainError::internal("Solana derived account requires HD root")
            })?;
            if meta.account_index.is_none() {
                return Err(WalletChainError::invalid_input(
                    "Solana account_index missing",
                ));
            }
            let input = hd_input_for_account(meta, root)?;
            ensure_hd_input(&input)?;
            derive_hd_signing_key(&input)
        }
    }
}

/// VR-234-003: `curve=ed25519` with a Phantom-compatible `base58_keypair` export (64 bytes,
/// secret seed followed by the public key, which must match the seed). A raw 32-byte `hex`
/// seed is also accepted.
fn parse_imported_key(
    curve: &str,
    private_key: &str,
    encoding: &str,
) -> Result<SigningKey, WalletChainError> {
    if curve != "ed25519" {
        return Err(WalletChainError::invalid_input(
            "Solana imported account requires curve=ed25519",
        ));
    }
    let bytes = Zeroizing::new(match encoding {
        "base58_keypair" => base58::decode(private_key.trim()).map_err(|error| {
            WalletChainError::invalid_input(format!("invalid Solana base58 keypair: {error}"))
        })?,
        "hex" => parse_hex(private_key.trim())?,
        _ => {
            return Err(WalletChainError::invalid_input(
                "Solana imported account requires encoding=base58_keypair or hex",
            ))
        }
    });
    let mut seed = Zeroizing::new([0u8; PUBKEY_LEN]);
    match (encoding, bytes.len()) {
        ("base58_keypair", 64) => {
            seed.copy_from_slice(&bytes[..PUBKEY_LEN]);
            let signing_key = SigningKey::from_bytes(&seed);
            if signing_key.verifying_key().as_bytes() != &bytes[PUBKEY_LEN..] {
                return Err(WalletChainError::invalid_input(
                    "Solana keypair public key does not match its secret key",
                ));
            }
            Ok(signing_key)
        }
        ("hex", 32) => {
            seed.copy_from_slice(&bytes);
            Ok(SigningKey::from_bytes(&seed))
        }
        ("base58_keypair", _) => Err(WalletChainError::invalid_input(
            "Solana base58 keypair must contain 64 bytes",
        )),
        _ => Err(WalletChainError::invalid_input(
            "Solana hex secret key must contain 32 bytes",
        )),
    }
}

fn address_from_signing_key(signing_key: &SigningKey) -> String {
    base58::encode(signing_key.verifying_key().as_bytes())
}

fn account_address(account: &WalletAccountMeta) -> Result<&str, WalletChainError> {
    match account {
        WalletAccountMeta::Imported(meta) => Ok(&meta.address),
        WalletAccountMeta::Derived(meta) => meta
            .address
            .as_deref()
            .ok_or_else(|| WalletChainError::invalid_input("Solana account missing address")),
    }
}

/// Decodes a base58 32-byte public key; other chains' address formats fail here, which is what
/// `wallet:address:detect` relies on.
fn decode_pubkey(address: &str) -> Result<[u8; PUBKEY_LEN], WalletChainError> {
    let trimmed = address.trim();
    if trimmed.is_empty() {
        return Err(WalletChainError::invalid_address(
            "Solana address is required",
        ));
    }
    let bytes = base58::decode(trimmed).map_err(|error| {
        WalletChainError::invalid_address(format!("Solana address is not base58: {error}"))
    })?;
    <[u8; PUBKEY_LEN]>::try_from(bytes)
        .map_err(|_| WalletChainError::invalid_address("Solana address must decode to 32 bytes"))
}

fn normalize_address(address: &str) -> Result<String, WalletChainError> {
    Ok(base58::encode(&decode_pubkey(address)?))
}

fn decode_blockhash(blockhash: &str) -> Result<[u8; 32], WalletChainError> {
    let bytes = base58::decode(blockhash.trim()).map_err(|error| {
        WalletChainError::preparation_stale(format!("Solana blockhash is not base58: {error}"))
    })?;
    <[u8; 32]>::try_from(bytes)
        .map_err(|_| WalletChainError::preparation_stale("Solana blockhash must be 32 bytes"))
}

/// VR-234-005: a non-empty ASCII decimal lamport integer within `u64`.
pub fn parse_lamports(value: &str) -> Result<u64, WalletChainError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(WalletChainError::invalid_input(
            "Solana amount must be an unsigned lamport integer",
        ));
    }
    value
        .parse::<u64>()
        .map_err(|_| WalletChainError::invalid_input("Solana amount exceeds u64 lamports"))
}

fn last_valid_block_height(submit_metadata: Option<&Value>) -> Option<u64> {
    submit_metadata?
        .get("last_valid_block_height")
        .and_then(Value::as_u64)
}

fn ensure_blockhash_valid(
    provider: &dyn SolanaProvider,
    last_valid_block_height: u64,
    message: &str,
) -> Result<(), WalletChainError> {
    if provider.block_height().map_err(provider_error)? > last_valid_block_height {
        return Err(WalletChainError::preparation_stale(message));
    }
    Ok(())
}

fn provider_error(error: SolanaProviderError) -> WalletChainError {
    match error.kind {
        SolanaProviderErrorKind::Unavailable => WalletChainError::provider_unavailable(),
        SolanaProviderErrorKind::Rejected => WalletChainError::broadcast_rejected(error.message),
        SolanaProviderErrorKind::Unknown => WalletChainError::broadcast_unknown(error.message),
    }
}

/// Folds a signature and its `getTransaction` details into the account's view.
///
/// The lamport delta is `postBalances - preBalances` at the account's index in `accountKeys`;
/// a negative delta is a send (the fee is charged only when the account is the fee payer, index
/// 0, and is excluded from `amount`), a positive one a receive. The counterparty is the key with
/// the largest opposite delta. `finalized` alone marks the entry confirmed (FR-234-016). Without
/// details the entry stays direction-unknown with a zero amount so the journal keeps whatever the
/// wallet already recorded for that signature.
fn history_transaction(
    address: &str,
    info: SolanaSignatureInfo,
    details: Option<SolanaTransactionDetails>,
    now: u64,
) -> WalletHistoryTransaction {
    let failed = info.failed || details.as_ref().is_some_and(|details| details.failed);
    let status = if failed {
        WalletTxStatus::Failed
    } else if info.finalized {
        WalletTxStatus::Confirmed
    } else {
        WalletTxStatus::Pending
    };
    let block_time = details
        .as_ref()
        .and_then(|details| details.block_time)
        .or(info.block_time);
    let (direction, counterparty, amount, fee) = match details {
        Some(details) => account_delta(address, &details),
        None => (WalletTransactionDirection::Unknown, None, 0, 0),
    };
    WalletHistoryTransaction {
        tx_hash: info.signature,
        message_ref: None,
        status,
        direction,
        counterparty,
        amount: amount.to_string(),
        fee: fee.to_string(),
        created_at: block_time
            .map(|seconds| seconds.saturating_mul(1_000))
            .unwrap_or(now),
    }
}

fn account_delta(
    address: &str,
    details: &SolanaTransactionDetails,
) -> (WalletTransactionDirection, Option<String>, u64, u64) {
    let deltas = details
        .account_keys
        .iter()
        .zip(
            details
                .pre_balances
                .iter()
                .zip(details.post_balances.iter()),
        )
        .map(|(key, (pre, post))| (key.as_str(), i128::from(*post) - i128::from(*pre)))
        .collect::<Vec<_>>();
    let Some(index) = deltas.iter().position(|(key, _)| *key == address) else {
        return (WalletTransactionDirection::Unknown, None, 0, 0);
    };
    let delta = deltas[index].1;
    let fee = if index == 0 { details.fee } else { 0 };
    let counterparty = |outgoing: bool| {
        deltas
            .iter()
            .enumerate()
            .filter(|(position, (_, delta))| {
                *position != index && if outgoing { *delta > 0 } else { *delta < 0 }
            })
            .max_by_key(|(_, (_, delta))| delta.unsigned_abs())
            .map(|(_, (key, _))| (*key).to_string())
    };
    if delta < 0 {
        let debit = u64::try_from(delta.unsigned_abs()).unwrap_or(u64::MAX);
        (
            WalletTransactionDirection::Outgoing,
            counterparty(true),
            debit.saturating_sub(fee),
            fee,
        )
    } else if delta > 0 {
        (
            WalletTransactionDirection::Incoming,
            counterparty(false),
            u64::try_from(delta).unwrap_or(u64::MAX),
            0,
        )
    } else {
        (WalletTransactionDirection::Unknown, None, 0, fee)
    }
}

/// Serializes a legacy Solana message with one System Program transfer, preceded by the two
/// Compute Budget instructions (`SetComputeUnitLimit`, `SetComputeUnitPrice`) when a budget is
/// given.
///
/// Layout: header `[signatures, readonly signed, readonly unsigned]`, compact array of account
/// keys (payer, destination, then the read-only programs), recent blockhash, compact array of
/// compiled instructions. Account keys are unique, so a self-transfer references the payer twice
/// instead of listing it twice.
fn build_transfer_message(
    from: &str,
    to: &str,
    recent_blockhash: &[u8; 32],
    lamports: u64,
    compute_budget: Option<ComputeBudget>,
) -> Result<Vec<u8>, WalletChainError> {
    let payer = decode_pubkey(from)?;
    let destination = decode_pubkey(to)?;
    let mut account_keys: Vec<[u8; PUBKEY_LEN]> = vec![payer];
    let destination_index = if destination == payer {
        0
    } else {
        account_keys.push(destination);
        1
    };
    account_keys.push(SYSTEM_PROGRAM_KEY);
    let system_program_index = (account_keys.len() - 1) as u8;
    let compute_budget_program_index = compute_budget.map(|_| {
        account_keys.push(COMPUTE_BUDGET_PROGRAM_KEY);
        (account_keys.len() - 1) as u8
    });
    let readonly_unsigned = if compute_budget.is_some() { 2 } else { 1 };

    let mut message = Vec::with_capacity(3 + 1 + account_keys.len() * PUBKEY_LEN + 32 + 40);
    message.push(1); // num_required_signatures: the fee payer
    message.push(0); // num_readonly_signed_accounts
    message.push(readonly_unsigned); // num_readonly_unsigned_accounts: the programs
    push_shortvec_len(&mut message, account_keys.len());
    for key in &account_keys {
        message.extend_from_slice(key);
    }
    message.extend_from_slice(recent_blockhash);
    push_shortvec_len(&mut message, if compute_budget.is_some() { 3 } else { 1 });
    if let (Some(budget), Some(program_index)) = (compute_budget, compute_budget_program_index) {
        message.push(program_index);
        push_shortvec_len(&mut message, 0);
        push_shortvec_len(&mut message, 5);
        message.push(COMPUTE_BUDGET_SET_UNIT_LIMIT);
        message.extend_from_slice(&budget.unit_limit.to_le_bytes());
        message.push(program_index);
        push_shortvec_len(&mut message, 0);
        push_shortvec_len(&mut message, 9);
        message.push(COMPUTE_BUDGET_SET_UNIT_PRICE);
        message.extend_from_slice(&budget.unit_price.to_le_bytes());
    }
    message.push(system_program_index);
    push_shortvec_len(&mut message, 2);
    message.push(0);
    message.push(destination_index);
    push_shortvec_len(&mut message, 12);
    message.extend_from_slice(&SYSTEM_TRANSFER_INSTRUCTION.to_le_bytes());
    message.extend_from_slice(&lamports.to_le_bytes());
    if 1 + SIGNATURE_LEN + message.len() > MAX_TRANSACTION_BYTES {
        return Err(WalletChainError::internal(
            "Solana transfer message exceeds the packet size",
        ));
    }
    Ok(message)
}

/// `ComputeBudget111111111111111111111111111111` decoded (base58, 32 bytes).
const COMPUTE_BUDGET_PROGRAM_KEY: [u8; PUBKEY_LEN] = [
    0x03, 0x06, 0x46, 0x6f, 0xe5, 0x21, 0x17, 0x32, 0xff, 0xec, 0xad, 0xba, 0x72, 0xc3, 0x9b, 0xe7,
    0xbc, 0x8c, 0xe5, 0xbb, 0xc5, 0xf7, 0x12, 0x6b, 0x2c, 0x43, 0x9b, 0x3a, 0x40, 0x00, 0x00, 0x00,
];

/// Solana "compact-u16" (shortvec) length prefix: 7 bits per byte, high bit continues.
fn push_shortvec_len(out: &mut Vec<u8>, length: usize) {
    let mut remaining = length as u16;
    loop {
        let byte = (remaining & 0x7f) as u8;
        remaining >>= 7;
        if remaining == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::wallet::hex_string;

    struct MockProvider {
        balances: Mutex<Vec<(String, u64)>>,
        block_height: Mutex<u64>,
        sends: Mutex<Vec<String>>,
        send_outcome: Mutex<Option<SolanaProviderError>>,
        status: Mutex<Option<SolanaSignatureStatus>>,
    }

    impl MockProvider {
        fn new() -> Self {
            Self {
                balances: Mutex::new(Vec::new()),
                block_height: Mutex::new(100),
                sends: Mutex::new(Vec::new()),
                send_outcome: Mutex::new(None),
                status: Mutex::new(None),
            }
        }

        fn set_balance(&self, address: &str, lamports: u64) {
            self.balances
                .lock()
                .expect("balances")
                .push((address.to_string(), lamports));
        }
    }

    impl SolanaProvider for MockProvider {
        fn balance(&self, address: &str) -> Result<u64, SolanaProviderError> {
            Ok(self
                .balances
                .lock()
                .expect("balances")
                .iter()
                .rev()
                .find(|(known, _)| known == address)
                .map(|(_, lamports)| *lamports)
                .unwrap_or(0))
        }

        fn latest_blockhash(&self) -> Result<SolanaBlockhash, SolanaProviderError> {
            Ok(SolanaBlockhash {
                blockhash: base58::encode(&[7u8; 32]),
                last_valid_block_height: 250,
            })
        }

        fn block_height(&self) -> Result<u64, SolanaProviderError> {
            Ok(*self.block_height.lock().expect("height"))
        }

        fn minimum_balance_for_rent_exemption(
            &self,
            _data_len: u64,
        ) -> Result<u64, SolanaProviderError> {
            Ok(890_880)
        }

        fn fee_for_message(&self, _message_base64: &str) -> Result<u64, SolanaProviderError> {
            Ok(5_000)
        }

        fn recent_prioritization_fees(
            &self,
            _addresses: &[&str],
        ) -> Result<Vec<u64>, SolanaProviderError> {
            Ok(vec![0, 0, 2_000, 5_000, 40_000])
        }

        fn send_transaction(
            &self,
            transaction_base64: &str,
        ) -> Result<String, SolanaProviderError> {
            self.sends
                .lock()
                .expect("sends")
                .push(transaction_base64.to_string());
            if let Some(error) = self.send_outcome.lock().expect("outcome").clone() {
                return Err(error);
            }
            let bytes = BASE64_STANDARD
                .decode(transaction_base64)
                .map_err(|error| SolanaProviderError::rejected(error.to_string()))?;
            Ok(base58::encode(&bytes[1..1 + SIGNATURE_LEN]))
        }

        fn signature_status(
            &self,
            _signature: &str,
        ) -> Result<Option<SolanaSignatureStatus>, SolanaProviderError> {
            Ok(self.status.lock().expect("status").clone())
        }
    }

    fn imported_input(private_key: &str, encoding: &str) -> WalletImportedAccountMaterializeInput {
        WalletImportedAccountMaterializeInput {
            wallet_id: "wallet".to_string(),
            account_id: "account".to_string(),
            network: WalletNetwork::from(SOLANA_NETWORK),
            label: "Solana".to_string(),
            curve: "ed25519".to_string(),
            private_key: private_key.to_string(),
            encoding: encoding.to_string(),
            now: 1,
        }
    }

    fn keypair_base58(seed: [u8; 32]) -> String {
        let signing_key = SigningKey::from_bytes(&seed);
        base58::encode(&signing_key.to_keypair_bytes())
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
            let materialized = SolanaChainProfile::unavailable()
                .materialize_hd_account(WalletHdAccountMaterializeInput {
                    wallet_id: "wallet".to_string(),
                    network: WalletNetwork::from(SOLANA_NETWORK),
                    account_index: 0,
                    root,
                    ton_signing,
                    scheme: AccountScheme::SolanaBip44Account,
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
    fn shortvec_encodes_like_solana() {
        let encode = |length: usize| {
            let mut out = Vec::new();
            push_shortvec_len(&mut out, length);
            out
        };
        assert_eq!(encode(0), [0x00]);
        assert_eq!(encode(1), [0x01]);
        assert_eq!(encode(127), [0x7f]);
        assert_eq!(encode(128), [0x80, 0x01]);
        assert_eq!(encode(16_383), [0xff, 0x7f]);
    }

    #[test]
    fn compute_budget_program_key_matches_its_base58_id() {
        assert_eq!(
            base58::encode(&COMPUTE_BUDGET_PROGRAM_KEY),
            SOLANA_COMPUTE_BUDGET_PROGRAM_ID
        );
    }

    #[test]
    fn compute_unit_price_follows_tier_percentiles_with_floor_and_cap() {
        let fees = [0, 0, 2_000, 5_000, 40_000];
        assert_eq!(compute_unit_price_for_tier(&WalletFeeTier::Slow, &fees), 0);
        assert_eq!(
            compute_unit_price_for_tier(&WalletFeeTier::Standard, &fees),
            2_000
        );
        assert_eq!(
            compute_unit_price_for_tier(&WalletFeeTier::Fast, &fees),
            10_000,
            "fast floor beats the 75th percentile (5 000)"
        );
        assert_eq!(
            compute_unit_price_for_tier(&WalletFeeTier::Standard, &[]),
            1_000,
            "an empty sample yields the floor"
        );
        assert_eq!(
            compute_unit_price_for_tier(&WalletFeeTier::Fast, &[u64::MAX, u64::MAX]),
            SOLANA_MAX_COMPUTE_UNIT_PRICE
        );
        let budget = ComputeBudget {
            unit_limit: SOLANA_TRANSFER_COMPUTE_UNIT_LIMIT,
            unit_price: 2_500,
        };
        assert_eq!(
            budget.priority_fee_lamports(),
            3,
            "ceil(1000 × 2500 / 10^6)"
        );
        assert_eq!(
            ComputeBudget {
                unit_limit: SOLANA_TRANSFER_COMPUTE_UNIT_LIMIT,
                unit_price: SOLANA_MAX_COMPUTE_UNIT_PRICE,
            }
            .priority_fee_lamports(),
            10_000
        );
    }

    #[test]
    fn terminal_status_needs_the_transaction_lookup_to_agree() {
        use WalletProviderObservationOutcomeV1 as Outcome;
        let finalized = SolanaSignatureStatus {
            finalized: true,
            failed: false,
            slot: Some(50),
        };
        let details = |slot: Option<u64>, failed: bool| SolanaTransactionDetails {
            slot,
            block_time: None,
            fee: 5_000,
            failed,
            account_keys: Vec::new(),
            pre_balances: Vec::new(),
            post_balances: Vec::new(),
        };
        let (primary, secondary) =
            reconcile_terminal_status(&finalized, Some(&details(Some(50), false)));
        assert_eq!(primary.outcome, Outcome::Confirmed);
        assert_eq!(secondary.expect("secondary").outcome, Outcome::Confirmed);
        // The lookup misses the signature: not confirmed, recorded as not found there.
        let (primary, secondary) = reconcile_terminal_status(&finalized, None);
        assert_eq!(primary.outcome, Outcome::Pending);
        assert_eq!(secondary.expect("secondary").outcome, Outcome::NotFound);
        // Slot or error mismatch: pending until the sources agree.
        let (primary, _) = reconcile_terminal_status(&finalized, Some(&details(Some(51), false)));
        assert_eq!(primary.outcome, Outcome::Pending);
        let (primary, _) = reconcile_terminal_status(&finalized, Some(&details(Some(50), true)));
        assert_eq!(primary.outcome, Outcome::Pending);
        let (primary, _) = reconcile_terminal_status(&finalized, Some(&details(None, false)));
        assert_eq!(
            primary.outcome,
            Outcome::Confirmed,
            "unknown slot is not a mismatch"
        );
        let failed = SolanaSignatureStatus {
            finalized: true,
            failed: true,
            slot: Some(50),
        };
        let (primary, secondary) =
            reconcile_terminal_status(&failed, Some(&details(Some(50), true)));
        assert_eq!(primary.outcome, Outcome::Failed);
        assert_eq!(secondary.expect("secondary").outcome, Outcome::Failed);
    }

    #[test]
    fn system_program_id_is_the_zero_key() {
        assert_eq!(
            base58::encode(&SYSTEM_PROGRAM_KEY),
            SOLANA_SYSTEM_PROGRAM_ID
        );
        assert_eq!(
            normalize_address(SOLANA_SYSTEM_PROGRAM_ID).expect("system program"),
            SOLANA_SYSTEM_PROGRAM_ID
        );
    }

    #[test]
    fn normalize_address_rejects_other_chain_formats() {
        for foreign in [
            "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
            "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
            "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
            "EQC-Ip06mEnUpcEN-VCDk3MIKwbnv6QhOLh4yGJHyZi0HcrD",
            "",
        ] {
            assert!(normalize_address(foreign).is_err(), "{foreign}");
        }
        let address = base58::encode(&[9u8; 32]);
        assert_eq!(
            normalize_address(&format!("  {address} ")).expect("valid"),
            address
        );
    }

    #[test]
    fn history_transaction_derives_delta_fee_counterparty_and_status() {
        let ours = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
        let other = "3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E";
        let info = |signature: &str, failed: bool, finalized: bool| SolanaSignatureInfo {
            signature: signature.to_string(),
            slot: Some(48),
            block_time: Some(1_710_000_000),
            failed,
            finalized,
        };
        let outgoing = history_transaction(
            ours,
            info("sig-out", false, true),
            Some(SolanaTransactionDetails {
                slot: Some(48),
                block_time: Some(1_710_000_001),
                fee: 5_000,
                failed: false,
                account_keys: vec![
                    ours.to_string(),
                    other.to_string(),
                    SOLANA_SYSTEM_PROGRAM_ID.to_string(),
                ],
                pre_balances: vec![1_000_000, 0, 1],
                post_balances: vec![895_000, 100_000, 1],
            }),
            7,
        );
        assert_eq!(outgoing.direction, WalletTransactionDirection::Outgoing);
        assert_eq!(outgoing.counterparty.as_deref(), Some(other));
        assert_eq!(outgoing.amount, "100000");
        assert_eq!(outgoing.fee, "5000");
        assert_eq!(outgoing.status, WalletTxStatus::Confirmed);
        assert_eq!(outgoing.created_at, 1_710_000_001_000);

        let incoming = history_transaction(
            ours,
            info("sig-in", false, false),
            Some(SolanaTransactionDetails {
                slot: Some(49),
                block_time: None,
                fee: 5_000,
                failed: false,
                account_keys: vec![other.to_string(), ours.to_string()],
                pre_balances: vec![500_000, 10],
                post_balances: vec![245_000, 250_010],
            }),
            7,
        );
        assert_eq!(incoming.direction, WalletTransactionDirection::Incoming);
        assert_eq!(incoming.counterparty.as_deref(), Some(other));
        assert_eq!(incoming.amount, "250000");
        assert_eq!(incoming.fee, "0");
        assert_eq!(incoming.status, WalletTxStatus::Pending);
        assert_eq!(incoming.created_at, 1_710_000_000_000);

        // A failed send only burns the fee: no amount, no counterparty.
        let failed = history_transaction(
            ours,
            info("sig-failed", true, true),
            Some(SolanaTransactionDetails {
                slot: Some(50),
                block_time: Some(1),
                fee: 5_000,
                failed: true,
                account_keys: vec![ours.to_string(), other.to_string()],
                pre_balances: vec![1_000_000, 0],
                post_balances: vec![995_000, 0],
            }),
            7,
        );
        assert_eq!(failed.status, WalletTxStatus::Failed);
        assert_eq!(failed.direction, WalletTransactionDirection::Outgoing);
        assert_eq!(failed.amount, "0");
        assert_eq!(failed.fee, "5000");
        assert_eq!(failed.counterparty, None);

        // Missing details keep the entry neutral so the journal's own record wins on merge.
        let unknown = history_transaction(ours, info("sig-unknown", false, false), None, 7);
        assert_eq!(unknown.direction, WalletTransactionDirection::Unknown);
        assert_eq!(unknown.amount, "0");
        assert_eq!(unknown.tx_hash, "sig-unknown");
    }

    #[test]
    fn lamport_parsing_is_strict() {
        assert_eq!(parse_lamports("0").expect("zero"), 0);
        assert_eq!(
            parse_lamports("18446744073709551615").expect("max"),
            u64::MAX
        );
        assert!(parse_lamports("18446744073709551616").is_err());
        assert!(parse_lamports("").is_err());
        assert!(parse_lamports("1.5").is_err());
        assert!(parse_lamports("-1").is_err());
    }

    #[test]
    fn imported_keypair_round_trips_and_rejects_mismatched_public_half() {
        let profile = SolanaChainProfile::unavailable();
        let seed = [3u8; 32];
        let expected = address_from_signing_key(&SigningKey::from_bytes(&seed));
        let account = profile
            .materialize_imported_account(imported_input(&keypair_base58(seed), "base58_keypair"))
            .expect("materialize")
            .account;
        assert_eq!(account_address(&account).expect("address"), expected);
        let hex_account = profile
            .materialize_imported_account(imported_input(&hex_string(&seed), "hex"))
            .expect("hex materialize")
            .account;
        assert_eq!(account_address(&hex_account).expect("address"), expected);

        let mut mismatched = SigningKey::from_bytes(&seed).to_keypair_bytes();
        mismatched[63] ^= 0x01;
        let error = profile
            .materialize_imported_account(imported_input(
                &base58::encode(&mismatched),
                "base58_keypair",
            ))
            .expect_err("mismatched keypair");
        assert_eq!(error.code, super::super::WalletChainErrorCode::InvalidInput);
        assert!(profile
            .materialize_imported_account(imported_input(&hex_string(&seed), "base64"))
            .is_err());
        let mut wrong_curve = imported_input(&keypair_base58(seed), "base58_keypair");
        wrong_curve.curve = "secp256k1".to_string();
        assert!(profile.materialize_imported_account(wrong_curve).is_err());
    }

    #[test]
    fn solana_profile_is_manifest_gated_and_signs_system_transfer() {
        let provider = Arc::new(MockProvider::new());
        let profile = SolanaChainProfile::new(provider.clone());
        let mut config = WalletRuntimeConfig::with_wallet_enabled(true);
        assert!(!profile.is_enabled(&config));
        config
            .enabled_capabilities
            .insert(SOLANA_NATIVE_TRANSFER_CAPABILITY.to_string());
        assert!(profile.is_enabled(&config));

        let seed = [5u8; 32];
        let account = profile
            .materialize_imported_account(imported_input(&keypair_base58(seed), "base58_keypair"))
            .expect("materialize")
            .account;
        let from = account_address(&account).expect("address").to_string();
        provider.set_balance(&from, 1_000_000_000);
        let destination = base58::encode(&[11u8; 32]);
        let prepare_input = |amount: &str, maximize: Option<usize>| WalletPrepareInput {
            account: account.clone(),
            wallet_accounts: vec![account.clone()],
            allocated_addresses: Vec::new(),
            live_preparations: Vec::new(),
            secret: None,
            outputs: vec![WalletTransactionOutput {
                address: destination.clone(),
                amount: amount.to_string(),
                comment: None,
            }],
            fee_tier: WalletFeeTier::Standard,
            maximize_output_index: maximize,
            now: 1,
        };
        let prepared = profile
            .prepare(prepare_input("100000", None))
            .expect("prepare");
        // Base fee 5 000 + ceil(1 000 CU × 2 000 µL (standard = median) / 10^6) = 2 lamports.
        assert_eq!(prepared.preview.estimated_fee, "5002");
        assert_eq!(prepared.preview.total_debit, "105002");
        assert_eq!(
            prepared.valid_until,
            Some(1 + (250 - 100) * SOLANA_BLOCK_TIME_ESTIMATE_MS)
        );
        assert_eq!(
            prepared.preview.warnings[0].code,
            SOLANA_DESTINATION_NOT_RENT_EXEMPT_WARNING
        );
        let solana = prepared.preview.solana.clone().expect("solana preview");
        assert_eq!(solana.last_valid_block_height, 250);
        assert_eq!(solana.destination_rent_exempt_minimum, "890880");

        let rent_exempt = profile
            .prepare(prepare_input("890880", None))
            .expect("prepare rent exempt");
        assert!(rent_exempt.preview.warnings.is_empty());
        let maxed = profile
            .prepare(prepare_input("1", Some(0)))
            .expect("prepare max");
        assert_eq!(maxed.preview.outputs[0].amount, "999994998");
        assert_eq!(maxed.preview.total_debit, "1000000000");
        assert!(profile.prepare(prepare_input("1000000000", None)).is_err());
        assert!(profile.prepare(prepare_input("0", None)).is_err());

        let signed = profile
            .sign_prepared(WalletSignInput {
                account: account.clone(),
                preparation_id: "preparation".to_string(),
                canonical_payload: Zeroizing::new(prepared.canonical_payload),
                provider_snapshot: prepared.provider_snapshot,
                signing_secret: super::super::SecretPayloadV1::ImportedKey {
                    network: WalletNetwork::from(SOLANA_NETWORK),
                    curve: "ed25519".to_string(),
                    private_key: keypair_base58(seed),
                    encoding: "base58_keypair".to_string(),
                },
            })
            .expect("sign");
        let transaction = BASE64_STANDARD
            .decode(signed.signed_artifact.as_str())
            .expect("base64 transaction");
        assert_eq!(transaction[0], 1, "one signature");
        let signature = &transaction[1..65];
        assert_eq!(
            signed.tx_hash.as_deref(),
            Some(base58::encode(signature).as_str())
        );
        let message = &transaction[65..];
        assert!(transaction.len() <= MAX_TRANSACTION_BYTES);
        assert_eq!(&message[..3], &[1, 0, 2], "two read-only programs");
        assert_eq!(message[3], 4, "four account keys");
        assert_eq!(
            &message[4..36],
            SigningKey::from_bytes(&seed).verifying_key().as_bytes()
        );
        assert_eq!(&message[36..68], &[11u8; 32]);
        assert_eq!(&message[68..100], &SYSTEM_PROGRAM_KEY);
        assert_eq!(&message[100..132], &COMPUTE_BUDGET_PROGRAM_KEY);
        assert_eq!(&message[132..164], &[7u8; 32], "recent blockhash");
        let mut expected = vec![3];
        // SetComputeUnitLimit(1_000)
        expected.extend_from_slice(&[3, 0, 5, 2, 0xe8, 0x03, 0, 0]);
        // SetComputeUnitPrice(2_000)
        expected.extend_from_slice(&[3, 0, 9, 3, 0xd0, 0x07, 0, 0, 0, 0, 0, 0]);
        // Transfer(100_000)
        expected.extend_from_slice(&[2, 2, 0, 1, 12, 2, 0, 0, 0, 160, 134, 1, 0, 0, 0, 0, 0]);
        assert_eq!(&message[164..], &expected[..]);
        let verifying_key = SigningKey::from_bytes(&seed).verifying_key();
        verifying_key
            .verify_strict(
                message,
                &ed25519_dalek::Signature::from_bytes(signature.try_into().expect("64 bytes")),
            )
            .expect("signature verifies over the message");

        let submitted = profile
            .submit_signed(WalletSubmitInput {
                account: account.clone(),
                preparation_id: "preparation".to_string(),
                signed_artifact: signed.clone(),
            })
            .expect("submit");
        assert_eq!(submitted.status, WalletConfirmStatus::Pending);
        assert_eq!(submitted.tx_hash, signed.tx_hash);
        assert_eq!(provider.sends.lock().expect("sends").len(), 1);

        *provider.send_outcome.lock().expect("outcome") =
            Some(SolanaProviderError::unknown("socket closed"));
        let unknown = profile
            .submit_signed(WalletSubmitInput {
                account: account.clone(),
                preparation_id: "preparation".to_string(),
                signed_artifact: signed.clone(),
            })
            .expect("unknown submit");
        assert_eq!(unknown.status, WalletConfirmStatus::BroadcastUnknown);

        *provider.block_height.lock().expect("height") = 251;
        let stale = profile
            .submit_signed(WalletSubmitInput {
                account,
                preparation_id: "preparation".to_string(),
                signed_artifact: signed,
            })
            .expect_err("expired blockhash");
        assert_eq!(
            stale.code,
            super::super::WalletChainErrorCode::PreparationStale
        );
    }
}
