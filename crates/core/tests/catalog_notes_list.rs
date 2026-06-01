//! Regression tests for catalog:notes:list.

mod test_helpers;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use test_helpers::*;

fn upload_create_at(
    router: &mut chromvoid_core::rpc::RpcRouter,
    parent_path: &str,
    name: &str,
    mime_type: Option<&str>,
) -> RpcResponse {
    let mut payload = serde_json::json!({
        "parent_path": parent_path,
        "name": name,
        "total_size": 1,
        "offset": 0,
        "size": 1
    });
    if let Some(mime_type) = mime_type {
        payload["mime_type"] = serde_json::json!(mime_type);
    }

    match router.handle_with_stream(
        &RpcRequest::new("catalog:upload", payload),
        Some(RpcInputStream::from_bytes(vec![0])),
    ) {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

fn list_notes(router: &mut chromvoid_core::rpc::RpcRouter) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:notes:list",
        serde_json::json!({}),
    ))
}

fn note_items(response: &RpcResponse) -> Vec<serde_json::Value> {
    response
        .result()
        .expect("notes response result")
        .get("items")
        .and_then(|value| value.as_array())
        .expect("items array")
        .clone()
}

fn note_names(response: &RpcResponse) -> Vec<String> {
    let mut names = note_items(response)
        .iter()
        .filter_map(|item| item.get("name").and_then(|value| value.as_str()))
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    names.sort();
    names
}

#[test]
fn catalog_notes_list_returns_nested_visible_markdown_metadata() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    assert_rpc_ok(&upload_create_at(&mut router, "/", "Root.md", None));
    assert_rpc_ok(&upload_create_at(
        &mut router,
        "/docs",
        "Plan.markdown",
        None,
    ));
    assert_rpc_ok(&upload_create_at(
        &mut router,
        "/docs",
        "MimeOnly",
        Some("text/markdown"),
    ));
    assert_rpc_ok(&upload_create_at(
        &mut router,
        "/docs/nested",
        "Deep.md",
        None,
    ));
    assert_rpc_ok(&upload_create_at(
        &mut router,
        "/docs",
        "Plain.txt",
        Some("text/plain"),
    ));

    let response = list_notes(&mut router);
    assert_rpc_ok(&response);
    assert_eq!(
        note_names(&response),
        vec![
            "Deep.md".to_string(),
            "MimeOnly".to_string(),
            "Plan.markdown".to_string(),
            "Root.md".to_string()
        ]
    );

    let result = response.result().expect("notes response result");
    assert!(result
        .get("version")
        .and_then(|value| value.as_u64())
        .is_some());

    let items = note_items(&response);
    let plan = items
        .iter()
        .find(|item| item.get("name").and_then(|value| value.as_str()) == Some("Plan.markdown"))
        .expect("Plan.markdown metadata");
    assert_eq!(
        plan.get("path").and_then(|value| value.as_str()),
        Some("/docs/Plan.markdown")
    );
    assert_eq!(
        plan.get("parent_path").and_then(|value| value.as_str()),
        Some("/docs/")
    );
    assert!(plan
        .get("node_id")
        .and_then(|value| value.as_u64())
        .is_some());
    assert_eq!(plan.get("size").and_then(|value| value.as_u64()), Some(1));
    assert!(plan
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .is_some());
    assert!(plan
        .get("created_at")
        .and_then(|value| value.as_u64())
        .is_some());
    assert!(plan
        .get("updated_at")
        .and_then(|value| value.as_u64())
        .is_some());
}

#[test]
fn catalog_notes_list_excludes_hidden_nodes_and_system_shards() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir(&mut router, ".secret"));
    assert_rpc_ok(&upload_create_at(&mut router, "/", ".hidden.md", None));
    assert_rpc_ok(&upload_create_at(&mut router, "/docs", "Visible.md", None));
    assert_rpc_ok(&upload_create_at(
        &mut router,
        "/.secret",
        "Hidden.md",
        None,
    ));

    let response = list_notes(&mut router);
    assert_rpc_ok(&response);
    assert_eq!(note_names(&response), vec!["Visible.md".to_string()]);
    assert!(note_items(&response).iter().all(|item| {
        item.get("path")
            .and_then(|value| value.as_str())
            .map(|path| !path.starts_with("/.") && !path.starts_with("/.passmanager"))
            .unwrap_or(false)
    }));
}
