use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::rpc::types::{WalletAccountMeta, WalletBalanceGetResponse, WalletTransactionEntry};
use crate::storage::Storage;
use crate::vault::VaultSession;
use crate::wallet::{
    hex_string, AllocatedAddressV1, BroadcastArtifactV2, PreparationRecordV1, PreparationStateV1,
    SecretBlobV1, SecretPayloadV1, WalletBalanceCacheV1, WalletIndexV1, WalletMetaV1,
    WalletOperationIdempotencyRecordV1, WalletReconciliationEvidenceV1, WalletSignedArtifact,
    WALLET_BALANCE_CACHE_SCHEMA_VERSION, WALLET_ROOT, WALLET_SCHEMA_VERSION,
};
use zeroize::Zeroizing;

use super::super::domain_read::{read_blob_by_path, DomainReadScope};
use super::super::domain_uow::DomainUnitOfWork;
use super::error::{WalletCommandError, WalletResult};
use super::paths::{
    account_path, balance_cache_path, broadcast_artifact_path, idempotency_path,
    reconciliation_evidence_path, secret_path, tx_path, wallet_meta_path,
};
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
    ensure_dir(uow, "/.wallet/tx-journal")?;
    ensure_dir(uow, "/.wallet/broadcast-artifacts")?;
    ensure_dir(uow, "/.wallet/reconciliation")?;
    ensure_dir(uow, "/.wallet/idempotency")?;
    ensure_dir(uow, "/.wallet/address-book")
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

pub(super) fn payload_digest<T: Serialize>(value: &T) -> WalletResult<String> {
    let bytes = serde_json::to_vec(value).map_err(|error| {
        WalletCommandError::internal(format!(
            "wallet payload digest serialization failed: {error}"
        ))
    })?;
    Ok(hex_string(&crate::crypto::hash(&bytes)))
}

pub(super) fn load_idempotency_record(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    client_request_id: &str,
) -> WalletResult<Option<WalletOperationIdempotencyRecordV1>> {
    read_json(session, storage, &idempotency_path(client_request_id))
}

pub(super) fn save_idempotency_record(
    uow: &mut DomainUnitOfWork<'_>,
    record: &WalletOperationIdempotencyRecordV1,
) -> WalletResult<()> {
    write_json(
        uow,
        &idempotency_path(&record.client_request_id),
        &format!("{}.json", record.client_request_id),
        record,
        JSON_MIME,
    )
}

pub(super) fn delete_path(uow: &mut DomainUnitOfWork<'_>, path: &str) -> WalletResult<bool> {
    uow.stage_delete_path(path)
        .map_err(WalletCommandError::from)
}

pub(super) fn load_index(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> WalletResult<WalletIndexV1> {
    let index = read_json(session, storage, INDEX_PATH)?.unwrap_or(WalletIndexV1 {
        schema_version: WALLET_SCHEMA_VERSION,
        wallet_ids: Vec::new(),
        created_at: 0,
        updated_at: 0,
    });
    validate_wallet_schema(index.schema_version)?;
    Ok(index)
}

pub(super) fn validate_wallet_schema(schema_version: u32) -> WalletResult<()> {
    if schema_version > WALLET_SCHEMA_VERSION {
        return Err(WalletCommandError::storage_version_not_supported(format!(
            ".wallet schema_version {schema_version} is newer than supported {WALLET_SCHEMA_VERSION}"
        )));
    }
    Ok(())
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
        a.wallet_id()
            .cmp(b.wallet_id())
            .then_with(|| a.network().as_str().cmp(b.network().as_str()))
            .then_with(|| {
                a.account_index()
                    .unwrap_or(0)
                    .cmp(&b.account_index().unwrap_or(0))
            })
            .then_with(|| a.account_id().cmp(b.account_id()))
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
        .find(|account| account.account_id() == account_id)
        .ok_or_else(WalletCommandError::account_not_found)
}

pub(super) fn load_balance_caches(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    accounts: &[WalletAccountMeta],
) -> WalletResult<Vec<WalletBalanceGetResponse>> {
    let mut balances = Vec::new();
    for account in accounts {
        let path = balance_cache_path(account.wallet_id(), account.account_id());
        let Some(bytes) = read_blob_by_path(session, storage, DomainReadScope::Wallet, &path)?
        else {
            continue;
        };
        let cache = match serde_json::from_slice::<WalletBalanceCacheV1>(&bytes) {
            Ok(cache) => cache,
            Err(error) => {
                tracing::warn!(
                    account_id = account.account_id(),
                    error = %error,
                    "wallet_balance_cache_parse_failed"
                );
                continue;
            }
        };
        if cache.schema_version != WALLET_BALANCE_CACHE_SCHEMA_VERSION
            || cache.wallet_id != account.wallet_id()
            || cache.account_id != account.account_id()
            || &cache.network != account.network()
        {
            tracing::warn!(
                account_id = account.account_id(),
                schema_version = cache.schema_version,
                "wallet_balance_cache_contract_mismatch"
            );
            continue;
        }
        balances.push(WalletBalanceGetResponse {
            account_id: cache.account_id,
            network: cache.network,
            balance: cache.balance,
            fetched_at: cache.fetched_at,
        });
    }
    balances.sort_by(|a, b| a.account_id.cmp(&b.account_id));
    Ok(balances)
}

pub(super) fn load_account_addresses(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    wallet_id: &str,
    account_id: &str,
) -> WalletResult<Vec<AllocatedAddressV1>> {
    let Some(root) = session.catalog().find_by_path(&format!(
        "{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}/addresses"
    )) else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        if let Some(address) = read_json::<AllocatedAddressV1>(
            session,
            storage,
            &format!(
                "{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}/addresses/{}",
                child.name
            ),
        )? {
            out.push(address);
        }
    }
    out.sort_by(|a, b| {
        a.purpose
            .cmp(&b.purpose)
            .then_with(|| a.index.cmp(&b.index))
            .then_with(|| a.address.cmp(&b.address))
    });
    Ok(out)
}

pub(super) fn load_live_preparations(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    wallet_id: &str,
    network: &crate::rpc::types::WalletNetwork,
    now: u64,
) -> WalletResult<Vec<PreparationRecordV1>> {
    let Some(root) = session.catalog().find_by_path("/.wallet/preparations") else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for child in root.children() {
        if !child.is_file() || !child.name.ends_with(".json") {
            continue;
        }
        let path = format!("{WALLET_ROOT}/preparations/{}", child.name);
        if let Some(record) = read_json::<PreparationRecordV1>(session, storage, &path)? {
            if record.wallet_id == wallet_id
                && &record.network == network
                && record.state == PreparationStateV1::Ready
                && record.expires_at > now
            {
                out.push(record);
            }
        }
    }
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(out)
}

pub(super) fn save_account(
    uow: &mut DomainUnitOfWork<'_>,
    account: &WalletAccountMeta,
) -> WalletResult<()> {
    ensure_wallet_wallet_dirs(uow, account.wallet_id())?;
    write_json(
        uow,
        &account_path(account.wallet_id(), account.account_id()),
        &format!("{}.json", account.account_id()),
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

pub(super) fn load_broadcast_artifact(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    tx_ref: &str,
) -> WalletResult<BroadcastArtifactV2> {
    read_json(session, storage, &broadcast_artifact_path(tx_ref))?
        .ok_or_else(|| WalletCommandError::internal("Wallet broadcast artifact not found"))
}

pub(super) fn load_reconciliation_evidence(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    tx_ref: &str,
) -> WalletResult<Option<WalletReconciliationEvidenceV1>> {
    read_json(session, storage, &reconciliation_evidence_path(tx_ref))
}

pub(super) fn save_reconciliation_evidence(
    uow: &mut DomainUnitOfWork<'_>,
    evidence: &WalletReconciliationEvidenceV1,
) -> WalletResult<()> {
    write_json(
        uow,
        &reconciliation_evidence_path(&evidence.tx_ref),
        &format!("{}.json", evidence.tx_ref),
        evidence,
        JSON_MIME,
    )
}

pub(super) fn load_signed_broadcast_artifact_from_record(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    artifact: BroadcastArtifactV2,
) -> WalletResult<WalletSignedArtifact> {
    let secret = load_secret(session, storage, &artifact.artifact_ref)?;
    let SecretPayloadV1::BroadcastArtifact {
        signed_artifact,
        tx_hash,
        message_ref,
        submit_metadata,
    } = secret.payload
    else {
        return Err(WalletCommandError::internal(
            "Wallet broadcast artifact secret has invalid payload",
        ));
    };
    if !artifact.artifact_digest.is_empty()
        && artifact.artifact_digest != crate::wallet::hash_hex(&[signed_artifact.as_bytes()])
    {
        return Err(WalletCommandError::internal(
            "Wallet broadcast artifact digest mismatch",
        ));
    }
    Ok(WalletSignedArtifact {
        signed_artifact: Zeroizing::new(signed_artifact),
        tx_hash: tx_hash.or(artifact.tx_hash),
        message_ref: message_ref.or(artifact.message_ref),
        submit_metadata,
    })
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
