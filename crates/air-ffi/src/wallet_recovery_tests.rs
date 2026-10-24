use super::wallet_tests::rpc;
use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::json;

#[tokio::test]
async fn wallet_recovery_uses_core_reauthentication_and_preserves_each_mnemonic_standard() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault"))
        .unwrap()
        .with_offline_wallet_fixture();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    let master = "synthetic recovery administrator";
    assert_eq!(
        rpc(
            &runtime,
            1,
            "master:setup",
            json!({"master_password":master})
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(
            &runtime,
            2,
            "vault:unlock",
            json!({"password":"synthetic recovery vault"})
        )
        .await["ok"],
        true
    );
    // Public synthetic vectors already exercised by Core's wallet tests, never funded wallets.
    let bip39 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    let ton = "open price dish charge law skirt alien churn fire swap number brass outdoor diamond lesson april remain puzzle title elbow valley grant champion staff";
    for (index, (standard, mode, network, phrase, passphrase)) in [
        (
            "bip39",
            "multichain",
            "bitcoin",
            bip39,
            Some("synthetic extra phrase"),
        ),
        ("ton_native", "ton_only", "ton", ton, None),
    ]
    .into_iter()
    .enumerate()
    {
        let id = 3 + index as u64 * 4;
        let words = phrase.split_whitespace().collect::<Vec<_>>();
        let created = rpc(
            &runtime,
            id,
            "wallet:hd:create",
            json!({
                "label":"Synthetic recovery", "mnemonic":words, "mnemonic_standard":standard,
                "wallet_mode":mode, "wordlist":"english", "supported_networks":[network],
                "bip39_passphrase":passphrase
            }),
        )
        .await;
        assert_eq!(created["ok"], true);
        let wallet_id = &created["result"]["wallet_id"];
        let denied = rpc(
            &runtime,
            id + 1,
            "wallet:backup:export",
            json!({
                "wallet_id":wallet_id, "master_password":"wrong synthetic administrator"
            }),
        )
        .await;
        assert_eq!(denied["code"], "EXPORT_REAUTH_FAILED");
        assert!(denied.get("result").is_none());
        let exported = rpc(
            &runtime,
            id + 2,
            "wallet:backup:export",
            json!({
                "wallet_id":wallet_id, "master_password":master
            }),
        )
        .await;
        assert_eq!(exported["ok"], true);
        assert_eq!(exported["result"]["wallet_id"], *wallet_id);
        assert_eq!(exported["result"]["export_kind"], "mnemonic");
        assert_eq!(exported["result"]["mnemonic"], json!(words));
        assert_eq!(exported["result"]["mnemonic_standard"], standard);
        assert_eq!(exported["result"]["wallet_mode"], mode);
        assert_eq!(exported["result"]["wordlist"], "english");
        assert_eq!(exported["result"]["bip39_passphrase"], json!(passphrase));
    }
    let imported = rpc(
        &runtime,
        11,
        "wallet:import:create",
        json!({
            "label":"Synthetic imported", "network":"ton", "curve":"ed25519",
            "encoding":"hex", "private_key":"01".repeat(32)
        }),
    )
    .await;
    assert_eq!(imported["ok"], true);
    let request = json!({"wallet_id":imported["result"]["wallet_id"],"master_password":master});
    assert_eq!(
        rpc(&runtime, 12, "wallet:backup:export", request.clone()).await["code"],
        "UNSUPPORTED_EXPORT_KIND"
    );
    let generation = runtime.snapshot().unwrap().generation;
    runtime.deactivate().unwrap();
    assert!(matches!(
        runtime.begin_execute(
            13,
            generation,
            serde_json::to_vec(&json!({"v":1,"command":"wallet:backup:export","data":request}))
                .unwrap()
        ),
        Err(BridgeError::SessionRevoked)
    ));
    runtime.shutdown().unwrap();
}
