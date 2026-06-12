use super::*;

impl RpcRouter {
    pub(super) fn with_wallet_read_session_cleaned<T, F>(&mut self, f: F) -> RpcResponse
    where
        T: Serialize,
        F: FnOnce(&mut VaultSession, &Storage) -> WalletResult<T>,
    {
        if let Some(response) = self.wallet_read_preflight() {
            return response;
        }
        self.with_wallet_session_cleaned_after_preflight(f)
    }

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

    pub(super) fn wallet_disabled_reason(&self) -> &'static str {
        "UNSUPPORTED: wallet crypto is disabled until real wallet crypto is implemented"
    }

    pub(super) fn wallet_read_preflight(&self) -> Option<RpcResponse> {
        if self.session.is_none() {
            return Some(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        }
        None
    }

    pub(super) fn wallet_preflight(&self, requires_broadcast: bool) -> Option<RpcResponse> {
        if self.session.is_none() {
            return Some(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        }
        let _ = requires_broadcast;
        Some(RpcResponse::error(
            self.wallet_disabled_reason(),
            Some("UNSUPPORTED"),
        ))
    }
}
