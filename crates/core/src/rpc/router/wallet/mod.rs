//! Wallet domain RPC handlers (SPEC-217).

use serde::Serialize;
use serde_json::Value;

use crate::error::ErrorCode;
use crate::rpc::types::{
    RpcResponse, WalletAccountMeta, WalletAccountsDeriveRequest, WalletAccountsDeriveResponse,
    WalletAccountsListRequest, WalletAccountsListResponse, WalletAddressBookCreateRequest,
    WalletAddressBookCreateResponse, WalletAddressBookDeleteRequest,
    WalletAddressBookDeleteResponse, WalletAddressBookEntry, WalletAddressBookListRequest,
    WalletAddressBookListResponse, WalletAddressBookUpdateRequest, WalletAddressBookUpdateResponse,
    WalletAddressDetectRequest, WalletAddressDetectResponse, WalletAddressesDeriveRequest,
    WalletBackupExportRequest, WalletBackupExportResponse, WalletBalanceGetRequest,
    WalletBalanceGetResponse, WalletConfirmStatus, WalletHdCreateRequest, WalletHdCreateResponse,
    WalletHdGenerateMnemonicRequest, WalletHdGenerateMnemonicResponse, WalletImportCreateRequest,
    WalletImportCreateResponse, WalletListRequest, WalletListResponse, WalletNetwork,
    WalletSpendAuthorizationCreateRequest, WalletSpendAuthorizationCreateResponse,
    WalletSpendAuthorizationRevokeRequest, WalletSpendAuthorizationRevokeResponse,
    WalletSpendAuthorizationScope, WalletStatusRequest, WalletStatusResponse,
    WalletTonRotateKeyRequest, WalletTonRotateKeyResponse, WalletTransactionCancelRequest,
    WalletTransactionCancelResponse, WalletTransactionConfirmRequest,
    WalletTransactionConfirmResponse, WalletTransactionEntry, WalletTransactionPrepareRequest,
    WalletTransactionPrepareResponse, WalletTransactionQuoteRequest,
    WalletTransactionQuoteResponse, WalletTransactionRebroadcastRequest,
    WalletTransactionRebroadcastResponse, WalletTransactionsListRequest,
    WalletTransactionsListResponse, WalletTransactionsRefreshRequest,
    WalletTransactionsRefreshResponse, WalletTransactionsSyncRequest,
    WalletTransactionsSyncResponse,
};
use crate::storage::Storage;
use crate::vault::VaultSession;
use crate::wallet::{
    account_summary_from_meta, hash_hex, hex_string, new_account_id, new_address_book_entry_id,
    new_mnemonic_draft_id, new_preparation_id, new_secret_id, new_tx_ref, new_wallet_id, now_ms,
    parse_hex, BroadcastArtifactV2, BroadcastSubmitAttemptV1, PreparationRecordV1,
    PreparationStateV1, PreparedIntentV1, SecretBlobV1, SecretPayloadV1,
    WalletImportedAccountMaterializeInput, WalletKeyRotationInput, WalletMetaV1,
    WalletOperationIdempotencyRecordV1, WalletProviderObservationOutcomeV1,
    WalletProviderObservationV1, WalletReconciliationEvidenceV1, WalletSecretReconcileInput,
    WalletTelemetryEvent, WalletTelemetryMetric, WalletTxStatus, BIP39_ENGLISH_WORDLIST,
    BIP39_MNEMONIC_STANDARD, MNEMONIC_DRAFT_TTL_MS, MULTICHAIN_WALLET_MODE, PREPARATION_TTL_MS,
    ROTATION_MNEMONIC_STANDARD, TON_NATIVE_MNEMONIC_STANDARD, TON_ONLY_WALLET_MODE, WALLET_ROOT,
    WALLET_SCHEMA_VERSION,
};

use super::state::RpcRouter;

const INDEX_PATH: &str = "/.wallet/index.json";
const JSON_MIME: &str = "application/json";
const SECRET_MIME: &str = "application/octet-stream";

mod account_handlers;
mod accounts;
mod address_book;
mod auth;
mod backup;
pub(in crate::rpc::router) mod balance;
mod error;
mod hd;
pub(in crate::rpc::router) mod history;
mod import;
mod lifecycle;
mod overview;
mod parse;
mod paths;
mod preparations;
mod provider;
mod rotation;
mod secrets;
mod store;
mod transaction_handlers;
mod transactions;

use accounts::{
    allocate_first_receive_address, hd_account_input, materialize_profile_account,
    materialize_profile_accounts, materialize_profile_addresses,
};
use error::{WalletCommandError, WalletResult};
use parse::{
    has_balance_freshness, has_disallowed_fee_policy_fields, has_disallowed_prepare_fields,
    has_duplicate_networks, parse, ton_prepare_boundary_error,
};
use paths::{
    address_book_entry_path, address_file_path, balance_cache_path, broadcast_artifact_path,
    preparation_path, secret_filename, secret_path, tx_path, wallet_meta_path,
};
use preparations::{
    cancel_preparation, cleanup_expired_preparations, create_preparation,
    load_confirmable_preparation, load_preparation_by_tx_ref, stage_mark_preparation_consumed,
    stage_mark_preparation_in_flight, stage_supersede_ready_sibling_preparations,
    PreparedTransactionInput,
};
use provider::invalid_input;
use store::{
    begin_wallet_uow, commit_wallet_uow, delete_path, ensure_wallet_dirs,
    ensure_wallet_wallet_dirs, load_account_addresses, load_account_by_id, load_accounts,
    load_balance_caches, load_broadcast_artifact, load_idempotency_record, load_index,
    load_live_preparations, load_reconciliation_evidence, load_secret,
    load_signed_broadcast_artifact_from_record, load_transaction, load_transactions, load_wallet,
    load_wallets, payload_digest, read_json, save_account, save_idempotency_record, save_index,
    save_reconciliation_evidence, write_json,
};
use transactions::{sum_outputs, validate_outputs};

fn result_response<T: Serialize>(result: WalletResult<T>) -> RpcResponse {
    match result {
        Ok(response) => RpcResponse::success(response),
        Err(error) => error.into_rpc_response(),
    }
}
