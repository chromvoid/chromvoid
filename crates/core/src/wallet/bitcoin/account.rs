use crate::rpc::types::{WalletAccountMeta, WalletNetwork};
use crate::wallet::{derived_account_meta, AccountScheme, AllocatedAddressV1, WalletChainError};

use super::constants::{
    BITCOIN_ACCOUNT_MODEL, BITCOIN_ADDRESS_GAP, BITCOIN_DERIVATION_PROFILE, BITCOIN_NETWORK,
};

#[derive(Debug, Clone)]
pub(super) struct DerivedAddress {
    pub(super) address: String,
    pub(super) public_key: String,
    pub(super) derivation_path: String,
    pub(super) script_pubkey: String,
}

pub(super) fn ensure_bitcoin_network(network: &WalletNetwork) -> Result<(), WalletChainError> {
    if network.as_str() != BITCOIN_NETWORK {
        return Err(WalletChainError::unsupported_chain("wrong Bitcoin network"));
    }
    Ok(())
}

pub(super) fn bitcoin_derived_account(
    existing: Option<&WalletAccountMeta>,
    wallet_id: String,
    network: WalletNetwork,
    account_index: u32,
    next_receive_index: u32,
    next_change_index: u32,
    current_receive: Option<DerivedAddress>,
    now: u64,
) -> Result<WalletAccountMeta, WalletChainError> {
    let mut meta = match existing {
        Some(WalletAccountMeta::Derived(meta)) => meta.clone(),
        Some(_) => {
            return Err(WalletChainError::unsupported_account_model(
                "Bitcoin derived metadata expected",
            ))
        }
        None => derived_account_meta(
            wallet_id,
            network,
            AccountScheme::BitcoinBip84Account,
            account_index,
            now,
        ),
    };
    meta.account_model = BITCOIN_ACCOUNT_MODEL.to_string();
    meta.label = meta
        .label
        .or_else(|| Some(format!("BTC account {}", account_index + 1)));
    meta.current_receive_address = current_receive
        .as_ref()
        .map(|address| address.address.clone());
    meta.current_receive_derivation_path = current_receive
        .as_ref()
        .map(|address| address.derivation_path.clone());
    meta.next_receive_index = Some(next_receive_index);
    meta.next_change_index = Some(next_change_index);
    meta.updated_at = now;
    Ok(WalletAccountMeta::Derived(meta))
}

pub(super) fn bitcoin_account_index(account: &WalletAccountMeta) -> Result<u32, WalletChainError> {
    ensure_bitcoin_network(account.network())?;
    match account {
        WalletAccountMeta::Derived(meta) => {
            if meta.account_model != BITCOIN_ACCOUNT_MODEL
                || meta.derivation_profile != BITCOIN_DERIVATION_PROFILE
            {
                return Err(WalletChainError::unsupported_account_model(
                    "Bitcoin derived account requires bip84 utxo metadata",
                ));
            }
            meta.account_index.ok_or_else(|| {
                WalletChainError::invalid_input("Bitcoin derived account missing account_index")
            })
        }
        WalletAccountMeta::Imported(_) => Err(WalletChainError::unsupported_account_model(
            "Bitcoin imported account does not support address derivation",
        )),
    }
}

pub(super) fn bitcoin_chain_for_purpose(purpose: &str) -> Result<u32, WalletChainError> {
    match purpose {
        "receive" => Ok(0),
        "change" => Ok(1),
        _ => Err(WalletChainError::invalid_input(
            "purpose must be receive or change",
        )),
    }
}

pub(super) fn ensure_gap_allocation_allowed(
    addresses: &[AllocatedAddressV1],
    purpose: &str,
) -> Result<(), WalletChainError> {
    let mut unused = addresses
        .iter()
        .filter(|address| address.purpose == purpose)
        .filter(|address| address.last_observed_at.is_none())
        .map(|address| address.index)
        .collect::<Vec<_>>();
    unused.sort_unstable();
    let mut run = 0u32;
    let mut previous = None;
    for index in unused {
        if previous.is_none_or(|previous| previous + 1 == index) {
            run += 1;
        } else {
            run = 1;
        }
        previous = Some(index);
    }
    if run >= BITCOIN_ADDRESS_GAP {
        return Err(WalletChainError::address_gap_limit_reached());
    }
    Ok(())
}
