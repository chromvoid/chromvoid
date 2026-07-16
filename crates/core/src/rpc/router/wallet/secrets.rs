use crate::rpc::types::WalletAccountMeta;
use crate::storage::Storage;
use crate::vault::VaultSession;
use crate::wallet::ton::ton_native_v5r1_account_identity;
use crate::wallet::ton_mnemonic::{
    legacy_ton_native_words_from_bip39_entropy, validate_ton_native_mnemonic,
};

use super::store::{begin_wallet_uow, commit_wallet_uow, load_accounts, write_json};
use super::{
    secret_filename, secret_path, SecretBlobV1, SecretPayloadV1, WalletCommandError, WalletMetaV1,
    WalletResult, BIP39_ENGLISH_WORDLIST, SECRET_MIME, TON_NATIVE_MNEMONIC_STANDARD,
};

pub(super) fn ensure_ton_native_secret_words_for_wallet(
    session: &mut VaultSession,
    storage: &Storage,
    wallet: &WalletMetaV1,
    secret: SecretBlobV1,
) -> WalletResult<SecretPayloadV1> {
    let account = if secret_requires_ton_native_repair(&secret.payload) {
        let accounts = load_accounts(session, storage, Some(&wallet.wallet_id))?;
        Some(
            accounts
                .into_iter()
                .find(is_ton_native_derived_account)
                .ok_or_else(ton_native_repair_required)?,
        )
    } else {
        None
    };
    migrate_legacy_hd_root(session, storage, account.as_ref(), secret)
}

pub(super) fn ensure_ton_native_secret_words_for_account(
    session: &mut VaultSession,
    storage: &Storage,
    account: &WalletAccountMeta,
    secret: SecretBlobV1,
) -> WalletResult<SecretPayloadV1> {
    migrate_legacy_hd_root(session, storage, Some(account), secret)
}

fn migrate_legacy_hd_root(
    session: &mut VaultSession,
    storage: &Storage,
    account: Option<&WalletAccountMeta>,
    secret: SecretBlobV1,
) -> WalletResult<SecretPayloadV1> {
    if !matches!(secret.payload, SecretPayloadV1::HdRoot { .. }) {
        return Ok(secret.payload);
    }

    let SecretBlobV1 {
        secret_id,
        kind,
        payload,
        ..
    } = secret;
    let SecretPayloadV1::HdRoot {
        mnemonic_standard,
        mnemonic_entropy,
        wordlist,
        mnemonic_words,
        bip39_passphrase,
    } = payload
    else {
        return Err(WalletCommandError::internal(
            "Wallet secret is not an HD root",
        ));
    };
    let mnemonic_words = if mnemonic_standard == TON_NATIVE_MNEMONIC_STANDARD {
        if wordlist != BIP39_ENGLISH_WORDLIST || bip39_passphrase.is_some() {
            return Err(ton_native_repair_required());
        }
        let words = match mnemonic_words {
            Some(words) => words,
            None => {
                let words = legacy_ton_native_words_from_bip39_entropy(&mnemonic_entropy)
                    .map_err(|_| ton_native_repair_required())?;
                let account = account
                    .filter(|account| is_ton_native_derived_account(account))
                    .ok_or_else(ton_native_repair_required)?;
                let (address, raw_account, _) =
                    ton_native_v5r1_account_identity(&words).map_err(WalletCommandError::from)?;
                let WalletAccountMeta::Derived(meta) = account else {
                    return Err(ton_native_repair_required());
                };
                if meta.address.as_deref() != Some(address.as_str())
                    || meta.raw_account.as_deref() != Some(raw_account.as_str())
                {
                    return Err(ton_native_repair_required());
                }
                words
            }
        };
        validate_ton_native_mnemonic(&words).map_err(|_| ton_native_repair_required())?;
        Some(words)
    } else {
        None
    };

    let repaired_payload = SecretPayloadV1::hd_root_v2(
        &mnemonic_standard,
        mnemonic_entropy,
        wordlist,
        mnemonic_words,
        bip39_passphrase,
    );
    let repaired_secret = SecretBlobV1 {
        secret_id: secret_id.clone(),
        kind,
        payload_version: 2,
        payload: repaired_payload.clone(),
    };
    let mut uow = begin_wallet_uow(session, storage, "wallet-ton-native-secret-repair");
    write_json(
        &mut uow,
        &secret_path(&secret_id),
        &secret_filename(&secret_id),
        &repaired_secret,
        SECRET_MIME,
    )?;
    commit_wallet_uow(uow, session)?;
    Ok(repaired_payload)
}

fn secret_requires_ton_native_repair(payload: &SecretPayloadV1) -> bool {
    matches!(
        payload,
        SecretPayloadV1::HdRoot {
            mnemonic_standard,
            mnemonic_words: None,
            ..
        } if mnemonic_standard == TON_NATIVE_MNEMONIC_STANDARD
    )
}

fn is_ton_native_derived_account(account: &WalletAccountMeta) -> bool {
    matches!(
        account,
        WalletAccountMeta::Derived(meta)
            if meta.network.as_str() == "ton"
                && meta.derivation_profile == "ton_native_v5r1_account"
    )
}

fn ton_native_repair_required() -> WalletCommandError {
    WalletCommandError::invalid_input("TON-native wallet requires repair")
}
