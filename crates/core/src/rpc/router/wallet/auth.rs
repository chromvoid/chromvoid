use getrandom::getrandom;

use crate::error::ErrorCode;

use super::super::state::WalletSpendAuthorizationWindow;
use super::*;

const SPEND_AUTH_MAX_DURATION_MS: u64 = 15 * 60 * 1000;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_spend_authorization_create(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletSpendAuthorizationCreateRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.master_password.is_empty() {
            return invalid_input("master_password required").into_rpc_response();
        }
        if request.duration_ms > SPEND_AUTH_MAX_DURATION_MS {
            return invalid_input("duration_ms must not exceed 15 minutes").into_rpc_response();
        }
        let scope = WalletSpendAuthorizationScope {
            wallet_id: request.wallet_id,
            account_id: request.account_id,
            network: request.network,
        };
        if scope.wallet_id.is_none() && scope.account_id.is_none() && scope.network.is_none() {
            return invalid_input("spend authorization scope must not be empty")
                .into_rpc_response();
        }
        if let Err(error) = self.validate_spend_authorization_scope(&scope) {
            return error.into_rpc_response();
        }
        if let Err(error) = self.verify_wallet_master_password_for_reauth(
            &request.master_password,
            ErrorCode::SpendReauthFailed,
        ) {
            return error.into_rpc_response();
        }

        let now = now_ms();
        self.prune_expired_spend_authorizations(now);
        let spend_authorization_id = match new_spend_authorization_id() {
            Ok(id) => id,
            Err(error) => return error.into_rpc_response(),
        };
        let expires_at = now.saturating_add(request.duration_ms);
        self.wallet_auth_runtime.spend_authorizations.insert(
            spend_authorization_id.clone(),
            WalletSpendAuthorizationWindow {
                scope: scope.clone(),
                expires_at,
            },
        );

        RpcResponse::success(WalletSpendAuthorizationCreateResponse {
            spend_authorization_id,
            scope,
            expires_at,
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_spend_authorization_revoke(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletSpendAuthorizationRevokeRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if let Some(id) = request.spend_authorization_id {
            self.wallet_auth_runtime.spend_authorizations.remove(&id);
        } else {
            self.wallet_auth_runtime.spend_authorizations.clear();
        }
        RpcResponse::success(WalletSpendAuthorizationRevokeResponse { revoked: true })
    }

    pub(super) fn verify_wallet_confirm_authorization(
        &mut self,
        request: &WalletTransactionConfirmRequest,
        wallet_id: &str,
        account_id: &str,
        network: &WalletNetwork,
    ) -> WalletResult<()> {
        if let Some(master_password) = request.master_password.as_deref() {
            return self
                .verify_wallet_master_password_for_reauth(
                    master_password,
                    ErrorCode::ConfirmRequired,
                )
                .map(|_| ());
        }

        let Some(spend_authorization_id) = request.spend_authorization_id.as_deref() else {
            return Err(WalletCommandError::confirm_required(
                "Spend authorization required",
            ));
        };
        let now = now_ms();
        self.prune_expired_spend_authorizations(now);
        let Some(window) = self
            .wallet_auth_runtime
            .spend_authorizations
            .get(spend_authorization_id)
        else {
            return Err(WalletCommandError::confirm_required(
                "Spend authorization required",
            ));
        };
        if window.expires_at <= now || !scope_matches(&window.scope, wallet_id, account_id, network)
        {
            self.wallet_auth_runtime
                .spend_authorizations
                .remove(spend_authorization_id);
            return Err(WalletCommandError::confirm_required(
                "Spend authorization required",
            ));
        }
        Ok(())
    }

    pub(super) fn verify_wallet_export_master_password(
        &mut self,
        master_password: &str,
    ) -> WalletResult<()> {
        self.verify_wallet_master_password_for_reauth(
            master_password,
            ErrorCode::ExportReauthFailed,
        )
    }

    pub(super) fn verify_wallet_rebroadcast_master_password(
        &mut self,
        master_password: &str,
    ) -> WalletResult<()> {
        self.verify_wallet_master_password_for_reauth(master_password, ErrorCode::ConfirmRequired)
    }

    fn verify_wallet_master_password_for_reauth(
        &mut self,
        master_password: &str,
        failure_code: ErrorCode,
    ) -> WalletResult<()> {
        let now = now_ms();
        if self.wallet_auth_runtime.reauth_limiter.is_locked(now) {
            return Err(WalletCommandError::new(
                "Wallet re-authentication is locked out",
                Some(failure_code),
            ));
        }

        match self.verify_master_password(master_password) {
            Ok(()) => {
                self.wallet_auth_runtime.reauth_limiter.record_success();
                Ok(())
            }
            Err(error) => {
                if self.wallet_auth_runtime.reauth_limiter.record_failure(now) {
                    self.wallet_auth_runtime.spend_authorizations.clear();
                }
                Err(WalletCommandError::new(
                    error.message().to_string(),
                    Some(failure_code),
                ))
            }
        }
    }

    fn prune_expired_spend_authorizations(&mut self, now: u64) {
        self.wallet_auth_runtime
            .spend_authorizations
            .retain(|_, window| window.expires_at > now);
    }

    fn validate_spend_authorization_scope(
        &mut self,
        scope: &WalletSpendAuthorizationScope,
    ) -> WalletResult<()> {
        let Some(session) = self.session.as_ref() else {
            return Err(WalletCommandError::new(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        };
        if let Some(account_id) = scope.account_id.as_deref() {
            let account = load_account_by_id(session, &self.storage, account_id)?;
            if let Some(wallet_id) = scope.wallet_id.as_deref() {
                if account.wallet_id() != wallet_id {
                    return Err(WalletCommandError::invalid_input(
                        "spend authorization account_id does not belong to wallet_id",
                    ));
                }
            }
            if let Some(network) = scope.network.as_ref() {
                if account.network() != network {
                    return Err(WalletCommandError::invalid_input(
                        "spend authorization account_id network mismatch",
                    ));
                }
            }
        } else if let Some(wallet_id) = scope.wallet_id.as_deref() {
            load_wallet(session, &self.storage, wallet_id)?;
        }
        Ok(())
    }
}

fn scope_matches(
    scope: &WalletSpendAuthorizationScope,
    wallet_id: &str,
    account_id: &str,
    network: &WalletNetwork,
) -> bool {
    scope
        .wallet_id
        .as_deref()
        .is_none_or(|scope_wallet_id| scope_wallet_id == wallet_id)
        && scope
            .account_id
            .as_deref()
            .is_none_or(|scope_account_id| scope_account_id == account_id)
        && scope
            .network
            .as_ref()
            .is_none_or(|scope_network| scope_network == network)
}

fn new_spend_authorization_id() -> WalletResult<String> {
    let mut bytes = [0u8; 16];
    getrandom(&mut bytes).map_err(|error| {
        WalletCommandError::internal(format!(
            "Failed to generate spend authorization id: {error}"
        ))
    })?;
    Ok(format!("spend-auth-{}", hex_string(&bytes)))
}
