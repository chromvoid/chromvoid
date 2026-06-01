use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::rpc::types::{WalletAccountMeta, WalletTransactionEntry};
use crate::storage::Storage;
use crate::vault::VaultSession;
use crate::wallet::{
    SecretBlobV1, WalletIndexV1, WalletMetaV1, WALLET_ROOT, WALLET_SCHEMA_VERSION,
};

use super::super::domain_read::{read_blob_by_path, DomainReadScope};
use super::super::domain_uow::DomainUnitOfWork;
use super::error::{WalletCommandError, WalletResult};
use super::paths::{account_path, secret_path, tx_path, wallet_meta_path};
use super::{INDEX_PATH, JSON_MIME};

pub(super) fn begin_wallet_uow<'a>(
    session: &VaultSession,
    storage: &'a Storage,
    tx_id_hint: &str,
) -> DomainUnitOfWork<'a> {
    DomainUnitOfWork::begin(session, storage, ".wallet", tx_id_hint)
}

pub(super) fn commit_wallet_uow(
    uow: DomainUnitOfWork<'_>,
    session: &mut VaultSession,
) -> WalletResult<()> {
    let outcome = uow.commit(session)?;
    let _ = outcome.chunks_written();
    Ok(())
}

pub(super) fn ensure_wallet_dirs(uow: &mut DomainUnitOfWork<'_>) -> WalletResult<()> {
    ensure_dir(uow, WALLET_ROOT)?;
    ensure_dir(uow, "/.wallet/wallets")?;
    ensure_dir(uow, "/.wallet/secrets")?;
    ensure_dir(uow, "/.wallet/preparations")?;
    ensure_dir(uow, "/.wallet/tx-journal")
}

pub(super) fn ensure_wallet_wallet_dirs(
    uow: &mut DomainUnitOfWork<'_>,
    wallet_id: &str,
) -> WalletResult<()> {
    ensure_dir(uow, &format!("{WALLET_ROOT}/wallets/{wallet_id}"))?;
    ensure_dir(uow, &format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts"))
}

pub(super) fn ensure_account_address_dir(
    uow: &mut DomainUnitOfWork<'_>,
    wallet_id: &str,
    account_id: &str,
) -> WalletResult<()> {
    ensure_dir(
        uow,
        &format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}"),
    )?;
    ensure_dir(
        uow,
        &format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}/addresses"),
    )
}

pub(super) fn ensure_dir(uow: &mut DomainUnitOfWork<'_>, path: &str) -> WalletResult<()> {
    Ok(uow.ensure_dir(path)?)
}

pub(super) fn read_json<T: DeserializeOwned>(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    path: &str,
) -> WalletResult<Option<T>> {
    let Some(bytes) = read_blob_by_path(session, storage, DomainReadScope::Wallet, path)? else {
        return Ok(None);
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| WalletCommandError::internal(format!("wallet file parse failed: {error}")))
}

pub(super) fn write_json<T: Serialize>(
    uow: &mut DomainUnitOfWork<'_>,
    path: &str,
    name: &str,
    value: &T,
    mime_type: &str,
) -> WalletResult<()> {
    let parent = path
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or(WALLET_ROOT);
    ensure_dir(uow, parent)?;
    let bytes = serde_json::to_vec(value).map_err(|error| {
        WalletCommandError::internal(format!("wallet serialization failed: {error}"))
    })?;
    uow.stage_blob_write(parent, name, &bytes, mime_type)
        .map(|_| ())
        .map_err(WalletCommandError::from)
}

pub(super) fn delete_path(uow: &mut DomainUnitOfWork<'_>, path: &str) -> WalletResult<bool> {
    uow.stage_delete_path(path)
        .map_err(WalletCommandError::from)
}

pub(super) fn load_index(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> WalletResult<WalletIndexV1> {
    Ok(
        read_json(session, storage, INDEX_PATH)?.unwrap_or(WalletIndexV1 {
            schema_version: WALLET_SCHEMA_VERSION,
            wallet_ids: Vec::new(),
            created_at: 0,
            updated_at: 0,
        }),
    )
}

pub(super) fn save_index(
    uow: &mut DomainUnitOfWork<'_>,
    index: &WalletIndexV1,
) -> WalletResult<()> {
    write_json(uow, INDEX_PATH, "index.json", index, JSON_MIME)
}

pub(super) fn load_wallets(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> WalletResult<Vec<WalletMetaV1>> {
    let index = load_index(session, storage)?;
    let mut wallets = Vec::new();
    for wallet_id in index.wallet_ids {
        if let Some(wallet) = read_json(session, storage, &wallet_meta_path(&wallet_id))? {
            wallets.push(wallet);
        }
    }
    Ok(wallets)
}

pub(super) fn load_wallet(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    wallet_id: &str,
) -> WalletResult<WalletMetaV1> {
    read_json(session, storage, &wallet_meta_path(wallet_id))?
        .ok_or_else(WalletCommandError::wallet_not_found)
}

pub(super) fn load_accounts(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    wallet_id: Option<&str>,
) -> WalletResult<Vec<WalletAccountMeta>> {
    let wallet_ids = if let Some(wallet_id) = wallet_id {
        vec![wallet_id.to_string()]
    } else {
        load_index(session, storage)?.wallet_ids
    };
    let mut out = Vec::new();
    for wallet_id in wallet_ids {
        let Some(root) = session
            .catalog()
            .find_by_path(&format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts"))
        else {
            continue;
        };
        for child in root.children() {
            if !child.is_file() || !child.name.ends_with(".json") {
                continue;
            }
            if let Some(account) = read_json::<WalletAccountMeta>(
                session,
                storage,
                &format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts/{}", child.name),
            )? {
                out.push(account);
            }
        }
    }
    out.sort_by(|a, b| {
        a.wallet_id
            .cmp(&b.wallet_id)
            .then_with(|| a.network.as_str().cmp(b.network.as_str()))
            .then_with(|| {
                a.account_index
                    .unwrap_or(0)
                    .cmp(&b.account_index.unwrap_or(0))
            })
            .then_with(|| a.account_id.cmp(&b.account_id))
    });
    Ok(out)
}

pub(super) fn load_account_by_id(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    account_id: &str,
) -> WalletResult<WalletAccountMeta> {
    load_accounts(session, storage, None)?
        .into_iter()
        .find(|account| account.account_id == account_id)
        .ok_or_else(WalletCommandError::account_not_found)
}

pub(super) fn save_account(
    uow: &mut DomainUnitOfWork<'_>,
    account: &WalletAccountMeta,
) -> WalletResult<()> {
    ensure_wallet_wallet_dirs(uow, &account.wallet_id)?;
    write_json(
        uow,
        &account_path(&account.wallet_id, &account.account_id),
        &format!("{}.json", account.account_id),
        account,
        JSON_MIME,
    )
}

pub(super) fn load_secret(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    secret_id: &str,
) -> WalletResult<SecretBlobV1> {
    read_json(session, storage, &secret_path(secret_id))?
        .ok_or_else(|| WalletCommandError::internal("Wallet secret not found"))
}

pub(super) fn load_transactions(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> WalletResult<Vec<WalletTransactionEntry>> {
    let Some(root) = session.catalog().find_by_path("/.wallet/tx-journal") else {
        return Ok(Vec::new());
    };
    let mut transactions = Vec::new();
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        if let Some(entry) = read_json::<WalletTransactionEntry>(
            session,
            storage,
            &format!("{WALLET_ROOT}/tx-journal/{}", child.name),
        )? {
            transactions.push(entry);
        }
    }
    Ok(transactions)
}

pub(super) fn load_transaction(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    tx_ref: &str,
) -> WalletResult<WalletTransactionEntry> {
    read_json(session, storage, &tx_path(tx_ref))?
        .ok_or_else(|| WalletCommandError::node_not_found("Transaction not found"))
}
