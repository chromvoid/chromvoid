//! Regression tests for catalog:notes:list.

mod test_helpers;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use std::path::Path;
use test_helpers::*;

fn upload_create_at_bytes(
    router: &mut chromvoid_core::rpc::RpcRouter,
    parent_path: &str,
    name: &str,
    mime_type: Option<&str>,
    bytes: Vec<u8>,
) -> RpcResponse {
    let size = bytes.len();
    let mut payload = serde_json::json!({
        "parent_path": parent_path,
        "name": name,
        "total_size": size,
        "offset": 0,
        "size": size
    });
    if let Some(mime_type) = mime_type {
        payload["mime_type"] = serde_json::json!(mime_type);
    }

    match router.handle_with_stream(
        &RpcRequest::new("catalog:upload", payload),
        Some(RpcInputStream::from_bytes(bytes)),
    ) {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

fn upload_create_at(
    router: &mut chromvoid_core::rpc::RpcRouter,
    parent_path: &str,
    name: &str,
    mime_type: Option<&str>,
) -> RpcResponse {
    upload_create_at_bytes(router, parent_path, name, mime_type, vec![0])
}

fn write_secret_bytes(
    router: &mut chromvoid_core::rpc::RpcRouter,
    node_id: u64,
    bytes: Vec<u8>,
) -> RpcResponse {
    let size = bytes.len() as u64;
    match router.handle_with_stream(
        &RpcRequest::new(
            "catalog:secret:write",
            serde_json::json!({
                "node_id": node_id,
                "size": size,
                "offset": 0,
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes)),
    ) {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:secret:write must return JSON response")
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

fn corrupt_chunk_files(path: &Path) {
    if path.is_file() {
        std::fs::write(path, b"corrupt").expect("corrupt chunk file");
        return;
    }

    for entry in std::fs::read_dir(path).expect("read chunks dir") {
        let entry = entry.expect("chunk dir entry");
        corrupt_chunk_files(&entry.path());
    }
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
fn catalog_notes_list_includes_bounded_preview_fields() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&upload_create_at_bytes(
        &mut router,
        "/docs",
        "Preview.md",
        None,
        b"# Launch Plan\n\nAlpha beta gamma content for vault notes.\n".to_vec(),
    ));

    let long_body = format!("# Long Note\n\n{}", "word ".repeat(1200)).into_bytes();
    assert_rpc_ok(&upload_create_at_bytes(
        &mut router,
        "/docs",
        "Long.md",
        None,
        long_body,
    ));

    let response = list_notes(&mut router);
    assert_rpc_ok(&response);

    let items = note_items(&response);
    let preview = items
        .iter()
        .find(|item| item.get("name").and_then(|value| value.as_str()) == Some("Preview.md"))
        .expect("Preview.md item");
    assert_eq!(
        preview.get("heading").and_then(|value| value.as_str()),
        Some("Launch Plan")
    );
    assert_eq!(
        preview.get("excerpt").and_then(|value| value.as_str()),
        Some("Alpha beta gamma content for vault notes.")
    );
    assert!(preview
        .get("preview_words")
        .and_then(|value| value.as_u64())
        .is_some_and(|count| count >= 8));
    assert_eq!(
        preview
            .get("preview_truncated")
            .and_then(|value| value.as_bool()),
        Some(false)
    );

    let long = items
        .iter()
        .find(|item| item.get("name").and_then(|value| value.as_str()) == Some("Long.md"))
        .expect("Long.md item");
    assert_eq!(
        long.get("preview_truncated")
            .and_then(|value| value.as_bool()),
        Some(true)
    );
    assert!(long
        .get("excerpt")
        .and_then(|value| value.as_str())
        .is_some_and(|excerpt| excerpt.len() <= 223));
}

#[test]
fn catalog_notes_list_uses_size_after_secret_write_to_empty_note() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let created =
        upload_create_at_bytes(&mut router, "/", "Draft.md", Some("text/markdown"), vec![]);
    assert_rpc_ok(&created);
    let node_id = get_node_id(&created);
    let content = b"# Draft\n\nSaved body.".to_vec();

    let written = write_secret_bytes(&mut router, node_id, content.clone());
    assert_rpc_ok(&written);

    let response = list_notes(&mut router);
    assert_rpc_ok(&response);
    let items = note_items(&response);
    let draft = items
        .iter()
        .find(|item| item.get("name").and_then(|value| value.as_str()) == Some("Draft.md"))
        .expect("Draft.md item");
    assert_eq!(
        draft.get("size").and_then(|value| value.as_u64()),
        Some(content.len() as u64)
    );
    assert_eq!(
        draft.get("heading").and_then(|value| value.as_str()),
        Some("Draft")
    );
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

#[test]
fn catalog_notes_list_keeps_note_when_preview_content_is_unreadable() {
    let (mut router, temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&upload_create_at_bytes(
        &mut router,
        "/",
        "Unreadable.md",
        None,
        b"# Private\n\nThis preview chunk will be corrupted.\n".to_vec(),
    ));
    corrupt_chunk_files(&temp_dir.path().join("chunks"));

    let response = list_notes(&mut router);
    assert_rpc_ok(&response);
    assert_eq!(note_names(&response), vec!["Unreadable.md".to_string()]);

    let items = note_items(&response);
    let unreadable = items
        .iter()
        .find(|item| item.get("name").and_then(|value| value.as_str()) == Some("Unreadable.md"))
        .expect("Unreadable.md item");
    assert!(unreadable.get("heading").is_none());
    assert!(unreadable.get("excerpt").is_none());
    assert!(unreadable.get("preview_words").is_none());
    assert!(unreadable.get("preview_truncated").is_none());
}
