use super::support::*;
use serde_json::{json, Value};

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let response = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}
fn list(router: &mut RpcRouter, id: &str) -> Value {
    call(
        router,
        "passmanager:otp:record:list",
        json!({"entry_id":id}),
    )
}
fn setup() -> (RpcRouter, tempfile::TempDir, String) {
    let (mut router, tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    let entry = call(
        &mut router,
        "passmanager:entry:save",
        json!({"title":"OTP records", "id":"records-entry"}),
    );
    (
        router,
        tmp,
        entry["entry_id"]
            .as_str()
            .unwrap_or("records-entry")
            .to_string(),
    )
}
fn save(id: &str, revision: &Value) -> Value {
    json!({"entry_id":id, "revision":revision, "source_label":null,
        "secret":"12345678901234567890", "settings": {
        "label":"Main", "encoding":"utf-8", "algorithm":"SHA1", "otp_type":"HOTP",
        "digits":6,"period":30,"counter":"0"}})
}
#[test]
fn otp_records_crud_preserves_seed_and_legacy_identity() {
    let (mut router, _tmp, id) = setup();
    let empty = list(&mut router, &id);
    assert_eq!(empty["records"], json!([]));
    call(
        &mut router,
        "passmanager:otp:record:save",
        save(&id, &empty["revision"]),
    );
    let first = list(&mut router, &id);
    assert!(!first.to_string().contains("1234567890"));
    let request = json!({"entry_id":id,"revision":first["revision"],"label":"Main"});
    let generated = call(&mut router, "passmanager:otp:record:code", request.clone());
    assert_eq!(generated["otp"], "755224");
    assert_eq!(generated["left_seconds"], 0);
    let mut rename = save(&id, &first["revision"]);
    rename["source_label"] = json!("Main");
    rename["secret"] = Value::Null;
    rename["settings"]["label"] = json!("Renamed");
    call(&mut router, "passmanager:otp:record:save", rename);
    let renamed = list(&mut router, &id);
    let stale = router.handle(&RpcRequest::new("passmanager:otp:record:delete", request));
    assert_rpc_error(&stale, "SYNC_CONFLICT");
    let request = json!({"entry_id":id,"revision":renamed["revision"],"label":"Renamed"});
    assert_eq!(
        call(&mut router, "passmanager:otp:record:code", request.clone())["otp"],
        "755224"
    );
    let missing = router.handle(&RpcRequest::new(
        "passmanager:otp:record:code",
        json!({"entry_id":id,"revision":renamed["revision"],"label":"Wrong"}),
    ));
    assert_rpc_error(&missing, "NODE_NOT_FOUND");
    call(&mut router, "passmanager:otp:record:delete", request);
    assert_eq!(list(&mut router, &id)["records"], json!([]));
}
#[test]
fn invalid_otp_settings_do_not_change_saved_record() {
    let (mut router, _tmp, id) = setup();
    let before = list(&mut router, &id);
    let mut invalid = save(&id, &before["revision"]);
    invalid["settings"]["counter"] = json!("18446744073709551616");
    let response = router.handle(&RpcRequest::new("passmanager:otp:record:save", invalid));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
    assert_eq!(before, list(&mut router, &id));
    let mut maximum = save(&id, &before["revision"]);
    maximum["settings"]["counter"] = json!("18446744073709551615");
    call(&mut router, "passmanager:otp:record:save", maximum);
    assert_eq!(
        list(&mut router, &id)["records"][0]["counter"],
        "18446744073709551615"
    );
}
#[test]
fn otp_record_commands_require_unlocked_session() {
    let (mut router, _tmp) = create_test_router();
    for command in ["list", "save", "delete", "code"] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                format!("passmanager:otp:record:{command}"),
                json!({}),
            )),
            "VAULT_REQUIRED",
        );
    }
}

#[test]
fn managed_otp_keeps_legacy_id_and_unrelated_metadata() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    call(
        &mut router,
        "passmanager:entry:save",
        json!({
            "entry_id":"legacy-otp", "title":"Legacy", "import_source":{"future":{"retained":true}},
            "otps":[{"id":"old-id","label":"Original","future":42}]
        }),
    );
    call(
        &mut router,
        "passmanager:otp:setSecret",
        json!({
            "otp_id":"old-id", "secret":"12345678901234567890", "encoding":"utf-8",
            "type":"TOTP", "algorithm":"SHA1", "digits":8, "period":30
        }),
    );
    let before = list(&mut router, "legacy-otp");
    let mut request = save("legacy-otp", &before["revision"]);
    request["source_label"] = json!("Original");
    request["secret"] = Value::Null;
    request["settings"] = before["records"][0].clone();
    request["settings"]["label"] = json!("Renamed");
    call(&mut router, "passmanager:otp:record:save", request);
    let raw = call(
        &mut router,
        "passmanager:entry:read",
        json!({"entry_id":"legacy-otp"}),
    );
    assert_eq!(raw["entry"]["otps"][0]["id"], "old-id");
    assert_eq!(raw["entry"]["otps"][0]["future"], 42);
    assert_eq!(raw["entry"]["import_source"]["future"]["retained"], true);
    let code = call(
        &mut router,
        "passmanager:otp:generate",
        json!({"otp_id":"old-id","ts":59}),
    );
    assert_eq!(code["otp"], "94287082");
    let latest = list(&mut router, "legacy-otp");
    call(
        &mut router,
        "passmanager:otp:record:delete",
        json!({"entry_id":"legacy-otp","revision":latest["revision"],"label":"Renamed"}),
    );
    let raw = call(
        &mut router,
        "passmanager:entry:read",
        json!({"entry_id":"legacy-otp"}),
    );
    assert_eq!(raw["entry"]["otps"], json!([]));
}

#[test]
fn setup_uri_parsing_matches_common_client_vectors_without_saving() {
    let (mut router, _tmp, id) = setup();
    let before = list(&mut router, &id);
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../../../packages/passmanager/src/service/otp-auth-uri-cases.json"
    ))
    .unwrap();
    for case in cases {
        let parsed = call(
            &mut router,
            "passmanager:otp:parseUri",
            json!({"uri":case["uri"]}),
        );
        for field in ["label", "algorithm", "digits", "period", "counter"] {
            assert_eq!(parsed["settings"][field], case[field]);
        }
        assert_eq!(parsed["settings"]["otp_type"], case["type"]);
        assert_eq!(parsed["issuer"], case["issuer"]);
        assert_eq!(parsed["account"], case["account"]);
        assert_eq!(parsed["secret"], "JBSWY3DPEHPK3PXP");
    }
    assert_eq!(before, list(&mut router, &id));
    let max = call(
        &mut router,
        "passmanager:otp:parseUri",
        json!({"uri":"otpauth://hotp/Counter?secret=JBSWY3DPEHPK3PXP&counter=18446744073709551615"}),
    );
    assert_eq!(max["settings"]["counter"], "18446744073709551615");
}
#[test]
fn setup_uri_rejects_ambiguous_invalid_and_oversize_input() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:otp:parseUri",
            json!({"uri":"otpauth://totp/Locked?secret=JBSWY3DPEHPK3PXP"}),
        )),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    for uri in [
        "https://example.com/?secret=JBSWY3DPEHPK3PXP",
        "otpauth://user@totp/Name?secret=JBSWY3DPEHPK3PXP",
        "otpauth://totp:443/Name?secret=JBSWY3DPEHPK3PXP",
        "otpauth://totp/Name?secret=JBSWY3DPEHPK3PXP#fragment",
        "otpauth://totp/Name?secret=JBSWY3DPEHPK3PXP&SECRET=Other",
        "otpauth://totp/%ZZ?secret=JBSWY3DPEHPK3PXP",
        "otpauth://totp/Name?secret=***",
        "otpauth://totp/Name?secret=JBSWY3DPEHPK3PXP&algorithm=MD5",
        "otpauth://totp/Name?secret=JBSWY3DPEHPK3PXP&period=9",
        "otpauth://hotp/Name?secret=JBSWY3DPEHPK3PXP&counter=18446744073709551616",
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                "passmanager:otp:parseUri",
                json!({"uri":uri}),
            )),
            "OTP_SETTINGS_INVALID",
        );
    }
    let huge = format!("otpauth://totp/Name?secret={}", "A".repeat(16384));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:otp:parseUri",
            json!({"uri":huge}),
        )),
        "OTP_SETTINGS_INVALID",
    );
}
