use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_balance_get(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        let provider = match self.wallet_provider.clone() {
            Some(provider) => provider,
            None => return provider_unavailable().into_rpc_response(),
        };
        let request = match parse::<WalletBalanceGetRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let mut account = load_account_by_id(session, storage, &request.account_id)?;
            let balance = match account.network {
                WalletNetwork::Bitcoin => {
                    let addresses = bitcoin_account_addresses(session, storage, &account)?;
                    let balance = provider
                        .bitcoin_balance(&addresses)
                        .map_err(provider_error)?;
                    if account.kind == "derived" {
                        let wallet = load_wallet(session, storage, &account.wallet_id)?;
                        let seed = hd_seed_from_secret(&load_secret(
                            session,
                            storage,
                            &wallet.secret_ref,
                        )?)?;
                        let mut uow = begin_wallet_uow(session, storage, "wallet-balance-backfill");
                        backfill_bitcoin_discovery(
                            &mut uow,
                            provider.as_ref(),
                            &seed,
                            &mut account,
                        )?;
                        commit_wallet_uow(uow, session)?;
                    }
                    balance
                }
                WalletNetwork::Ethereum => {
                    let address = account
                        .address
                        .as_deref()
                        .ok_or_else(|| WalletCommandError::internal("account address missing"))?;
                    provider.ethereum_balance(address).map_err(provider_error)?
                }
            };
            Ok(WalletBalanceGetResponse {
                account_id: account.account_id,
                network: account.network,
                balance,
                fetched_at: now_ms(),
            })
        })
    }
}
