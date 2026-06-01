use super::support::*;

fn assert_rpc_error_message(response: &RpcResponse, expected_code: &str, expected_message: &str) {
    assert_rpc_error(response, expected_code);
    assert_eq!(response.error_message(), Some(expected_message));
}

fn save_payment_card_entry(router: &mut RpcRouter, entry_id: &str, title: &str) {
    let saved_card = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": entry_id,
            "title": title,
            "entry_type": "payment_card",
            "payment_card": {
                "cardholder_name": "JOHN DOE",
                "brand": "visa",
                "exp_month": 12,
                "exp_year": 2028
            }
        }),
    ));
    assert_rpc_ok(&saved_card);
}

fn payment_card_meta(entry: &serde_json::Value) -> Option<&serde_json::Value> {
    entry
        .get("payment_card")
        .or_else(|| entry.get("paymentCard"))
}

fn payment_card_last4(entry: &serde_json::Value) -> Option<&str> {
    payment_card_meta(entry)
        .and_then(|value| value.get("last4"))
        .and_then(|value| value.as_str())
}

#[test]
fn test_passmanager_secret_domain_save_read_roundtrip() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-1", "title": "Secret Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let secret_save = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-1",
            "secret_type": "password",
            "value": "sup3r-secret"
        }),
    ));
    assert_rpc_ok(&secret_save);

    let secret_read = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "secret-entry-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&secret_read);
    assert_eq!(
        secret_read
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("sup3r-secret")
    );
}

#[test]
fn test_passmanager_secret_save_survives_fresh_router_without_explicit_save() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "persist-entry-1", "title": "Persist Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let secret_save = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "persist-entry-1",
            "secret_type": "password",
            "value": "persisted-secret"
        }),
    ));
    assert_rpc_ok(&secret_save);
    drop(router);

    let storage = chromvoid_core::storage::Storage::new(tmp.path()).expect("storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));
    let secret_read = reopened.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "persist-entry-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&secret_read);
    assert_eq!(
        secret_read
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("persisted-secret")
    );
}

#[test]
fn test_passmanager_secret_domain_empty_value_is_allowed() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-empty-1", "title": "Secret Empty Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let secret_save = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-empty-1",
            "secret_type": "password",
            "value": ""
        }),
    ));
    assert_rpc_ok(&secret_save);

    let secret_read = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "secret-entry-empty-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&secret_read);
    assert_eq!(
        secret_read
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("")
    );
}

#[test]
fn test_passmanager_secret_domain_save_rejects_missing_or_null_value() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-missing-1", "title": "Secret Missing Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let missing_value = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-missing-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_error_message(&missing_value, "EMPTY_PAYLOAD", "value is required");

    let null_value = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-missing-1",
            "secret_type": "password",
            "value": null
        }),
    ));
    assert_rpc_error_message(
        &null_value,
        "EMPTY_PAYLOAD",
        "value must be string; use passmanager:secret:delete for null",
    );
}

#[test]
fn test_passmanager_secret_typed_boundary_error_messages() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_login = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-error-entry", "title": "Secret Error Entry"}),
    ));
    assert_rpc_ok(&saved_login);

    let missing_entry_id = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({"secret_type": "password"}),
    ));
    assert_rpc_error_message(&missing_entry_id, "EMPTY_PAYLOAD", "entry_id is required");

    let unsupported_ssh_secret = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-error-entry",
            "secret_type": "ssh_private_key:bad id",
            "value": "private-key"
        }),
    ));
    assert_rpc_error_message(
        &unsupported_ssh_secret,
        "EMPTY_PAYLOAD",
        "Unsupported secret type",
    );

    let incompatible_card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-error-entry",
            "secret_type": "card_pan",
            "value": "4111111111111111"
        }),
    ));
    assert_rpc_error_message(
        &incompatible_card_pan,
        "EMPTY_PAYLOAD",
        "secret_type is incompatible with entry_type",
    );

    save_payment_card_entry(&mut router, "secret-error-card", "Secret Error Card");

    let invalid_card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-error-card",
            "secret_type": "card_pan",
            "value": "123"
        }),
    ));
    assert_rpc_error_message(
        &invalid_card_pan,
        "EMPTY_PAYLOAD",
        "card_pan must contain 12-19 digits after normalization",
    );

    let invalid_card_cvv = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-error-card",
            "secret_type": "card_cvv",
            "value": "12"
        }),
    ));
    assert_rpc_error_message(
        &invalid_card_cvv,
        "EMPTY_PAYLOAD",
        "card_cvv must contain 3-4 digits after normalization",
    );
}

#[test]
fn test_passmanager_secret_domain_delete_removes_secret() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-delete-1", "title": "Secret Delete Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let secret_save = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-delete-1",
            "secret_type": "password",
            "value": "to-be-deleted"
        }),
    ));
    assert_rpc_ok(&secret_save);

    let deleted = router.handle(&RpcRequest::new(
        "passmanager:secret:delete",
        serde_json::json!({
            "entry_id": "secret-entry-delete-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&deleted);

    let read_after_delete = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "secret-entry-delete-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_error(&read_after_delete, "NODE_NOT_FOUND");
}

#[test]
fn test_passmanager_secret_read_requires_entry_id() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let outside = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "outside"}),
    ));
    assert_rpc_ok(&outside);
    let outside_node_id = get_node_id(&outside);

    let denied = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({"node_id": outside_node_id}),
    ));
    assert_rpc_error_message(&denied, "EMPTY_PAYLOAD", "entry_id is required");
}

#[test]
fn test_passmanager_payment_card_pan_delete_clears_last4() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    save_payment_card_entry(&mut router, "card-delete-last4", "Delete Last4 Card");

    let card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "card-delete-last4",
            "secret_type": "card_pan",
            "value": "4111 1111 1111 1111"
        }),
    ));
    assert_rpc_ok(&card_pan);

    let read_after_save = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "card-delete-last4"}),
    ));
    assert_rpc_ok(&read_after_save);
    let entry_after_save = read_after_save
        .result()
        .and_then(|result| result.get("entry"))
        .expect("entry");
    assert_eq!(payment_card_last4(entry_after_save), Some("1111"));

    let deleted = router.handle(&RpcRequest::new(
        "passmanager:secret:delete",
        serde_json::json!({
            "entry_id": "card-delete-last4",
            "secret_type": "card_pan"
        }),
    ));
    assert_rpc_ok(&deleted);

    let read_after_delete = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "card-delete-last4"}),
    ));
    assert_rpc_ok(&read_after_delete);
    let entry_after_delete = read_after_delete
        .result()
        .and_then(|result| result.get("entry"))
        .expect("entry");
    let payment_card = payment_card_meta(entry_after_delete).expect("payment_card");
    assert!(payment_card.get("last4").is_none());

    let read_card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "card-delete-last4",
            "secret_type": "card_pan"
        }),
    ));
    assert_rpc_error_message(&read_card_pan, "NODE_NOT_FOUND", "Secret not found");

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let exported_entry =
        get_root_entry_by_id(&exported, "card-delete-last4").expect("exported card entry");
    assert!(exported_entry.get("card_pan").is_none());
    let exported_payment_card = payment_card_meta(exported_entry).expect("exported payment_card");
    assert!(exported_payment_card.get("last4").is_none());
}

#[test]
fn test_passmanager_payment_card_pan_save_requires_payment_card_metadata() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": [],
            "entries": [{
                "id": "card-missing-meta",
                "title": "Card Missing Meta",
                "entry_type": "payment_card"
            }]
        }),
    ));
    assert_rpc_ok(&imported);

    let card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "card-missing-meta",
            "secret_type": "card_pan",
            "value": "4111111111111111"
        }),
    ));
    assert_rpc_error_message(
        &card_pan,
        "EMPTY_PAYLOAD",
        "payment_card metadata is required",
    );

    let read_card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "card-missing-meta",
            "secret_type": "card_pan"
        }),
    ));
    assert_rpc_error_message(&read_card_pan, "NODE_NOT_FOUND", "Secret not found");
}
