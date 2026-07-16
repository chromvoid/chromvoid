use ::bitcoin::absolute;
use ::bitcoin::transaction;
use ::bitcoin::{Amount, OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxOut, Witness};

use crate::rpc::types::WalletAccountMeta;
use crate::wallet::{
    hex_string, parse_hex, AllocatedAddressV1, SecretPayloadV1, WalletChainError,
    WalletProfileAccountMaterialization,
};

use super::account::bitcoin_account_index;
use super::constants::BITCOIN_DUST_THRESHOLD_SATS;
use super::keys::derive_hd_address;
use super::payload::{BitcoinPreparedChangeV1, BitcoinPreparedOutputV1, BitcoinPreparedUtxoV1};
use super::scan::{parse_mainnet_address, LocatedUtxo};

#[derive(Debug, Clone)]
pub(super) struct BitcoinChangeTarget {
    pub(super) change: BitcoinPreparedChangeV1,
    pub(super) materialization: Option<WalletProfileAccountMaterialization>,
}

pub(super) struct UtxoSelection {
    pub(super) selected: Vec<BitcoinPreparedUtxoV1>,
    pub(super) fee: u64,
    pub(super) change: Option<BitcoinPreparedChangeV1>,
    pub(super) change_materialization: Option<WalletProfileAccountMaterialization>,
    pub(super) dust_change_to_fee: bool,
}

pub(super) fn change_target(
    account: &WalletAccountMeta,
    secret: Option<&SecretPayloadV1>,
    now: u64,
) -> Result<Option<BitcoinChangeTarget>, WalletChainError> {
    match account {
        WalletAccountMeta::Imported(meta) => {
            let parsed = parse_mainnet_address(&meta.address)?;
            Ok(Some(BitcoinChangeTarget {
                change: BitcoinPreparedChangeV1 {
                    address: meta.address.clone(),
                    amount: 0,
                    script_pubkey: hex_string(parsed.script_pubkey().as_bytes()),
                    account_id: meta.account_id.clone(),
                    purpose: "imported".to_string(),
                    index: 0,
                    derivation_path: "imported".to_string(),
                    public_key: meta.public_key.clone().unwrap_or_default(),
                },
                materialization: None,
            }))
        }
        WalletAccountMeta::Derived(meta) => {
            let secret = secret.ok_or_else(|| {
                WalletChainError::internal("Bitcoin change derivation requires HD secret")
            })?;
            let account_index = bitcoin_account_index(account)?;
            let index = meta.next_change_index.unwrap_or(0);
            let derived = derive_hd_address(secret, account_index, 1, index)?;
            let mut updated = account.clone();
            updated.set_next_change_index(index.saturating_add(1));
            updated.set_updated_at(now);
            let allocated = AllocatedAddressV1 {
                account_id: meta.account_id.clone(),
                purpose: "change".to_string(),
                index,
                address: derived.address.clone(),
                public_key: derived.public_key.clone(),
                derivation_path: derived.derivation_path.clone(),
                created_at: now,
                last_observed_at: None,
            };
            Ok(Some(BitcoinChangeTarget {
                change: BitcoinPreparedChangeV1 {
                    address: derived.address,
                    amount: 0,
                    script_pubkey: derived.script_pubkey,
                    account_id: meta.account_id.clone(),
                    purpose: "change".to_string(),
                    index,
                    derivation_path: derived.derivation_path,
                    public_key: derived.public_key,
                },
                materialization: Some(WalletProfileAccountMaterialization {
                    account: updated,
                    addresses: vec![allocated],
                }),
            }))
        }
    }
}

pub(super) fn select_utxos(
    utxos: &[LocatedUtxo],
    outputs: &[BitcoinPreparedOutputV1],
    change_target: Option<&BitcoinChangeTarget>,
    fee_rate_sat_vb: u64,
) -> Result<UtxoSelection, WalletChainError> {
    let output_sum = outputs.iter().map(|output| output.amount).sum::<u64>();
    let output_scripts = outputs
        .iter()
        .map(|output| script_from_hex(&output.script_pubkey))
        .collect::<Result<Vec<_>, _>>()?;
    let change_script = change_target
        .map(|change| script_from_hex(&change.change.script_pubkey))
        .transpose()?;
    let mut selected = Vec::new();
    let mut selected_sum = 0u64;
    for utxo in utxos {
        selected.push(utxo.clone());
        selected_sum = selected_sum.saturating_add(utxo.utxo.value);
        let no_change_fee = estimate_fee(selected.len(), &output_scripts, None, fee_rate_sat_vb)?;
        if selected_sum < output_sum.saturating_add(no_change_fee) {
            continue;
        }
        let no_change_remainder =
            selected_sum.saturating_sub(output_sum.saturating_add(no_change_fee));
        let mut dust_change_to_fee =
            no_change_remainder > 0 && no_change_remainder < BITCOIN_DUST_THRESHOLD_SATS;
        let (fee, change, change_materialization) =
            if let (Some(target), Some(script)) = (change_target, change_script.as_ref()) {
                if no_change_remainder >= BITCOIN_DUST_THRESHOLD_SATS {
                    let fee_with_change = estimate_fee(
                        selected.len(),
                        &output_scripts,
                        Some(script),
                        fee_rate_sat_vb,
                    )?;
                    if selected_sum >= output_sum.saturating_add(fee_with_change) {
                        let change_amount =
                            selected_sum.saturating_sub(output_sum.saturating_add(fee_with_change));
                        if change_amount >= BITCOIN_DUST_THRESHOLD_SATS {
                            let mut change = target.change.clone();
                            change.amount = change_amount;
                            (
                                fee_with_change,
                                Some(change),
                                target.materialization.clone(),
                            )
                        } else {
                            dust_change_to_fee |= change_amount > 0;
                            (selected_sum.saturating_sub(output_sum), None, None)
                        }
                    } else {
                        continue;
                    }
                } else {
                    (selected_sum.saturating_sub(output_sum), None, None)
                }
            } else {
                (selected_sum.saturating_sub(output_sum), None, None)
            };
        let selected = selected
            .into_iter()
            .map(prepared_utxo)
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(UtxoSelection {
            selected,
            fee,
            change,
            change_materialization,
            dust_change_to_fee,
        });
    }
    Err(WalletChainError::insufficient_funds())
}

pub(super) fn select_max_utxos(
    utxos: &[LocatedUtxo],
    outputs: &mut [BitcoinPreparedOutputV1],
    max_output_index: usize,
    fee_rate_sat_vb: u64,
) -> Result<UtxoSelection, WalletChainError> {
    let max_output = outputs
        .get(max_output_index)
        .ok_or_else(|| WalletChainError::invalid_input("max output index is out of range"))?;
    if utxos.is_empty() {
        return Err(WalletChainError::insufficient_funds());
    }
    let output_scripts = outputs
        .iter()
        .map(|output| script_from_hex(&output.script_pubkey))
        .collect::<Result<Vec<_>, _>>()?;
    let selected_sum = utxos
        .iter()
        .try_fold(0u64, |sum, utxo| sum.checked_add(utxo.utxo.value))
        .ok_or_else(WalletChainError::insufficient_funds)?;
    let other_output_sum = outputs
        .iter()
        .enumerate()
        .filter(|(index, _)| *index != max_output_index)
        .try_fold(0u64, |sum, (_, output)| sum.checked_add(output.amount))
        .ok_or_else(WalletChainError::insufficient_funds)?;
    let fee = estimate_fee(utxos.len(), &output_scripts, None, fee_rate_sat_vb)?;
    let max_amount = selected_sum
        .checked_sub(other_output_sum.saturating_add(fee))
        .ok_or_else(WalletChainError::insufficient_funds)?;
    let dust_threshold = script_from_hex(&max_output.script_pubkey)?
        .minimal_non_dust()
        .to_sat();
    if max_amount < dust_threshold {
        return Err(WalletChainError::insufficient_funds());
    }
    outputs[max_output_index].amount = max_amount;
    let selected = utxos
        .iter()
        .cloned()
        .map(prepared_utxo)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(UtxoSelection {
        selected,
        fee,
        change: None,
        change_materialization: None,
        dust_change_to_fee: false,
    })
}

fn prepared_utxo(utxo: LocatedUtxo) -> Result<BitcoinPreparedUtxoV1, WalletChainError> {
    Ok(BitcoinPreparedUtxoV1 {
        txid: utxo.utxo.txid,
        vout: utxo.utxo.vout,
        value: utxo.utxo.value,
        address: utxo.utxo.address,
        script_pubkey: utxo.utxo.script_pubkey,
        account_id: utxo.owner.account_id,
        purpose: utxo.owner.purpose,
        index: utxo.owner.index,
        derivation_path: utxo.owner.derivation_path,
        public_key: utxo.owner.public_key,
    })
}

fn estimate_fee(
    input_count: usize,
    output_scripts: &[ScriptBuf],
    change_script: Option<&ScriptBuf>,
    fee_rate_sat_vb: u64,
) -> Result<u64, WalletChainError> {
    let mut outputs = output_scripts
        .iter()
        .map(|script| TxOut {
            value: Amount::from_sat(1000),
            script_pubkey: script.clone(),
        })
        .collect::<Vec<_>>();
    if let Some(change_script) = change_script {
        outputs.push(TxOut {
            value: Amount::from_sat(1000),
            script_pubkey: change_script.clone(),
        });
    }
    let mut tx = Transaction {
        version: transaction::Version(2),
        lock_time: absolute::LockTime::ZERO,
        input: (0..input_count)
            .map(|_| TxIn {
                previous_output: OutPoint::null(),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::MAX,
                witness: Witness::new(),
            })
            .collect(),
        output: outputs,
    };
    for input in &mut tx.input {
        input.witness.push(vec![0u8; 73]);
        input.witness.push(vec![0u8; 33]);
    }
    Ok((tx.vsize() as u64)
        .saturating_mul(fee_rate_sat_vb)
        .max(fee_rate_sat_vb))
}

pub(super) fn script_from_hex(hex: &str) -> Result<ScriptBuf, WalletChainError> {
    Ok(ScriptBuf::from_bytes(parse_hex(hex)?))
}
