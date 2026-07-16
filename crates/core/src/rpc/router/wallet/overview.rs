use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_status(&mut self, data: &Value) -> RpcResponse {
        if let Err(error) = parse::<WalletStatusRequest>(data) {
            return error.into_rpc_response();
        }
        let enabled = self.wallet_runtime_config.wallet_enabled;
        let disabled_reason = (!enabled).then(|| self.wallet_disabled_reason().to_string());
        let networks = self
            .wallet_chain_registry
            .network_statuses(&self.wallet_runtime_config);
        self.with_wallet_read_session_cleaned(|session, storage| {
            let index = load_index(session, storage)?;
            Ok(WalletStatusResponse {
                initialized: session.catalog().find_by_path(WALLET_ROOT).is_some(),
                wallet_count: index.wallet_ids.len() as u64,
                enabled,
                disabled_reason,
                networks,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_list(&mut self, data: &Value) -> RpcResponse {
        if let Err(error) = parse::<WalletListRequest>(data) {
            return error.into_rpc_response();
        }
        self.with_wallet_read_session_cleaned(|session, storage| {
            let wallets = load_wallets(session, storage)?
                .into_iter()
                .map(|meta| account_summary_from_meta(&meta))
                .collect();
            Ok(WalletListResponse { wallets })
        })
    }
}
