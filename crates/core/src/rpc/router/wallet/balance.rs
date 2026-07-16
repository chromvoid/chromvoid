use super::*;

pub struct WalletBalanceSnapshot {
    started_at: std::time::Instant,
    account_id: String,
    network: WalletNetwork,
    account_snapshot: WalletAccountMeta,
    discover_addresses: bool,
    task: crate::wallet::WalletBalanceTask,
}

pub struct WalletBalanceExecution {
    started_at: std::time::Instant,
    account_id: String,
    network: WalletNetwork,
    account_snapshot: WalletAccountMeta,
    discover_addresses: bool,
    output: Result<crate::wallet::WalletBalanceOutput, crate::wallet::WalletChainError>,
}

pub fn execute_wallet_balance_snapshot(snapshot: WalletBalanceSnapshot) -> WalletBalanceExecution {
    WalletBalanceExecution {
        started_at: snapshot.started_at,
        account_id: snapshot.account_id,
        network: snapshot.network,
        account_snapshot: snapshot.account_snapshot,
        discover_addresses: snapshot.discover_addresses,
        output: (snapshot.task)(),
    }
}

impl RpcRouter {
    pub fn snapshot_wallet_balance_get(
        &mut self,
        data: &Value,
    ) -> Result<Option<WalletBalanceSnapshot>, RpcResponse> {
        let started_at = std::time::Instant::now();
        let result = self.snapshot_wallet_balance_get_inner(data, started_at);
        result.map_err(|response| {
            self.observe_wallet_rpc_response("wallet:balance:get", started_at, response)
        })
    }

    fn snapshot_wallet_balance_get_inner(
        &mut self,
        data: &Value,
        started_at: std::time::Instant,
    ) -> Result<Option<WalletBalanceSnapshot>, RpcResponse> {
        if let Some(response) = self.wallet_preflight() {
            return Err(response);
        }
        if has_balance_freshness(data) {
            return Err(
                invalid_input("wallet:balance:get does not accept freshness").into_rpc_response(),
            );
        }
        let request = parse::<WalletBalanceGetRequest>(data)
            .map_err(WalletCommandError::into_rpc_response)?;
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_balance_session(|session, storage| {
            let discover_addresses = request.discover_addresses.unwrap_or(false);
            let input =
                wallet_balance_input(session, storage, &request.account_id, discover_addresses)?;
            let account_id = input.account.account_id().to_string();
            let network = input.account.network().clone();
            let account_snapshot = input.account.clone();
            let profile = registry
                .enabled_profile(&network, &config)
                .map_err(WalletCommandError::from)?;
            let Some(task) = profile
                .split_balance_task(input)
                .map_err(WalletCommandError::from)?
            else {
                return Ok(None);
            };
            Ok(Some(WalletBalanceSnapshot {
                started_at,
                account_id,
                network,
                account_snapshot,
                discover_addresses,
                task,
            }))
        })
    }

    pub fn commit_wallet_balance_get(&mut self, execution: WalletBalanceExecution) -> RpcResponse {
        let started_at = execution.started_at;
        let output = match execution.output {
            Ok(output) => output,
            Err(error) => {
                let response = WalletCommandError::from(error).into_rpc_response();
                return self.observe_wallet_rpc_response(
                    "wallet:balance:get",
                    started_at,
                    response,
                );
            }
        };
        if let Some(response) = self.wallet_preflight() {
            return self.observe_wallet_rpc_response("wallet:balance:get", started_at, response);
        }
        let response = match self.with_wallet_balance_session(|session, storage| {
            let account = load_account_by_id(session, storage, &execution.account_id)?;
            if account.network() != &execution.network {
                return Err(WalletCommandError::invalid_input(
                    "wallet account network changed during balance refresh",
                ));
            }
            if account == execution.account_snapshot {
                commit_balance_materializations(
                    session,
                    storage,
                    &account,
                    output.materializations,
                    execution.discover_addresses,
                )?;
                let response = WalletBalanceGetResponse {
                    account_id: execution.account_id,
                    network: execution.network,
                    balance: output.balance,
                    fetched_at: now_ms(),
                };
                save_balance_cache_best_effort(session, storage, &account, &response);
                return Ok(response);
            }
            Ok(WalletBalanceGetResponse {
                account_id: execution.account_id,
                network: execution.network,
                balance: output.balance,
                fetched_at: now_ms(),
            })
        }) {
            Ok(response) => RpcResponse::success(response),
            Err(response) => response,
        };
        self.observe_wallet_rpc_response("wallet:balance:get", started_at, response)
    }

    pub(in crate::rpc::router) fn handle_wallet_balance_get(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        if has_balance_freshness(data) {
            return invalid_input("wallet:balance:get does not accept freshness")
                .into_rpc_response();
        }
        let request = match parse::<WalletBalanceGetRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let discover_addresses = request.discover_addresses.unwrap_or(false);
            let input =
                wallet_balance_input(session, storage, &request.account_id, discover_addresses)?;
            let account = input.account.clone();
            let profile = registry
                .enabled_profile(account.network(), &config)
                .map_err(WalletCommandError::from)?;
            let output = profile.balance(input).map_err(WalletCommandError::from)?;
            commit_balance_materializations(
                session,
                storage,
                &account,
                output.materializations,
                discover_addresses,
            )?;
            let response = WalletBalanceGetResponse {
                account_id: account.account_id().to_string(),
                network: account.network().clone(),
                balance: output.balance,
                fetched_at: now_ms(),
            };
            save_balance_cache_best_effort(session, storage, &account, &response);
            Ok(response)
        })
    }

    fn with_wallet_balance_session<T>(
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

fn wallet_balance_input(
    session: &VaultSession,
    storage: &Storage,
    account_id: &str,
    discover_addresses: bool,
) -> WalletResult<crate::wallet::WalletBalanceInput> {
    let account = load_account_by_id(session, storage, account_id)?;
    if discover_addresses && account.network().as_str() != "bitcoin" {
        return Err(WalletCommandError::invalid_input(
            "address discovery is supported only for Bitcoin accounts",
        ));
    }
    let wallet = load_wallet(session, storage, account.wallet_id())?;
    let secret = if discover_addresses {
        Some(load_secret(session, storage, &wallet.secret_ref)?.payload)
    } else {
        None
    };
    let wallet_accounts = load_accounts(session, storage, Some(account.wallet_id()))?;
    let mut allocated_addresses = Vec::new();
    for wallet_account in &wallet_accounts {
        if wallet_account.network() == account.network() {
            allocated_addresses.extend(load_account_addresses(
                session,
                storage,
                wallet_account.wallet_id(),
                wallet_account.account_id(),
            )?);
        }
    }
    Ok(crate::wallet::WalletBalanceInput {
        account,
        wallet_accounts,
        allocated_addresses,
        secret,
        discover_addresses,
        now: now_ms(),
    })
}

fn commit_balance_materializations(
    session: &mut VaultSession,
    storage: &Storage,
    account: &WalletAccountMeta,
    materializations: Vec<crate::wallet::WalletProfileAccountMaterialization>,
    discovery_completed: bool,
) -> WalletResult<()> {
    if materializations.is_empty() && !discovery_completed {
        return Ok(());
    }

    let wallet = if discovery_completed {
        let mut wallet = load_wallet(session, storage, account.wallet_id())?;
        wallet.bitcoin_discovery_pending = Some(false);
        wallet.updated_at = now_ms();
        Some(wallet)
    } else {
        None
    };
    let mut uow = begin_wallet_uow(session, storage, "wallet-balance-backfill");
    materialize_profile_accounts(&mut uow, materializations)?;
    if let Some(wallet) = wallet {
        write_json(
            &mut uow,
            &wallet_meta_path(&wallet.wallet_id),
            "meta.json",
            &wallet,
            JSON_MIME,
        )?;
    }
    commit_wallet_uow(uow, session)
}

fn save_balance_cache_best_effort(
    session: &mut VaultSession,
    storage: &Storage,
    account: &WalletAccountMeta,
    response: &WalletBalanceGetResponse,
) {
    if let Err(error) = save_balance_cache(session, storage, account, response) {
        tracing::warn!(
            account_id = account.account_id(),
            error = ?error,
            "wallet_balance_cache_write_failed"
        );
    }
}

fn save_balance_cache(
    session: &mut VaultSession,
    storage: &Storage,
    account: &WalletAccountMeta,
    response: &WalletBalanceGetResponse,
) -> WalletResult<()> {
    if account.network().as_str() == "bitcoin"
        && load_wallet(session, storage, account.wallet_id())?.needs_bitcoin_discovery()
    {
        return Ok(());
    }
    let cache = crate::wallet::WalletBalanceCacheV1 {
        schema_version: crate::wallet::WALLET_BALANCE_CACHE_SCHEMA_VERSION,
        wallet_id: account.wallet_id().to_string(),
        account_id: response.account_id.clone(),
        network: response.network.clone(),
        balance: response.balance.clone(),
        fetched_at: response.fetched_at,
    };
    let mut uow = begin_wallet_uow(session, storage, "wallet-balance-cache");
    write_json(
        &mut uow,
        &balance_cache_path(account.wallet_id(), account.account_id()),
        "balance-cache.json",
        &cache,
        JSON_MIME,
    )?;
    commit_wallet_uow(uow, session)
}
