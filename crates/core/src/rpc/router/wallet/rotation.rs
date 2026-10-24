//! `wallet:ton:rotateKey`: rotate the on-chain signing key of a WalletTg account driven by a
//! TEP-0003 Rotation mnemonic. The new signing half is persisted as *pending* before the
//! `ChangePublicKey` message is broadcast; it is promoted once the chain reports the new key.

use super::secrets::{persist_secret_payload, reconcile_wallet_secret};
use super::store::{load_account_by_id, load_secret, load_wallet};
use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_ton_rotate_key(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletTonRotateKeyRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if let Err(error) = self.verify_wallet_export_master_password(&request.master_password) {
            return error.into_rpc_response();
        }
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let account = load_account_by_id(session, storage, &request.account_id)?;
            if account.network().as_str() != "ton" {
                return Err(WalletCommandError::invalid_input(
                    "signing key rotation is available only for TON accounts",
                ));
            }
            let wallet = load_wallet(session, storage, account.wallet_id())?;
            let profile = registry
                .enabled_profile(account.network(), &config)
                .map_err(WalletCommandError::from)?;
            let secret_blob = load_secret(session, storage, &wallet.secret_ref)?;
            let secret_kind = secret_blob.kind.clone();
            let secret =
                reconcile_wallet_secret(session, storage, &profile, &account, secret_blob)?;

            let rotation = profile
                .rotate_signing_key(WalletKeyRotationInput {
                    account: account.clone(),
                    secret,
                    now: now_ms(),
                })
                .map_err(WalletCommandError::from)?;

            // Persist the pending signing half first: if the broadcast lands but the process
            // dies, the phrase on disk still recovers the account.
            persist_secret_payload(
                session,
                storage,
                &wallet.secret_ref,
                &secret_kind,
                rotation.updated_secret,
            )?;

            let submitted = profile
                .submit_signed(crate::wallet::WalletSubmitInput {
                    account: account.clone(),
                    preparation_id: format!("rotation-{}", new_preparation_id()),
                    signed_artifact: rotation.signed_artifact,
                })
                .map_err(WalletCommandError::from)?;

            Ok(WalletTonRotateKeyResponse {
                wallet_id: wallet.wallet_id,
                account_id: account.account_id().to_string(),
                status: submitted.status.as_str().to_string(),
                tx_hash: submitted.tx_hash,
                message_ref: submitted.message_ref,
                seqno: rotation.seqno,
                valid_until: rotation.valid_until,
                new_public_key: rotation.new_public_key,
                mnemonic: rotation.mnemonic,
                wordlist: BIP39_ENGLISH_WORDLIST.to_string(),
                mnemonic_standard: ROTATION_MNEMONIC_STANDARD.to_string(),
            })
        })
    }
}
