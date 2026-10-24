use super::wallet_tests::rpc;
use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::json;

#[tokio::test]
async fn wallet_send_quotes_cancels_and_reconciles_unknown_submission_in_real_core() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault"))
        .unwrap()
        .with_wallet_send_fixture();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    let master = "synthetic send administrator";
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
            json!({"password":"synthetic send vault"})
        )
        .await["ok"],
        true
    );
    let imported = rpc(
        &runtime,
        3,
        "wallet:import:create",
        json!({
            "label":"Synthetic sender", "network":"ton", "curve":"ed25519",
            "encoding":"hex", "private_key":"01".repeat(32)
        }),
    )
    .await;
    assert_eq!(imported["ok"], true);
    let account = &imported["result"]["account_id"];
    let accounts = rpc(&runtime, 4, "wallet:accounts:list", json!({})).await;
    let address = &accounts["result"]["accounts"][0]["address"];
    assert!(address.is_string());
    let input = json!({"account_id":account,"network":"ton", "outputs":[{"address":address,"amount":"1000000000","comment":"synthetic memo"}],"fee_policy":{"tier":"standard"}});
    let mut quote_input = input.clone();
    quote_input["max_output_index"] = json!(0);
    let quote = rpc(&runtime, 5, "wallet:transaction:quote", quote_input).await;
    assert_eq!(quote["ok"], true, "quote code: {}", quote["code"]);
    assert_eq!(quote["result"]["spendable"], "2000000000");
    assert_eq!(quote["result"]["max_amount"], "1995000000");
    assert_eq!(
        quote["result"]["current_preview"]["total_debit"],
        "1005000000"
    );
    assert_eq!(
        rpc(
            &runtime,
            6,
            "wallet:transactions:list",
            json!({"account_id":account})
        )
        .await["result"]["transactions"],
        json!([])
    );
    let prepared = rpc(&runtime, 7, "wallet:transaction:prepare", input.clone()).await;
    assert_eq!(prepared["ok"], true);
    assert_eq!(prepared["result"]["account_id"], *account);
    assert_eq!(prepared["result"]["preview"]["outputs"], input["outputs"]);
    assert_eq!(prepared["result"]["preview"]["estimated_fee"], "5000000");
    assert_eq!(prepared["result"]["preview"]["amount_unit"], "nanoton");
    let canceled = rpc(
        &runtime,
        8,
        "wallet:transaction:cancel",
        json!({"preparation_id":prepared["result"]["preparation_id"]}),
    )
    .await;
    assert_eq!(canceled["result"]["cancelled"], true);
    let canceled_confirm = rpc(&runtime,9,"wallet:transaction:confirm",json!({"preparation_id":prepared["result"]["preparation_id"],"accepted_warnings":[],"master_password":master})).await;
    assert_eq!(canceled_confirm["code"], "PREPARATION_NOT_FOUND");
    let prepared = rpc(&runtime, 10, "wallet:transaction:prepare", input.clone()).await;
    assert_eq!(prepared["ok"], true);
    let confirm_input = json!({"preparation_id":prepared["result"]["preparation_id"],"accepted_warnings":[],"master_password":master});
    let mut denied_input = confirm_input.clone();
    denied_input["master_password"] = json!("wrong synthetic password");
    assert_eq!(
        rpc(&runtime, 11, "wallet:transaction:confirm", denied_input).await["code"],
        "CONFIRM_REQUIRED"
    );
    assert_eq!(
        rpc(
            &runtime,
            12,
            "wallet:transactions:list",
            json!({"account_id":account})
        )
        .await["result"]["transactions"],
        json!([])
    );
    let unknown = rpc(
        &runtime,
        13,
        "wallet:transaction:confirm",
        confirm_input.clone(),
    )
    .await;
    assert_eq!(unknown["ok"], true);
    assert_eq!(unknown["result"]["status"], "broadcast_unknown");
    let repeated = rpc(&runtime, 14, "wallet:transaction:confirm", confirm_input).await;
    // A second provider submission would return pending in this fixture, so unchanged unknown
    // proves that Core returns the prior confirmation rather than broadcasting again.
    assert_eq!(repeated["result"], unknown["result"]);
    assert_eq!(
        rpc(&runtime, 15, "wallet:transaction:prepare", input).await["code"],
        "BROADCAST_UNKNOWN"
    );
    let tx_ref = &unknown["result"]["tx_ref"];
    assert_eq!(
        rpc(
            &runtime,
            16,
            "wallet:transaction:rebroadcast",
            json!({"tx_ref":tx_ref,"master_password":"wrong synthetic password"})
        )
        .await["code"],
        "CONFIRM_REQUIRED"
    );
    let replay = rpc(
        &runtime,
        17,
        "wallet:transaction:rebroadcast",
        json!({"tx_ref":tx_ref,"master_password":master}),
    )
    .await;
    assert_eq!(replay["ok"], true);
    assert_eq!(replay["result"]["status"], "pending");
    assert_eq!(replay["result"]["tx_ref"], *tx_ref);
    let journal = rpc(
        &runtime,
        18,
        "wallet:transactions:list",
        json!({"account_id":account}),
    )
    .await;
    let records = journal["result"]["transactions"].as_array().unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["tx_ref"], *tx_ref);
    assert_eq!(records[0]["status"], "pending");
    assert_eq!(records[0]["amount"], "1000000000");
    assert_eq!(records[0]["fee"], "5000000");
    let generation = runtime.snapshot().unwrap().generation;
    runtime.deactivate().unwrap();
    assert!(matches!(
        runtime.begin_execute(
            19,
            generation,
            serde_json::to_vec(&json!({"v":1,"command":"wallet:transaction:confirm","data":{}}))
                .unwrap()
        ),
        Err(BridgeError::SessionRevoked)
    ));
    runtime.shutdown().unwrap();
}
