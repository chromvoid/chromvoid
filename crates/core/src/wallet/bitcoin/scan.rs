use std::collections::{HashMap, HashSet};
use std::str::FromStr;

use ::bitcoin::{Address, Network};

use crate::rpc::types::{WalletAccountMeta, WalletBalance};
use crate::wallet::{hex_string, AllocatedAddressV1, WalletChainError};

use super::account::ensure_bitcoin_network;
use super::constants::{BITCOIN_AMOUNT_UNIT, BITCOIN_CURVE};
use super::provider::{provider_error, BitcoinProvider, BitcoinUtxo};

#[derive(Debug, Clone)]
pub(super) struct ScanAddress {
    pub(super) account_id: String,
    pub(super) purpose: String,
    pub(super) index: u32,
    pub(super) address: String,
    pub(super) public_key: String,
    pub(super) derivation_path: String,
    pub(super) script_pubkey: String,
}

#[derive(Debug, Clone)]
pub(super) struct LocatedUtxo {
    pub(super) utxo: BitcoinUtxo,
    pub(super) owner: ScanAddress,
}

pub(super) fn dedupe_addresses(addresses: Vec<AllocatedAddressV1>) -> Vec<ScanAddress> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for address in addresses {
        if !seen.insert(address.address.clone()) {
            continue;
        }
        if let Ok(parsed) = parse_mainnet_address(&address.address) {
            out.push(ScanAddress {
                account_id: address.account_id,
                purpose: address.purpose,
                index: address.index,
                address: address.address,
                public_key: address.public_key,
                derivation_path: address.derivation_path,
                script_pubkey: hex_string(parsed.script_pubkey().as_bytes()),
            });
        }
    }
    out
}

pub(super) fn imported_scan_address(
    account: &WalletAccountMeta,
) -> Result<ScanAddress, WalletChainError> {
    let WalletAccountMeta::Imported(meta) = account else {
        return Err(WalletChainError::unsupported_account_model(
            "expected imported Bitcoin account",
        ));
    };
    ensure_bitcoin_network(&meta.network)?;
    if meta.curve.as_deref() != Some(BITCOIN_CURVE) {
        return Err(WalletChainError::invalid_input(
            "Bitcoin imported account requires secp256k1",
        ));
    }
    let parsed = parse_mainnet_address(&meta.address)?;
    Ok(ScanAddress {
        account_id: meta.account_id.clone(),
        purpose: "imported".to_string(),
        index: 0,
        address: meta.address.clone(),
        public_key: meta.public_key.clone().unwrap_or_default(),
        derivation_path: "imported".to_string(),
        script_pubkey: hex_string(parsed.script_pubkey().as_bytes()),
    })
}

pub(super) fn balance_for_addresses(
    provider: &dyn BitcoinProvider,
    addresses: &[ScanAddress],
) -> Result<WalletBalance, WalletChainError> {
    let mut confirmed = 0u64;
    let mut pending_in = 0u64;
    let mut pending_out = 0u64;
    for address in addresses {
        let status = provider
            .address_status(&address.address)
            .map_err(provider_error)?;
        confirmed = confirmed.saturating_add(status.confirmed_balance());
        pending_in = pending_in.saturating_add(status.pending_in());
        pending_out = pending_out.saturating_add(status.pending_out());
    }
    Ok(WalletBalance {
        spendable: confirmed.to_string(),
        pending_in: pending_in.to_string(),
        pending_out: pending_out.to_string(),
        total: confirmed
            .saturating_add(pending_in)
            .saturating_sub(pending_out)
            .to_string(),
        amount_unit: BITCOIN_AMOUNT_UNIT.to_string(),
    })
}

pub(super) fn parse_mainnet_address(address: &str) -> Result<Address, WalletChainError> {
    Address::from_str(address)
        .map_err(|error| {
            WalletChainError::invalid_address(format!("invalid Bitcoin address: {error}"))
        })?
        .require_network(Network::Bitcoin)
        .map_err(|error| {
            WalletChainError::invalid_address(format!("Bitcoin address must be mainnet: {error}"))
        })
}

pub(super) fn collect_utxos(
    provider: &dyn BitcoinProvider,
    addresses: &[ScanAddress],
) -> Result<Vec<LocatedUtxo>, WalletChainError> {
    let by_address = addresses
        .iter()
        .map(|address| (address.address.as_str(), address))
        .collect::<HashMap<_, _>>();
    let mut out = Vec::new();
    for address in addresses {
        for mut utxo in provider
            .address_utxos(&address.address)
            .map_err(provider_error)?
        {
            utxo.address = address.address.clone();
            utxo.script_pubkey = address.script_pubkey.clone();
            if let Some(owner) = by_address.get(utxo.address.as_str()) {
                out.push(LocatedUtxo {
                    utxo,
                    owner: (*owner).clone(),
                });
            }
        }
    }
    out.sort_by(|a, b| {
        b.utxo
            .value
            .cmp(&a.utxo.value)
            .then_with(|| a.utxo.txid.cmp(&b.utxo.txid))
            .then_with(|| a.utxo.vout.cmp(&b.utxo.vout))
    });
    Ok(out)
}
