//! Wallet domain RPC handlers (SPEC-217).

use serde::Serialize;
use serde_json::Value;

use crate::error::ErrorCode;
use crate::rpc::types::{
    RpcResponse, WalletAccountMeta, WalletAccountsDeriveRequest, WalletAccountsDeriveResponse,
    WalletAccountsListRequest, WalletAccountsListResponse, WalletAddressesDeriveRequest,
    WalletAddressesDeriveResponse, WalletBackupExportRequest, WalletBackupExportResponse,
    WalletBalanceGetRequest, WalletBalanceGetResponse, WalletHdCreateRequest,
    WalletHdCreateResponse, WalletHdGenerateMnemonicRequest, WalletHdGenerateMnemonicResponse,
    WalletImportCreateRequest, WalletImportCreateResponse, WalletListResponse, WalletNetwork,
    WalletStatusResponse, WalletTransactionCancelRequest, WalletTransactionCancelResponse,
    WalletTransactionConfirmRequest, WalletTransactionConfirmResponse, WalletTransactionEntry,
    WalletTransactionPrepareRequest, WalletTransactionPrepareResponse,
    WalletTransactionsListRequest, WalletTransactionsListResponse,
    WalletTransactionsRefreshRequest, WalletTransactionsRefreshResponse,
};
use crate::storage::Storage;
use crate::vault::VaultSession;
use crate::wallet::{
    account_summary_from_meta, derive_address, derive_public_key, hash_hex, new_account_id,
    new_preparation_id, new_secret_id, new_tx_ref, new_wallet_id, now_ms, AllocatedAddressV1,
    PreparationRecordV1, PreparedIntentV1, SecretBlobV1, SecretPayloadV1, WalletBroadcastOutcome,
    WalletMetaV1, PREPARATION_TTL_MS, WALLET_ROOT, WALLET_SCHEMA_VERSION,
};

use super::state::RpcRouter;

const INDEX_PATH: &str = "/.wallet/index.json";
const JSON_MIME: &str = "application/json";
const SECRET_MIME: &str = "application/octet-stream";

mod account_handlers;
mod accounts;
mod backup;
mod balance;
mod error;
mod hd;
mod import;
mod lifecycle;
mod overview;
mod parse;
mod paths;
mod preparations;
mod provider;
mod store;
mod transaction_handlers;
mod transactions;

use accounts::{
    backfill_bitcoin_discovery, bitcoin_account_addresses, hd_seed_from_secret,
    materialize_hd_account,
};
use error::{WalletCommandError, WalletResult};
use parse::{
    has_disallowed_prepare_fields, has_duplicate_networks, mnemonic_word, parse,
    reject_unsupported_network, reject_unsupported_supported_networks,
};
use paths::{
    address_file_path, bitcoin_derivation_path, imported_derivation_path, preparation_path,
    secret_filename, secret_path, tx_path,
};
use preparations::{
    cancel_preparation, cleanup_expired_preparations, create_preparation, load_active_preparation,
    stage_complete_preparation, PreparedTransactionInput,
};
use provider::{invalid_input, provider_error, provider_unavailable};
use store::{
    begin_wallet_uow, commit_wallet_uow, delete_path, ensure_wallet_dirs,
    ensure_wallet_wallet_dirs, load_account_by_id, load_accounts, load_index, load_secret,
    load_transaction, load_transactions, load_wallet, load_wallets, save_account, save_index,
    write_json,
};
use transactions::{
    prepare_bitcoin, prepare_ethereum, revalidate_preconditions, sum_outputs, validate_outputs,
};

fn result_response<T: Serialize>(result: WalletResult<T>) -> RpcResponse {
    match result {
        Ok(response) => RpcResponse::success(response),
        Err(error) => error.into_rpc_response(),
    }
}
