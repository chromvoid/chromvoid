use super::*;
use crate::rpc::types::WalletTransactionDirection;

const DEFAULT_HISTORY_LIMIT: u32 = 50;
const MAX_HISTORY_LIMIT: u32 = 200;

pub struct WalletHistorySnapshot {
    started_at: std::time::Instant,
    account_snapshot: WalletAccountMeta,
    amount_unit: String,
    task: crate::wallet::WalletHistoryTask,
}

pub struct WalletHistoryExecution {
    started_at: std::time::Instant,
    account_snapshot: WalletAccountMeta,
    amount_unit: String,
    output: Result<crate::wallet::WalletHistoryOutput, crate::wallet::WalletChainError>,
}

pub fn execute_wallet_history_snapshot(snapshot: WalletHistorySnapshot) -> WalletHistoryExecution {
    WalletHistoryExecution {
        started_at: snapshot.started_at,
        account_snapshot: snapshot.account_snapshot,
        amount_unit: snapshot.amount_unit,
        output: (snapshot.task)(),
    }
}

impl RpcRouter {
    pub fn snapshot_wallet_transactions_sync(
        &mut self,
        data: &Value,
    ) -> Result<WalletHistorySnapshot, RpcResponse> {
        let started_at = std::time::Instant::now();
        self.snapshot_wallet_transactions_sync_inner(data, started_at)
            .map_err(|response| {
                self.observe_wallet_rpc_response("wallet:transactions:sync", started_at, response)
            })
    }

    fn snapshot_wallet_transactions_sync_inner(
        &mut self,
        data: &Value,
        started_at: std::time::Instant,
    ) -> Result<WalletHistorySnapshot, RpcResponse> {
        if let Some(response) = self.wallet_preflight() {
            return Err(response);
        }
        let request = parse::<WalletTransactionsSyncRequest>(data)
            .map_err(WalletCommandError::into_rpc_response)?;
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_history_session(|session, storage| {
            let account = load_account_by_id(session, storage, &request.account_id)?;
            let profile = registry
                .enabled_profile(account.network(), &config)
                .map_err(WalletCommandError::from)?;
            let amount_unit = profile.amount_unit().to_string();
            let mut allocated_addresses = Vec::new();
            for wallet_account in load_accounts(session, storage, Some(account.wallet_id()))? {
                if wallet_account.network() == account.network() {
                    allocated_addresses.extend(load_account_addresses(
                        session,
                        storage,
                        wallet_account.wallet_id(),
                        wallet_account.account_id(),
                    )?);
                }
            }
            let task = profile
                .split_history_task(crate::wallet::WalletHistoryInput {
                    account: account.clone(),
                    allocated_addresses,
                    limit: request
                        .limit
                        .unwrap_or(DEFAULT_HISTORY_LIMIT)
                        .clamp(1, MAX_HISTORY_LIMIT),
                    now: now_ms(),
                })
                .map_err(WalletCommandError::from)?
                .ok_or_else(|| {
                    WalletCommandError::invalid_input(
                        "transaction history sync is unsupported for this network",
                    )
                })?;
            Ok(WalletHistorySnapshot {
                started_at,
                account_snapshot: account,
                amount_unit,
                task,
            })
        })
    }

    pub fn commit_wallet_transactions_sync(
        &mut self,
        execution: WalletHistoryExecution,
    ) -> RpcResponse {
        let started_at = execution.started_at;
        let response = self.commit_wallet_transactions_sync_inner(execution);
        self.observe_wallet_rpc_response("wallet:transactions:sync", started_at, response)
    }

    fn commit_wallet_transactions_sync_inner(
        &mut self,
        execution: WalletHistoryExecution,
    ) -> RpcResponse {
        let output = match execution.output {
            Ok(output) => output,
            Err(error) => return WalletCommandError::from(error).into_rpc_response(),
        };
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let account =
                load_account_by_id(session, storage, execution.account_snapshot.account_id())?;
            if account != execution.account_snapshot {
                return Err(WalletCommandError::invalid_input(
                    "wallet account changed during transaction history sync",
                ));
            }
            let fetched_at = now_ms();
            let synced_count = output.transactions.len() as u32;
            merge_history_transactions(
                session,
                storage,
                &account,
                &execution.amount_unit,
                output.transactions,
                fetched_at,
            )?;
            Ok(WalletTransactionsSyncResponse {
                account_id: account.account_id().to_string(),
                network: account.network().clone(),
                synced_count,
                fetched_at,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transactions_sync(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        let started_at = std::time::Instant::now();
        let snapshot = match self.snapshot_wallet_transactions_sync_inner(data, started_at) {
            Ok(snapshot) => snapshot,
            Err(response) => return response,
        };
        self.commit_wallet_transactions_sync_inner(execute_wallet_history_snapshot(snapshot))
    }

    fn with_wallet_history_session<T>(
        &mut self,
        f: impl FnOnce(&mut VaultSession, &Storage) -> WalletResult<T>,
    ) -> Result<T, RpcResponse> {
        let storage = self.storage.clone();
        let session = self.session.as_mut().ok_or_else(|| {
            RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired))
        })?;
        cleanup_expired_preparations(session, &storage)
            .map_err(WalletCommandError::into_rpc_response)?;
        f(session, &storage).map_err(WalletCommandError::into_rpc_response)
    }
}

fn merge_history_transactions(
    session: &mut VaultSession,
    storage: &Storage,
    account: &WalletAccountMeta,
    amount_unit: &str,
    transactions: Vec<crate::wallet::WalletHistoryTransaction>,
    fetched_at: u64,
) -> WalletResult<()> {
    if transactions.is_empty() {
        return Ok(());
    }
    let existing = load_transactions(session, storage)?;
    let mut uow = begin_wallet_uow(session, storage, "wallet-transactions-sync");
    for transaction in transactions {
        let matched = existing
            .iter()
            .find(|entry| history_matches_entry(account, &transaction, entry))
            .cloned();
        let tx_ref = matched
            .as_ref()
            .map(|entry| entry.tx_ref.clone())
            .unwrap_or_else(|| history_tx_ref(account.account_id(), &transaction.tx_hash));
        let provider_direction = transaction.direction;
        let direction = if provider_direction == WalletTransactionDirection::Unknown {
            matched
                .as_ref()
                .and_then(|entry| entry.direction)
                .unwrap_or(WalletTransactionDirection::Unknown)
        } else {
            provider_direction
        };
        let amount = if provider_direction == WalletTransactionDirection::Unknown
            && transaction.amount == "0"
        {
            matched
                .as_ref()
                .map(|entry| entry.amount.clone())
                .unwrap_or(transaction.amount)
        } else {
            transaction.amount
        };
        let entry = WalletTransactionEntry {
            tx_ref: tx_ref.clone(),
            wallet_id: account.wallet_id().to_string(),
            account_id: account.account_id().to_string(),
            network: account.network().clone(),
            status: transaction.status.as_str().to_string(),
            tx_hash: Some(transaction.tx_hash),
            message_ref: transaction
                .message_ref
                .or_else(|| matched.as_ref().and_then(|entry| entry.message_ref.clone())),
            broadcast_artifact_ref: matched
                .as_ref()
                .and_then(|entry| entry.broadcast_artifact_ref.clone()),
            amount_unit: amount_unit.to_string(),
            amount,
            fee: transaction.fee,
            direction: Some(direction),
            counterparty: transaction.counterparty.or_else(|| {
                matched
                    .as_ref()
                    .and_then(|entry| entry.counterparty.clone())
            }),
            valid_until: matched.as_ref().and_then(|entry| entry.valid_until),
            created_at: matched
                .as_ref()
                .map(|entry| entry.created_at)
                .unwrap_or(transaction.created_at),
            updated_at: fetched_at,
        };
        write_json(
            &mut uow,
            &tx_path(&tx_ref),
            &format!("{tx_ref}.json"),
            &entry,
            JSON_MIME,
        )?;
    }
    commit_wallet_uow(uow, session)
}

fn history_matches_entry(
    account: &WalletAccountMeta,
    transaction: &crate::wallet::WalletHistoryTransaction,
    entry: &WalletTransactionEntry,
) -> bool {
    entry.account_id == account.account_id()
        && (entry.tx_hash.as_deref() == Some(transaction.tx_hash.as_str())
            || transaction
                .message_ref
                .as_deref()
                .is_some_and(|message_ref| entry.message_ref.as_deref() == Some(message_ref)))
}

fn history_tx_ref(account_id: &str, tx_hash: &str) -> String {
    // The `ton-` prefix predates multi-chain history; it is an opaque journal key shared by every
    // network so existing TON entries keep matching.
    format!(
        "ton-history-{}",
        hash_hex(&[account_id.as_bytes(), tx_hash.as_bytes()])
    )
}
