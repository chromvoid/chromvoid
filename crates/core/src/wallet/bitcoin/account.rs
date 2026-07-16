use crate::rpc::types::{DerivedAccountMetaV1, WalletAccountMeta, WalletNetwork};
use crate::wallet::{
    new_account_id, AllocatedAddressV1, WalletChainError, BIP39_ENGLISH_WORDLIST,
    BIP39_MNEMONIC_STANDARD, MULTICHAIN_WALLET_MODE,
};

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

pub(super) fn ensure_bip39_hd_input(
    wallet_mode: &str,
    mnemonic_standard: &str,
    mnemonic_entropy: &str,
    wordlist: &str,
) -> Result<(), WalletChainError> {
    if wallet_mode != MULTICHAIN_WALLET_MODE {
        return Err(WalletChainError::unsupported_chain(
            "Bitcoin v1 requires wallet_mode=multichain",
        ));
    }
    ensure_bip39_secret_input(mnemonic_standard, mnemonic_entropy, wordlist)
}

pub(super) fn ensure_bip39_secret_input(
    mnemonic_standard: &str,
    mnemonic_entropy: &str,
    wordlist: &str,
) -> Result<(), WalletChainError> {
    if mnemonic_standard != BIP39_MNEMONIC_STANDARD {
        return Err(WalletChainError::unsupported_chain(
            "Bitcoin v1 supports only bip39 mnemonic_standard",
        ));
    }
    if wordlist != BIP39_ENGLISH_WORDLIST {
        return Err(WalletChainError::invalid_input(
            "Bitcoin v1 supports only english wordlist",
        ));
    }
    if mnemonic_entropy.is_empty() {
        return Err(WalletChainError::invalid_input(
            "Bitcoin HD root entropy is missing",
        ));
    }
    Ok(())
}

pub(super) fn bitcoin_derived_account(
    existing: Option<&WalletAccountMeta>,
    wallet_id: String,
    network: WalletNetwork,
    wallet_mode: Option<String>,
    account_index: u32,
    next_receive_index: u32,
    next_change_index: u32,
    current_receive: Option<DerivedAddress>,
    now: u64,
) -> Result<WalletAccountMeta, WalletChainError> {
    let (account_id, created_at, label) = match existing {
        Some(WalletAccountMeta::Derived(meta)) => (
            meta.account_id.clone(),
            meta.created_at,
            meta.label
                .clone()
                .or_else(|| Some(format!("BTC account {}", account_index + 1))),
        ),
        Some(_) => {
            return Err(WalletChainError::unsupported_account_model(
                "Bitcoin derived metadata expected",
            ))
        }
        None => (
            new_account_id(),
            now,
            Some(format!("BTC account {}", account_index + 1)),
        ),
    };
    Ok(WalletAccountMeta::Derived(DerivedAccountMetaV1 {
        account_id,
        wallet_id,
        network,
        wallet_mode,
        mnemonic_standard: BIP39_MNEMONIC_STANDARD.to_string(),
        account_model: BITCOIN_ACCOUNT_MODEL.to_string(),
        derivation_profile: BITCOIN_DERIVATION_PROFILE.to_string(),
        wallet_contract: None,
        account_index: Some(account_index),
        workchain: None,
        label,
        address: None,
        raw_account: None,
        public_key: None,
        derivation_path: None,
        current_receive_address: current_receive
            .as_ref()
            .map(|address| address.address.clone()),
        current_receive_derivation_path: current_receive
            .as_ref()
            .map(|address| address.derivation_path.clone()),
        next_receive_index: Some(next_receive_index),
        next_change_index: Some(next_change_index),
        created_at,
        updated_at: now,
    }))
}

pub(super) fn bitcoin_account_index(account: &WalletAccountMeta) -> Result<u32, WalletChainError> {
    ensure_bitcoin_network(account.network())?;
    match account {
        WalletAccountMeta::Derived(meta) => {
            if meta.account_model != BITCOIN_ACCOUNT_MODEL
                || meta.derivation_profile != BITCOIN_DERIVATION_PROFILE
                || meta.mnemonic_standard != BIP39_MNEMONIC_STANDARD
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
