use crate::rpc::types::WalletAccountMeta;
use crate::wallet::{SecretBlobV1, WalletProfileAccountMaterialization};

use super::super::domain_uow::DomainUnitOfWork;
use super::store::{ensure_account_address_dir, save_account, write_json};
use super::{address_file_path, WalletCommandError, WalletResult, JSON_MIME};

pub(super) fn materialize_profile_account(
    uow: &mut DomainUnitOfWork<'_>,
    materialization: WalletProfileAccountMaterialization,
) -> WalletResult<WalletAccountMeta> {
    let account = materialization.account;
    account
        .validate_base_contract()
        .map_err(WalletCommandError::internal)?;
    materialize_profile_addresses(uow, &account, materialization.addresses)?;
    save_account(uow, &account)?;
    Ok(account)
}

pub(super) fn materialize_profile_accounts(
    uow: &mut DomainUnitOfWork<'_>,
    materializations: Vec<WalletProfileAccountMaterialization>,
) -> WalletResult<Vec<WalletAccountMeta>> {
    let mut accounts = Vec::with_capacity(materializations.len());
    for materialization in materializations {
        accounts.push(materialize_profile_account(uow, materialization)?);
    }
    Ok(accounts)
}

pub(super) fn materialize_profile_addresses(
    uow: &mut DomainUnitOfWork<'_>,
    account: &WalletAccountMeta,
    addresses: Vec<crate::wallet::AllocatedAddressV1>,
) -> WalletResult<()> {
    if addresses.is_empty() {
        return Ok(());
    }
    ensure_account_address_dir(uow, account.wallet_id(), account.account_id())?;
    for address in addresses {
        write_json(
            uow,
            &address_file_path(
                account.wallet_id(),
                account.account_id(),
                &address.purpose,
                address.index,
            ),
            &format!("{}-{}.json", address.purpose, address.index),
            &address,
            JSON_MIME,
        )?;
    }
    Ok(())
}

pub(super) fn restore_hd_secret_material(
    secret: &SecretBlobV1,
) -> WalletResult<(String, String, Option<Vec<String>>, String, Option<String>)> {
    let root = secret
        .payload
        .hd_root_material()
        .ok_or_else(|| WalletCommandError::internal("Wallet secret is not an HD root"))?;
    Ok((
        root.mnemonic_standard,
        root.mnemonic_entropy,
        root.mnemonic_words,
        root.wordlist,
        root.bip39_passphrase,
    ))
}
