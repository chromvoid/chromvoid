use crate::rpc::types::WalletAccountMeta;
use crate::wallet::{AllocatedAddressV1, WalletChainError, WalletProfileAccountMaterialization};

use super::account::{bitcoin_account_index, bitcoin_derived_account, DerivedAddress};
use super::constants::BITCOIN_ADDRESS_GAP;
use super::keys::derive_address_from_account_xpub;
use super::provider::{provider_error, BitcoinProvider};
use ::bitcoin::bip32::Xpub;

pub(super) fn discover_hd_account_with_xpub(
    provider: &dyn BitcoinProvider,
    account_xpub: &Xpub,
    account: &WalletAccountMeta,
    now: u64,
) -> Result<WalletProfileAccountMaterialization, WalletChainError> {
    let account_index = bitcoin_account_index(account)?;
    let discovered = discover_account_addresses(
        provider,
        account_xpub,
        account.account_id(),
        account_index,
        now,
    )?;
    let mut discovered_account = bitcoin_derived_account(
        Some(account),
        account.wallet_id().to_string(),
        account.network().clone(),
        account_index,
        discovered.next_receive_index,
        discovered.next_change_index,
        discovered.current_receive,
        now,
    )?;
    preserve_manual_cursors(&mut discovered_account, account);
    Ok(WalletProfileAccountMaterialization {
        account: discovered_account,
        addresses: discovered.addresses,
    })
}

#[derive(Debug)]
struct AccountDiscovery {
    addresses: Vec<AllocatedAddressV1>,
    current_receive: Option<DerivedAddress>,
    next_receive_index: u32,
    next_change_index: u32,
}

fn discover_account_addresses(
    provider: &dyn BitcoinProvider,
    account_xpub: &Xpub,
    account_id: &str,
    account_index: u32,
    now: u64,
) -> Result<AccountDiscovery, WalletChainError> {
    let receive = discover_chain(provider, account_xpub, account_id, account_index, 0, now)?;
    let change = discover_chain(provider, account_xpub, account_id, account_index, 1, now)?;
    let mut addresses = receive.addresses;
    let next_change_index = change.next_index;
    // An account nobody has paid yet still needs an address to show: allocate index 0 here so
    // clients never see "no address yet" after a restore either.
    let (current_receive, next_receive_index) = match receive.last_used {
        Some(used) => (Some(used), receive.next_index),
        None => {
            let first = derive_address_from_account_xpub(account_xpub, account_index, 0, 0)?;
            addresses.push(AllocatedAddressV1 {
                account_id: account_id.to_string(),
                purpose: "receive".to_string(),
                index: 0,
                address: first.address.clone(),
                public_key: first.public_key.clone(),
                derivation_path: first.derivation_path.clone(),
                created_at: now,
                last_observed_at: None,
            });
            (Some(first), 1)
        }
    };
    addresses.extend(change.addresses);
    Ok(AccountDiscovery {
        addresses,
        current_receive,
        next_receive_index,
        next_change_index,
    })
}

#[derive(Debug)]
struct ChainDiscovery {
    addresses: Vec<AllocatedAddressV1>,
    last_used: Option<DerivedAddress>,
    next_index: u32,
}

fn discover_chain(
    provider: &dyn BitcoinProvider,
    account_xpub: &Xpub,
    account_id: &str,
    account_index: u32,
    chain: u32,
    now: u64,
) -> Result<ChainDiscovery, WalletChainError> {
    let purpose = if chain == 0 { "receive" } else { "change" };
    let mut addresses = Vec::new();
    let mut last_used = None;
    let mut unused_run = 0u32;
    let mut index = 0u32;
    while unused_run < BITCOIN_ADDRESS_GAP {
        let derived = derive_address_from_account_xpub(account_xpub, account_index, chain, index)?;
        let status = provider
            .address_status(&derived.address)
            .map_err(provider_error)?;
        if status.is_used() {
            unused_run = 0;
            last_used = Some(derived.clone());
            addresses.push(AllocatedAddressV1 {
                account_id: account_id.to_string(),
                purpose: purpose.to_string(),
                index,
                address: derived.address,
                public_key: derived.public_key,
                derivation_path: derived.derivation_path,
                created_at: now,
                last_observed_at: Some(now),
            });
        } else {
            unused_run += 1;
        }
        index = index.saturating_add(1);
    }
    let next_index = addresses
        .iter()
        .map(|address| address.index.saturating_add(1))
        .max()
        .unwrap_or(0);
    Ok(ChainDiscovery {
        addresses,
        last_used,
        next_index,
    })
}

fn preserve_manual_cursors(account: &mut WalletAccountMeta, existing: &WalletAccountMeta) {
    if let (WalletAccountMeta::Derived(account), WalletAccountMeta::Derived(existing)) =
        (account, existing)
    {
        account.next_receive_index = Some(
            account
                .next_receive_index
                .unwrap_or(0)
                .max(existing.next_receive_index.unwrap_or(0)),
        );
        account.next_change_index = Some(
            account
                .next_change_index
                .unwrap_or(0)
                .max(existing.next_change_index.unwrap_or(0)),
        );
        if existing.current_receive_address.is_some() {
            account.current_receive_address = existing.current_receive_address.clone();
            account.current_receive_derivation_path =
                existing.current_receive_derivation_path.clone();
        }
    }
}
