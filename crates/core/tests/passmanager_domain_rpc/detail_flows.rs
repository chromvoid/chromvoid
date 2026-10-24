use super::support::*;
use serde_json::{json, Value};
fn read(router: &mut RpcRouter, id: &str) -> Value {
    let response = router.handle(&RpcRequest::new(
        "passmanager:entry:detail",
        json!({"entry_id":id}),
    ));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}
#[test]
fn strict_update_preserves_unedited_fields_and_rejects_stale_or_missing_entry() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:save", json!({
        "entry_id":"detail-login", "title":"Original", "username":"alice", "urls":[{"value":"https://example.com/private","match":"exact","future":"retained"}],
        "otps":[{"label":"OTP","future":true}], "tags":["Team"], "import_source":{"future":{"nested":42}}
    }))));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        json!({"entry_id":"detail-login","secret_type":"password","value":"private-secret"}),
    )));
    // Destination has the old name: the final new name must be checked atomically.
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({"entry_id":"other","title":"Original","group_path":"/Team/Nested","secrets":{}}),
    )));
    let before = read(&mut router, "detail-login");
    assert_eq!(before["websites_editable"], false);
    assert_eq!(before["websites"], json!(["https://example.com/private"]));
    assert!(!before.to_string().contains("private-secret"));
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:update", json!({"entry_id":"detail-login", "revision":before["revision"], "title":"Почта", "group_path":"/Team/Nested"}))));
    let after = read(&mut router, "detail-login");
    assert_eq!(after["title"], "Почта");
    assert_eq!(after["group_path"], "/Team/Nested");
    assert_ne!(before["revision"], after["revision"]);
    let raw = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        json!({"entry_id":"detail-login"}),
    ));
    let raw = &raw.result().unwrap()["entry"];
    assert_eq!(raw["urls"][0]["future"], "retained");
    assert_eq!(raw["import_source"]["future"]["nested"], 42);
    assert_eq!(raw["otps"][0]["future"], true);
    assert_eq!(raw["username"], "alice");
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:update",
            json!({"entry_id":"detail-login","revision":before["revision"],"title":"Stale"}),
        )),
        "SYNC_CONFLICT",
    );
    assert_rpc_error(&router.handle(&RpcRequest::new("passmanager:entry:update", json!({"entry_id":"detail-login","revision":after["revision"],"websites":["https://flattened.example"]}))), "EMPTY_PAYLOAD");
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:delete",
        json!({"entry_id":"detail-login"}),
    )));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:update",
            json!({"entry_id":"detail-login","revision":after["revision"],"title":"Resurrected"}),
        )),
        "NODE_NOT_FOUND",
    );
    let entries =
        get_entries(&router.handle(&RpcRequest::new("passmanager:entry:list", json!({}))));
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["id"], "other");
}
#[test]
fn card_update_retains_type_pan_and_last4_and_validation_does_not_partially_move() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({"entry_id":"detail-card","title":"Card", "entry_type":"payment_card", "payment_card":{"cardholder_name":"Original","exp_month":12,"exp_year":2030,"brand":"visa"},"secrets":{"card_pan":"4111111111111111","card_cvv":"123"}}))));
    let before = read(&mut router, "detail-card");
    assert_rpc_error(&router.handle(&RpcRequest::new("passmanager:entry:update", json!({"entry_id":"detail-card","revision":before["revision"],"cardholder_name":"", "group_path":"/MustNotAppear"}))), "EMPTY_PAYLOAD");
    assert_eq!(read(&mut router, "detail-card"), before);
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:update", json!({"entry_id":"detail-card","revision":before["revision"],"cardholder_name":"Updated", "exp_month":6, "exp_year":2035}))));
    let after = read(&mut router, "detail-card");
    assert_eq!(after["entry_type"], "payment_card");
    assert_eq!(
        after["payment_card"],
        json!({"cardholder_name":"Updated","exp_month":6,"exp_year":2035,"brand":"visa","last4":"1111"})
    );
    let secret = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        json!({"entry_id":"detail-card","secret_type":"card_pan"}),
    ));
    assert_eq!(secret.result().unwrap()["value"], "4111111111111111");
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:secret:save",
            json!({"entry_id":"detail-card","secret_type":"card_cvv","value":"1"}),
        )),
        "EMPTY_PAYLOAD",
    );
    let secret = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        json!({"entry_id":"detail-card","secret_type":"card_cvv"}),
    ));
    assert_eq!(secret.result().unwrap()["value"], "123");
}

fn create_card(router: &mut RpcRouter, id: &str, title: &str, pan: &str) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({"entry_id":id,"title":title,"entry_type":"payment_card",
            "payment_card":{"cardholder_name":"Synthetic","exp_month":12,"exp_year":2030,"brand":"unknown"},
            "secrets":{"card_pan":pan}}),
    ))
}

#[test]
fn a_card_without_a_name_is_named_by_its_network_and_last_four() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    assert_rpc_ok(&create_card(&mut router, "first", "", "4111111111111111"));
    assert_eq!(read(&mut router, "first")["title"], "Visa •••• 1111");
    // The same card again stays apart in its group.
    assert_rpc_ok(&create_card(
        &mut router,
        "again",
        "  ",
        "4111 1111 1111 1111",
    ));
    assert_eq!(read(&mut router, "again")["title"], "Visa •••• 1111 (2)");
    assert_rpc_ok(&create_card(&mut router, "odd", "", "1234567812345670"));
    assert_eq!(read(&mut router, "odd")["title"], "•••• 5670");
    // Any other entry still needs its name.
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:create",
            json!({"entry_id":"login","title":"","secrets":{}}),
        )),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:save",
            json!({"entry_id":"legacy","title":"","entry_type":"payment_card",
                "payment_card":{"cardholder_name":"Synthetic","exp_month":12,"exp_year":2030}}),
        )),
        "EMPTY_PAYLOAD",
    );
}

#[test]
fn a_name_core_chose_follows_the_number_and_a_typed_one_stays() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    assert_rpc_ok(&create_card(&mut router, "auto", "", "4111111111111111"));
    assert_rpc_ok(&create_card(
        &mut router,
        "typed",
        "Travel",
        "4111111111111111",
    ));
    for id in ["auto", "typed"] {
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:secret:save",
            json!({"entry_id":id,"secret_type":"card_pan","value":"5555555555554444"}),
        )));
    }
    assert_eq!(read(&mut router, "auto")["title"], "Mastercard •••• 4444");
    assert_eq!(
        read(&mut router, "auto")["payment_card"]["brand"],
        "mastercard"
    );
    assert_eq!(read(&mut router, "typed")["title"], "Travel");
    // Cleared in the editor, a typed name goes back to Core's, numbered past the one taken.
    let typed = read(&mut router, "typed");
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:update",
        json!({"entry_id":"typed","revision":typed["revision"],"title":""}),
    )));
    assert_eq!(
        read(&mut router, "typed")["title"],
        "Mastercard •••• 4444 (2)"
    );
    // Clearing it again keeps the card's own name rather than numbering it further.
    let typed = read(&mut router, "typed");
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:update",
        json!({"entry_id":"typed","revision":typed["revision"],"title":""}),
    )));
    assert_eq!(
        read(&mut router, "typed")["title"],
        "Mastercard •••• 4444 (2)"
    );
    // A login still needs a name on update.
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({"entry_id":"login","title":"Mail","secrets":{}}),
    )));
    let login = read(&mut router, "login");
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:update",
            json!({"entry_id":"login","revision":login["revision"],"title":""}),
        )),
        "EMPTY_PAYLOAD",
    );
}
