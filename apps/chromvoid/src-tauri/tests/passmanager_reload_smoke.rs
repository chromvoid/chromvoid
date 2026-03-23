mod common;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use common::TestVault;
use serde_json::json;

fn rpc(vault: &TestVault, command: &str, data: serde_json::Value) -> RpcResponse {
    let mut adapter = vault.adapter.lock().expect("adapter lock");
    adapter.handle(&RpcRequest::new(command.to_string(), data))
}

fn assert_ok(response: &RpcResponse, command: &str) {
    assert!(
        matches!(response, RpcResponse::Success { .. }),
        "{command} must succeed, got: {response:?}"
    );
}

#[test]
fn passmanager_create_and_hard_reload_smoke() {
    let vault = TestVault::new_unlocked();

    let group_name = "smoke-group";
    let entry_id = "smoke-entry-id";

    let create_group = rpc(
        &vault,
        "passmanager:group:ensure",
        json!({"path": format!("/{group_name}")}),
    );
    assert_ok(&create_group, "passmanager:group:ensure");

    let create_entry = rpc(
        &vault,
        "passmanager:entry:save",
        json!({
            "id": entry_id,
            "title": "Smoke Entry",
            "group_path": format!("/{group_name}"),
            "username": "smoke-user",
            "urls": []
        }),
    );
    assert_ok(&create_entry, "passmanager:entry:save");

    vault.save();
    vault.restart_core_unlocked();

    let groups_after_restart = rpc(&vault, "passmanager:group:list", json!({}));
    assert_ok(&groups_after_restart, "passmanager:group:list after reload");
    let groups = groups_after_restart
        .result()
        .and_then(|result| result.get("groups"))
        .and_then(|value| value.as_array())
        .cloned()
        .expect("groups array");
    assert!(
        groups
            .iter()
            .any(|group| group.as_str() == Some(&format!("/{group_name}"))),
        "group must persist across hard reload"
    );

    let read_after_restart = rpc(
        &vault,
        "passmanager:entry:read",
        json!({"entry_id": entry_id}),
    );
    assert_ok(&read_after_restart, "passmanager:entry:read after reload");
    let entry = read_after_restart
        .result()
        .and_then(|result| result.get("entry"))
        .expect("entry in read response");

    assert_eq!(
        entry.get("id").and_then(|v| v.as_str()),
        Some(entry_id),
        "entry id must persist across hard reload"
    );
    assert_eq!(
        entry.get("title").and_then(|v| v.as_str()),
        Some("Smoke Entry"),
        "entry title must persist across hard reload"
    );
    assert_eq!(
        entry.get("username").and_then(|v| v.as_str()),
        Some("smoke-user"),
        "entry username must persist across hard reload"
    );
}
