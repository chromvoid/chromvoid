mod test_helpers;

use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
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

#[test]
fn test_root_file_replace_emits_committed_update_event() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let node_id = upload_file(
        &mut router,
        Some("/"),
        "note.md",
        Vec::new(),
        Some("text/markdown"),
    );
    let metadata = router.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    let source_revision = metadata
        .result()
        .and_then(|result| result.get("source_revision"))
        .and_then(|value| value.as_u64())
        .expect("source revision");

    let subscribe = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_ok(&subscribe);
    let replacement = "Привет".as_bytes().to_vec();
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:file:replace",
            serde_json::json!({
                "node_id": node_id,
                "size": replacement.len() as u64,
                "mime_type": "text/markdown",
                "expected_source_revision": source_revision,
                "conflict_mode": "fail_if_stale",
            }),
        ),
        Some(RpcInputStream::from_bytes(replacement.clone())),
    );
    let response = match reply {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:file:replace must return JSON")
        }
    };
    assert_rpc_ok(&response);
    let next_source_revision = response
        .result()
        .and_then(|result| result.get("source_revision"))
        .and_then(|value| value.as_u64())
        .expect("next source revision");

    let events = router.take_events();
    let catalog_events = catalog_event_payloads(&events);
    let update = catalog_events
        .iter()
        .find(|event| {
            event.get("shard_id").and_then(|value| value.as_str()) == Some("note.md")
                && event.get("type").and_then(|value| value.as_str()) == Some("update")
        })
        .expect("expected root file update event");
    assert_eq!(
        update.get("node_id").and_then(|value| value.as_u64()),
        Some(node_id)
    );
    assert_eq!(
        update.get("version").and_then(|value| value.as_u64()),
        Some(1)
    );

    let delta = update.get("delta").expect("delta");
    assert_eq!(
        delta.get("path").and_then(|value| value.as_str()),
        Some("/")
    );
    assert_eq!(delta.get("seq").and_then(|value| value.as_u64()), Some(1));
    let fields = delta
        .get("op")
        .and_then(|op| op.get("fields"))
        .expect("update fields");
    assert_eq!(
        fields.get("size").and_then(|value| value.as_u64()),
        Some(replacement.len() as u64)
    );
    assert_eq!(
        fields.get("mime_type").and_then(|value| value.as_str()),
        Some("text/markdown")
    );
    assert!(fields
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .is_some_and(|revision| revision > source_revision));

    let next_replacement = b"next edit".to_vec();
    let next_reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:file:replace",
            serde_json::json!({
                "node_id": node_id,
                "size": next_replacement.len() as u64,
                "mime_type": "text/markdown",
                "expected_source_revision": next_source_revision,
                "conflict_mode": "fail_if_stale",
            }),
        ),
        Some(RpcInputStream::from_bytes(next_replacement.clone())),
    );
    match next_reply {
        RpcReply::Json(response) => assert_rpc_ok(&response),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:file:replace must return JSON")
        }
    }
    let next_events = router.take_events();
    let next_catalog_events = catalog_event_payloads(&next_events);
    let next_update = next_catalog_events
        .iter()
        .find(|event| {
            event.get("shard_id").and_then(|value| value.as_str()) == Some("note.md")
                && event.get("type").and_then(|value| value.as_str()) == Some("update")
        })
        .expect("expected second root file update event");
    assert_eq!(
        next_update.get("version").and_then(|value| value.as_u64()),
        Some(2)
    );
    assert_eq!(
        next_update
            .get("delta")
            .and_then(|delta| delta.get("op"))
            .and_then(|op| op.get("fields"))
            .and_then(|fields| fields.get("size"))
            .and_then(|value| value.as_u64()),
        Some(next_replacement.len() as u64)
    );
}

#[test]
fn test_root_file_upload_overwrite_emits_committed_update_event() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let node_id = upload_file(
        &mut router,
        Some("/"),
        "upload.bin",
        b"old".to_vec(),
        Some("application/octet-stream"),
    );
    let subscribe = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_ok(&subscribe);

    let replacement = b"replacement bytes".to_vec();
    let overwritten_id = upload_file(
        &mut router,
        Some("/"),
        "upload.bin",
        replacement.clone(),
        Some("application/octet-stream"),
    );
    assert_eq!(overwritten_id, node_id);

    let events = router.take_events();
    let catalog_events = catalog_event_payloads(&events);
    let update = catalog_events
        .iter()
        .find(|event| {
            event.get("shard_id").and_then(|value| value.as_str()) == Some("upload.bin")
                && event.get("type").and_then(|value| value.as_str()) == Some("update")
        })
        .expect("expected root upload update event");
    assert_eq!(
        update.get("node_id").and_then(|value| value.as_u64()),
        Some(node_id)
    );
    assert_eq!(
        update
            .get("delta")
            .and_then(|delta| delta.get("op"))
            .and_then(|op| op.get("fields"))
            .and_then(|fields| fields.get("size"))
            .and_then(|value| value.as_u64()),
        Some(replacement.len() as u64)
    );
}
