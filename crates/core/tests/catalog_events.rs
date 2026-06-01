mod test_helpers;

use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

fn catalog_event_payloads(events: &[serde_json::Value]) -> Vec<&serde_json::Value> {
    events
        .iter()
        .flat_map(
            |event| match event.get("command").and_then(|v| v.as_str()) {
                Some("catalog:event") => event
                    .get("data")
                    .into_iter()
                    .collect::<Vec<&serde_json::Value>>(),
                Some("catalog:event:batch") => event
                    .get("data")
                    .and_then(|data| data.get("events"))
                    .and_then(|events| events.as_array())
                    .map(|items| items.iter().collect::<Vec<_>>())
                    .unwrap_or_default(),
                _ => Vec::new(),
            },
        )
        .collect()
}

#[test]
fn test_catalog_events_emitted_on_save_when_subscribed() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let subscribe = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_ok(&subscribe);

    // Create a lazy shard and a mutation within it so it produces a per-shard delta.
    assert_rpc_ok(&create_dir(&mut router, "docs"));
    let created = create_dir_at(&mut router, "/docs", "work");
    assert_rpc_ok(&created);
    let node_id = get_node_id(&created);

    router.save().expect("save");

    let events = router.take_events();
    assert!(!events.is_empty(), "expected at least one event");

    let catalog_events = catalog_event_payloads(&events);
    let docs_event = catalog_events
        .iter()
        .find(|e| e.get("shard_id").and_then(|v| v.as_str()) == Some("docs"))
        .expect("expected catalog:event for docs shard");

    let data = docs_event;
    assert_eq!(data.get("type").and_then(|v| v.as_str()), Some("create"));
    assert_eq!(data.get("node_id").and_then(|v| v.as_u64()), Some(node_id));
    assert_eq!(data.get("version").and_then(|v| v.as_u64()), Some(1));

    let delta = data.get("delta").expect("delta");
    assert_eq!(delta.get("seq").and_then(|v| v.as_u64()), Some(1));
}

#[test]
fn test_catalog_events_are_not_emitted_when_not_subscribed() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "work"));
    router.save().expect("save");

    let events = router.take_events();
    assert!(events.is_empty(), "expected no events when not subscribed");
}

#[test]
fn test_catalog_events_exclude_system_shard_externally() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let subscribe = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_ok(&subscribe);

    // Bypass guards to mutate a system shard.
    set_bypass_system_shard_guards(true);
    assert_rpc_ok(&create_dir(&mut router, ".passmanager"));
    assert_rpc_ok(&create_dir_at(&mut router, "/.passmanager", "entry1"));
    set_bypass_system_shard_guards(false);

    // Also create a user shard mutation.
    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "work"));

    router.save().expect("save");

    let events = router.take_events();
    let catalog_events = catalog_event_payloads(&events);

    // There should be events for "docs" but none for ".passmanager".
    assert!(
        !catalog_events.is_empty(),
        "expected at least one catalog:event for user shard"
    );

    for evt in catalog_events.iter() {
        let shard_id = evt.get("shard_id").and_then(|v| v.as_str()).unwrap_or("");
        assert_ne!(
            shard_id, ".passmanager",
            "catalog:event for system shard must not be emitted externally"
        );
        assert_ne!(
            shard_id, ".wallet",
            "catalog:event for system shard must not be emitted externally"
        );
    }

    assert!(
        catalog_events
            .iter()
            .any(|e| e.get("shard_id").and_then(|v| v.as_str()) == Some("docs")),
        "expected catalog:event for user shard 'docs'"
    );
}

#[test]
fn test_catalog_events_for_user_shard_still_emitted() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let subscribe = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_ok(&subscribe);

    assert_rpc_ok(&create_dir(&mut router, "photos"));
    assert_rpc_ok(&create_dir_at(&mut router, "/photos", "album"));

    router.save().expect("save");

    let events = router.take_events();
    let catalog_events = catalog_event_payloads(&events);

    assert!(
        catalog_events
            .iter()
            .any(|e| e.get("shard_id").and_then(|v| v.as_str()) == Some("photos")),
        "expected catalog:event for user shard 'photos'"
    );
}

#[test]
fn test_catalog_events_are_emitted_per_committed_mutation() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let subscribe = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_ok(&subscribe);

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "work"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "archive"));

    let events = router.take_events();
    let catalog_events = catalog_event_payloads(&events);
    let docs_events: Vec<_> = catalog_events
        .iter()
        .filter(|event| event.get("shard_id").and_then(|v| v.as_str()) == Some("docs"))
        .collect();

    assert!(docs_events.len() >= 2);
    assert!(docs_events
        .iter()
        .all(|event| event.get("shard_id").and_then(|v| v.as_str()) == Some("docs")));
}
