use serde::Serialize;

use crate::rpc::types::{
    WalletAccountMeta, WalletFeeTier, WalletNetwork, WalletPreview, WalletTransactionOutput,
    WalletWarning,
};
use crate::vault::VaultSession;
use crate::wallet::{PreparationRecordV1, WalletProvider, WalletProviderPreconditions};

use super::accounts::bitcoin_account_addresses;
use super::provider::invalid_input;
use super::provider::provider_error;
use super::{WalletCommandError, WalletResult};

pub(super) fn prepare_bitcoin(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    provider: &dyn WalletProvider,
    account: &WalletAccountMeta,
    outputs: &[WalletTransactionOutput],
    fee_tier: &WalletFeeTier,
) -> WalletResult<(WalletPreview, WalletProviderPreconditions, String)> {
    let addresses = bitcoin_account_addresses(session, storage, account)?;
    let snapshot = provider
        .bitcoin_prepare(&addresses, outputs, fee_tier)
        .map_err(provider_error)?;
    let amount = sum_outputs(outputs)?;
    let total_input: u128 = snapshot.utxos.iter().map(|utxo| utxo.amount).sum();
    let total_debit = amount.saturating_add(snapshot.fee);
    if total_input < total_debit {
        return Err(WalletCommandError::insufficient_funds());
    }
    let warnings = fee_warnings(snapshot.fee, amount);
    let preview = WalletPreview {
        amount_unit: WalletNetwork::Bitcoin.amount_unit().to_string(),
        outputs: outputs.to_vec(),
        estimated_fee: snapshot.fee.to_string(),
        total_debit: total_debit.to_string(),
        warnings,
    };
    let payload = canonical_payload(WalletNetwork::Bitcoin, outputs, fee_tier, &snapshot, None)?;
    let preconditions = WalletProviderPreconditions {
        nonce: None,
        utxo_refs: snapshot
            .utxos
            .into_iter()
            .map(|utxo| utxo.outpoint)
            .collect(),
    };
    Ok((preview, preconditions, payload))
}

pub(super) fn prepare_ethereum(
    provider: &dyn WalletProvider,
    account: &WalletAccountMeta,
    outputs: &[WalletTransactionOutput],
    fee_tier: &WalletFeeTier,
) -> WalletResult<(WalletPreview, WalletProviderPreconditions, String)> {
    let address = account
        .address
        .as_deref()
        .ok_or_else(|| WalletCommandError::internal("account address missing"))?;
    let snapshot = provider
        .ethereum_prepare(address, outputs, fee_tier)
        .map_err(provider_error)?;
    let amount = sum_outputs(outputs)?;
    let total_debit = amount.saturating_add(snapshot.estimated_fee);
    if snapshot.balance < total_debit {
        return Err(WalletCommandError::insufficient_funds());
    }
    let warnings = fee_warnings(snapshot.estimated_fee, amount);
    let preview = WalletPreview {
        amount_unit: WalletNetwork::Ethereum.amount_unit().to_string(),
        outputs: outputs.to_vec(),
        estimated_fee: snapshot.estimated_fee.to_string(),
        total_debit: total_debit.to_string(),
        warnings,
    };
    let payload = canonical_payload(
        WalletNetwork::Ethereum,
        outputs,
        fee_tier,
        &(),
        Some(snapshot.nonce),
    )?;
    let preconditions = WalletProviderPreconditions {
        nonce: Some(snapshot.nonce),
        utxo_refs: Vec::new(),
    };
    Ok((preview, preconditions, payload))
}

pub(super) fn revalidate_preconditions(
    provider: &dyn WalletProvider,
    account: &WalletAccountMeta,
    record: &PreparationRecordV1,
) -> WalletResult<()> {
    match record.network {
        WalletNetwork::Bitcoin => {
            let snapshot = provider
                .bitcoin_prepare(
                    &account
                        .current_receive_address
                        .clone()
                        .into_iter()
                        .collect::<Vec<_>>(),
                    &record.canonical_intent.outputs,
                    &record.canonical_intent.fee_tier,
                )
                .map_err(provider_error)?;
            let current_refs: Vec<String> = snapshot
                .utxos
                .into_iter()
                .map(|utxo| utxo.outpoint)
                .collect();
            if current_refs != record.preconditions.utxo_refs {
                return Err(WalletCommandError::preparation_stale(
                    "Bitcoin inputs changed",
                ));
            }
        }
        WalletNetwork::Ethereum => {
            let address = account
                .address
                .as_deref()
                .ok_or_else(|| WalletCommandError::internal("account address missing"))?;
            let snapshot = provider
                .ethereum_prepare(
                    address,
                    &record.canonical_intent.outputs,
                    &record.canonical_intent.fee_tier,
                )
                .map_err(provider_error)?;
            if Some(snapshot.nonce) != record.preconditions.nonce {
                return Err(WalletCommandError::preparation_stale(
                    "Ethereum nonce changed",
                ));
            }
        }
    }
    Ok(())
}

pub(super) fn validate_outputs(outputs: &[WalletTransactionOutput]) -> WalletResult<()> {
    for output in outputs {
        if output.address.trim().is_empty() {
            return Err(invalid_input("output address is required"));
        }
        parse_amount(&output.amount)?;
    }
    Ok(())
}

pub(super) fn parse_amount(amount: &str) -> WalletResult<u128> {
    if amount.is_empty() || !amount.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid_input(
            "amount must be an integer string in base units",
        ));
    }
    amount
        .parse::<u128>()
        .map_err(|_| invalid_input("amount is too large"))
}

pub(super) fn sum_outputs(outputs: &[WalletTransactionOutput]) -> WalletResult<u128> {
    outputs.iter().try_fold(0u128, |sum, output| {
        parse_amount(&output.amount).map(|amount| sum.saturating_add(amount))
    })
}

pub(super) fn fee_warnings(fee: u128, amount: u128) -> Vec<WalletWarning> {
    if amount > 0 && fee > amount / 2 {
        vec![WalletWarning {
            code: "high_fee".to_string(),
            message: "Fee exceeds configured threshold".to_string(),
        }]
    } else {
        Vec::new()
    }
}

pub(super) fn canonical_payload<T: Serialize>(
    network: WalletNetwork,
    outputs: &[WalletTransactionOutput],
    fee_tier: &WalletFeeTier,
    snapshot: &T,
    nonce: Option<u64>,
) -> WalletResult<String> {
    let value = serde_json::json!({
        "v": 1,
        "network": network,
        "chain_id": if network == WalletNetwork::Ethereum { Some(1u64) } else { None },
        "outputs": outputs,
        "fee_tier": fee_tier,
        "snapshot": snapshot,
        "nonce": nonce,
    });
    serde_json::to_string(&value)
        .map_err(|error| WalletCommandError::internal(format!("canonical payload failed: {error}")))
}
