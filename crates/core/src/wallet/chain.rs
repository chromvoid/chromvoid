use std::collections::BTreeSet;
use std::fmt;

use serde_json::Value;
use zeroize::Zeroizing;

use crate::rpc::types::{
    WalletAccountMeta, WalletBalance, WalletConfirmStatus, WalletFeeTier, WalletNetwork,
    WalletPreview, WalletProviderStatus, WalletTransactionDirection, WalletTransactionEntry,
    WalletTransactionOutput,
};

use super::error::WalletChainError;
use super::records::{
    AllocatedAddressV1, PreparationRecordV1, SecretPayloadV1, WalletProviderObservationV1,
    WalletTxStatus,
};

#[derive(Debug, Clone)]
pub struct WalletRuntimeConfig {
    pub wallet_enabled: bool,
    pub enabled_capabilities: BTreeSet<String>,
}

impl Default for WalletRuntimeConfig {
    fn default() -> Self {
        Self {
            wallet_enabled: false,
            enabled_capabilities: BTreeSet::from([
                "bitcoin_native_transfer".to_string(),
                "ton_native_transfer".to_string(),
            ]),
        }
    }
}

impl WalletRuntimeConfig {
    pub fn with_wallet_enabled(wallet_enabled: bool) -> Self {
        Self {
            wallet_enabled,
            ..Self::default()
        }
    }

    pub fn capability_enabled(&self, capability_id: &str) -> bool {
        self.enabled_capabilities.contains(capability_id)
    }
}

#[derive(Debug, Clone)]
pub struct WalletProfileAccountMaterialization {
    pub account: WalletAccountMeta,
    pub addresses: Vec<AllocatedAddressV1>,
}

#[derive(Debug, Clone)]
pub struct WalletHdAccountMaterializeInput {
    pub wallet_id: String,
    pub network: WalletNetwork,
    pub account_index: u32,
    pub wallet_mode: String,
    pub mnemonic_standard: String,
    pub mnemonic_entropy: String,
    pub mnemonic_words: Option<Vec<String>>,
    pub wordlist: String,
    pub bip39_passphrase: Option<String>,
    pub now: u64,
}

#[derive(Debug, Clone)]
pub struct WalletImportedAccountMaterializeInput {
    pub wallet_id: String,
    pub account_id: String,
    pub network: WalletNetwork,
    pub label: String,
    pub curve: String,
    pub private_key: String,
    pub encoding: String,
    pub now: u64,
}

#[derive(Debug, Clone)]
pub struct WalletAddressDeriveInput {
    pub account: WalletAccountMeta,
    pub secret: Option<SecretPayloadV1>,
    pub allocated_addresses: Vec<AllocatedAddressV1>,
    pub purpose: String,
    pub now: u64,
}

#[derive(Debug, Clone)]
pub struct WalletAddressDeriveOutput {
    pub response: crate::rpc::types::WalletAddressesDeriveResponse,
    pub account: WalletAccountMeta,
    pub address: AllocatedAddressV1,
}

#[derive(Debug, Clone)]
pub struct WalletBalanceInput {
    pub account: WalletAccountMeta,
    pub wallet_accounts: Vec<WalletAccountMeta>,
    pub allocated_addresses: Vec<AllocatedAddressV1>,
    pub secret: Option<SecretPayloadV1>,
    pub discover_addresses: bool,
    pub now: u64,
}

#[derive(Debug, Clone)]
pub struct WalletBalanceOutput {
    pub balance: WalletBalance,
    pub materializations: Vec<WalletProfileAccountMaterialization>,
}

pub type WalletBalanceTask =
    Box<dyn FnOnce() -> Result<WalletBalanceOutput, WalletChainError> + Send + 'static>;

impl WalletBalanceOutput {
    pub fn from_balance(balance: WalletBalance) -> Self {
        Self {
            balance,
            materializations: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct WalletHistoryInput {
    pub account: WalletAccountMeta,
    pub limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletHistoryTransaction {
    pub tx_hash: String,
    pub message_ref: Option<String>,
    pub status: WalletTxStatus,
    pub direction: WalletTransactionDirection,
    pub counterparty: Option<String>,
    pub amount: String,
    pub fee: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletHistoryOutput {
    pub transactions: Vec<WalletHistoryTransaction>,
}

pub type WalletHistoryTask =
    Box<dyn FnOnce() -> Result<WalletHistoryOutput, WalletChainError> + Send + 'static>;

#[derive(Debug, Clone)]
pub struct WalletPrepareInput {
    pub account: WalletAccountMeta,
    pub wallet_accounts: Vec<WalletAccountMeta>,
    pub allocated_addresses: Vec<AllocatedAddressV1>,
    pub live_preparations: Vec<PreparationRecordV1>,
    pub secret: Option<SecretPayloadV1>,
    pub outputs: Vec<WalletTransactionOutput>,
    pub fee_tier: WalletFeeTier,
    pub maximize_output_index: Option<usize>,
    pub now: u64,
}

#[derive(Clone)]
pub struct WalletPrepareOutput {
    pub preview: WalletPreview,
    pub provider_snapshot: Option<Value>,
    pub canonical_payload: String,
    pub materializations: Vec<WalletProfileAccountMaterialization>,
}

impl fmt::Debug for WalletPrepareOutput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletPrepareOutput")
            .field("preview", &self.preview)
            .field("provider_snapshot", &self.provider_snapshot)
            .field("canonical_payload", &"[redacted]")
            .finish()
    }
}

#[derive(Clone)]
pub struct WalletConfirmInput {
    pub account: WalletAccountMeta,
    pub preparation_id: String,
    pub canonical_payload: Zeroizing<String>,
    pub provider_snapshot: Option<Value>,
    pub signing_secret: SecretPayloadV1,
}

impl fmt::Debug for WalletConfirmInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletConfirmInput")
            .field("account", &self.account)
            .field("preparation_id", &self.preparation_id)
            .field("canonical_payload", &"[redacted]")
            .field("provider_snapshot", &self.provider_snapshot)
            .field("signing_secret", &self.signing_secret)
            .finish()
    }
}

#[derive(Debug, Clone)]
pub struct WalletConfirmOutput {
    pub status: WalletConfirmStatus,
    pub tx_hash: Option<String>,
    pub message_ref: Option<String>,
}

#[derive(Clone)]
pub struct WalletSignInput {
    pub account: WalletAccountMeta,
    pub preparation_id: String,
    pub canonical_payload: Zeroizing<String>,
    pub provider_snapshot: Option<Value>,
    pub signing_secret: SecretPayloadV1,
}

impl fmt::Debug for WalletSignInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletSignInput")
            .field("account", &self.account)
            .field("preparation_id", &self.preparation_id)
            .field("canonical_payload", &"[redacted]")
            .field("provider_snapshot", &self.provider_snapshot)
            .field("signing_secret", &self.signing_secret)
            .finish()
    }
}

#[derive(Clone)]
pub struct WalletSignedArtifact {
    pub signed_artifact: Zeroizing<String>,
    pub tx_hash: Option<String>,
    pub message_ref: Option<String>,
    pub submit_metadata: Option<Value>,
}

impl fmt::Debug for WalletSignedArtifact {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletSignedArtifact")
            .field("signed_artifact", &"[redacted]")
            .field("tx_hash", &self.tx_hash)
            .field("message_ref", &self.message_ref)
            .field("submit_metadata", &self.submit_metadata)
            .finish()
    }
}

#[derive(Clone)]
pub struct WalletSubmitInput {
    pub account: WalletAccountMeta,
    pub preparation_id: String,
    pub signed_artifact: WalletSignedArtifact,
}

impl fmt::Debug for WalletSubmitInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("WalletSubmitInput")
            .field("account", &self.account)
            .field("preparation_id", &self.preparation_id)
            .field("signed_artifact", &self.signed_artifact)
            .finish()
    }
}

#[derive(Debug, Clone)]
pub struct WalletSubmitOutput {
    pub status: WalletConfirmStatus,
    pub tx_hash: Option<String>,
    pub message_ref: Option<String>,
}

#[derive(Debug, Clone)]
pub struct WalletRefreshInput {
    pub account: WalletAccountMeta,
    pub transaction: WalletTransactionEntry,
    pub now: u64,
}

#[derive(Debug, Clone)]
pub struct WalletRefreshOutput {
    pub tx_hash: Option<String>,
    pub observations: Vec<WalletProviderObservationV1>,
}

pub trait WalletChainProfile: Send + Sync {
    fn network(&self) -> &str;
    fn amount_unit(&self) -> &str;

    fn normalize_address(&self, address: &str) -> Result<String, WalletChainError> {
        let address = address.trim();
        if address.is_empty() {
            return Err(WalletChainError::invalid_address(
                "wallet address is required",
            ));
        }
        Ok(address.to_string())
    }

    fn capability_ids(&self) -> Vec<&'static str> {
        vec!["native_transfer"]
    }

    fn capability_implemented(&self, _capability_id: &str) -> bool {
        true
    }

    fn reconciliation_source_id(&self) -> String {
        format!("{}:primary", self.network())
    }

    fn reconciliation_independence_group(&self) -> String {
        self.reconciliation_source_id()
    }

    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }

    fn is_enabled(&self, config: &WalletRuntimeConfig) -> bool {
        config.wallet_enabled
    }

    fn materialize_hd_account(
        &self,
        input: WalletHdAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError>;

    fn materialize_imported_account(
        &self,
        input: WalletImportedAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError>;

    fn derive_address(
        &self,
        input: WalletAddressDeriveInput,
    ) -> Result<WalletAddressDeriveOutput, WalletChainError>;

    fn balance(&self, input: WalletBalanceInput) -> Result<WalletBalanceOutput, WalletChainError>;

    fn split_balance_task(
        &self,
        _input: WalletBalanceInput,
    ) -> Result<Option<WalletBalanceTask>, WalletChainError> {
        Ok(None)
    }

    fn split_history_task(
        &self,
        _input: WalletHistoryInput,
    ) -> Result<Option<WalletHistoryTask>, WalletChainError> {
        Ok(None)
    }

    fn prepare(&self, input: WalletPrepareInput) -> Result<WalletPrepareOutput, WalletChainError>;

    fn sign_prepared(
        &self,
        input: WalletSignInput,
    ) -> Result<WalletSignedArtifact, WalletChainError>;

    fn submit_signed(
        &self,
        input: WalletSubmitInput,
    ) -> Result<WalletSubmitOutput, WalletChainError>;

    fn confirm(&self, input: WalletConfirmInput) -> Result<WalletConfirmOutput, WalletChainError> {
        let account = input.account.clone();
        let preparation_id = input.preparation_id.clone();
        let signed = self.sign_prepared(WalletSignInput {
            account: input.account,
            preparation_id: input.preparation_id,
            canonical_payload: input.canonical_payload,
            provider_snapshot: input.provider_snapshot,
            signing_secret: input.signing_secret,
        })?;
        let submitted = self.submit_signed(WalletSubmitInput {
            account,
            preparation_id,
            signed_artifact: signed,
        })?;
        Ok(WalletConfirmOutput {
            status: submitted.status,
            tx_hash: submitted.tx_hash,
            message_ref: submitted.message_ref,
        })
    }

    fn refresh(&self, input: WalletRefreshInput) -> Result<WalletRefreshOutput, WalletChainError>;
}
