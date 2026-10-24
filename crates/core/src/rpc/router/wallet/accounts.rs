use crate::rpc::types::{WalletAccountMeta, WalletNetwork};
use crate::wallet::{
    AccountScheme, SecretPayloadV1, WalletHdAccountMaterializeInput, WalletMetaV1,
    WalletProfileAccountMaterialization, BIP39_MNEMONIC_STANDARD, MULTICHAIN_WALLET_MODE,
    ROTATION_MNEMONIC_STANDARD, TON_NATIVE_MNEMONIC_STANDARD, TON_ONLY_WALLET_MODE,
};

use super::super::domain_uow::DomainUnitOfWork;
use super::secrets::ensure_english_wordlist;
use super::store::{ensure_account_address_dir, save_account, write_json};
use super::{address_file_path, WalletCommandError, WalletResult, JSON_MIME};

pub(super) fn materialize_profile_account(
    uow: &mut DomainUnitOfWork<'_>,
    materialization: WalletProfileAccountMaterialization,
    wallet: &WalletMetaV1,
) -> WalletResult<WalletAccountMeta> {
    let mut account = materialization.account;
    if let WalletAccountMeta::Derived(meta) = &mut account {
        if meta.mnemonic_standard.is_empty() {
            meta.wallet_mode = Some(wallet.wallet_mode.clone());
            meta.mnemonic_standard = if meta.network.as_str() == "bitcoin" {
                BIP39_MNEMONIC_STANDARD.to_string()
            } else {
                wallet.mnemonic_standard.clone()
            };
        }
    }
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
    wallet: &WalletMetaV1,
) -> WalletResult<Vec<WalletAccountMeta>> {
    let mut accounts = Vec::with_capacity(materializations.len());
    for materialization in materializations {
        accounts.push(materialize_profile_account(uow, materialization, wallet)?);
    }
    Ok(accounts)
}

/// Address-per-transaction models (Bitcoin) start without a receive address; every client
/// would otherwise have to ask for one before the first deposit. Allocate index 0 as soon as
/// the account exists so "no address yet" never reaches the user. Deterministic and offline.
pub(super) fn allocate_first_receive_address(
    uow: &mut DomainUnitOfWork<'_>,
    profile: &dyn crate::wallet::WalletChainProfile,
    account: WalletAccountMeta,
    secret: &SecretPayloadV1,
    now: u64,
) -> WalletResult<WalletAccountMeta> {
    let needs_address =
        account.account_model() == Some("utxo") && account.current_receive_address().is_none();
    if !needs_address {
        return Ok(account);
    }
    let output = profile
        .derive_address(crate::wallet::WalletAddressDeriveInput {
            account,
            secret: Some(secret.clone()),
            allocated_addresses: Vec::new(),
            purpose: "receive".to_string(),
            now,
        })
        .map_err(WalletCommandError::from)?;
    materialize_profile_addresses(uow, &output.account, vec![output.address])?;
    save_account(uow, &output.account)?;
    Ok(output.account)
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

pub(super) fn hd_account_input(
    wallet: &WalletMetaV1,
    secret: &SecretPayloadV1,
    network: WalletNetwork,
    account_index: u32,
    now: u64,
) -> WalletResult<WalletHdAccountMaterializeInput> {
    ensure_english_wordlist(secret)?;
    let (root, ton_signing) = secret
        .wallet_root()
        .ok_or_else(|| WalletCommandError::internal("Wallet secret is not an HD root"))?;
    let scheme = if network.as_str() == "ton" {
        match (
            wallet.wallet_mode.as_str(),
            wallet.mnemonic_standard.as_str(),
        ) {
            (TON_ONLY_WALLET_MODE, TON_NATIVE_MNEMONIC_STANDARD) => {
                AccountScheme::TonNativeWalletTgAccount
            }
            (TON_ONLY_WALLET_MODE | MULTICHAIN_WALLET_MODE, ROTATION_MNEMONIC_STANDARD) => {
                AccountScheme::TonRotationWalletTgAccount
            }
            (MULTICHAIN_WALLET_MODE, BIP39_MNEMONIC_STANDARD) => {
                AccountScheme::TonBip39WalletTgAccount
            }
            _ => {
                return Err(WalletCommandError::invalid_input(
                    "TON wallet_mode and mnemonic_standard mismatch",
                ))
            }
        }
    } else {
        if wallet.wallet_mode != MULTICHAIN_WALLET_MODE {
            return Err(WalletCommandError::unsupported_chain(
                "network requires a multichain wallet",
            ));
        }
        match network.as_str() {
            "ethereum" => AccountScheme::EthereumEip44Account,
            "solana" => AccountScheme::SolanaBip44Account,
            // The registry also accepts custom BIP39 profiles (such as the RPC test profile).
            _ => AccountScheme::BitcoinBip84Account,
        }
    };
    scheme
        .ensure_compatible(&root)
        .map_err(WalletCommandError::from)?;
    Ok(WalletHdAccountMaterializeInput {
        wallet_id: wallet.wallet_id.clone(),
        network,
        account_index,
        root,
        ton_signing,
        scheme,
        now,
    })
}
