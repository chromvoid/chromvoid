use super::secrets::ensure_english_wordlist;
use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_accounts_list(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        let request = match parse::<WalletAccountsListRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_read_session_cleaned(|session, storage| {
            let accounts = load_accounts(session, storage, request.wallet_id.as_deref())?;
            let cached_balances = load_balance_caches(session, storage, &accounts)?;
            Ok(WalletAccountsListResponse {
                accounts,
                cached_balances,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_accounts_derive(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletAccountsDeriveRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let profile = match self
            .wallet_chain_registry
            .enabled_profile(&request.network, &self.wallet_runtime_config)
        {
            Ok(profile) => profile,
            Err(error) => return WalletCommandError::from(error).into_rpc_response(),
        };

        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let mut wallet = load_wallet(session, storage, &request.wallet_id)?;
            if wallet.kind != "hd" {
                return Err(WalletCommandError::unsupported_account_model(
                    "imported wallet does not support account derivation",
                ));
            }
            let adds_network = !wallet.supported_networks.contains(&request.network);
            if adds_network && wallet.wallet_mode != MULTICHAIN_WALLET_MODE {
                return Err(WalletCommandError::unsupported_chain(
                    "network is not enabled for wallet",
                ));
            }
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            let accounts = load_accounts(session, storage, Some(&wallet.wallet_id))?;
            let next_index = accounts
                .iter()
                .filter(|account| account.network() == &request.network)
                .filter_map(WalletAccountMeta::account_index)
                .max()
                .map(|index| index + 1)
                .unwrap_or(0);
            let now = now_ms();
            let mut uow = begin_wallet_uow(session, storage, "wallet-accounts-derive");
            let materialization = profile
                .materialize_hd_account(hd_account_input(
                    &wallet,
                    &secret.payload,
                    request.network.clone(),
                    next_index,
                    now,
                )?)
                .map_err(WalletCommandError::from)?;
            let account = materialize_profile_account(&mut uow, materialization, &wallet)?;
            let account = allocate_first_receive_address(
                &mut uow,
                profile.as_ref(),
                account,
                &secret.payload,
                now,
            )?;
            if adds_network {
                wallet.supported_networks.push(request.network.clone());
                wallet.updated_at = now;
                write_json(
                    &mut uow,
                    &wallet_meta_path(&wallet.wallet_id),
                    "meta.json",
                    &wallet,
                    JSON_MIME,
                )?;
            }
            commit_wallet_uow(uow, session)?;
            Ok(WalletAccountsDeriveResponse {
                account_id: account.account_id().to_string(),
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_addresses_derive(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletAddressesDeriveRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.purpose != "receive" && request.purpose != "change" {
            return invalid_input("purpose must be receive or change").into_rpc_response();
        }
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let account = load_account_by_id(session, storage, &request.account_id)?;
            if account.account_model() != Some("utxo") {
                return Err(WalletCommandError::unsupported_account_model(
                    "address derivation requires a derived utxo account",
                ));
            }
            let profile = registry
                .enabled_profile(account.network(), &config)
                .map_err(WalletCommandError::from)?;
            let wallet = load_wallet(session, storage, account.wallet_id())?;
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            ensure_english_wordlist(&secret.payload)?;
            let allocated_addresses = load_account_addresses(
                session,
                storage,
                account.wallet_id(),
                account.account_id(),
            )?;
            let output = profile
                .derive_address(crate::wallet::WalletAddressDeriveInput {
                    account,
                    secret: Some(secret.payload),
                    allocated_addresses,
                    purpose: request.purpose.clone(),
                    now: now_ms(),
                })
                .map_err(WalletCommandError::from)?;
            let mut uow = begin_wallet_uow(session, storage, "wallet-addresses-derive");
            materialize_profile_addresses(&mut uow, &output.account, vec![output.address.clone()])?;
            save_account(&mut uow, &output.account)?;
            commit_wallet_uow(uow, session)?;
            Ok(output.response)
        })
    }
}
