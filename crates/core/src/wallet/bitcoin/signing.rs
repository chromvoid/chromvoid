use std::str::FromStr;

use ::bitcoin::absolute;
use ::bitcoin::ecdsa::Signature as BitcoinEcdsaSignature;
use ::bitcoin::key::{CompressedPublicKey, PrivateKey};
use ::bitcoin::secp256k1::{Message, Secp256k1};
use ::bitcoin::sighash::{EcdsaSighashType, SighashCache};
use ::bitcoin::transaction;
use ::bitcoin::{Amount, OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxOut, Txid, Witness};

use crate::rpc::types::WalletAccountMeta;
use crate::wallet::{SecretPayloadV1, WalletChainError};

use super::account::{bitcoin_chain_for_purpose, ensure_bitcoin_network};
use super::constants::{BITCOIN_CURVE, BITCOIN_WIF_ENCODING};
use super::keys::{derive_hd_private_key, parse_wif_private_key};
use super::payload::{BitcoinPreparedPayloadV1, BitcoinPreparedUtxoV1};
use super::provider::{provider_error, BitcoinProvider};
use super::selection::script_from_hex;

pub(super) fn revalidate_selected_utxos(
    provider: &dyn BitcoinProvider,
    selected: &[BitcoinPreparedUtxoV1],
) -> Result<(), WalletChainError> {
    for utxo in selected {
        let current = provider
            .address_utxos(&utxo.address)
            .map_err(provider_error)?
            .into_iter()
            .find(|candidate| candidate.txid == utxo.txid && candidate.vout == utxo.vout);
        match current {
            Some(current) if current.confirmed && current.value == utxo.value => {}
            _ => {
                return Err(WalletChainError::preparation_stale(
                    "Bitcoin selected UTXO is no longer spendable",
                ))
            }
        }
    }
    Ok(())
}

pub(super) fn sign_bitcoin_transaction(
    account: &WalletAccountMeta,
    secret: &SecretPayloadV1,
    prepared: &BitcoinPreparedPayloadV1,
) -> Result<Transaction, WalletChainError> {
    let mut tx = unsigned_transaction(prepared)?;
    let secp = Secp256k1::new();
    for index in 0..prepared.selected_utxos.len() {
        let utxo = &prepared.selected_utxos[index];
        let private_key = signing_key_for_utxo(account, secret, utxo)?;
        let public_key = CompressedPublicKey::from_private_key(&secp, &private_key)
            .map_err(|_| WalletChainError::internal("Bitcoin signing key is uncompressed"))?;
        let script_pubkey = script_from_hex(&utxo.script_pubkey)?;
        let sighash = {
            let mut cache = SighashCache::new(&mut tx);
            cache
                .p2wpkh_signature_hash(
                    index,
                    &script_pubkey,
                    Amount::from_sat(utxo.value),
                    EcdsaSighashType::All,
                )
                .map_err(|error| {
                    WalletChainError::internal(format!("Bitcoin sighash failed: {error}"))
                })?
        };
        let message = Message::from_digest_slice(sighash.as_ref()).map_err(|error| {
            WalletChainError::internal(format!("Bitcoin sighash message failed: {error}"))
        })?;
        let signature = secp.sign_ecdsa(&message, &private_key.inner);
        let signature = BitcoinEcdsaSignature {
            signature,
            sighash_type: EcdsaSighashType::All,
        };
        tx.input[index].witness.push(signature.to_vec());
        tx.input[index].witness.push(public_key.to_bytes());
    }
    Ok(tx)
}

fn unsigned_transaction(
    prepared: &BitcoinPreparedPayloadV1,
) -> Result<Transaction, WalletChainError> {
    let mut outputs = prepared
        .outputs
        .iter()
        .map(|output| {
            Ok(TxOut {
                value: Amount::from_sat(output.amount),
                script_pubkey: script_from_hex(&output.script_pubkey)?,
            })
        })
        .collect::<Result<Vec<_>, WalletChainError>>()?;
    if let Some(change) = prepared.change.as_ref() {
        outputs.push(TxOut {
            value: Amount::from_sat(change.amount),
            script_pubkey: script_from_hex(&change.script_pubkey)?,
        });
    }
    Ok(Transaction {
        version: transaction::Version(2),
        lock_time: absolute::LockTime::ZERO,
        input: prepared
            .selected_utxos
            .iter()
            .map(|utxo| {
                Ok(TxIn {
                    previous_output: OutPoint {
                        txid: Txid::from_str(&utxo.txid).map_err(|error| {
                            WalletChainError::preparation_stale(format!(
                                "Bitcoin UTXO txid invalid: {error}"
                            ))
                        })?,
                        vout: utxo.vout,
                    },
                    script_sig: ScriptBuf::new(),
                    sequence: Sequence::MAX,
                    witness: Witness::new(),
                })
            })
            .collect::<Result<Vec<_>, WalletChainError>>()?,
        output: outputs,
    })
}

fn signing_key_for_utxo(
    account: &WalletAccountMeta,
    secret: &SecretPayloadV1,
    utxo: &BitcoinPreparedUtxoV1,
) -> Result<PrivateKey, WalletChainError> {
    match account {
        WalletAccountMeta::Derived(meta) => {
            let account_index = meta.account_index.ok_or_else(|| {
                WalletChainError::invalid_input("Bitcoin derived account missing account_index")
            })?;
            let chain = bitcoin_chain_for_purpose(&utxo.purpose)?;
            derive_hd_private_key(secret, account_index, chain, utxo.index)
        }
        WalletAccountMeta::Imported(_) => {
            let SecretPayloadV1::ImportedKey {
                network,
                curve,
                private_key,
                encoding,
            } = secret
            else {
                return Err(WalletChainError::internal(
                    "Bitcoin imported signing requires imported key secret",
                ));
            };
            ensure_bitcoin_network(network)?;
            if curve != BITCOIN_CURVE || encoding != BITCOIN_WIF_ENCODING {
                return Err(WalletChainError::invalid_input(
                    "Bitcoin imported signing secret mismatch",
                ));
            }
            parse_wif_private_key(private_key)
        }
    }
}
