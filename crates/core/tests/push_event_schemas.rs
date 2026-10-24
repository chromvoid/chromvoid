mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn save_without_catalog_changes_does_not_publish_events_when_subscribed() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test_password"));
    assert_rpc_ok(&router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({}))));
    let _ = router.take_events();

    router.save().expect("save unchanged catalog");

    let events = router.take_events();
    assert!(
        events.is_empty(),
        "unchanged catalog emitted events: {events:?}"
    );

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    let events = router.take_events();
    assert!(
        events
            .iter()
            .any(|event| event["command"] == "update:state"),
        "catalog mutation must still publish update:state: {events:?}"
    );

    router.save().expect("save already persisted catalog");

    let events = router.take_events();
    assert!(
        events.is_empty(),
        "persisted catalog emitted events: {events:?}"
    );
}

#[test]
fn test_push_event_update_state_schema_when_subscribed() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({}))));

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    router.save().expect("save");

    let events = router.take_events();
    let msg = events
        .iter()
        .find(|e| e.get("command").and_then(|v| v.as_str()) == Some("update:state"))
        .expect("expected update:state event");

    let data = msg.get("data").expect("data");
    assert!(data.get("TS").and_then(|v| v.as_u64()).is_some());
    assert!(data.get("serial_num").and_then(|v| v.as_str()).is_some());
}

#[test]
fn test_push_event_vault_locked_schema_when_subscribed() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({}))));

    // Drain any prior events.
    let _ = router.take_events();

    assert_rpc_ok(&lock_vault(&mut router));

    let events = router.take_events();
    let msg = events
        .iter()
        .find(|e| e.get("command").and_then(|v| v.as_str()) == Some("vault:locked"))
        .expect("expected vault:locked event");
    let data = msg.get("data").expect("data");
    assert_eq!(data.get("reason").and_then(|v| v.as_str()), Some("manual"));
}
