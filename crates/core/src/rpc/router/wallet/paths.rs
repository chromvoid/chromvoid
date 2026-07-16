use crate::wallet::WALLET_ROOT;

pub(super) fn wallet_meta_path(wallet_id: &str) -> String {
    format!("{WALLET_ROOT}/wallets/{wallet_id}/meta.json")
}

pub(super) fn account_path(wallet_id: &str, account_id: &str) -> String {
    format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}.json")
}

pub(super) fn balance_cache_path(wallet_id: &str, account_id: &str) -> String {
    format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}/balance-cache.json")
}

pub(super) fn secret_path(secret_id: &str) -> String {
    format!("{WALLET_ROOT}/secrets/{}", secret_filename(secret_id))
}

pub(super) fn secret_filename(secret_id: &str) -> String {
    format!("{secret_id}.blob")
}

pub(super) fn preparation_path(preparation_id: &str) -> String {
    format!("{WALLET_ROOT}/preparations/{preparation_id}.json")
}

pub(super) fn tx_path(tx_ref: &str) -> String {
    format!("{WALLET_ROOT}/tx-journal/{tx_ref}.json")
}

pub(super) fn broadcast_artifact_path(tx_ref: &str) -> String {
    format!("{WALLET_ROOT}/broadcast-artifacts/{tx_ref}.json")
}

pub(super) fn reconciliation_evidence_path(tx_ref: &str) -> String {
    format!("{WALLET_ROOT}/reconciliation/{tx_ref}.json")
}

pub(super) fn idempotency_path(client_request_id: &str) -> String {
    format!("{WALLET_ROOT}/idempotency/{client_request_id}.json")
}

pub(super) fn address_book_entry_path(entry_id: &str) -> String {
    format!("{WALLET_ROOT}/address-book/{entry_id}.json")
}

pub(super) fn address_file_path(
    wallet_id: &str,
    account_id: &str,
    purpose: &str,
    index: u32,
) -> String {
    format!(
        "{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}/addresses/{purpose}-{index}.json"
    )
}
