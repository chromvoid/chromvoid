use super::*;

impl RpcRouter {
    pub(super) fn with_wallet_session_cleaned<T, F>(
        &mut self,
        requires_broadcast: bool,
        f: F,
    ) -> RpcResponse
    where
        T: Serialize,
        F: FnOnce(&mut VaultSession, &Storage) -> WalletResult<T>,
    {
        if let Some(response) = self.wallet_preflight(requires_broadcast) {
            return response;
        }
        self.with_wallet_session_cleaned_after_preflight(f)
    }

    pub(super) fn with_wallet_session_cleaned_after_preflight<T, F>(&mut self, f: F) -> RpcResponse
    where
        T: Serialize,
        F: FnOnce(&mut VaultSession, &Storage) -> WalletResult<T>,
    {
        let storage = self.storage.clone();
        self.with_session_mut(|session| {
            if let Err(error) = cleanup_expired_preparations(session, &storage) {
                return error.into_rpc_response();
            }
            result_response(f(session, &storage))
        })
    }

    pub(in crate::rpc::router) fn recover_wallet_preparations_best_effort(&mut self) {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_mut() else {
            return;
        };
        if let Err(error) = cleanup_expired_preparations(session, &storage) {
            tracing::warn!(
                message = error.message(),
                code = error.code(),
                "wallet:expired_preparation_cleanup_failed"
            );
        }
    }

    pub(super) fn wallet_preflight(&self, requires_broadcast: bool) -> Option<RpcResponse> {
        if self.session.is_none() {
            return Some(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        }
        if !self.wallet_runtime_config.wallet_phase1_enabled {
            return Some(RpcResponse::error(
                "Wallet phase 1 disabled",
                Some(ErrorCode::ProviderDisabled),
            ));
        }
        if requires_broadcast && !self.wallet_runtime_config.wallet_core_broadcast_enabled {
            return Some(RpcResponse::error(
                "Wallet Core broadcast disabled",
                Some(ErrorCode::ProviderDisabled),
            ));
        }
        self.require_pro_feature(crate::license::PRO_FEATURE_CRYPTO_WALLET)
    }
}
