use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::rpc::types::{WalletFeeTier, WalletTransactionOutput};
use crate::wallet::{hex_string, WalletChainError};

use super::constants::BITCOIN_PROVIDER_SNAPSHOT_KIND;
use super::provider::BitcoinUtxo;
use super::scan::parse_mainnet_address;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct BitcoinPreparedOutputV1 {
    pub(super) address: String,
    pub(super) amount: u64,
    pub(super) script_pubkey: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct BitcoinPreparedUtxoV1 {
    pub(super) txid: String,
    pub(super) vout: u32,
    pub(super) value: u64,
    pub(super) address: String,
    pub(super) script_pubkey: String,
    pub(super) account_id: String,
    pub(super) purpose: String,
    pub(super) index: u32,
    pub(super) derivation_path: String,
    pub(super) public_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct BitcoinPreparedChangeV1 {
    pub(super) address: String,
    pub(super) amount: u64,
    pub(super) script_pubkey: String,
    pub(super) account_id: String,
    pub(super) purpose: String,
    pub(super) index: u32,
    pub(super) derivation_path: String,
    pub(super) public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct BitcoinPreparedPayloadV1 {
    pub(super) kind: String,
    pub(super) account_id: String,
    pub(super) account_model: String,
    pub(super) outputs: Vec<BitcoinPreparedOutputV1>,
    pub(super) selected_utxos: Vec<BitcoinPreparedUtxoV1>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) change: Option<BitcoinPreparedChangeV1>,
    pub(super) fee: u64,
    pub(super) fee_rate_sat_vb: u64,
    pub(super) fee_tier: WalletFeeTier,
    pub(super) dust_threshold: u64,
    pub(super) warning_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct BitcoinProviderSnapshotV1 {
    pub(super) kind: String,
    pub(super) selected_utxos: Vec<BitcoinPreparedUtxoV1>,
    pub(super) utxo_set: Vec<BitcoinUtxo>,
    pub(super) fee_rate_sat_vb: u64,
    pub(super) fee_tier: WalletFeeTier,
    pub(super) dust_threshold: u64,
    pub(super) tip_height: Option<u64>,
    pub(super) created_at: u64,
}

pub(super) fn parse_bitcoin_outputs(
    outputs: &[WalletTransactionOutput],
) -> Result<Vec<BitcoinPreparedOutputV1>, WalletChainError> {
    let mut parsed = Vec::with_capacity(outputs.len());
    for output in outputs {
        if output.comment.is_some() {
            return Err(WalletChainError::unsupported_provider_surface(
                "Bitcoin outputs do not support comments in v1",
            ));
        }
        let address = parse_mainnet_address(&output.address)?;
        let amount = output.amount.parse::<u64>().map_err(|_| {
            WalletChainError::invalid_input("Bitcoin amount must be satoshi integer")
        })?;
        let dust_threshold = address.script_pubkey().minimal_non_dust().to_sat();
        if amount < dust_threshold {
            return Err(WalletChainError::invalid_input(
                "Bitcoin recipient output is below dust threshold",
            ));
        }
        parsed.push(BitcoinPreparedOutputV1 {
            address: address.to_string(),
            amount,
            script_pubkey: hex_string(address.script_pubkey().as_bytes()),
        });
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use ::bitcoin::key::PrivateKey;
    use ::bitcoin::secp256k1::{Secp256k1, SecretKey};
    use ::bitcoin::{Address, Network, PublicKey};

    use super::*;

    fn output(address: Address, amount: u64) -> WalletTransactionOutput {
        WalletTransactionOutput {
            address: address.to_string(),
            amount: amount.to_string(),
            comment: None,
        }
    }

    #[test]
    fn recipient_dust_threshold_depends_on_destination_script() {
        let secp = Secp256k1::new();
        let private_key = PrivateKey::new(
            SecretKey::from_slice(&[1u8; 32]).expect("secret key"),
            Network::Bitcoin,
        );
        let public_key = PublicKey::from_private_key(&secp, &private_key);
        let p2pkh = Address::p2pkh(public_key, Network::Bitcoin);
        let p2wpkh = Address::p2wpkh(
            &public_key.try_into().expect("compressed public key"),
            Network::Bitcoin,
        );

        assert!(parse_bitcoin_outputs(&[output(p2wpkh, 294)]).is_ok());
        assert!(parse_bitcoin_outputs(&[output(p2pkh.clone(), 545)]).is_err());
        assert!(parse_bitcoin_outputs(&[output(p2pkh, 546)]).is_ok());
    }
}

pub(super) fn locked_outpoints(
    preparations: &[crate::wallet::PreparationRecordV1],
) -> HashSet<String> {
    let mut out = HashSet::new();
    for preparation in preparations {
        let Some(snapshot) = preparation.provider_snapshot.as_ref() else {
            continue;
        };
        let Ok(snapshot) = serde_json::from_value::<BitcoinProviderSnapshotV1>(snapshot.clone())
        else {
            continue;
        };
        if snapshot.kind != BITCOIN_PROVIDER_SNAPSHOT_KIND {
            continue;
        }
        for utxo in snapshot.selected_utxos {
            out.insert(format!("{}:{}", utxo.txid, utxo.vout));
        }
    }
    out
}
