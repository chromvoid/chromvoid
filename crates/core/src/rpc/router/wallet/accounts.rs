use crate::rpc::types::{WalletAccountMeta, WalletNetwork};
use crate::vault::VaultSession;
use crate::wallet::{
    derive_address, derive_public_key, hash_hex, new_account_id, now_ms, AllocatedAddressV1,
    SecretBlobV1, SecretPayloadV1, WalletProvider, WalletProviderError, WALLET_ROOT,
};

use super::super::domain_uow::DomainUnitOfWork;
use super::paths::{address_file_path, bitcoin_derivation_path, ethereum_derivation_path};
use super::provider::provider_error;
use super::store::{ensure_account_address_dir, read_json, save_account, write_json};
use super::{WalletCommandError, WalletResult, JSON_MIME};

pub(super) fn materialize_hd_account(
    uow: &mut DomainUnitOfWork<'_>,
    provider: Option<&dyn WalletProvider>,
    wallet_id: &str,
    network: WalletNetwork,
    account_index: u32,
    seed: &str,
    now: u64,
) -> WalletResult<WalletAccountMeta> {
    let account_id = new_account_id();
    let account = match network {
        WalletNetwork::Bitcoin => {
            let derivation_path = bitcoin_derivation_path(account_index, 0, 0);
            let address = derive_address(network, seed, &derivation_path);
            let public_key = derive_public_key(seed, &derivation_path);
            let mut account = WalletAccountMeta {
                account_id: account_id.clone(),
                wallet_id: wallet_id.to_string(),
                network,
                kind: "derived".to_string(),
                account_model: Some("utxo".to_string()),
                derivation_profile: Some("bitcoin_bip84_account".to_string()),
                account_index: Some(account_index),
                label: Some("Bitcoin account".to_string()),
                address: None,
                public_key: None,
                derivation_path: None,
                current_receive_address: Some(address.clone()),
                current_receive_derivation_path: Some(derivation_path.clone()),
                next_receive_index: Some(1),
                next_change_index: Some(0),
                created_at: now,
                updated_at: now,
            };
            ensure_account_address_dir(uow, wallet_id, &account_id)?;
            let first = AllocatedAddressV1 {
                account_id: account_id.clone(),
                purpose: "receive".to_string(),
                index: 0,
                address,
                public_key,
                derivation_path,
                created_at: now,
                last_observed_at: None,
            };
            write_json(
                uow,
                &address_file_path(wallet_id, &account_id, "receive", 0),
                "receive-0.json",
                &first,
                JSON_MIME,
            )?;
            if let Some(provider) = provider {
                let _ = backfill_bitcoin_discovery(uow, provider, seed, &mut account);
            }
            account
        }
        WalletNetwork::Ethereum => {
            let derivation_path = ethereum_derivation_path(account_index);
            WalletAccountMeta {
                account_id: account_id.clone(),
                wallet_id: wallet_id.to_string(),
                network,
                kind: "derived".to_string(),
                account_model: Some("account".to_string()),
                derivation_profile: Some("ethereum_eip44_account".to_string()),
                account_index: Some(account_index),
                label: Some(format!("Ethereum account {}", account_index + 1)),
                address: Some(derive_address(network, seed, &derivation_path)),
                public_key: Some(derive_public_key(seed, &derivation_path)),
                derivation_path: Some(derivation_path),
                current_receive_address: None,
                current_receive_derivation_path: None,
                next_receive_index: None,
                next_change_index: None,
                created_at: now,
                updated_at: now,
            }
        }
    };
    save_account(uow, &account)?;
    Ok(account)
}

pub(super) fn hd_seed_from_secret(secret: &SecretBlobV1) -> WalletResult<String> {
    match &secret.payload {
        SecretPayloadV1::HdRoot {
            mnemonic,
            bip39_passphrase,
            ..
        } => Ok(hash_hex(&[
            mnemonic.join(" ").as_bytes(),
            bip39_passphrase.as_deref().unwrap_or("").as_bytes(),
        ])),
        _ => Err(WalletCommandError::internal(
            "Wallet secret is not an HD root",
        )),
    }
}

pub(super) fn bitcoin_account_addresses(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    account: &WalletAccountMeta,
) -> WalletResult<Vec<String>> {
    if account.kind == "imported" {
        return account
            .address
            .clone()
            .map(|address| vec![address])
            .ok_or_else(|| WalletCommandError::internal("account address missing"));
    }
    let dir = format!(
        "{WALLET_ROOT}/wallets/{}/accounts/{}/addresses",
        account.wallet_id, account.account_id
    );
    let Some(root) = session.catalog().find_by_path(&dir) else {
        return Ok(account
            .current_receive_address
            .clone()
            .into_iter()
            .collect::<Vec<_>>());
    };
    let mut addresses = Vec::new();
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        if let Some(record) =
            read_json::<AllocatedAddressV1>(session, storage, &format!("{dir}/{}", child.name))?
        {
            addresses.push(record.address);
        }
    }
    addresses.sort();
    addresses.dedup();
    Ok(addresses)
}

pub(super) fn backfill_bitcoin_discovery(
    uow: &mut DomainUnitOfWork<'_>,
    provider: &dyn WalletProvider,
    seed: &str,
    account: &mut WalletAccountMeta,
) -> WalletResult<()> {
    for (purpose, chain) in [("receive", 0), ("change", 1)] {
        let mut consecutive_unused = 0;
        let mut index = 0u32;
        let mut max_used = None;
        while consecutive_unused < crate::wallet::BITCOIN_GAP_LIMIT {
            let path = bitcoin_derivation_path(account.account_index.unwrap_or(0), chain, index);
            let address = derive_address(WalletNetwork::Bitcoin, &seed, &path);
            let used = match provider.address_used(WalletNetwork::Bitcoin, &address) {
                Ok(used) => used,
                Err(WalletProviderError::Unavailable) => return Ok(()),
                Err(error) => return Err(provider_error(error)),
            };
            if used {
                consecutive_unused = 0;
                max_used = Some(index);
                let public_key = derive_public_key(&seed, &path);
                let record = AllocatedAddressV1 {
                    account_id: account.account_id.clone(),
                    purpose: purpose.to_string(),
                    index,
                    address: address.clone(),
                    public_key,
                    derivation_path: path.clone(),
                    created_at: now_ms(),
                    last_observed_at: Some(now_ms()),
                };
                write_json(
                    uow,
                    &address_file_path(&account.wallet_id, &account.account_id, purpose, index),
                    &format!("{purpose}-{index}.json"),
                    &record,
                    JSON_MIME,
                )?;
            } else {
                consecutive_unused += 1;
            }
            index += 1;
        }
        if let Some(max_used) = max_used {
            if purpose == "receive" {
                account.next_receive_index =
                    Some(account.next_receive_index.unwrap_or(0).max(max_used + 1));
            } else {
                account.next_change_index =
                    Some(account.next_change_index.unwrap_or(0).max(max_used + 1));
            }
        }
    }
    save_account(uow, account)
}
