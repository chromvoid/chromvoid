use crate::rpc::types::WalletNetwork;
use crate::wallet::WALLET_ROOT;

pub(super) fn wallet_meta_path(wallet_id: &str) -> String {
    format!("{WALLET_ROOT}/wallets/{wallet_id}/meta.json")
}

pub(super) fn account_path(wallet_id: &str, account_id: &str) -> String {
    format!("{WALLET_ROOT}/wallets/{wallet_id}/accounts/{account_id}.json")
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

pub(super) fn bitcoin_derivation_path(account_index: u32, chain: u32, index: u32) -> String {
    format!("m/84'/0'/{account_index}'/{chain}/{index}")
}

pub(super) fn ethereum_derivation_path(account_index: u32) -> String {
    format!("m/44'/60'/0'/0/{account_index}")
}

pub(super) fn imported_derivation_path(network: WalletNetwork) -> &'static str {
    match network {
        WalletNetwork::Bitcoin => "imported:bitcoin",
        WalletNetwork::Ethereum => "imported:ethereum",
    }
}
