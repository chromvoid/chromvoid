use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_status(&mut self) -> RpcResponse {
        let disabled_reason = self.wallet_disabled_reason().to_string();
        self.with_wallet_read_session_cleaned(|session, storage| {
            let index = load_index(session, storage)?;
            Ok(WalletStatusResponse {
                initialized: session.catalog().find_by_path(WALLET_ROOT).is_some(),
                wallet_count: index.wallet_ids.len() as u64,
                enabled: false,
                disabled_reason: Some(disabled_reason),
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_list(&mut self) -> RpcResponse {
        self.with_wallet_read_session_cleaned(|session, storage| {
            let wallets = load_wallets(session, storage)?
                .into_iter()
                .map(|meta| account_summary_from_meta(&meta))
                .collect();
            Ok(WalletListResponse { wallets })
        })
    }
}
