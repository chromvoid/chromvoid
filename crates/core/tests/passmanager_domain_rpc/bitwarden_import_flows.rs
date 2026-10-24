use super::support::*;
use chromvoid_core::rpc::types::CredentialImportWarningCode as Warning;
use serde_json::{json, Value};

fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/bitwarden-credentials.json")).unwrap()
}
fn export(router: &mut RpcRouter) -> RpcResponse {
    let response = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_rpc_ok(&response);
    response
}
fn commit(router: &mut RpcRouter, data: Value) {
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", data)));
}

#[test]
fn bitwarden_import_preserves_supported_credentials_through_review_commit_and_export() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "bitwarden synthetic vault");
    let before = super::import_review_flows::storage_files(root.path());
    let data = fixture();
    let (mut data, info) = router
        .prepare_credential_import_document(&serde_json::to_vec(&data).unwrap(), true)
        .unwrap();
    assert_eq!(info.source.as_deref(), Some("bitwarden"));
    assert_eq!(
        info.warnings
            .iter()
            .map(|warning| (warning.code, warning.count))
            .collect::<Vec<_>>(),
        vec![
            (Warning::UnsupportedRecords, 1),
            (Warning::PasskeysOmitted, 1)
        ]
    );
    let review = router.handle(&RpcRequest::new(
        "passmanager:root:import:preview",
        data.clone(),
    ));
    assert_rpc_ok(&review);
    assert_eq!(review.result().unwrap()["entry_count"], 5);
    assert_eq!(
        super::import_review_flows::storage_files(root.path()),
        before
    );
    data["expected_revision"] = review.result().unwrap()["revision"].clone();
    commit(&mut router, data);
    let saved = export(&mut router);
    let login = get_root_entry_by_id(&saved, "bw-login").unwrap();
    assert_eq!(login["password"], "  synthetic password\n ");
    assert_eq!(login["username"], "alice@example.test");
    assert_eq!(
        login["note"],
        "Original note\n\nImported Fields:\n- Recovery: synthetic recovery"
    );
    assert_eq!(login["folderPath"], "/Imported/Work");
    assert_eq!(login["tags"], json!(["Team"]));
    assert_eq!(
        login["urls"],
        json!([{"value":"https://example.test/login","match":"exact"}])
    );
    assert_eq!(login["import_source"]["original_id"], "bw-login");
    assert_eq!(login["otps"][0]["secret"], "JBSWY3DPEHPK3PXP");
    assert_eq!(login["otps"][0]["algorithm"], "SHA256");
    assert_eq!(login["otps"][0]["digits"], 8);
    assert_eq!(login["otps"][0]["period"], 60);
    let card = get_root_entry_by_id(&saved, "bw-card").unwrap();
    assert_eq!(card["card_pan"], "4111111111111111");
    assert_eq!(card["card_cvv"], "123");
    assert_eq!(card["note"], "Card note");
    assert_eq!(
        get_root_entry_by_id(&saved, "bw-note").unwrap()["note"],
        "Private synthetic note"
    );
    assert!(get_root_entry_by_id(&saved, "bw-identity").unwrap()["note"]
        .as_str()
        .unwrap()
        .contains("passportNumber: SYNTHETIC-123"));
    assert_eq!(
        get_root_entry_by_id(&saved, "bw-otp").unwrap()["otps"][0]["secret"],
        "JBSWY3DPEHPK3PXP"
    );
    assert!(saved.result().unwrap()["root"]["folders"]
        .as_array()
        .unwrap()
        .contains(&json!("/Empty")));
}

#[test]
fn bitwarden_repeat_import_matches_provenance_and_keeps_the_users_location() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "bitwarden repeat vault");
    commit(
        &mut router,
        json!({"folders":["Personal"],"entries":[
        {"id":"local-id","title":"User title","folderPath":"Personal","password":"old",
         "importSource":{"originalId":"external-id"}},
        {"id":"unrelated","title":"Duplicate","password":"keep"}]}),
    );
    let source = json!({"items":[
        {"id":"external-id","type":1,"name":"Updated source name","login":{"password":"new"}},
        {"id":"new-a","type":1,"name":"Duplicate"},
        {"id":"new-b","type":1,"name":"Duplicate"}]});
    for _ in 0..2 {
        let data = source.clone();
        let (data, _) = router
            .prepare_credential_import_document(&serde_json::to_vec(&data).unwrap(), true)
            .unwrap();
        commit(&mut router, data);
        let saved = export(&mut router);
        assert_eq!(
            saved.result().unwrap()["root"]["entries"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        let matched = get_root_entry_by_id(&saved, "local-id").unwrap();
        assert_eq!(matched["folderPath"], "/Personal");
        assert_eq!(matched["password"], "new");
        assert_eq!(matched["import_source"]["original_id"], "external-id");
        assert_eq!(
            get_root_entry_by_id(&saved, "unrelated").unwrap()["password"],
            "keep"
        );
    }
}

#[test]
fn bitwarden_unconvertible_otp_and_card_details_are_preserved_with_warnings() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "bitwarden fallback vault");
    let data = json!({"items":[
        {"id":"bad-otp","type":1,"name":"OTP","login":{"totp":"steam://synthetic"}},
        {"id":"partial-card","type":3,"name":"Card","card":{"number":"4111","code":"123","expYear":"unknown"}}
    ]});
    let (data, info) = router
        .prepare_credential_import_document(&serde_json::to_vec(&data).unwrap(), true)
        .unwrap();
    assert_eq!(
        info.warnings
            .iter()
            .map(|warning| (warning.code, warning.count))
            .collect::<Vec<_>>(),
        vec![(Warning::OtpInNote, 1), (Warning::CardInNote, 1)]
    );
    commit(&mut router, data);
    let saved = export(&mut router);
    assert!(get_root_entry_by_id(&saved, "bad-otp").unwrap()["note"]
        .as_str()
        .unwrap()
        .contains("steam://synthetic"));
    let note = get_root_entry_by_id(&saved, "partial-card").unwrap()["note"]
        .as_str()
        .unwrap();
    assert!(
        note.contains("number: 4111")
            && note.contains("code: 123")
            && note.contains("expYear: unknown")
    );
}

#[test]
fn bitwarden_invalid_documents_cannot_turn_into_an_empty_replacement() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "bitwarden rejection vault");
    for data in [
        json!({"encrypted":true,"items":[]}),
        json!({"items":[{"type":5}]}),
        json!({"items":[null]}),
        json!({"items":[{"type":1,"id":"same"},{"type":1,"id":"same"}]}),
        json!({"items":[{"type":1,"login":"malformed"}]}),
        json!({"items":[{"type":1,"login":{"uris":{}}}]}),
    ] {
        assert!(
            router
                .prepare_credential_import_document(&serde_json::to_vec(&data).unwrap(), false)
                .is_err(),
            "{data}"
        );
    }
}

#[test]
fn bitwarden_entry_limit_reports_omissions_and_replace_ignores_existing_names() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "bitwarden bounded vault");
    commit(
        &mut router,
        json!({"folders":[],"entries":[{"id":"old","title":"New 0"}]}),
    );
    let data = json!({"items":(0..10001).map(|index|json!({"type":2,"name":format!("New {index}")})).collect::<Vec<_>>()});
    let (data, info) = router
        .prepare_credential_import_document(&serde_json::to_vec(&data).unwrap(), false)
        .unwrap();
    assert_eq!(data["entries"].as_array().unwrap().len(), 10000);
    assert_eq!(data["entries"][0]["title"], "New 0");
    assert_eq!(info.warnings.len(), 1);
    assert_eq!(info.warnings[0].code, Warning::EntryLimit);
    assert_eq!(info.warnings[0].count, 1);
    assert_eq!(
        export(&mut router).result().unwrap()["root"]["entries"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
