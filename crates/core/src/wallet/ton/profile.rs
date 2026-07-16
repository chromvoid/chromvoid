use std::sync::Arc;

use ::ton::ton_core::traits::tlb::TLB;
use serde_json::json;
use zeroize::Zeroizing;

use crate::rpc::types::{
    DerivedAccountMetaV1, ImportedAccountMetaV1, TonTransactionPreviewV1, WalletAccountMeta,
    WalletBalance, WalletConfirmStatus, WalletPreview, WalletProviderStatus,
    WalletTransactionOutput,
};
use crate::wallet::{
    hex_string, new_account_id, WalletAddressDeriveInput, WalletAddressDeriveOutput,
    WalletBalanceInput, WalletBalanceOutput, WalletChainError, WalletChainProfile,
    WalletHdAccountMaterializeInput, WalletHistoryInput, WalletHistoryOutput, WalletHistoryTask,
    WalletHistoryTransaction, WalletImportedAccountMaterializeInput, WalletPrepareInput,
    WalletPrepareOutput, WalletProfileAccountMaterialization, WalletProviderObservationOutcomeV1,
    WalletProviderObservationV1, WalletRefreshInput, WalletRefreshOutput, WalletRuntimeConfig,
    WalletSignInput, WalletSignedArtifact, WalletSubmitInput, WalletSubmitOutput, WalletTxStatus,
};

use super::account::{ensure_ton_network, provider_account_from_meta, ton_derivation_profile};
use super::constants::{
    TON_ACCOUNT_MODEL, TON_AMOUNT_UNIT, TON_MESSAGE_MODE_SIMPLE_TRANSFER,
    TON_NATIVE_DERIVATION_PROFILE, TON_NETWORK, TON_PREPARED_PAYLOAD_KIND, TON_WALLET_CONTRACT,
    TON_WORKCHAIN,
};
use super::error::{fee_estimation_error, provider_error, ton_core_error, ton_error};
use super::keys::{
    key_pair_from_hd_root, key_pair_from_imported, ton_wallet_from_key_pair, ton_wallet_from_secret,
};
use super::payload::{snapshot_value, TonPreparedPayloadV1};
use super::provider::{
    TonBroadcastRequest, TonFeeEstimateRequest, TonHistoryRequest, TonProvider, TonProviderAccount,
    TonProviderAccountState, TonProviderErrorKind, TonProviderSnapshot, TonRefreshRequest,
    UnavailableTonProvider,
};
use super::transfer::{
    build_fee_estimate_body, build_internal_message, comment_body, parse_amount, parse_ton_address,
    parse_ton_destination, ton_prepare_warnings, valid_until_seconds, valid_until_seconds_now,
    validate_comment, validate_single_output,
};

#[derive(Clone)]
pub struct TonChainProfile {
    provider: Arc<dyn TonProvider>,
}

impl TonChainProfile {
    pub fn new(provider: Arc<dyn TonProvider>) -> Self {
        Self { provider }
    }

    pub fn unavailable() -> Self {
        Self::new(Arc::new(UnavailableTonProvider))
    }

    fn estimate_transfer_fee(
        &self,
        provider_account: &TonProviderAccount,
        wallet: &::ton::ton_wallet::TonWallet,
        snapshot: &TonProviderSnapshot,
        internal_message: ::ton::ton_core::cell::TonCell,
        valid_until: u32,
    ) -> Result<u128, WalletChainError> {
        let body = build_fee_estimate_body(wallet, internal_message, snapshot.seqno, valid_until)?;
        let (init_code_boc_base64, init_data_boc_base64) =
            if snapshot.account_state == TonProviderAccountState::Uninitialized {
                let code = ::ton::ton_wallet::WalletVersion::get_code(wallet.version)
                    .map_err(ton_core_error)?;
                let data = ::ton::ton_wallet::WalletVersion::get_default_data(
                    wallet.version,
                    &wallet.key_pair,
                    wallet.wallet_id,
                )
                .map_err(ton_core_error)?;
                (
                    Some(code.to_boc_base64().map_err(ton_core_error)?),
                    Some(data.to_boc_base64().map_err(ton_core_error)?),
                )
            } else {
                (None, None)
            };
        self.provider
            .estimate_transfer_fee(TonFeeEstimateRequest {
                account: provider_account.clone(),
                body_boc_base64: body.to_boc_base64().map_err(ton_core_error)?,
                init_code_boc_base64,
                init_data_boc_base64,
            })
            .map_err(fee_estimation_error)
    }
}

impl WalletChainProfile for TonChainProfile {
    fn network(&self) -> &str {
        TON_NETWORK
    }

    fn amount_unit(&self) -> &str {
        TON_AMOUNT_UNIT
    }

    fn normalize_address(&self, address: &str) -> Result<String, WalletChainError> {
        Ok(parse_ton_destination(address)?.normalized_address)
    }

    fn capability_ids(&self) -> Vec<&'static str> {
        vec![
            "ton_native_transfer",
            super::super::ton_v2::TON_CONNECT_CAPABILITY,
            super::super::ton_v2::TON_JETTON_CAPABILITY,
            super::super::ton_v2::TON_LEGACY_RESTORE_CAPABILITY,
            super::super::ton_v2::TON_CONTRACT_RAW_CACHE_CAPABILITY,
        ]
    }

    fn capability_implemented(&self, capability_id: &str) -> bool {
        capability_id == "ton_native_transfer"
    }

    fn provider_status(&self) -> WalletProviderStatus {
        self.provider.provider_status()
    }

    fn is_enabled(&self, config: &WalletRuntimeConfig) -> bool {
        config.wallet_enabled && config.capability_enabled("ton_native_transfer")
    }

    fn materialize_hd_account(
        &self,
        input: WalletHdAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        ensure_ton_network(&input.network)?;
        let derivation_profile =
            ton_derivation_profile(&input.wallet_mode, &input.mnemonic_standard)?;
        if derivation_profile == TON_NATIVE_DERIVATION_PROFILE && input.account_index != 0 {
            return Err(WalletChainError::unsupported_account_model(
                "TON native v1 supports only account_index=0",
            ));
        }
        let key_pair = key_pair_from_hd_root(
            &input.mnemonic_standard,
            &input.mnemonic_entropy,
            input.mnemonic_words.as_deref(),
            &input.wordlist,
            input.bip39_passphrase.as_deref(),
            input.account_index,
            derivation_profile,
        )?;
        let wallet = ton_wallet_from_key_pair(key_pair)?;
        let address = wallet.address.to_string();
        let raw_account = wallet.address.to_hex();
        let public_key = hex_string(&wallet.key_pair.public_key);
        let account_id = new_account_id();
        let account = WalletAccountMeta::Derived(DerivedAccountMetaV1 {
            account_id: account_id.clone(),
            wallet_id: input.wallet_id,
            network: input.network,
            wallet_mode: Some(input.wallet_mode),
            mnemonic_standard: input.mnemonic_standard,
            account_model: TON_ACCOUNT_MODEL.to_string(),
            derivation_profile: derivation_profile.to_string(),
            wallet_contract: Some(TON_WALLET_CONTRACT.to_string()),
            account_index: Some(input.account_index),
            workchain: Some(TON_WORKCHAIN),
            label: Some(format!("TON account {}", input.account_index + 1)),
            address: Some(address),
            raw_account: Some(raw_account),
            public_key: Some(public_key),
            derivation_path: Some(format!("{derivation_profile}/{}", input.account_index)),
            current_receive_address: None,
            current_receive_derivation_path: None,
            next_receive_index: None,
            next_change_index: None,
            created_at: input.now,
            updated_at: input.now,
        });
        Ok(WalletProfileAccountMaterialization {
            account,
            addresses: Vec::new(),
        })
    }

    fn materialize_imported_account(
        &self,
        input: WalletImportedAccountMaterializeInput,
    ) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
        ensure_ton_network(&input.network)?;
        if input.curve != "ed25519" {
            return Err(WalletChainError::invalid_input(
                "TON imported accounts require curve=ed25519",
            ));
        }
        let key_pair = key_pair_from_imported(&input.private_key, &input.encoding)?;
        let wallet = ton_wallet_from_key_pair(key_pair)?;
        let account = WalletAccountMeta::Imported(ImportedAccountMetaV1 {
            account_id: input.account_id,
            wallet_id: input.wallet_id,
            network: input.network,
            label: Some(input.label),
            address: wallet.address.to_string(),
            public_key: Some(hex_string(&wallet.key_pair.public_key)),
            curve: Some("ed25519".to_string()),
            wallet_contract: Some(TON_WALLET_CONTRACT.to_string()),
            workchain: Some(TON_WORKCHAIN),
            raw_account: Some(wallet.address.to_hex()),
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
        _input: WalletAddressDeriveInput,
    ) -> Result<WalletAddressDeriveOutput, WalletChainError> {
        Err(WalletChainError::unsupported_account_model(
            "TON accounts do not support address derivation in v1",
        ))
    }

    fn balance(&self, input: WalletBalanceInput) -> Result<WalletBalanceOutput, WalletChainError> {
        let provider_account = provider_account_from_meta(&input.account)?;
        let snapshot = self
            .provider
            .snapshot(&provider_account)
            .map_err(provider_error)?;
        Ok(WalletBalanceOutput::from_balance(WalletBalance {
            spendable: snapshot.balance.to_string(),
            pending_in: "0".to_string(),
            pending_out: "0".to_string(),
            total: snapshot.balance.to_string(),
            amount_unit: TON_AMOUNT_UNIT.to_string(),
        }))
    }

    fn split_history_task(
        &self,
        input: WalletHistoryInput,
    ) -> Result<Option<WalletHistoryTask>, WalletChainError> {
        ensure_ton_network(input.account.network())?;
        if self.provider.provider_status() != WalletProviderStatus::Ready {
            return Err(WalletChainError::provider_unavailable());
        }
        let account = provider_account_from_meta(&input.account)?;
        let provider = self.provider.clone();
        Ok(Some(Box::new(move || {
            let transactions = provider
                .history(TonHistoryRequest {
                    account,
                    limit: input.limit,
                })
                .map_err(provider_error)?
                .into_iter()
                .map(|transaction| WalletHistoryTransaction {
                    tx_hash: transaction.tx_hash,
                    message_ref: transaction.message_ref,
                    status: transaction.status,
                    direction: transaction.direction,
                    counterparty: transaction.counterparty,
                    amount: transaction.amount.to_string(),
                    fee: transaction.fee.to_string(),
                    created_at: transaction.created_at,
                })
                .collect();
            Ok(WalletHistoryOutput { transactions })
        })))
    }

    fn prepare(&self, input: WalletPrepareInput) -> Result<WalletPrepareOutput, WalletChainError> {
        let provider_account = provider_account_from_meta(&input.account)?;
        let output = validate_single_output(&input.outputs)?;
        if input.maximize_output_index.is_some_and(|index| index != 0) {
            return Err(WalletChainError::invalid_input(
                "max output index is out of range",
            ));
        }
        let destination = parse_ton_destination(&output.address)?;
        let requested_amount = input
            .maximize_output_index
            .is_none()
            .then(|| parse_amount(&output.amount))
            .transpose()?;
        validate_comment(output.comment.as_deref())?;

        let secret = input
            .secret
            .as_ref()
            .ok_or_else(|| WalletChainError::internal("TON preparation requires wallet secret"))?;
        let ton_wallet = ton_wallet_from_secret(&input.account, secret)?;
        if ton_wallet.address.to_hex() != provider_account.raw_account {
            return Err(WalletChainError::internal(
                "TON preparation material does not match account address",
            ));
        }

        let snapshot = self
            .provider
            .snapshot(&provider_account)
            .map_err(provider_error)?;
        let destination_state = self
            .provider
            .account_state(&destination.normalized_address)
            .map_err(provider_error)?;
        let sender_state_init_included =
            snapshot.account_state == TonProviderAccountState::Uninitialized;
        let valid_until = valid_until_seconds();
        let estimate_for_amount = |amount| {
            let body = comment_body(output.comment.as_deref())?;
            let internal_message = build_internal_message(
                destination.address.clone(),
                amount,
                body,
                destination.bounceable,
            )?;
            self.estimate_transfer_fee(
                &provider_account,
                &ton_wallet,
                &snapshot,
                internal_message,
                valid_until,
            )
        };
        let (amount, estimated_fee) = if input.maximize_output_index.is_some() {
            let mut amount = snapshot.balance;
            let mut estimated_fee = estimate_for_amount(amount)?;
            for _ in 0..8 {
                let next = snapshot
                    .balance
                    .checked_sub(estimated_fee)
                    .ok_or_else(WalletChainError::insufficient_funds)?;
                if next == amount {
                    break;
                }
                amount = next;
                estimated_fee = estimate_for_amount(amount)?;
            }
            estimated_fee = estimate_for_amount(amount)?;
            amount = snapshot
                .balance
                .checked_sub(estimated_fee)
                .ok_or_else(WalletChainError::insufficient_funds)?;
            if amount == 0 {
                return Err(WalletChainError::insufficient_funds());
            }
            let final_fee = estimate_for_amount(amount)?;
            if amount.saturating_add(final_fee) > snapshot.balance {
                amount = snapshot
                    .balance
                    .checked_sub(final_fee)
                    .ok_or_else(WalletChainError::insufficient_funds)?;
            }
            (amount, final_fee)
        } else {
            let amount = requested_amount.expect("non-max TON amount");
            (amount, estimate_for_amount(amount)?)
        };
        let total_debit = amount.saturating_add(estimated_fee);
        if snapshot.balance < total_debit {
            return Err(WalletChainError::insufficient_funds());
        }
        let warnings = ton_prepare_warnings(&destination, destination_state);

        let prepared = TonPreparedPayloadV1 {
            kind: TON_PREPARED_PAYLOAD_KIND.to_string(),
            account_id: input.account.account_id().to_string(),
            wallet_contract: TON_WALLET_CONTRACT.to_string(),
            account_address: provider_account.address.clone(),
            raw_account: provider_account.raw_account.clone(),
            destination_address: destination.normalized_address.clone(),
            destination_raw_account: destination.raw_account.clone(),
            destination_bounceable: destination.bounceable,
            amount: amount.to_string(),
            comment: output.comment.clone(),
            seqno: snapshot.seqno,
            valid_until,
            message_mode: TON_MESSAGE_MODE_SIMPLE_TRANSFER,
            account_state: snapshot.account_state.as_str().to_string(),
            sender_state_init_included,
            destination_state: destination_state.as_str().to_string(),
            estimated_fee: estimated_fee.to_string(),
            warning_codes: warnings
                .iter()
                .map(|warning| warning.code.clone())
                .collect(),
        };

        Ok(WalletPrepareOutput {
            preview: WalletPreview {
                amount_unit: TON_AMOUNT_UNIT.to_string(),
                outputs: vec![WalletTransactionOutput {
                    address: prepared.destination_address.clone(),
                    amount: prepared.amount.clone(),
                    comment: prepared.comment.clone(),
                }],
                estimated_fee: prepared.estimated_fee.clone(),
                total_debit: total_debit.to_string(),
                warnings,
                ton: Some(TonTransactionPreviewV1 {
                    wallet_contract: TON_WALLET_CONTRACT.to_string(),
                    seqno: snapshot.seqno,
                    account_state: snapshot.account_state.as_str().to_string(),
                    valid_until,
                    message_mode: TON_MESSAGE_MODE_SIMPLE_TRANSFER,
                    sender_state_init_included,
                    destination_state: destination_state.as_str().to_string(),
                }),
                ethereum: None,
            },
            provider_snapshot: Some(snapshot_value(
                &snapshot,
                destination_state,
                estimated_fee,
                sender_state_init_included,
            )),
            canonical_payload: serde_json::to_string(&prepared).map_err(|error| {
                WalletChainError::internal(format!("TON payload serialization failed: {error}"))
            })?,
            materializations: Vec::new(),
        })
    }

    fn sign_prepared(
        &self,
        input: WalletSignInput,
    ) -> Result<WalletSignedArtifact, WalletChainError> {
        let provider_account = provider_account_from_meta(&input.account)?;
        let prepared: TonPreparedPayloadV1 = serde_json::from_str(&input.canonical_payload)
            .map_err(|error| {
                WalletChainError::preparation_stale(format!(
                    "TON preparation payload is invalid: {error}"
                ))
            })?;
        prepared.validate_for_account(&provider_account)?;

        if valid_until_seconds_now() > prepared.valid_until {
            return Err(WalletChainError::preparation_stale(
                "TON preparation valid_until expired",
            ));
        }

        let snapshot = self
            .provider
            .snapshot(&provider_account)
            .map_err(provider_error)?;
        if snapshot.seqno != prepared.seqno
            || snapshot.account_state.as_str() != prepared.account_state
        {
            return Err(WalletChainError::preparation_stale(
                "TON provider snapshot changed",
            ));
        }
        let destination_state = self
            .provider
            .account_state(&prepared.destination_address)
            .map_err(provider_error)?;
        if destination_state.as_str() != prepared.destination_state {
            return Err(WalletChainError::preparation_stale(
                "TON destination state changed",
            ));
        }
        let amount = parse_amount(&prepared.amount)?;
        let estimated_fee = parse_amount(&prepared.estimated_fee)?;
        let expected_sender_state_init_included =
            snapshot.account_state == TonProviderAccountState::Uninitialized;
        let ton_wallet = ton_wallet_from_secret(&input.account, &input.signing_secret)?;
        if ton_wallet.address.to_hex() != provider_account.raw_account {
            return Err(WalletChainError::internal(
                "TON signing material does not match account address",
            ));
        }

        let destination = parse_ton_address(&prepared.destination_address)?;
        let body = comment_body(prepared.comment.as_deref())?;
        let int_msg =
            build_internal_message(destination, amount, body, prepared.destination_bounceable)?;
        let current_estimated_fee = self.estimate_transfer_fee(
            &provider_account,
            &ton_wallet,
            &snapshot,
            int_msg.clone(),
            prepared.valid_until,
        )?;
        if prepared.message_mode != TON_MESSAGE_MODE_SIMPLE_TRANSFER
            || prepared.sender_state_init_included != expected_sender_state_init_included
            || current_estimated_fee > estimated_fee
            || snapshot.balance < amount.saturating_add(estimated_fee)
        {
            return Err(WalletChainError::preparation_stale(
                "TON preparation preconditions changed",
            ));
        }

        let add_state_init = prepared.sender_state_init_included;
        let signed = ton_wallet
            .create_ext_in_msg(
                vec![int_msg],
                prepared.seqno,
                prepared.valid_until,
                add_state_init,
            )
            .map_err(ton_error)?;
        let message_hash = hex_string(signed.cell_hash().map_err(ton_core_error)?.as_slice());
        let signed_message_boc_base64 = signed.to_boc_base64().map_err(ton_core_error)?;
        Ok(WalletSignedArtifact {
            signed_artifact: Zeroizing::new(signed_message_boc_base64),
            tx_hash: None,
            message_ref: Some(message_hash),
            submit_metadata: Some(json!({"seqno": prepared.seqno})),
        })
    }

    fn submit_signed(
        &self,
        input: WalletSubmitInput,
    ) -> Result<WalletSubmitOutput, WalletChainError> {
        let provider_account = provider_account_from_meta(&input.account)?;
        let seqno = input
            .signed_artifact
            .submit_metadata
            .as_ref()
            .and_then(|metadata| metadata.get("seqno"))
            .and_then(serde_json::Value::as_u64)
            .and_then(|seqno| u32::try_from(seqno).ok())
            .ok_or_else(|| WalletChainError::internal("TON signed artifact missing seqno"))?;
        let message_hash =
            input.signed_artifact.message_ref.clone().ok_or_else(|| {
                WalletChainError::internal("TON signed artifact missing message_ref")
            })?;
        let signed_message_boc_base64 = input.signed_artifact.signed_artifact.to_string();
        let broadcast = match self.provider.broadcast(TonBroadcastRequest {
            account: provider_account,
            seqno,
            message_hash: message_hash.clone(),
            signed_message_boc_base64,
        }) {
            Ok(broadcast) => broadcast,
            Err(error) if error.kind == TonProviderErrorKind::Unknown => {
                return Ok(WalletSubmitOutput {
                    status: WalletConfirmStatus::BroadcastUnknown,
                    tx_hash: input.signed_artifact.tx_hash,
                    message_ref: Some(message_hash),
                });
            }
            Err(error) => return Err(provider_error(error)),
        };
        Ok(WalletSubmitOutput {
            status: broadcast.status,
            tx_hash: broadcast.tx_hash.or(input.signed_artifact.tx_hash),
            message_ref: broadcast.message_ref.or(Some(message_hash)),
        })
    }

    fn refresh(&self, input: WalletRefreshInput) -> Result<WalletRefreshOutput, WalletChainError> {
        let provider_account = provider_account_from_meta(&input.account)?;
        if provider_account.account_id != input.transaction.account_id {
            return Err(WalletChainError::invalid_input(
                "TON transaction account does not match account metadata",
            ));
        }
        let output = self
            .provider
            .refresh(TonRefreshRequest {
                account: provider_account,
                tx_ref: input.transaction.tx_ref,
                account_id: input.transaction.account_id,
                message_ref: input.transaction.message_ref,
                tx_hash: input.transaction.tx_hash,
                valid_until: input.transaction.valid_until,
            })
            .map_err(provider_error)?;
        let outcome = if output.found {
            match output.status {
                WalletTxStatus::Confirmed => WalletProviderObservationOutcomeV1::Confirmed,
                WalletTxStatus::Failed => WalletProviderObservationOutcomeV1::Failed,
                _ => WalletProviderObservationOutcomeV1::Pending,
            }
        } else if input
            .transaction
            .valid_until
            .is_some_and(|valid_until| valid_until_seconds_now() > valid_until)
        {
            WalletProviderObservationOutcomeV1::NotFound
        } else {
            WalletProviderObservationOutcomeV1::Unknown
        };
        Ok(WalletRefreshOutput {
            tx_hash: output.tx_hash,
            observations: vec![WalletProviderObservationV1 {
                source_id: self.reconciliation_source_id(),
                independence_group: self.reconciliation_independence_group(),
                observed_at: input.now,
                outcome,
                block_ref: None,
                confirmations: None,
                reason: None,
            }],
        })
    }
}
