use super::{
    SecretBlobV1, SecretPayloadV1, WalletConfirmInput, WalletPrepareOutput, BIP39_MNEMONIC_STANDARD,
};
use crate::rpc::types::{ImportedAccountMetaV1, WalletAccountMeta, WalletNetwork, WalletPreview};
use zeroize::Zeroizing;

#[test]
fn wallet_secret_payload_debug_redacts_secret_material() {
    let hd_root = SecretPayloadV1::hd_root_v2(
        BIP39_MNEMONIC_STANDARD,
        "entropy-secret".to_string(),
        "english".to_string(),
        None,
        Some("phrase-secret".to_string()),
    );
    let rotation_root = SecretPayloadV1::hd_root_v2(
        "rotation",
        String::new(),
        "english".to_string(),
        Some(vec!["word-secret".to_string()]),
        None,
    );
    let imported = SecretPayloadV1::ImportedKey {
        network: WalletNetwork::from("bitcoin"),
        curve: "secp256k1".to_string(),
        private_key: "private-key-secret".to_string(),
        encoding: "hex".to_string(),
    };
    let prepared = SecretPayloadV1::PreparedPayload {
        canonical_payload: "canonical-payload-secret".to_string(),
    };
    let broadcast = SecretPayloadV1::BroadcastArtifact {
        signed_artifact: "signed-artifact-secret".to_string(),
        tx_hash: Some("tx-hash-secret".to_string()),
        message_ref: Some("message-ref-secret".to_string()),
        submit_metadata: Some(serde_json::json!({"secret": "metadata-secret"})),
    };

    let debug =
        format!("{hd_root:?}\n{rotation_root:?}\n{imported:?}\n{prepared:?}\n{broadcast:?}");
    for secret in [
        "entropy-secret",
        "word-secret",
        "phrase-secret",
        "private-key-secret",
        "canonical-payload-secret",
        "signed-artifact-secret",
        "tx-hash-secret",
        "message-ref-secret",
        "metadata-secret",
    ] {
        assert!(!debug.contains(secret), "{secret} leaked in {debug}");
    }
    assert!(debug.contains("[redacted"));
}

#[test]
fn wallet_hd_root_secret_serializes_only_canonical_root_payload() {
    let secret = SecretBlobV1 {
        secret_id: "secret-test".to_string(),
        kind: "hd_root".to_string(),
        payload_version: 2,
        payload: SecretPayloadV1::hd_root_v2(
            BIP39_MNEMONIC_STANDARD,
            "001122".to_string(),
            "english".to_string(),
            None,
            None,
        ),
    };

    let json = serde_json::to_value(&secret).expect("serialize secret");
    let payload = json.get("payload").expect("payload");
    assert_eq!(
        payload.get("kind").and_then(|value| value.as_str()),
        Some("hd_root_v2")
    );
    let recovery = payload.get("recovery").expect("recovery");
    assert_eq!(
        recovery
            .get("mnemonic_standard")
            .and_then(|value| value.as_str()),
        Some(BIP39_MNEMONIC_STANDARD)
    );
    assert_eq!(
        recovery
            .get("mnemonic_entropy")
            .and_then(|value| value.as_str()),
        Some("001122")
    );
    assert!(recovery.get("bip39_passphrase").is_none());
    assert!(recovery.get("mnemonic_words").is_none());
    assert!(payload.get("mnemonic_entropy").is_none());

    let parsed: SecretBlobV1 = serde_json::from_value(json).expect("round trip");
    let super::SecretPayloadV1::HdRootV2 {
        recovery:
            super::HdRootRecoveryMaterialV2::Bip39 {
                mnemonic_entropy,
                bip39_passphrase,
            },
        ..
    } = parsed.payload
    else {
        panic!("expected BIP39 HD root");
    };
    assert_eq!(mnemonic_entropy, "001122");
    assert_eq!(bip39_passphrase, None);
}

#[test]
fn wallet_hd_root_v2_separates_bip39_entropy_from_ton_native_words() {
    let bip39 = SecretPayloadV1::hd_root_v2(
        BIP39_MNEMONIC_STANDARD,
        "001122".to_string(),
        "english".to_string(),
        None,
        Some("passphrase".to_string()),
    );
    let ton_native = SecretPayloadV1::hd_root_v2(
        "ton_native",
        String::new(),
        "english".to_string(),
        Some(vec!["word".to_string(); 24]),
        None,
    );

    let bip39 = serde_json::to_value(bip39).expect("serialize bip39");
    assert_eq!(bip39["kind"], "hd_root_v2");
    assert_eq!(bip39["recovery"]["mnemonic_standard"], "bip39");
    assert_eq!(bip39["recovery"]["mnemonic_entropy"], "001122");
    assert!(bip39["recovery"].get("mnemonic_words").is_none());

    let ton_native = serde_json::to_value(ton_native).expect("serialize TON native");
    assert_eq!(ton_native["kind"], "hd_root_v2");
    assert_eq!(ton_native["recovery"]["mnemonic_standard"], "ton_native");
    assert!(ton_native["recovery"].get("mnemonic_entropy").is_none());
    assert_eq!(
        ton_native["recovery"]["mnemonic_words"]
            .as_array()
            .map(Vec::len),
        Some(24)
    );
}

#[test]
fn wallet_operation_debug_redacts_canonical_payloads() {
    let account = WalletAccountMeta::Imported(ImportedAccountMetaV1 {
        account_id: "account".to_string(),
        wallet_id: "wallet".to_string(),
        network: WalletNetwork::from("testchain"),
        label: Some("imported".to_string()),
        address: "address".to_string(),
        public_key: None,
        curve: None,
        wallet_contract: None,
        workchain: None,
        raw_account: None,
        created_at: 1,
        updated_at: 1,
    });
    let prepare = WalletPrepareOutput {
        preview: WalletPreview {
            amount_unit: "unit".to_string(),
            outputs: Vec::new(),
            estimated_fee: "1".to_string(),
            total_debit: "1".to_string(),
            warnings: Vec::new(),
            ton: None,
            ethereum: None,
            solana: None,
        },
        provider_snapshot: None,
        canonical_payload: "canonical-payload-secret".to_string(),
        materializations: Vec::new(),
        valid_until: None,
    };
    let confirm = WalletConfirmInput {
        account,
        preparation_id: "prep".to_string(),
        canonical_payload: Zeroizing::new("canonical-confirm-secret".to_string()),
        provider_snapshot: None,
        signing_secret: SecretPayloadV1::hd_root_v2(
            BIP39_MNEMONIC_STANDARD,
            "00112233445566778899aabbccddeeff".to_string(),
            "english".to_string(),
            None,
            None,
        ),
    };

    let debug = format!("{prepare:?}\n{confirm:?}");
    for secret in ["canonical-payload-secret", "canonical-confirm-secret"] {
        assert!(!debug.contains(secret), "{secret} leaked in {debug}");
    }
    assert!(debug.contains("[redacted"));
}
