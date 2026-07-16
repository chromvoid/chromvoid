use std::cmp::Ordering;
use std::str::FromStr;
use std::sync::Arc;

use bip39::{Language, Mnemonic};
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
    hex_string, new_account_id, parse_hex, WalletAddressDeriveInput, WalletAddressDeriveOutput,
    WalletBalanceInput, WalletBalanceOutput, WalletChainError, WalletChainProfile,
    WalletHdAccountMaterializeInput, WalletImportedAccountMaterializeInput, WalletPrepareInput,
    WalletPrepareOutput, WalletProfileAccountMaterialization, WalletProviderObservationOutcomeV1,
    WalletProviderObservationV1, WalletRefreshInput, WalletRefreshOutput, WalletRuntimeConfig,
    WalletSignInput, WalletSignedArtifact, WalletSubmitInput, WalletSubmitOutput,
};

pub const ETHEREUM_NETWORK: &str = "ethereum";
pub const ETHEREUM_AMOUNT_UNIT: &str = "wei";
pub const ETHEREUM_DERIVATION_PROFILE: &str = "ethereum_eip44_account";
pub const ETHEREUM_NATIVE_TRANSFER_CAPABILITY: &str = "ethereum_native_transfer";
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EthereumTransactionStatus {
    pub finalized: bool,
    pub failed: bool,
    pub block_number: Option<u64>,
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
    fn transaction_status(
        &self,
        tx_hash: &str,
    ) -> Result<Option<EthereumTransactionStatus>, EthereumProviderError>;
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

    fn transaction_status(
        &self,
        _tx_hash: &str,
    ) -> Result<Option<EthereumTransactionStatus>, EthereumProviderError> {
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
        let address = account_address(&input.account)?;
        let snapshot = self
            .provider
            .account_snapshot(address)
            .map_err(provider_error)?;
        let balance = U256::parse(&snapshot.balance)?.to_decimal();
        Ok(WalletBalanceOutput::from_balance(WalletBalance {
            spendable: balance.clone(),
            pending_in: "0".to_string(),
            pending_out: "0".to_string(),
            total: balance,
            amount_unit: ETHEREUM_AMOUNT_UNIT.to_string(),
        }))
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

    fn refresh(&self, input: WalletRefreshInput) -> Result<WalletRefreshOutput, WalletChainError> {
        let tx_hash = input.transaction.tx_hash.as_deref().ok_or_else(|| {
            WalletChainError::invalid_input("Ethereum transaction missing tx_hash")
        })?;
        let status = self
            .provider
            .transaction_status(tx_hash)
            .map_err(provider_error)?;
        let (outcome, block_ref) = match status {
            Some(status) if status.failed => (
                WalletProviderObservationOutcomeV1::Failed,
                status.block_number.map(|block| block.to_string()),
            ),
            Some(status) if status.finalized => (
                WalletProviderObservationOutcomeV1::Confirmed,
                status.block_number.map(|block| block.to_string()),
            ),
            Some(status) => (
                WalletProviderObservationOutcomeV1::Pending,
                status.block_number.map(|block| block.to_string()),
            ),
            None => (WalletProviderObservationOutcomeV1::NotFound, None),
        };
        Ok(WalletRefreshOutput {
            tx_hash: Some(tx_hash.to_string()),
            observations: vec![WalletProviderObservationV1 {
                source_id: self.reconciliation_source_id(),
                independence_group: self.reconciliation_independence_group(),
                observed_at: input.now,
                outcome,
                block_ref,
                confirmations: None,
                reason: None,
            }],
        })
    }
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
    if input.wallet_mode != "multichain"
        || input.mnemonic_standard != "bip39"
        || input.wordlist != "english"
    {
        return Err(WalletChainError::unsupported_account_model(
            "Ethereum HD account requires multichain BIP39 English root",
        ));
    }
    Ok(())
}

fn materialize_hd_account(
    input: &WalletHdAccountMaterializeInput,
) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
    let secret = derive_hd_secret(input)?;
    let (address, public_key) = address_from_secret(&secret);
    Ok(WalletProfileAccountMaterialization {
        account: WalletAccountMeta::Derived(DerivedAccountMetaV1 {
            account_id: new_account_id(),
            wallet_id: input.wallet_id.clone(),
            network: input.network.clone(),
            wallet_mode: Some(input.wallet_mode.clone()),
            mnemonic_standard: input.mnemonic_standard.clone(),
            account_model: "account".to_string(),
            derivation_profile: ETHEREUM_DERIVATION_PROFILE.to_string(),
            wallet_contract: None,
            account_index: Some(input.account_index),
            workchain: None,
            label: Some(format!("Ethereum account {}", input.account_index + 1)),
            address: Some(address.clone()),
            raw_account: Some(address),
            public_key: Some(public_key),
            derivation_path: Some(format!("m/44'/60'/0'/0/{}", input.account_index)),
            current_receive_address: None,
            current_receive_derivation_path: None,
            next_receive_index: None,
            next_change_index: None,
            created_at: input.now,
            updated_at: input.now,
        }),
        addresses: Vec::new(),
    })
}

fn derive_hd_secret(
    input: &WalletHdAccountMaterializeInput,
) -> Result<SecretKey, WalletChainError> {
    let entropy = Zeroizing::new(parse_hex(&input.mnemonic_entropy)?);
    let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy).map_err(|error| {
        WalletChainError::invalid_input(format!("invalid Ethereum BIP39 root: {error}"))
    })?;
    let seed = Zeroizing::new(mnemonic.to_seed(input.bip39_passphrase.as_deref().unwrap_or("")));
    let master = Xpriv::new_master(Network::Bitcoin, seed.as_ref()).map_err(|error| {
        WalletChainError::invalid_input(format!("Ethereum BIP32 root failed: {error}"))
    })?;
    let path = DerivationPath::from_str(&format!("m/44'/60'/0'/0/{}", input.account_index))
        .map_err(|error| WalletChainError::invalid_input(format!("invalid EIP44 path: {error}")))?;
    Ok(master
        .derive_priv(&Secp256k1::new(), &path)
        .map_err(|error| {
            WalletChainError::invalid_input(format!("Ethereum key derivation failed: {error}"))
        })?
        .private_key)
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
            let root = payload.hd_root_material().ok_or_else(|| {
                WalletChainError::internal("Ethereum derived account requires HD root")
            })?;
            let input = WalletHdAccountMaterializeInput {
                wallet_id: meta.wallet_id.clone(),
                network: meta.network.clone(),
                account_index: meta.account_index.ok_or_else(|| {
                    WalletChainError::invalid_input("Ethereum account_index missing")
                })?,
                wallet_mode: meta.wallet_mode.clone().unwrap_or_default(),
                mnemonic_standard: root.mnemonic_standard,
                mnemonic_entropy: root.mnemonic_entropy,
                mnemonic_words: root.mnemonic_words,
                wordlist: root.wordlist,
                bip39_passphrase: root.bip39_passphrase,
                now: meta.updated_at,
            };
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

        fn transaction_status(
            &self,
            _tx_hash: &str,
        ) -> Result<Option<EthereumTransactionStatus>, EthereumProviderError> {
            Ok(Some(EthereumTransactionStatus {
                finalized: false,
                failed: false,
                block_number: Some(100),
            }))
        }
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
