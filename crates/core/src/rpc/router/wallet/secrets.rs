use crate::rpc::types::WalletAccountMeta;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::store::{begin_wallet_uow, commit_wallet_uow, write_json};
use super::{
    now_ms, secret_filename, secret_path, SecretBlobV1, SecretPayloadV1, WalletCommandError,
    WalletResult, WalletSecretReconcileInput, BIP39_ENGLISH_WORDLIST, SECRET_MIME,
};

pub(super) fn ensure_english_wordlist(secret: &SecretPayloadV1) -> WalletResult<()> {
    if let SecretPayloadV1::HdRootV2 { wordlist, .. } = secret {
        if wordlist != BIP39_ENGLISH_WORDLIST {
            return Err(WalletCommandError::invalid_input(
                "Only english wordlist is supported",
            ));
        }
    }
    Ok(())
}

/// Lets the chain profile reconcile the wallet secret with on-chain state (for example
/// promoting a confirmed WalletTg key rotation). Any update is persisted under the same
/// secret id before the payload is returned.
pub(super) fn reconcile_wallet_secret(
    session: &mut VaultSession,
    storage: &Storage,
    profile: &std::sync::Arc<dyn crate::wallet::WalletChainProfile>,
    account: &WalletAccountMeta,
    secret: SecretBlobV1,
) -> WalletResult<SecretPayloadV1> {
    let SecretBlobV1 {
        secret_id,
        kind,
        payload,
        ..
    } = secret;
    let updated = profile
        .reconcile_secret(WalletSecretReconcileInput {
            account: account.clone(),
            secret: payload.clone(),
            now: now_ms(),
        })
        .map_err(WalletCommandError::from)?;
    let Some(updated) = updated else {
        return Ok(payload);
    };
    persist_secret_payload(session, storage, &secret_id, &kind, updated.clone())?;
    Ok(updated)
}

/// Rewrites the HD root secret blob in place (same id, payload version 2).
pub(super) fn persist_secret_payload(
    session: &mut VaultSession,
    storage: &Storage,
    secret_id: &str,
    kind: &str,
    payload: SecretPayloadV1,
) -> WalletResult<()> {
    let blob = SecretBlobV1 {
        secret_id: secret_id.to_string(),
        kind: kind.to_string(),
        payload_version: 2,
        payload,
    };
    let mut uow = begin_wallet_uow(session, storage, "wallet-secret-update");
    write_json(
        &mut uow,
        &secret_path(secret_id),
        &secret_filename(secret_id),
        &blob,
        SECRET_MIME,
    )?;
    commit_wallet_uow(uow, session)?;
    Ok(())
}
