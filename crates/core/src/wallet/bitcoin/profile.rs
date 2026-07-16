use std::sync::Arc;

use ::bitcoin::consensus::encode::serialize_hex;
use ::bitcoin::key::CompressedPublicKey;
use ::bitcoin::secp256k1::Secp256k1;
use serde_json::json;
use zeroize::Zeroizing;

use crate::rpc::types::{
    ImportedAccountMetaV1, WalletAccountMeta, WalletAddressesDeriveResponse, WalletConfirmStatus,
    WalletPreview, WalletProviderStatus, WalletTransactionOutput, WalletWarning,
};
use crate::wallet::{
    hex_string, AllocatedAddressV1, WalletAddressDeriveInput, WalletAddressDeriveOutput,
    WalletBalanceInput, WalletBalanceOutput, WalletBalanceTask, WalletChainError,
    WalletChainProfile, WalletHdAccountMaterializeInput, WalletImportedAccountMaterializeInput,
    WalletPrepareInput, WalletPrepareOutput, WalletProfileAccountMaterialization,
    WalletProviderObservationOutcomeV1, WalletProviderObservationV1, WalletRefreshInput,
    WalletRefreshOutput, WalletRuntimeConfig, WalletSignInput, WalletSignedArtifact,
    WalletSubmitInput, WalletSubmitOutput,
};

use super::account::{
    bitcoin_account_index, bitcoin_chain_for_purpose, bitcoin_derived_account,
    ensure_bip39_hd_input, ensure_bitcoin_network, ensure_gap_allocation_allowed,
};
use super::constants::{
    BITCOIN_AMOUNT_UNIT, BITCOIN_CURVE, BITCOIN_DUST_THRESHOLD_SATS,
    BITCOIN_FINALITY_CONFIRMATIONS, BITCOIN_NETWORK, BITCOIN_PREPARED_PAYLOAD_KIND,
    BITCOIN_PROVIDER_SNAPSHOT_KIND, BITCOIN_RECONCILIATION_WINDOW_MS, BITCOIN_WIF_ENCODING,
};
use super::discovery::discover_hd_account_with_xpub;
use super::keys::{derive_account_xpub, derive_hd_address, p2wpkh_address, parse_wif_private_key};
use super::payload::{
    locked_outpoints, parse_bitcoin_outputs, BitcoinPreparedPayloadV1, BitcoinProviderSnapshotV1,
};
use super::provider::{
    provider_error, BitcoinProvider, BitcoinProviderErrorKind, UnavailableBitcoinProvider,
};
use super::scan::{balance_for_addresses, collect_utxos, dedupe_addresses, imported_scan_address};
use super::selection::{change_target, select_max_utxos, select_utxos};
use super::signing::{revalidate_selected_utxos, sign_bitcoin_transaction};

#[derive(Clone)]
pub struct BitcoinChainProfile {
    provider: Arc<dyn BitcoinProvider>,
}

impl BitcoinChainProfile {
    pub fn new(provider: Arc<dyn BitcoinProvider>) -> Self {
        Self { provider }
    }

    pub fn unavailable() -> Self {
        Self::new(Arc::new(UnavailableBitcoinProvider))
    }

    fn create_balance_task(
        &self,
        mut input: WalletBalanceInput,
    ) -> Result<WalletBalanceTask, WalletChainError> {
        ensure_bitcoin_network(input.account.network())?;
        if self.provider.provider_status() != WalletProviderStatus::Ready {
            return Err(WalletChainError::provider_unavailable());
        }
        let derived_account = input.account.is_derived();
        let account_xpub = if derived_account && input.discover_addresses {
            let secret = input.secret.as_ref().ok_or_else(|| {
                WalletChainError::internal("Bitcoin discovery requires HD secret material")
            })?;
            Some(derive_account_xpub(
                secret,
                bitcoin_account_index(&input.account)?,
            )?)
        } else {
            None
        };
        input.secret = None;
        input.wallet_accounts.clear();
        let provider = self.provider.clone();
        Ok(Box::new(move || {
            let mut materializations = Vec::new();
            let scan_addresses = if derived_account {
                let account_id = input.account.account_id().to_string();
                let mut addresses = input
                    .allocated_addresses
                    .iter()
                    .filter(|address| address.account_id == account_id)
                    .cloned()
                    .collect::<Vec<_>>();
                if let Some(account_xpub) = account_xpub {
                    let discovered = discover_hd_account_with_xpub(
                        provider.as_ref(),
                        &account_xpub,
                        &input.account,
                        input.now,
                    )?;
                    addresses.extend(discovered.addresses.clone());
                    materializations.push(discovered);
                }
                dedupe_addresses(addresses)
            } else {
                vec![imported_scan_address(&input.account)?]
            };
            let balance = balance_for_addresses(provider.as_ref(), &scan_addresses)?;
            Ok(WalletBalanceOutput {
                balance,
                materializations,
            })
        }))
    }
}

impl WalletChainProfile for BitcoinChainProfile {
    fn network(&self) -> &str {
        BITCOIN_NETWORK
    }

    fn amount_unit(&self) -> &str {
        BITCOIN_AMOUNT_UNIT
    }

    fn normalize_address(&self, address: &str) -> Result<String, WalletChainError> {
        Ok(super::scan::parse_mainnet_address(address)?.to_string())
    }

    fn capability_ids(&self) -> Vec<&'static str> {
        vec!["bitcoin_native_transfer"]
    }

    fn provider_status(&self) -> WalletProviderStatus {
        self.provider.provider_status()
    }

    fn is_enabled(&self, config: &WalletRuntimeConfig) -> bool {
        config.wallet_enabled && config.capability_enabled("bitcoin_native_transfer")
    }

    fn materialize_hd_account(
        &self,
        input: WalletHdAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        ensure_bitcoin_network(&input.network)?;
        ensure_bip39_hd_input(
            &input.wallet_mode,
            &input.mnemonic_standard,
            &input.mnemonic_entropy,
            &input.wordlist,
        )?;
        Ok(WalletProfileAccountMaterialization {
            account: bitcoin_derived_account(
                None,
                input.wallet_id,
                input.network,
                Some(input.wallet_mode),
                input.account_index,
                0,
                0,
                None,
                input.now,
            )?,
            addresses: Vec::new(),
        })
    }

    fn materialize_imported_account(
        &self,
        input: WalletImportedAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        ensure_bitcoin_network(&input.network)?;
        if input.curve != BITCOIN_CURVE || input.encoding != BITCOIN_WIF_ENCODING {
            return Err(WalletChainError::invalid_input(
                "Bitcoin imported accounts require curve=secp256k1 and encoding=wif",
            ));
        }
        let private_key = parse_wif_private_key(&input.private_key)?;
        let secp = Secp256k1::new();
        let public_key = CompressedPublicKey::from_private_key(&secp, &private_key)
            .map_err(|_| WalletChainError::invalid_input("Bitcoin WIF must be compressed"))?;
        let address = p2wpkh_address(&public_key);
        let account = WalletAccountMeta::Imported(ImportedAccountMetaV1 {
            account_id: input.account_id,
            wallet_id: input.wallet_id,
            network: input.network,
            label: Some(input.label),
            address: address.to_string(),
            public_key: Some(public_key.to_string()),
            curve: Some(BITCOIN_CURVE.to_string()),
            wallet_contract: None,
            workchain: None,
            raw_account: Some(hex_string(address.script_pubkey().as_bytes())),
            created_at: input.now,
            updated_at: input.now,
        });
        Ok(WalletProfileAccountMaterialization {
            account,
            addresses: Vec::new(),
        })
    }

    fn derive_address(
        &self,
        input: WalletAddressDeriveInput,
    ) -> Result<WalletAddressDeriveOutput, WalletChainError> {
        let account_index = bitcoin_account_index(&input.account)?;
        let secret = input.secret.as_ref().ok_or_else(|| {
            WalletChainError::internal("Bitcoin address derivation requires HD secret material")
        })?;
        let chain = bitcoin_chain_for_purpose(&input.purpose)?;
        ensure_gap_allocation_allowed(&input.allocated_addresses, &input.purpose)?;
        let index = match input.purpose.as_str() {
            "receive" => input.account.next_receive_index().unwrap_or(0),
            "change" => input.account.next_change_index().unwrap_or(0),
            _ => {
                return Err(WalletChainError::invalid_input(
                    "purpose must be receive or change",
                ))
            }
        };
        let derived = derive_hd_address(secret, account_index, chain, index)?;
        let mut account = input.account;
        if input.purpose == "receive" {
            account.set_next_receive_state(
                index.saturating_add(1),
                derived.address.clone(),
                derived.derivation_path.clone(),
            );
        } else {
            account.set_next_change_index(index.saturating_add(1));
            account.set_updated_at(input.now);
        }
        let allocated = AllocatedAddressV1 {
            account_id: account.account_id().to_string(),
            purpose: input.purpose.clone(),
            index,
            address: derived.address.clone(),
            public_key: derived.public_key,
            derivation_path: derived.derivation_path.clone(),
            created_at: input.now,
            last_observed_at: None,
        };
        Ok(WalletAddressDeriveOutput {
            response: WalletAddressesDeriveResponse {
                account_id: account.account_id().to_string(),
                purpose: input.purpose,
                address: derived.address,
                public_key: allocated.public_key.clone(),
                derivation_path: derived.derivation_path,
                index,
            },
            account,
            address: allocated,
        })
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

    fn prepare(&self, input: WalletPrepareInput) -> Result<WalletPrepareOutput, WalletChainError> {
        ensure_bitcoin_network(input.account.network())?;
        if self.provider.provider_status() != WalletProviderStatus::Ready {
            return Err(WalletChainError::provider_unavailable());
        }
        let mut requested_outputs = input.outputs.clone();
        if let Some(index) = input.maximize_output_index {
            let output = requested_outputs.get_mut(index).ok_or_else(|| {
                WalletChainError::invalid_input("max output index is out of range")
            })?;
            output.amount = u64::MAX.to_string();
        }
        let mut outputs = parse_bitcoin_outputs(&requested_outputs)?;
        let estimates = self.provider.fee_estimates().map_err(provider_error)?;
        let fee_rate_sat_vb = estimates.for_tier(&input.fee_tier);
        let mut materializations = Vec::new();
        let scan_addresses = if input.account.is_derived() {
            let account_id = input.account.account_id().to_string();
            let addresses = input
                .allocated_addresses
                .iter()
                .filter(|address| address.account_id == account_id)
                .cloned()
                .collect::<Vec<_>>();
            dedupe_addresses(addresses)
        } else {
            vec![imported_scan_address(&input.account)?]
        };
        let all_utxos = collect_utxos(self.provider.as_ref(), &scan_addresses)?;
        let locked = locked_outpoints(&input.live_preparations);
        let spendable = all_utxos
            .iter()
            .filter(|utxo| utxo.utxo.confirmed && !locked.contains(&utxo.utxo.outpoint_key()))
            .cloned()
            .collect::<Vec<_>>();
        let selection = if let Some(index) = input.maximize_output_index {
            select_max_utxos(&spendable, &mut outputs, index, fee_rate_sat_vb)?
        } else {
            let change = change_target(&input.account, input.secret.as_ref(), input.now)?;
            select_utxos(&spendable, &outputs, change.as_ref(), fee_rate_sat_vb)?
        };
        let mut warnings = Vec::new();
        if selection.dust_change_to_fee {
            warnings.push(WalletWarning {
                code: "dust_change_to_fee".to_string(),
                message: "Sub-dust Bitcoin change was folded into the fee".to_string(),
            });
        }
        if let Some(materialization) = selection.change_materialization.clone() {
            materializations.push(materialization);
        }
        let payload = BitcoinPreparedPayloadV1 {
            kind: BITCOIN_PREPARED_PAYLOAD_KIND.to_string(),
            account_id: input.account.account_id().to_string(),
            account_model: input
                .account
                .account_model()
                .unwrap_or("imported")
                .to_string(),
            outputs: outputs.clone(),
            selected_utxos: selection.selected.clone(),
            change: selection.change.clone(),
            fee: selection.fee,
            fee_rate_sat_vb,
            fee_tier: input.fee_tier.clone(),
            dust_threshold: BITCOIN_DUST_THRESHOLD_SATS,
            warning_codes: warnings
                .iter()
                .map(|warning| warning.code.clone())
                .collect(),
        };
        let snapshot = BitcoinProviderSnapshotV1 {
            kind: BITCOIN_PROVIDER_SNAPSHOT_KIND.to_string(),
            selected_utxos: selection.selected.clone(),
            utxo_set: all_utxos.into_iter().map(|utxo| utxo.utxo).collect(),
            fee_rate_sat_vb,
            fee_tier: input.fee_tier.clone(),
            dust_threshold: BITCOIN_DUST_THRESHOLD_SATS,
            tip_height: self.provider.tip_height().map_err(provider_error)?,
            created_at: input.now,
        };
        let total_output = outputs.iter().map(|output| output.amount).sum::<u64>();
        Ok(WalletPrepareOutput {
            preview: WalletPreview {
                amount_unit: BITCOIN_AMOUNT_UNIT.to_string(),
                outputs: outputs
                    .iter()
                    .map(|output| WalletTransactionOutput {
                        address: output.address.clone(),
                        amount: output.amount.to_string(),
                        comment: None,
                    })
                    .collect(),
                estimated_fee: selection.fee.to_string(),
                total_debit: total_output.saturating_add(selection.fee).to_string(),
                warnings,
                ton: None,
                ethereum: None,
            },
            provider_snapshot: Some(serde_json::to_value(snapshot).map_err(|error| {
                WalletChainError::internal(format!(
                    "Bitcoin snapshot serialization failed: {error}"
                ))
            })?),
            canonical_payload: serde_json::to_string(&payload).map_err(|error| {
                WalletChainError::internal(format!("Bitcoin payload serialization failed: {error}"))
            })?,
            materializations,
        })
    }

    fn sign_prepared(
        &self,
        input: WalletSignInput,
    ) -> Result<WalletSignedArtifact, WalletChainError> {
        let prepared: BitcoinPreparedPayloadV1 = serde_json::from_str(&input.canonical_payload)
            .map_err(|error| {
                WalletChainError::preparation_stale(format!(
                    "Bitcoin preparation payload is invalid: {error}"
                ))
            })?;
        if prepared.kind != BITCOIN_PREPARED_PAYLOAD_KIND
            || prepared.account_id != input.account.account_id()
        {
            return Err(WalletChainError::preparation_stale(
                "Bitcoin preparation does not match account",
            ));
        }
        let snapshot: BitcoinProviderSnapshotV1 = input
            .provider_snapshot
            .clone()
            .ok_or_else(|| WalletChainError::preparation_stale("Bitcoin snapshot missing"))
            .and_then(|value| {
                serde_json::from_value(value).map_err(|error| {
                    WalletChainError::preparation_stale(format!(
                        "Bitcoin snapshot is invalid: {error}"
                    ))
                })
            })?;
        if snapshot.kind != BITCOIN_PROVIDER_SNAPSHOT_KIND
            || snapshot.selected_utxos != prepared.selected_utxos
            || snapshot.fee_rate_sat_vb != prepared.fee_rate_sat_vb
        {
            return Err(WalletChainError::preparation_stale(
                "Bitcoin provider snapshot changed",
            ));
        }
        revalidate_selected_utxos(self.provider.as_ref(), &prepared.selected_utxos)?;
        let current_rate = self
            .provider
            .fee_estimates()
            .map_err(provider_error)?
            .for_tier(&prepared.fee_tier);
        if current_rate > prepared.fee_rate_sat_vb {
            return Err(WalletChainError::preparation_stale(
                "Bitcoin fee estimate increased",
            ));
        }
        let tx = sign_bitcoin_transaction(&input.account, &input.signing_secret, &prepared)?;
        let tx_hash = tx.compute_txid().to_string();
        Ok(WalletSignedArtifact {
            signed_artifact: Zeroizing::new(serialize_hex(&tx)),
            tx_hash: Some(tx_hash),
            message_ref: None,
            submit_metadata: Some(json!({"fee_rate_sat_vb": prepared.fee_rate_sat_vb})),
        })
    }

    fn submit_signed(
        &self,
        input: WalletSubmitInput,
    ) -> Result<WalletSubmitOutput, WalletChainError> {
        let tx_hash =
            input.signed_artifact.tx_hash.clone().ok_or_else(|| {
                WalletChainError::internal("Bitcoin signed artifact missing tx_hash")
            })?;
        match self
            .provider
            .broadcast_raw_tx(input.signed_artifact.signed_artifact.as_str())
        {
            Ok(result) => Ok(WalletSubmitOutput {
                status: WalletConfirmStatus::Pending,
                tx_hash: Some(result.txid),
                message_ref: None,
            }),
            Err(error) if error.kind == BitcoinProviderErrorKind::Unknown => {
                Ok(WalletSubmitOutput {
                    status: WalletConfirmStatus::BroadcastUnknown,
                    tx_hash: Some(tx_hash),
                    message_ref: None,
                })
            }
            Err(error) => Err(provider_error(error)),
        }
    }

    fn refresh(&self, input: WalletRefreshInput) -> Result<WalletRefreshOutput, WalletChainError> {
        ensure_bitcoin_network(input.account.network())?;
        let txid = input.transaction.tx_hash.as_deref().ok_or_else(|| {
            WalletChainError::invalid_input("Bitcoin transaction is missing tx_hash")
        })?;
        let status = self
            .provider
            .transaction_status(txid)
            .map_err(provider_error)?;
        let (outcome, block_ref, confirmations) = match status {
            Some(status) if status.confirmations >= BITCOIN_FINALITY_CONFIRMATIONS => (
                WalletProviderObservationOutcomeV1::Confirmed,
                status.block_height.map(|height| height.to_string()),
                Some(status.confirmations),
            ),
            Some(status) => (
                WalletProviderObservationOutcomeV1::Pending,
                status.block_height.map(|height| height.to_string()),
                Some(status.confirmations),
            ),
            None if input.now.saturating_sub(input.transaction.created_at)
                > BITCOIN_RECONCILIATION_WINDOW_MS =>
            {
                (WalletProviderObservationOutcomeV1::NotFound, None, None)
            }
            None => (WalletProviderObservationOutcomeV1::Unknown, None, None),
        };
        Ok(WalletRefreshOutput {
            tx_hash: Some(txid.to_string()),
            observations: vec![WalletProviderObservationV1 {
                source_id: self.reconciliation_source_id(),
                independence_group: self.reconciliation_independence_group(),
                observed_at: input.now,
                outcome,
                block_ref,
                confirmations,
                reason: None,
            }],
        })
    }
}
