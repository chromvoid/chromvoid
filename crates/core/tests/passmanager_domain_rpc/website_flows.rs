use super::support::*;
use serde_json::{json, Value};

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let response = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}
fn read(router: &mut RpcRouter, id: &str) -> Value {
    call(
        router,
        "passmanager:entry:websites:read",
        json!({"entry_id":id}),
    )
}
fn raw(router: &mut RpcRouter, id: &str) -> Value {
    call(router, "passmanager:entry:read", json!({"entry_id":id}))["entry"].clone()
}

#[test]
fn website_validation_preserves_modes_and_returns_indexed_errors_without_storage() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    for mode in ["base_domain", "host", "starts_with", "exact", "never"] {
        let result = call(
            &mut router,
            "passmanager:entry:websites:validate",
            json!({"rules":[{"value":" example.com/path,segment ","match_mode":mode}]}),
        );
        assert_eq!(result["errors"], json!([]));
        assert_eq!(
            result["rules"][0]["value"],
            "https://example.com/path,segment"
        );
        assert_eq!(result["rules"][0]["match_mode"], mode);
        assert!(result["revision"].is_null());
    }
    let valid = call(
        &mut router,
        "passmanager:entry:websites:validate",
        json!({"rules":[{"value":"^https://example\\.com","match_mode":"regex"}]}),
    );
    assert_eq!(valid["errors"], json!([]));
    let invalid = call(
        &mut router,
        "passmanager:entry:websites:validate",
        json!({"rules":[
            {"value":"[","match_mode":"regex"}, {"value":"https://[","match_mode":"exact"},
            {"value":"example.com","match_mode":"future"}, {"value":"example.com/","match_mode":"host"},
            {"value":"https://example.com","match_mode":"never"}
        ]}),
    );
    assert_eq!(
        invalid["errors"],
        json!([
            {"index":0,"code":"invalid_regex"}, {"index":1,"code":"invalid_value"},
            {"index":2,"code":"invalid_mode"}, {"index":3,"code":"duplicate"}, {"index":4,"code":"duplicate"}
        ])
    );
    assert!(router
        .session()
        .unwrap()
        .catalog()
        .find_by_path("/.passmanager")
        .is_none());
}

#[test]
fn website_edit_preserves_legacy_extensions_secrets_and_unedited_rules() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    call(
        &mut router,
        "passmanager:entry:save",
        json!({"id":"login","title":"Login","username":"alice","urls":[
        {"href":"example.com","mode":"host","future":{"keep":1}},
        {"value":"(?=legacy)legacy","match":"regex","future":true}
    ],"tags":["Team"],"import_source":{"keep":true}}),
    );
    call(
        &mut router,
        "passmanager:secret:save",
        json!({"entry_id":"login","secret_type":"note","value":"private-note"}),
    );
    let before = read(&mut router, "login");
    let raw_before = raw(&mut router, "login");
    let mut rules = before["rules"].clone();
    rules[0]["value"] = json!("updated.example/path");
    rules[0]["match_mode"] = json!("exact");
    let after = call(
        &mut router,
        "passmanager:entry:websites:update",
        json!({"entry_id":"login","revision":before["revision"],"rules":rules}),
    );
    assert_eq!(after["errors"], json!([]));
    assert_ne!(after["revision"], before["revision"]);
    let saved = raw(&mut router, "login");
    assert_eq!(
        saved["urls"][0],
        json!({"value":"https://updated.example/path","match":"exact","future":{"keep":1}})
    );
    assert_eq!(saved["urls"][1], raw_before["urls"][1]);
    for key in ["title", "username", "tags", "import_source"] {
        assert_eq!(saved[key], raw_before[key]);
    }
    let secret = call(
        &mut router,
        "passmanager:secret:read",
        json!({"entry_id":"login","secret_type":"note"}),
    );
    assert_eq!(secret["value"], "private-note");
    assert!(!after.to_string().contains("private-note"));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:websites:update",
            json!({"entry_id":"login","revision":before["revision"],"rules":[]}),
        )),
        "SYNC_CONFLICT",
    );
    let mut duplicate = after["rules"].as_array().unwrap().clone();
    duplicate.insert(
        0,
        json!({"value":"https://updated.example/path","match_mode":"never"}),
    );
    let invalid = call(
        &mut router,
        "passmanager:entry:websites:update",
        json!({"entry_id":"login","revision":after["revision"],"rules":duplicate}),
    );
    assert_eq!(invalid["errors"], json!([{"index":0,"code":"duplicate"}]));
    assert_eq!(raw(&mut router, "login"), saved);
}

#[test]
fn website_commands_enforce_lock_type_references_and_bounds() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:websites:read",
            json!({"entry_id":"login"}),
        )),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    call(
        &mut router,
        "passmanager:entry:save",
        json!({"id":"login","title":"Login","urls":["example.com"]}),
    );
    let before = read(&mut router, "login");
    for rules in [
        json!([{"source_index":2,"value":"example.com","match_mode":"host"}]),
        json!([before["rules"][0], before["rules"][0]]),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                "passmanager:entry:websites:update",
                json!({"entry_id":"login","revision":before["revision"],"rules":rules}),
            )),
            "EMPTY_PAYLOAD",
        );
    }
    assert_eq!(read(&mut router, "login"), before);
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:websites:validate",
            json!({"rules":vec![json!({"value":"example.com","match_mode":"host"});101]}),
        )),
        "EMPTY_PAYLOAD",
    );
    let huge = call(
        &mut router,
        "passmanager:entry:websites:validate",
        json!({"rules":[{"value":"x".repeat(4097),"match_mode":"regex"}]}),
    );
    assert_eq!(huge["errors"][0]["code"], "too_long");
    call(
        &mut router,
        "passmanager:entry:create",
        json!({"entry_id":"card","title":"Card","entry_type":"payment_card","payment_card":{"cardholder_name":"A","exp_month":1,"exp_year":2030},"secrets":{"card_pan":"4111111111111111"}}),
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:websites:read",
            json!({"entry_id":"card"}),
        )),
        "EMPTY_PAYLOAD",
    );
    call(
        &mut router,
        "passmanager:entry:delete",
        json!({"entry_id":"login"}),
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:websites:update",
            json!({"entry_id":"login","revision":before["revision"],"rules":[]}),
        )),
        "NODE_NOT_FOUND",
    );
}

#[test]
fn root_exchange_preserves_website_aliases_modes_and_legacy_extensions() {
    let (mut router, tmp) = create_test_router();
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
    assert_rpc_ok(&unlock_vault(&mut router, "website exchange"));
    let rules = json!([
        {"value":"https://example.com/login", "match":"exact", "future":{"keep":1}},
        {"url":"https://never.example", "type":"never"},
        {"href":"(?=legacy)legacy", "mode":"regex"}
    ]);
    let mut before = Vec::new();
    for alias in ["urls", "url_rules", "urlRules"] {
        call(
            &mut router,
            "passmanager:entry:save",
            json!({
                "id":alias,"title":alias,"urls":rules,"import_source":" ".repeat(1024)
            }),
        );
        // Model an existing legacy vault. The public save API only accepts canonical urls.
        // Keep the catalog byte length so the fixture exercises decoding, not size rejection.
        let session = router.session().unwrap();
        let node = session
            .catalog()
            .find_by_path(&format!("/.passmanager/{alias}/meta.json"))
            .unwrap();
        let name =
            chromvoid_core::crypto::blob_chunk_name(session.vault_key(), node.node_id as u32, 0);
        let bytes = storage.read_chunk(&name).unwrap();
        let original =
            chromvoid_core::crypto::decrypt(&bytes, session.vault_key(), name.as_bytes()).unwrap();
        let mut meta: Value = serde_json::from_slice(&original).unwrap();
        meta.as_object_mut().unwrap().remove("import_source");
        meta["urls"] = json!([]);
        meta[alias] = rules.clone();
        let mut bytes = serde_json::to_vec(&meta).unwrap();
        assert!(bytes.len() <= original.len());
        bytes.resize(original.len(), b' ');
        let encrypted =
            chromvoid_core::crypto::encrypt(&bytes, session.vault_key(), name.as_bytes()).unwrap();
        storage.write_chunk_atomic(&name, &encrypted).unwrap();
        assert_eq!(raw(&mut router, alias)[alias], rules, "saved {alias}");
        let projected = read(&mut router, alias)["rules"].clone();
        assert_eq!(projected.as_array().unwrap().len(), 3);
        before.push((alias, projected));
    }
    let exported = call(&mut router, "passmanager:root:export", json!({}));
    let mut imported = exported["root"].clone();
    imported["mode"] = json!("replace");
    let review = call(
        &mut router,
        "passmanager:root:import:preview",
        imported.clone(),
    );
    imported["expected_revision"] = review["revision"].clone();
    imported["allow_destructive"] = json!(true);
    call(&mut router, "passmanager:root:import", imported);
    for (alias, expected) in before {
        assert_eq!(read(&mut router, alias)["rules"], expected, "{alias}");
        assert_eq!(raw(&mut router, alias)[alias], rules, "{alias}");
    }
}
