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
        self.with_wallet_session_cleaned(false, |session, storage| {
            let accounts = load_accounts(session, storage, request.wallet_id.as_deref())?;
            Ok(WalletAccountsListResponse { accounts })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_accounts_derive(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        if let Some(error) = reject_unsupported_network(data, "network") {
            return error.into_rpc_response();
        }
        let request = match parse::<WalletAccountsDeriveRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let wallet = load_wallet(session, storage, &request.wallet_id)?;
            if wallet.kind != "hd" {
                return Err(WalletCommandError::unsupported_account_model(
                    "imported wallet does not support account derivation",
                ));
            }
            if !wallet.supported_networks.contains(&request.network) {
                return Err(WalletCommandError::unsupported_chain(
                    "network is not enabled for wallet",
                ));
            }
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            let seed = hd_seed_from_secret(&secret)?;
            let accounts = load_accounts(session, storage, Some(&wallet.wallet_id))?;
            let next_index = accounts
                .iter()
                .filter(|account| account.network == request.network)
                .filter_map(|account| account.account_index)
                .max()
                .map(|index| index + 1)
                .unwrap_or(0);
            let mut uow = begin_wallet_uow(session, storage, "wallet-accounts-derive");
            let account = materialize_hd_account(
                &mut uow,
                None,
                &wallet.wallet_id,
                request.network,
                next_index,
                &seed,
                now_ms(),
            )?;
            commit_wallet_uow(uow, session)?;
            Ok(WalletAccountsDeriveResponse {
                account_id: account.account_id,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_addresses_derive(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        let request = match parse::<WalletAddressesDeriveRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.purpose != "receive" && request.purpose != "change" {
            return invalid_input("purpose must be receive or change").into_rpc_response();
        }
        self.with_wallet_session_cleaned(false, |session, storage| {
            let mut account = load_account_by_id(session, storage, &request.account_id)?;
            if account.network != WalletNetwork::Bitcoin
                || account.kind != "derived"
                || account.account_model.as_deref() != Some("utxo")
            {
                return Err(WalletCommandError::unsupported_account_model(
                    "address derivation is supported only for Bitcoin derived accounts",
                ));
            }
            let wallet = load_wallet(session, storage, &account.wallet_id)?;
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            let seed = hd_seed_from_secret(&secret)?;
            let index = if request.purpose == "receive" {
                account.next_receive_index.unwrap_or(0)
            } else {
                account.next_change_index.unwrap_or(0)
            };
            let chain = if request.purpose == "receive" { 0 } else { 1 };
            let derivation_path =
                bitcoin_derivation_path(account.account_index.unwrap_or(0), chain, index);
            let address = derive_address(WalletNetwork::Bitcoin, &seed, &derivation_path);
            let public_key = derive_public_key(&seed, &derivation_path);
            let now = now_ms();
            let allocated = AllocatedAddressV1 {
                account_id: account.account_id.clone(),
                purpose: request.purpose.clone(),
                index,
                address: address.clone(),
                public_key: public_key.clone(),
                derivation_path: derivation_path.clone(),
                created_at: now,
                last_observed_at: None,
            };
            let mut uow = begin_wallet_uow(session, storage, "wallet-addresses-derive");
            write_json(
                &mut uow,
                &address_file_path(
                    &account.wallet_id,
                    &account.account_id,
                    &request.purpose,
                    index,
                ),
                &format!("{}-{index}.json", request.purpose),
                &allocated,
                JSON_MIME,
            )?;
            if request.purpose == "receive" {
                account.next_receive_index = Some(index + 1);
                account.current_receive_address = Some(address.clone());
                account.current_receive_derivation_path = Some(derivation_path.clone());
            } else {
                account.next_change_index = Some(index + 1);
            }
            account.updated_at = now;
            save_account(&mut uow, &account)?;
            commit_wallet_uow(uow, session)?;
            Ok(WalletAddressesDeriveResponse {
                account_id: account.account_id,
                purpose: request.purpose,
                address,
                public_key,
                derivation_path,
                index,
            })
        })
    }
}
