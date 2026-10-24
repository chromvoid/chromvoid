use std::sync::Arc;

use zeroize::Zeroizing;

use crate::rpc::types::{
    DerivedAccountMetaV1, WalletAccountMeta, WalletNetwork, WalletTransactionEntry,
};
use crate::wallet::{
    SecretPayloadV1, WalletChainErrorCode, WalletChainProfile, WalletProviderObservationOutcomeV1,
    WalletRefreshInput, WalletSignInput, WalletTxStatus, BIP39_ENGLISH_WORDLIST,
    TON_NATIVE_MNEMONIC_STANDARD, TON_ONLY_WALLET_MODE,
};

use super::constants::{
    TON_ACCOUNT_MODEL, TON_AMOUNT_UNIT, TON_MESSAGE_MODE_SIMPLE_TRANSFER,
    TON_NATIVE_DERIVATION_PROFILE, TON_NETWORK, TON_PREPARED_PAYLOAD_KIND, TON_WALLET_CONTRACT,
    TON_WORKCHAIN,
};
use super::keys::{key_material_from_secret, ton_native_account_identity};
use super::payload::TonPreparedPayloadV1;
use super::profile::TonChainProfile;
use super::provider::{
    TonBroadcastRequest, TonBroadcastResult, TonProvider, TonProviderAccount,
    TonProviderAccountState, TonProviderError, TonProviderSnapshot, TonRefreshRequest,
    TonRefreshResult,
};
use super::transfer::valid_until_seconds_now;

fn fixture_words() -> Vec<String> {
    "open price dish charge law skirt alien churn fire swap number brass outdoor diamond lesson april remain puzzle title elbow valley grant champion staff"
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

fn fixture_account() -> WalletAccountMeta {
    WalletAccountMeta::Derived(DerivedAccountMetaV1 {
        account_id: "account-ton".to_string(),
        wallet_id: "wallet-ton".to_string(),
        network: WalletNetwork::from(TON_NETWORK),
        wallet_mode: Some(TON_ONLY_WALLET_MODE.to_string()),
        mnemonic_standard: TON_NATIVE_MNEMONIC_STANDARD.to_string(),
        account_model: TON_ACCOUNT_MODEL.to_string(),
        derivation_profile: TON_NATIVE_DERIVATION_PROFILE.to_string(),
        wallet_contract: Some(TON_WALLET_CONTRACT.to_string()),
        account_index: Some(0),
        workchain: Some(TON_WORKCHAIN),
        label: None,
        address: Some("EQBNuHItbPc3iODpRisWfpI1eumtpoNa6XTwr1aHJiKzn22U".to_string()),
        raw_account: Some(
            "0:4db8722d6cf73788e0e9462b167e92357ae9ada6835ae974f0af56872622b39f".to_string(),
        ),
        public_key: Some(
            "0cce79e60d25fde965e249096617e3ef212541ddeb5b3336cc3853e4499da196".to_string(),
        ),
        derivation_path: Some("ton_native_wallet_tg_account/0".to_string()),
        current_receive_address: None,
        current_receive_derivation_path: None,
        next_receive_index: None,
        next_change_index: None,
        created_at: 1,
        updated_at: 1,
    })
}

#[test]
fn ton_native_identity_matches_reference_fixture() {
    let (address, raw_account, public_key) =
        ton_native_account_identity(&fixture_words()).expect("fixture identity");
    // Cross-checked against @ton/core `contractAddress(0, {code: trampoline, data})`.
    assert_eq!(address, "EQBNuHItbPc3iODpRisWfpI1eumtpoNa6XTwr1aHJiKzn22U");
    assert_eq!(
        raw_account,
        "0:4db8722d6cf73788e0e9462b167e92357ae9ada6835ae974f0af56872622b39f"
    );
    assert_eq!(
        public_key,
        "0cce79e60d25fde965e249096617e3ef212541ddeb5b3336cc3853e4499da196"
    );
}

#[test]
fn ton_native_secret_without_words_fails_closed() {
    let secret = SecretPayloadV1::hd_root_v2(
        TON_NATIVE_MNEMONIC_STANDARD,
        String::new(),
        BIP39_ENGLISH_WORDLIST.to_string(),
        Some(Vec::new()),
        None,
    );
    let error = key_material_from_secret(&fixture_account(), &secret).expect_err("fail closed");
    assert_eq!(error.code, WalletChainErrorCode::InvalidInput);
}

#[derive(Debug)]
struct PendingRefreshProvider;

impl TonProvider for PendingRefreshProvider {
    fn snapshot(
        &self,
        _account: &TonProviderAccount,
    ) -> Result<TonProviderSnapshot, TonProviderError> {
        unreachable!("refresh expiry test must not fetch snapshot")
    }

    fn account_state(&self, _address: &str) -> Result<TonProviderAccountState, TonProviderError> {
        unreachable!("refresh expiry test must not fetch account state")
    }

    fn broadcast(
        &self,
        _request: TonBroadcastRequest,
    ) -> Result<TonBroadcastResult, TonProviderError> {
        unreachable!("refresh expiry test must not broadcast")
    }

    fn refresh(&self, _request: TonRefreshRequest) -> Result<TonRefreshResult, TonProviderError> {
        Ok(TonRefreshResult {
            status: WalletTxStatus::Pending,
            tx_hash: None,
            found: false,
        })
    }
}

#[test]
fn refresh_keeps_expired_ton_transaction_non_terminal_with_one_source() {
    let profile = TonChainProfile::new(Arc::new(PendingRefreshProvider));
    let transaction = WalletTransactionEntry {
        tx_ref: "tx-expired".to_string(),
        wallet_id: "wallet-ton".to_string(),
        account_id: "account-ton".to_string(),
        network: WalletNetwork::from(TON_NETWORK),
        status: WalletTxStatus::Pending.as_str().to_string(),
        tx_hash: None,
        message_ref: Some("message-ref".to_string()),
        broadcast_artifact_ref: None,
        amount_unit: TON_AMOUNT_UNIT.to_string(),
        amount: "1".to_string(),
        fee: "1".to_string(),
        direction: None,
        counterparty: None,
        valid_until: Some(1),
        created_at: 1,
        updated_at: 1,
    };

    let output = profile
        .refresh(WalletRefreshInput {
            account: fixture_account(),
            transaction,
            submit_metadata: None,
            now: valid_until_seconds_now() as u64 * 1000,
        })
        .expect("refresh");

    assert_eq!(output.observations.len(), 1);
    assert_eq!(
        output.observations[0].outcome,
        WalletProviderObservationOutcomeV1::NotFound
    );
}

#[test]
fn sign_prepared_rejects_expired_valid_until_before_snapshot_or_secret_use() {
    let profile = TonChainProfile::new(Arc::new(PendingRefreshProvider));
    let account = fixture_account();
    let (account_address, raw_account) = match &account {
        WalletAccountMeta::Derived(meta) => (
            meta.address.as_deref().expect("address").to_string(),
            meta.raw_account
                .as_deref()
                .expect("raw account")
                .to_string(),
        ),
        WalletAccountMeta::Imported(_) => unreachable!("fixture is derived"),
    };
    let prepared = TonPreparedPayloadV1 {
        kind: TON_PREPARED_PAYLOAD_KIND.to_string(),
        account_id: account.account_id().to_string(),
        wallet_contract: TON_WALLET_CONTRACT.to_string(),
        account_address: account_address.clone(),
        raw_account: raw_account.clone(),
        destination_address: account_address,
        destination_raw_account: raw_account,
        destination_bounceable: true,
        amount: "1".to_string(),
        comment: None,
        seqno: 0,
        valid_until: 1,
        message_mode: TON_MESSAGE_MODE_SIMPLE_TRANSFER,
        account_state: TonProviderAccountState::Active.as_str().to_string(),
        sender_state_init_included: false,
        destination_state: TonProviderAccountState::Active.as_str().to_string(),
        estimated_fee: "1".to_string(),
        warning_codes: Vec::new(),
    };
    let error = profile
        .sign_prepared(WalletSignInput {
            account,
            preparation_id: "prep".to_string(),
            canonical_payload: Zeroizing::new(serde_json::to_string(&prepared).expect("json")),
            provider_snapshot: None,
            signing_secret: SecretPayloadV1::hd_root_v2(
                TON_NATIVE_MNEMONIC_STANDARD,
                String::new(),
                BIP39_ENGLISH_WORDLIST.to_string(),
                Some(Vec::new()),
                None,
            ),
        })
        .expect_err("expired");

    assert_eq!(error.code, WalletChainErrorCode::PreparationStale);
}
