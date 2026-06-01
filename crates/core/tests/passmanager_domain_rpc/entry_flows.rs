use super::support::*;

#[test]
fn test_passmanager_domain_allows_root_list_while_generic_denies() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let generic = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/.passmanager"}),
    ));
    assert_rpc_error(&generic, "ACCESS_DENIED");

    let pm = router.handle(&RpcRequest::new(
        "passmanager:entry:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&pm);
}

#[test]
fn test_passmanager_create_update_move_delete_flow() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let created_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/GroupA"}),
    ));
    assert_rpc_ok(&created_group);

    let created_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"title": "EntryA"}),
    ));
    assert_rpc_ok(&created_entry);
    let entry_id = created_entry
        .result()
        .and_then(|r| r.get("entry_id"))
        .and_then(|v| v.as_str())
        .expect("entry_id")
        .to_string();

    let updated = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"entry_id": entry_id.clone(), "title": "EntryRenamed"}),
    ));
    assert_rpc_ok(&updated);

    let read_updated = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": entry_id.clone()}),
    ));
    assert_rpc_ok(&read_updated);
    let read_entry = read_updated
        .result()
        .and_then(|r| r.get("entry"))
        .expect("entry");
    assert_eq!(
        read_entry.get("title").and_then(|v| v.as_str()),
        Some("EntryRenamed")
    );

    let moved = router.handle(&RpcRequest::new(
        "passmanager:entry:move",
        serde_json::json!({"entry_id": entry_id.clone(), "target_group_path": "/GroupA"}),
    ));
    assert_rpc_ok(&moved);

    let deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:delete",
        serde_json::json!({"entry_id": entry_id.clone()}),
    ));
    assert_rpc_ok(&deleted);

    let read_deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": entry_id.clone()}),
    ));
    assert_rpc_error(&read_deleted, "NODE_NOT_FOUND");
}

#[test]
fn test_passmanager_entry_domain_save_read_move_list_delete_flow() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_work = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/work"}),
    ));
    assert_rpc_ok(&ensure_work);

    let ensure_archive = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/archive"}),
    ));
    assert_rpc_ok(&ensure_archive);

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-1",
            "import_source": {
                "type": "keepass",
                "original_id": "keepass:entry-1"
            },
            "title": "Alpha",
            "group_path": "/work",
            "username": "alice",
            "urls": ["https://alpha.local"],
        }),
    ));
    assert_rpc_ok(&created);
    assert_eq!(
        created
            .result()
            .and_then(|r| r.get("entry_id"))
            .and_then(|v| v.as_str()),
        Some("entry-1")
    );

    let updated = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "entry-1",
            "title": "Alpha Updated",
            "groupPath": "/work",
            "username": "alice.updated",
            "urls": ["https://alpha-updated.local"],
        }),
    ));
    assert_rpc_ok(&updated);

    let read = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "entry-1"}),
    ));
    assert_rpc_ok(&read);
    let read_entry = read.result().and_then(|r| r.get("entry")).expect("entry");
    assert_eq!(
        read_entry.get("title").and_then(|v| v.as_str()),
        Some("Alpha Updated")
    );
    assert_eq!(
        read_entry.get("username").and_then(|v| v.as_str()),
        Some("alice.updated")
    );
    assert_eq!(
        read_entry
            .get("import_source")
            .and_then(|v| v.get("original_id"))
            .and_then(|v| v.as_str()),
        Some("keepass:entry-1")
    );

    let listed = router.handle(&RpcRequest::new(
        "passmanager:entry:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let _entries = get_entries(&listed);

    let moved = router.handle(&RpcRequest::new(
        "passmanager:entry:move",
        serde_json::json!({"entry_id": "entry-1", "target_group_path": "/archive"}),
    ));
    assert_rpc_ok(&moved);

    let created_to_delete = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-2",
            "title": "Delete Me",
            "group_path": "/work"
        }),
    ));
    assert_rpc_ok(&created_to_delete);

    let deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:delete",
        serde_json::json!({"entry_id": "entry-2"}),
    ));
    assert_rpc_ok(&deleted);

    let read_deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "entry-2"}),
    ));
    assert_rpc_error(&read_deleted, "NODE_NOT_FOUND");
}

#[test]
fn test_passmanager_entry_save_preserves_created_timestamp_on_update() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "timestamp-entry",
            "title": "Timestamp Entry",
            "createdTs": 1_700_000_000_000u64,
            "updatedTs": 1_700_000_010_000u64,
        }),
    ));
    assert_rpc_ok(&created);

    let updated = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "timestamp-entry",
            "title": "Timestamp Entry Updated",
            "updatedTs": 1_700_000_020_000u64,
        }),
    ));
    assert_rpc_ok(&updated);

    let read = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "timestamp-entry"}),
    ));
    assert_rpc_ok(&read);
    let entry = read.result().and_then(|r| r.get("entry")).expect("entry");
    assert_eq!(
        entry.get("createdTs").and_then(|v| v.as_u64()),
        Some(1_700_000_000_000)
    );
    assert_eq!(
        entry.get("updatedTs").and_then(|v| v.as_u64()),
        Some(1_700_000_020_000)
    );
}

#[test]
fn test_passmanager_entry_tags_follow_shared_normalization_cases() {
    let cases: serde_json::Value =
        serde_json::from_str(CREDENTIAL_TAG_NORMALIZATION_CASES).expect("normalization fixture");
    let cases = cases.as_array().expect("normalization cases array");

    for (index, case) in cases.iter().enumerate() {
        let (mut router, _tmp) = create_test_router();
        assert_rpc_ok(&unlock_vault(&mut router, "pw"));

        let input = case.get("input").expect("case input");
        let expected_labels = case
            .get("labels")
            .and_then(|v| v.as_array())
            .expect("case labels")
            .iter()
            .map(|value| value.as_str().expect("label string").to_string())
            .collect::<Vec<_>>();
        let expected_keys = case
            .get("keys")
            .and_then(|v| v.as_array())
            .expect("case keys")
            .iter()
            .map(|value| value.as_str().expect("key string").to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            expected_labels
                .iter()
                .map(|label| tag_key(label))
                .collect::<Vec<_>>(),
            expected_keys
        );

        let entry_id = format!("tag-fixture-{index}");
        let saved = router.handle(&RpcRequest::new(
            "passmanager:entry:save",
            serde_json::json!({
                "id": entry_id,
                "title": format!("Tag Fixture {index}"),
                "tags": input,
            }),
        ));
        assert_rpc_ok(&saved);

        let read = router.handle(&RpcRequest::new(
            "passmanager:entry:read",
            serde_json::json!({"entry_id": format!("tag-fixture-{index}")}),
        ));
        assert_rpc_ok(&read);
        let entry = read.result().and_then(|r| r.get("entry")).expect("entry");
        assert_eq!(
            entry_tags(entry),
            expected_labels,
            "fixture case should match: {}",
            case.get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unnamed")
        );
    }
}

#[test]
fn test_passmanager_entry_tags_roundtrip_preserve_and_clear() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "tag-entry-1",
            "title": "Tagged Entry",
            "tags": ["  #Work  ", "Client   A", "client a", "Ｆｉｎａｎｃｅ"],
        }),
    ));
    assert_rpc_ok(&saved);

    let read = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "tag-entry-1"}),
    ));
    assert_rpc_ok(&read);
    let entry = read.result().and_then(|r| r.get("entry")).expect("entry");
    assert_eq!(entry_tags(entry), vec!["Work", "Client A", "Finance"]);

    let omitted_tags_update = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "tag-entry-1",
            "title": "Tagged Entry Renamed",
        }),
    ));
    assert_rpc_ok(&omitted_tags_update);

    let read_after_omitted = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "tag-entry-1"}),
    ));
    assert_rpc_ok(&read_after_omitted);
    let entry_after_omitted = read_after_omitted
        .result()
        .and_then(|r| r.get("entry"))
        .expect("entry");
    assert_eq!(
        entry_tags(entry_after_omitted),
        vec!["Work", "Client A", "Finance"]
    );

    let listed = router.handle(&RpcRequest::new(
        "passmanager:entry:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let listed_entry = get_entries(&listed)
        .into_iter()
        .find(|entry| entry.get("id").and_then(|v| v.as_str()) == Some("tag-entry-1"))
        .expect("listed tagged entry");
    assert_eq!(
        entry_tags(&listed_entry),
        vec!["Work", "Client A", "Finance"]
    );

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let exported_entry =
        get_root_entry_by_id(&exported, "tag-entry-1").expect("exported tagged entry");
    assert_eq!(
        entry_tags(exported_entry),
        vec!["Work", "Client A", "Finance"]
    );

    let cleared = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "tag-entry-1",
            "title": "Tagged Entry Cleared",
            "tags": [],
        }),
    ));
    assert_rpc_ok(&cleared);

    let read_after_clear = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "tag-entry-1"}),
    ));
    assert_rpc_ok(&read_after_clear);
    let entry_after_clear = read_after_clear
        .result()
        .and_then(|r| r.get("entry"))
        .expect("entry");
    assert!(entry_after_clear.get("tags").is_none());

    let saved_again = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "tag-entry-1",
            "title": "Tagged Entry Again",
            "tags": ["Keep"],
        }),
    ));
    assert_rpc_ok(&saved_again);

    let malformed_clear = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "tag-entry-1",
            "title": "Tagged Entry Malformed Clear",
            "tags": [null, "", " # "],
        }),
    ));
    assert_rpc_ok(&malformed_clear);

    let read_after_malformed = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "tag-entry-1"}),
    ));
    assert_rpc_ok(&read_after_malformed);
    let entry_after_malformed = read_after_malformed
        .result()
        .and_then(|r| r.get("entry"))
        .expect("entry");
    assert!(entry_after_malformed.get("tags").is_none());
}

#[test]
fn test_passmanager_delete_and_group_ensure_survive_fresh_router_without_explicit_save() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/persisted/group"}),
    )));
    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "delete-persist-entry",
            "title": "Delete Persist",
            "group_path": "/persisted/group"
        }),
    ));
    assert_rpc_ok(&saved_entry);
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:delete",
        serde_json::json!({"entry_id": "delete-persist-entry"}),
    )));
    drop(router);

    let storage = chromvoid_core::storage::Storage::new(tmp.path()).expect("storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));
    let groups = reopened.handle(&RpcRequest::new(
        "passmanager:group:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&groups);
    assert!(get_groups(&groups).contains(&"/persisted/group".to_string()));
    let entries = reopened.handle(&RpcRequest::new(
        "passmanager:entry:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&entries);
    assert!(get_entries(&entries).iter().all(|entry| {
        entry.get("id").and_then(|value| value.as_str()) != Some("delete-persist-entry")
    }));
}

#[test]
fn test_passmanager_payment_card_roundtrip_masks_list_and_read_but_exports_secrets() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensured_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/Finance/Cards"}),
    ));
    assert_rpc_ok(&ensured_group);

    let saved = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "card-1",
            "title": "Personal Visa",
            "entry_type": "payment_card",
            "group_path": "/Finance/Cards",
            "payment_card": {
                "cardholder_name": "JOHN DOE",
                "brand": "visa",
                "exp_month": 12,
                "exp_year": 2028
            },
            "tags": [" #Finance ", "Card"]
        }),
    ));
    assert_rpc_ok(&saved);

    let card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "card-1",
            "secret_type": "card_pan",
            "value": "4111 1111 1111 1111"
        }),
    ));
    assert_rpc_ok(&card_pan);

    let card_cvv = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "card-1",
            "secret_type": "card_cvv",
            "value": "123"
        }),
    ));
    assert_rpc_ok(&card_cvv);

    let card_note = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "card-1",
            "secret_type": "note",
            "value": "Billing address: 1 Payment Street"
        }),
    ));
    assert_rpc_ok(&card_note);

    let invalid_password = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "card-1",
            "secret_type": "password",
            "value": "should-fail"
        }),
    ));
    assert_rpc_error(&invalid_password, "EMPTY_PAYLOAD");

    let read = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "card-1"}),
    ));
    assert_rpc_ok(&read);
    let entry = read.result().and_then(|r| r.get("entry")).expect("entry");
    assert_eq!(
        entry.get("entry_type").and_then(|v| v.as_str()),
        Some("payment_card")
    );
    assert_eq!(
        entry
            .get("payment_card")
            .or_else(|| entry.get("paymentCard"))
            .and_then(|v| v.get("last4"))
            .and_then(|v| v.as_str()),
        Some("1111")
    );
    assert!(entry.get("card_pan").is_none());
    assert!(entry.get("card_cvv").is_none());
    assert_eq!(entry_tags(entry), vec!["Finance", "Card"]);

    let listed = router.handle(&RpcRequest::new(
        "passmanager:entry:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let listed_entry = get_entries(&listed)
        .into_iter()
        .find(|entry| entry.get("id").and_then(|v| v.as_str()) == Some("card-1"))
        .expect("listed entry");
    assert!(listed_entry.get("card_pan").is_none());
    assert!(listed_entry.get("card_cvv").is_none());
    assert_eq!(entry_tags(&listed_entry), vec!["Finance", "Card"]);

    let read_card_pan = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({"entry_id": "card-1", "secret_type": "card_pan"}),
    ));
    assert_rpc_ok(&read_card_pan);
    assert_eq!(
        read_card_pan
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("4111111111111111")
    );

    let read_card_note = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({"entry_id": "card-1", "secret_type": "note"}),
    ));
    assert_rpc_ok(&read_card_note);
    assert_eq!(
        read_card_note
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("Billing address: 1 Payment Street")
    );

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let exported_entry = get_root_entry_by_id(&exported, "card-1").expect("exported card entry");
    assert_eq!(
        exported_entry.get("card_pan").and_then(|v| v.as_str()),
        Some("4111111111111111")
    );
    assert_eq!(
        exported_entry.get("card_cvv").and_then(|v| v.as_str()),
        Some("123")
    );
    assert_eq!(
        exported_entry.get("note").and_then(|v| v.as_str()),
        Some("Billing address: 1 Payment Street")
    );
    assert_eq!(entry_tags(exported_entry), vec!["Finance", "Card"]);
}

#[test]
fn test_passmanager_entry_save_accepts_icon_ref_and_exports_icon_ref() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "icon-entry-1",
            "title": "Icon Entry",
            "icon_ref": SAMPLE_ENTRY_ICON_REF
        }),
    ));
    assert_rpc_ok(&saved);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");
    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    let entry = entries
        .iter()
        .find(|item| item.get("id").and_then(|v| v.as_str()) == Some("icon-entry-1"))
        .expect("icon entry in export");
    assert_eq!(
        entry.get("iconRef").and_then(|v| v.as_str()),
        Some(SAMPLE_ENTRY_ICON_REF)
    );
}

#[test]
fn test_passmanager_entry_save_moves_existing_entry_to_root_when_group_path_is_cleared() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/work"}),
    ));
    assert_rpc_ok(&ensure_group);

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "move-root-1",
            "title": "Move Root",
            "group_path": "/work",
            "username": "alice",
            "urls": ["https://example.test"],
        }),
    ));
    assert_rpc_ok(&created);

    let updated = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "move-root-1",
            "title": "Move Root",
            "group_path": "",
            "username": "alice",
            "urls": ["https://example.test"],
        }),
    ));
    assert_rpc_ok(&updated);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let entry = get_root_entry_by_id(&exported, "move-root-1").expect("entry in export");
    assert_eq!(entry.get("folderPath"), Some(&serde_json::Value::Null));
}

#[test]
fn test_passmanager_entry_move_moves_existing_entry_to_root() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/work"}),
    ));
    assert_rpc_ok(&ensure_group);

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "move-root-direct-1",
            "title": "Move Root Direct",
            "group_path": "/work",
            "username": "alice",
            "urls": ["https://example.test"],
        }),
    ));
    assert_rpc_ok(&created);

    let moved = router.handle(&RpcRequest::new(
        "passmanager:entry:move",
        serde_json::json!({
            "entry_id": "move-root-direct-1",
            "target_group_path": "",
        }),
    ));
    assert_rpc_ok(&moved);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let entry = get_root_entry_by_id(&exported, "move-root-direct-1").expect("entry in export");
    assert_eq!(entry.get("folderPath"), Some(&serde_json::Value::Null));
}

#[test]
fn test_passmanager_entry_move_moves_existing_nested_entry_to_root() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/team/dev"}),
    ));
    assert_rpc_ok(&ensure_group);

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "move-root-nested-1",
            "title": "Move Root Nested",
            "group_path": "/team/dev",
            "username": "alice",
            "urls": ["https://example.test"],
        }),
    ));
    assert_rpc_ok(&created);

    let moved = router.handle(&RpcRequest::new(
        "passmanager:entry:move",
        serde_json::json!({
            "entry_id": "move-root-nested-1",
            "target_group_path": "",
        }),
    ));
    assert_rpc_ok(&moved);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let entry = get_root_entry_by_id(&exported, "move-root-nested-1").expect("entry in export");
    assert_eq!(entry.get("folderPath"), Some(&serde_json::Value::Null));
    assert_eq!(
        entry.get("group_path"),
        Some(&serde_json::Value::String("/".to_string()))
    );
    assert_eq!(
        entry.get("groupPath"),
        Some(&serde_json::Value::String("/".to_string()))
    );
}

#[test]
fn test_passmanager_entry_move_preserves_otp_and_ssh_artifacts() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/work"}),
    ));
    assert_rpc_ok(&ensure_group);

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "move-secrets-direct-1",
            "title": "Move Secrets Direct",
            "group_path": "/work",
            "username": "alice",
            "urls": ["https://example.test"],
            "sshKeys": [{
                "id": "key-1",
                "type": "ed25519",
                "fingerprint": "SHA256:test",
                "comment": "alice@example.test"
            }],
            "otps": [{
                "id": "otp-1",
                "label": "Main",
                "algorithm": "SHA1",
                "digits": 6,
                "period": 30,
                "encoding": "base32",
                "type": "TOTP"
            }]
        }),
    ));
    assert_rpc_ok(&created);

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "move-secrets-direct-1",
            "secret_type": "ssh_private_key:key-1",
            "value": "PRIVATE-KEY-DATA"
        }),
    )));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "move-secrets-direct-1",
            "secret_type": "ssh_public_key:key-1",
            "value": "PUBLIC-KEY-DATA"
        }),
    )));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "otp-1",
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30
        }),
    )));

    let moved = router.handle(&RpcRequest::new(
        "passmanager:entry:move",
        serde_json::json!({
            "entry_id": "move-secrets-direct-1",
            "target_group_path": "",
        }),
    ));
    assert_rpc_ok(&moved);

    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({
            "entry_id": "move-secrets-direct-1",
            "otp_id": "otp-1",
            "ts": 0
        }),
    ));
    assert_rpc_ok(&generated);
    let otp = generated
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp");
    assert_eq!(otp.len(), 6);
    assert!(otp.chars().all(|c| c.is_ascii_digit()));

    let read_private = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "move-secrets-direct-1",
            "secret_type": "ssh_private_key:key-1"
        }),
    ));
    assert_rpc_ok(&read_private);
    assert_eq!(
        read_private
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("PRIVATE-KEY-DATA")
    );

    let read_public = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "move-secrets-direct-1",
            "secret_type": "ssh_public_key:key-1"
        }),
    ));
    assert_rpc_ok(&read_public);
    assert_eq!(
        read_public
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("PUBLIC-KEY-DATA")
    );

    let read_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "move-secrets-direct-1"}),
    ));
    assert_rpc_ok(&read_entry);
    let entry = read_entry
        .result()
        .and_then(|r| r.get("entry"))
        .expect("entry");
    assert_eq!(
        entry
            .get("sshKeys")
            .and_then(|v| v.as_array())
            .map(|items| items.len()),
        Some(1)
    );
    assert_eq!(
        entry
            .get("otps")
            .and_then(|v| v.as_array())
            .map(|items| items.len()),
        Some(1)
    );

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let entry = get_root_entry_by_id(&exported, "move-secrets-direct-1").expect("entry in export");
    assert_eq!(entry.get("folderPath"), Some(&serde_json::Value::Null));
    assert_eq!(
        entry
            .get("sshKeys")
            .and_then(|v| v.as_array())
            .map(|items| items.len()),
        Some(1)
    );
    assert_eq!(
        entry
            .get("otps")
            .and_then(|v| v.as_array())
            .map(|items| items.len()),
        Some(1)
    );
}

#[test]
fn test_passmanager_entry_save_move_preserves_otp_and_ssh_artifacts() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/work"}),
    ));
    assert_rpc_ok(&ensure_group);

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "move-secrets-save-1",
            "title": "Move Secrets Save",
            "group_path": "/work",
            "username": "alice",
            "urls": ["https://example.test"],
            "sshKeys": [{
                "id": "key-1",
                "type": "ed25519",
                "fingerprint": "SHA256:test",
                "comment": "alice@example.test"
            }],
            "otps": [{
                "id": "otp-1",
                "label": "Main",
                "algorithm": "SHA1",
                "digits": 6,
                "period": 30,
                "encoding": "base32",
                "type": "TOTP"
            }]
        }),
    ));
    assert_rpc_ok(&created);

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "move-secrets-save-1",
            "secret_type": "ssh_private_key:key-1",
            "value": "PRIVATE-KEY-DATA"
        }),
    )));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "move-secrets-save-1",
            "secret_type": "ssh_public_key:key-1",
            "value": "PUBLIC-KEY-DATA"
        }),
    )));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "otp-1",
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30
        }),
    )));

    let moved_meta = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "move-secrets-save-1",
            "title": "Move Secrets Save",
            "group_path": "",
            "username": "alice",
            "urls": ["https://example.test"],
            "sshKeys": [{
                "id": "key-1",
                "type": "ed25519",
                "fingerprint": "SHA256:test",
                "comment": "alice@example.test"
            }]
        }),
    ));
    assert_rpc_ok(&moved_meta);

    let restored_otps = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "move-secrets-save-1",
            "title": "Move Secrets Save",
            "group_path": "",
            "username": "alice",
            "urls": ["https://example.test"],
            "sshKeys": [{
                "id": "key-1",
                "type": "ed25519",
                "fingerprint": "SHA256:test",
                "comment": "alice@example.test"
            }],
            "otps": [{
                "id": "otp-1",
                "label": "Main",
                "algorithm": "SHA1",
                "digits": 6,
                "period": 30,
                "encoding": "base32",
                "type": "TOTP"
            }]
        }),
    ));
    assert_rpc_ok(&restored_otps);

    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({
            "entry_id": "move-secrets-save-1",
            "otp_id": "otp-1",
            "ts": 0
        }),
    ));
    assert_rpc_ok(&generated);

    let read_private = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "move-secrets-save-1",
            "secret_type": "ssh_private_key:key-1"
        }),
    ));
    assert_rpc_ok(&read_private);
    assert_eq!(
        read_private
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("PRIVATE-KEY-DATA")
    );

    let read_public = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "move-secrets-save-1",
            "secret_type": "ssh_public_key:key-1"
        }),
    ));
    assert_rpc_ok(&read_public);
    assert_eq!(
        read_public
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("PUBLIC-KEY-DATA")
    );

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let entry = get_root_entry_by_id(&exported, "move-secrets-save-1").expect("entry in export");
    assert_eq!(entry.get("folderPath"), Some(&serde_json::Value::Null));
    assert_eq!(
        entry
            .get("sshKeys")
            .and_then(|v| v.as_array())
            .map(|items| items.len()),
        Some(1)
    );
    assert_eq!(
        entry
            .get("otps")
            .and_then(|v| v.as_array())
            .map(|items| items.len()),
        Some(1)
    );
}

#[test]
fn test_passmanager_meta_update_keeps_secret_icon_and_otp_links() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let put_icon = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put_icon);
    let icon_ref = put_icon
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("icon_ref")
        .to_string();

    let entry_id = "wave3-entry-1";
    let otp_id = "otp-wave3-1";

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": entry_id,
            "title": "Wave3 Entry",
            "username": "alice",
            "icon_ref": icon_ref.clone(),
            "otps": [
                {
                    "id": otp_id,
                    "label": "Main",
                    "algorithm": "SHA1",
                    "digits": 6,
                    "period": 30,
                    "encoding": "base32",
                    "type": "TOTP"
                }
            ]
        }),
    ));
    assert_rpc_ok(&created);

    let saved_password = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "password",
            "value": "pw-wave3"
        }),
    ));
    assert_rpc_ok(&saved_password);

    let saved_note = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "note",
            "value": "note-wave3"
        }),
    ));
    assert_rpc_ok(&saved_note);

    let set_otp_secret = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": otp_id,
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30
        }),
    ));
    assert_rpc_ok(&set_otp_secret);

    let otp_before = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "otp_id": otp_id, "ts": 0}),
    ));
    assert_rpc_ok(&otp_before);

    let meta_only_update = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": entry_id,
            "title": "Wave3 Entry Updated",
            "username": "alice.updated",
            "urls": ["https://updated.local"]
        }),
    ));
    assert_rpc_ok(&meta_only_update);

    let read_password = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&read_password);
    assert_eq!(
        read_password
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("pw-wave3")
    );

    let read_note = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "note"
        }),
    ));
    assert_rpc_ok(&read_note);
    assert_eq!(
        read_note
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("note-wave3")
    );

    let otp_after = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "otp_id": otp_id, "ts": 0}),
    ));
    assert_rpc_ok(&otp_after);
    let otp_code = otp_after
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp code");
    assert_eq!(otp_code.len(), 6);
    assert!(otp_code.chars().all(|c| c.is_ascii_digit()));

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");
    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    let entry = entries
        .iter()
        .find(|item| item.get("id").and_then(|v| v.as_str()) == Some(entry_id))
        .expect("entry in export");

    assert_eq!(
        entry.get("title").and_then(|v| v.as_str()),
        Some("Wave3 Entry Updated")
    );
    assert_eq!(
        entry.get("iconRef").and_then(|v| v.as_str()),
        Some(icon_ref.as_str())
    );
    let otps = entry
        .get("otps")
        .and_then(|v| v.as_array())
        .expect("otps in export");
    assert!(otps
        .iter()
        .any(|item| item.get("id").and_then(|v| v.as_str()) == Some(otp_id)));

    let fetched_icon = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": icon_ref}),
    ));
    assert_rpc_ok(&fetched_icon);
}
