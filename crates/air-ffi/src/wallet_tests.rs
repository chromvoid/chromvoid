use super::*;
use chromvoid_client_runtime::LocalCoreAdapter;
use serde_json::{Value, json};

pub(super) async fn rpc(runtime: &AirRuntime, id: u64, command: &str, data: Value) -> Value {
    let reply = runtime
        .begin_execute(
            id,
            runtime.snapshot().unwrap().generation,
            serde_json::to_vec(&json!({"v":1,"command":command,"data":data})).unwrap(),
        )
        .unwrap_or_else(|error| panic!("{command} admission failed: {error}"))
        .finish()
        .await
        .unwrap();
    serde_json::from_slice(&reply.payload).unwrap()
}

#[tokio::test]
async fn wallet_metadata_uses_core_and_requires_current_vault_authority() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault")).unwrap();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    assert_eq!(
        rpc(&runtime, 1, "wallet:list", json!({})).await["code"],
        "VAULT_REQUIRED"
    );
    assert_eq!(
        rpc(
            &runtime,
            2,
            "vault:unlock",
            json!({"password":"synthetic wallet metadata"})
        )
        .await["ok"],
        true
    );
    let status = rpc(&runtime, 3, "wallet:status", json!({})).await;
    assert_eq!(status["ok"], true);
    assert_eq!(status["result"]["enabled"], true);
    assert_eq!(status["result"]["wallet_count"], 0);
    assert_eq!(status["result"]["initialized"], false);
    let wallets = rpc(&runtime, 4, "wallet:list", json!({})).await;
    let accounts = rpc(&runtime, 5, "wallet:accounts:list", json!({})).await;
    assert_eq!(wallets["result"]["wallets"], json!([]));
    assert_eq!(accounts["result"]["accounts"], json!([]));
    assert_eq!(accounts["result"]["cached_balances"], json!([]));
    assert_eq!(
        rpc(&runtime, 25, "wallet:transactions:list", json!({})).await["result"]["transactions"],
        json!([])
    );
    let generation = runtime.snapshot().unwrap().generation;
    runtime.deactivate().unwrap();
    assert!(matches!(
        runtime.begin_execute(
            9,
            generation,
            serde_json::to_vec(&json!({"v":1,"command":"wallet:list","data":{}})).unwrap()
        ),
        Err(BridgeError::SessionRevoked)
    ));
    runtime.shutdown().unwrap();
}

#[tokio::test]
async fn wallet_setup_uses_core_drafts_validation_and_idempotency_offline() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault"))
        .unwrap()
        .with_offline_wallet_fixture();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    assert_eq!(
        rpc(
            &runtime,
            1,
            "vault:unlock",
            json!({"password":"synthetic wallet setup"})
        )
        .await["ok"],
        true
    );
    let status = rpc(&runtime, 2, "wallet:status", json!({})).await;
    assert_eq!(status["result"]["enabled"], true);
    assert!(
        status["result"]["networks"]
            .as_array()
            .unwrap()
            .iter()
            .all(|network| network["provider_status"] == "unavailable"
                && network["broadcast_enabled"] == false)
    );
    let generated = rpc(
        &runtime,
        3,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode":"multichain","mnemonic_standard":"rotation","word_count":12}),
    )
    .await;
    assert_eq!(generated["ok"], true);
    assert_eq!(
        generated["result"]["mnemonic"].as_array().unwrap().len(),
        12
    );
    // Generating a phrase never creates a stored wallet.
    assert_eq!(
        rpc(&runtime, 4, "wallet:list", json!({})).await["result"]["wallets"],
        json!([])
    );
    let create = json!({"label":"Synthetic generated", "wallet_mode":"multichain", "mnemonic_standard":"rotation", "mnemonic_draft_id":generated["result"]["mnemonic_draft_id"], "wordlist":"english", "supported_networks":["bitcoin"], "client_request_id":"fixture-generated"});
    let created = rpc(&runtime, 5, "wallet:hd:create", create.clone()).await;
    assert_eq!(created["ok"], true);
    assert_eq!(created["result"]["accounts"][0]["kind"], "derived");
    assert_eq!(
        rpc(&runtime, 6, "wallet:hd:create", create.clone()).await["result"],
        created["result"]
    );
    let mut conflicting = create.clone();
    conflicting["label"] = json!("Different payload");
    assert_eq!(
        rpc(&runtime, 7, "wallet:hd:create", conflicting).await["code"],
        "INVALID_INPUT"
    );
    let mut consumed = create;
    consumed
        .as_object_mut()
        .unwrap()
        .remove("client_request_id");
    assert_eq!(
        rpc(&runtime, 8, "wallet:hd:create", consumed).await["code"],
        "INVALID_INPUT"
    );
    let restore = json!({"label":"Synthetic restored", "wallet_mode":"multichain", "mnemonic_standard":"bip39", "mnemonic":generated["result"]["mnemonic"], "wordlist":"english", "supported_networks":["bitcoin"], "client_request_id":"fixture-restored"});
    let mut invalid = restore.clone();
    invalid["mnemonic"] = json!(vec!["invalid"; 12]);
    assert_eq!(
        rpc(&runtime, 9, "wallet:hd:create", invalid).await["code"],
        "INVALID_INPUT"
    );
    let restored = rpc(&runtime, 10, "wallet:hd:create", restore).await;
    assert_eq!(restored["ok"], true);
    assert_ne!(
        restored["result"]["wallet_id"],
        created["result"]["wallet_id"]
    );
    let imported_request = json!({"label":"Synthetic imported", "network":"ton", "curve":"ed25519", "encoding":"hex", "private_key":"01".repeat(32), "client_request_id":"fixture-imported"});
    let imported = rpc(
        &runtime,
        11,
        "wallet:import:create",
        imported_request.clone(),
    )
    .await;
    assert_eq!(imported["ok"], true);
    assert_eq!(
        rpc(&runtime, 12, "wallet:import:create", imported_request).await["result"],
        imported["result"]
    );
    let wallets = rpc(&runtime, 13, "wallet:list", json!({})).await;
    assert_eq!(wallets["result"]["wallets"].as_array().unwrap().len(), 3);
    // Account and receive-address derivation stay with Core and the chosen wallet.
    let derived = rpc(
        &runtime,
        14,
        "wallet:accounts:derive",
        json!({"wallet_id":created["result"]["wallet_id"], "network":"bitcoin"}),
    )
    .await;
    assert_eq!(derived["ok"], true);
    let accounts = rpc(
        &runtime,
        15,
        "wallet:accounts:list",
        json!({"wallet_id":created["result"]["wallet_id"]}),
    )
    .await;
    let accounts = accounts["result"]["accounts"].as_array().unwrap();
    assert_eq!(accounts.len(), 2);
    let account = accounts
        .iter()
        .find(|account| account["account_id"] == derived["result"]["account_id"])
        .unwrap();
    assert_eq!(account["account_index"], 1);
    assert_eq!(account["wallet_id"], created["result"]["wallet_id"]);
    let address = rpc(
        &runtime,
        16,
        "wallet:addresses:derive",
        json!({"account_id":account["account_id"], "purpose":"receive"}),
    )
    .await;
    assert_eq!(address["ok"], true);
    assert_eq!(address["result"]["account_id"], account["account_id"]);
    assert_eq!(address["result"]["index"], account["next_receive_index"]);
    assert_eq!(address["result"]["purpose"], "receive");
    assert_ne!(
        address["result"]["address"],
        account["current_receive_address"]
    );
    let refreshed = rpc(
        &runtime,
        17,
        "wallet:accounts:list",
        json!({"wallet_id":created["result"]["wallet_id"]}),
    )
    .await;
    let updated = refreshed["result"]["accounts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["account_id"] == account["account_id"])
        .unwrap();
    assert_eq!(
        updated["current_receive_address"],
        address["result"]["address"]
    );
    assert_eq!(
        rpc(
            &runtime,
            18,
            "wallet:accounts:derive",
            json!({"wallet_id":imported["result"]["wallet_id"], "network":"ton"})
        )
        .await["code"],
        "UNSUPPORTED_ACCOUNT_MODEL"
    );
    assert_eq!(
        rpc(
            &runtime,
            19,
            "wallet:addresses:derive",
            json!({"account_id":account["account_id"], "purpose":"invalid"})
        )
        .await["code"],
        "INVALID_INPUT"
    );
    // Drafts belong to the unlocked session and cannot survive lock/unlock.
    let draft = rpc(
        &runtime,
        20,
        "wallet:hd:generateMnemonic",
        json!({"wallet_mode":"multichain", "mnemonic_standard":"rotation", "word_count":12}),
    )
    .await;
    let mut locked = runtime.lock().unwrap();
    while locked.cleanup_pending {
        locked = runtime.events(locked.sequence).await.unwrap().snapshot;
    }
    assert_eq!(
        rpc(
            &runtime,
            21,
            "vault:unlock",
            json!({"password":"synthetic wallet setup"})
        )
        .await["ok"],
        true
    );
    let stale = json!({"label":"Stale", "wallet_mode":"multichain", "mnemonic_standard":"rotation", "bip39_passphrase":"synthetic passphrase", "mnemonic_draft_id":draft["result"]["mnemonic_draft_id"], "wordlist":"english", "supported_networks":["bitcoin"]});
    assert_eq!(
        rpc(&runtime, 22, "wallet:hd:create", stale).await["code"],
        "INVALID_INPUT"
    );
    assert_eq!(
        rpc(&runtime, 23, "wallet:list", json!({})).await["result"]["wallets"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    runtime.shutdown().unwrap();
}

#[tokio::test]
async fn wallet_address_book_uses_core_validation_and_persists_changes() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault"))
        .unwrap()
        .with_offline_wallet_fixture();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    assert_eq!(
        rpc(
            &runtime,
            1,
            "vault:unlock",
            json!({"password":"synthetic contacts"})
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(&runtime, 2, "wallet:addressBook:list", json!({})).await["result"]["entries"],
        json!([])
    );
    let wallet = rpc(&runtime, 3, "wallet:import:create", json!({"label":"Contact source", "network":"ton", "curve":"ed25519", "encoding":"hex", "private_key":"01".repeat(32)})).await;
    assert_eq!(wallet["ok"], true);
    let accounts = rpc(
        &runtime,
        4,
        "wallet:accounts:list",
        json!({"wallet_id":wallet["result"]["wallet_id"]}),
    )
    .await;
    let address = &accounts["result"]["accounts"][0]["address"];
    assert!(address.as_str().is_some_and(|value| !value.is_empty()));
    assert_eq!(
        rpc(
            &runtime,
            5,
            "wallet:addressBook:create",
            json!({"label":"Invalid address", "network":"ton", "address":"not-an-address"})
        )
        .await["code"],
        "INVALID_ADDRESS"
    );
    assert_eq!(
        rpc(
            &runtime,
            6,
            "wallet:addressBook:create",
            json!({"label":"  ", "network":"ton", "address":address})
        )
        .await["code"],
        "INVALID_INPUT"
    );
    let created = rpc(
        &runtime,
        7,
        "wallet:addressBook:create",
        json!({"label":"  Savings  ", "network":"ton", "address":address}),
    )
    .await;
    assert_eq!(created["ok"], true);
    let entry = &created["result"]["entry"];
    assert_eq!(entry["label"], "Savings");
    assert_eq!(entry["network"], "ton");
    assert_eq!(
        rpc(
            &runtime,
            8,
            "wallet:addressBook:create",
            json!({"label":"Duplicate", "network":"ton", "address":entry["address"]})
        )
        .await["code"],
        "INVALID_INPUT"
    );
    let updated = rpc(&runtime, 9, "wallet:addressBook:update", json!({"entry_id":entry["entry_id"], "label":"Long-term savings", "network":"ton", "address":entry["address"]})).await;
    assert_eq!(updated["ok"], true);
    let updated_entry = &updated["result"]["entry"];
    assert_eq!(updated_entry["entry_id"], entry["entry_id"]);
    assert_eq!(updated_entry["created_at"], entry["created_at"]);
    assert_eq!(updated_entry["label"], "Long-term savings");
    assert_eq!(
        rpc(&runtime, 10, "wallet:addressBook:list", json!({})).await["result"]["entries"],
        json!([updated_entry])
    );
    let mut snapshot = runtime.lock().unwrap();
    while snapshot.cleanup_pending {
        snapshot = runtime.events(snapshot.sequence).await.unwrap().snapshot;
    }
    assert_eq!(
        rpc(&runtime, 11, "wallet:addressBook:list", json!({})).await["code"],
        "VAULT_REQUIRED"
    );
    assert_eq!(
        rpc(
            &runtime,
            12,
            "vault:unlock",
            json!({"password":"synthetic contacts"})
        )
        .await["ok"],
        true
    );
    assert_eq!(
        rpc(&runtime, 13, "wallet:addressBook:list", json!({})).await["result"]["entries"],
        json!([updated_entry])
    );
    assert_eq!(
        rpc(
            &runtime,
            14,
            "wallet:addressBook:delete",
            json!({"entry_id":"invalid"})
        )
        .await["code"],
        "INVALID_INPUT"
    );
    let deleted = rpc(
        &runtime,
        15,
        "wallet:addressBook:delete",
        json!({"entry_id":entry["entry_id"]}),
    )
    .await;
    assert_eq!(deleted["ok"], true);
    assert_eq!(deleted["result"]["entry_id"], entry["entry_id"]);
    assert_eq!(
        rpc(&runtime, 16, "wallet:addressBook:list", json!({})).await["result"]["entries"],
        json!([])
    );
    assert_eq!(
        rpc(
            &runtime,
            17,
            "wallet:addressBook:delete",
            json!({"entry_id":entry["entry_id"]})
        )
        .await["code"],
        "NODE_NOT_FOUND"
    );
    runtime.shutdown().unwrap();
}

#[tokio::test]
async fn wallet_history_sync_paginates_and_reconciles_real_core_records_offline() {
    let root = tempfile::tempdir().unwrap();
    let adapter = LocalCoreAdapter::new_with_test_keystore(root.path().join("vault"))
        .unwrap()
        .with_wallet_history_fixture();
    let runtime = AirRuntime {
        session: Arc::new(LocalSession::new(adapter).unwrap()),
        host: Mutex::new(None),
    };
    assert_eq!(
        rpc(
            &runtime,
            1,
            "vault:unlock",
            json!({"password":"synthetic history"})
        )
        .await["ok"],
        true
    );
    let imported = rpc(
        &runtime,
        2,
        "wallet:import:create",
        json!({
            "label":"Synthetic history", "network":"ton", "curve":"ed25519",
            "encoding":"hex", "private_key":"01".repeat(32)
        }),
    )
    .await;
    assert_eq!(imported["ok"], true);
    let account_id = &imported["result"]["account_id"];
    let wallet_id = &imported["result"]["wallet_id"];
    assert_eq!(
        rpc(
            &runtime,
            3,
            "wallet:transactions:list",
            json!({"account_id":account_id})
        )
        .await["result"]["transactions"],
        json!([])
    );
    for id in 4..=5 {
        let synced = rpc(
            &runtime,
            id,
            "wallet:transactions:sync",
            json!({"account_id":account_id,"limit":50}),
        )
        .await;
        assert_eq!(synced["ok"], true, "history sync code: {}", synced["code"]);
        assert_eq!(synced["result"]["synced_count"], 2);
        assert_eq!(synced["result"]["account_id"], *account_id);
    }
    let first = rpc(
        &runtime,
        6,
        "wallet:transactions:list",
        json!({"wallet_id":wallet_id,"account_id":account_id,"limit":1}),
    )
    .await;
    assert_eq!(first["ok"], true);
    let first_entry = &first["result"]["transactions"][0];
    assert_eq!(first_entry["tx_hash"], "air-fixture-outgoing");
    assert_eq!(first_entry["status"], "pending");
    assert_eq!(first_entry["amount"], "42");
    assert_eq!(first_entry["fee"], "3");
    assert!(first["result"]["next_cursor"].is_string());
    let second = rpc(
        &runtime,
        7,
        "wallet:transactions:list",
        json!({"account_id":account_id,"limit":1,"cursor":first["result"]["next_cursor"]}),
    )
    .await;
    assert_eq!(second["ok"], true);
    let second_entry = &second["result"]["transactions"][0];
    assert_eq!(second_entry["tx_hash"], "air-fixture-incoming");
    assert_eq!(second_entry["amount"], "900719925474099312345");
    assert_eq!(second_entry["direction"], "incoming");
    assert_eq!(second_entry["counterparty"], "synthetic-sender");
    assert!(second["result"]["next_cursor"].is_null());
    let filtered = rpc(
        &runtime,
        8,
        "wallet:transactions:list",
        json!({"account_id":account_id,"status":"confirmed"}),
    )
    .await;
    assert_eq!(
        filtered["result"]["transactions"].as_array().unwrap().len(),
        1
    );
    let other = rpc(
        &runtime,
        9,
        "wallet:import:create",
        json!({
            "label":"Other account", "network":"ton", "curve":"ed25519",
            "encoding":"hex", "private_key":"02".repeat(32)
        }),
    )
    .await;
    assert_eq!(other["ok"], true);
    assert_eq!(
        rpc(
            &runtime,
            10,
            "wallet:transactions:list",
            json!({"account_id":other["result"]["account_id"]})
        )
        .await["result"]["transactions"],
        json!([])
    );
    let refreshed = rpc(
        &runtime,
        11,
        "wallet:transactions:refresh",
        json!({"tx_ref":first_entry["tx_ref"]}),
    )
    .await;
    assert_eq!(refreshed["ok"], true);
    assert_eq!(refreshed["result"]["tx_ref"], first_entry["tx_ref"]);
    assert_eq!(refreshed["result"]["status"], "confirmed");
    let confirmed = rpc(
        &runtime,
        12,
        "wallet:transactions:list",
        json!({"account_id":account_id,"status":"confirmed"}),
    )
    .await;
    assert_eq!(
        confirmed["result"]["transactions"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let generation = runtime.snapshot().unwrap().generation;
    let mut snapshot = runtime.lock().unwrap();
    while snapshot.cleanup_pending {
        snapshot = runtime.events(snapshot.sequence).await.unwrap().snapshot;
    }
    assert_eq!(
        rpc(&runtime, 13, "wallet:transactions:list", json!({})).await["code"],
        "VAULT_REQUIRED"
    );
    assert_eq!(
        rpc(
            &runtime,
            14,
            "vault:unlock",
            json!({"password":"synthetic history"})
        )
        .await["ok"],
        true
    );
    let persisted = rpc(
        &runtime,
        15,
        "wallet:transactions:list",
        json!({"account_id":account_id}),
    )
    .await;
    assert_eq!(
        persisted["result"]["transactions"],
        confirmed["result"]["transactions"]
    );
    assert!(matches!(runtime.begin_execute(16, generation, serde_json::to_vec(&json!({"v":1,"command":"wallet:transactions:sync","data":{"account_id":account_id}})).unwrap()), Err(BridgeError::SessionRevoked)));
    runtime.shutdown().unwrap();
}
