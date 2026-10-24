//! Regression tests for catalog:file-links:*.

mod test_helpers;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use test_helpers::*;

fn complete_file_links(
    router: &mut chromvoid_core::rpc::RpcRouter,
    query: &str,
    limit: Option<u64>,
    current_path: Option<&str>,
) -> RpcResponse {
    let mut payload = serde_json::json!({"query": query});
    if let Some(limit) = limit {
        payload["limit"] = serde_json::json!(limit);
    }
    if let Some(current_path) = current_path {
        payload["current_path"] = serde_json::json!(current_path);
    }

    router.handle(&RpcRequest::new("catalog:file-links:complete", payload))
}

fn resolve_file_links(
    router: &mut chromvoid_core::rpc::RpcRouter,
    targets: &[&str],
) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:file-links:resolve",
        serde_json::json!({"targets": targets}),
    ))
}

fn completion_names(response: &RpcResponse) -> Vec<String> {
    get_items(response)
        .iter()
        .filter_map(|item| item.get("name").and_then(|value| value.as_str()))
        .map(ToString::to_string)
        .collect()
}

fn resolve_results(response: &RpcResponse) -> Vec<serde_json::Value> {
    response
        .result()
        .expect("response result")
        .get("results")
        .and_then(|value| value.as_array())
        .expect("results array")
        .clone()
}

#[test]
fn catalog_file_links_complete_matches_visible_files_only() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    assert_rpc_ok(&create_dir(&mut router, ".hidden"));
    upload_file(
        &mut router,
        Some("/docs"),
        "Report.pdf",
        vec![1],
        Some("application/pdf"),
    );
    upload_file(
        &mut router,
        Some("/docs/nested"),
        "report-notes.txt",
        vec![1],
        Some("text/plain"),
    );
    upload_file(
        &mut router,
        Some("/docs"),
        "Photo.jpg",
        vec![1],
        Some("image/jpeg"),
    );
    upload_file(
        &mut router,
        Some("/.hidden"),
        "report-secret.txt",
        vec![1],
        Some("text/plain"),
    );

    let response = complete_file_links(&mut router, "report", Some(20), Some("/docs"));
    assert_rpc_ok(&response);

    assert_eq!(
        completion_names(&response),
        vec!["Report.pdf".to_string(), "report-notes.txt".to_string()]
    );
    assert!(get_items(&response).iter().all(|item| {
        item.get("path")
            .and_then(|value| value.as_str())
            .map(|path| !path.starts_with("/.") && path != "/docs/nested")
            .unwrap_or(false)
    }));
}

#[test]
fn catalog_file_links_complete_clamps_limit_and_ranks_by_basename() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    upload_file(
        &mut router,
        Some("/docs"),
        "alpha.txt",
        vec![1],
        Some("text/plain"),
    );
    upload_file(
        &mut router,
        Some("/docs"),
        "beta-alpha.txt",
        vec![1],
        Some("text/plain"),
    );
    upload_file(
        &mut router,
        Some("/docs"),
        "gamma.txt",
        vec![1],
        Some("text/plain"),
    );

    let response = complete_file_links(&mut router, "alpha", Some(1), None);
    assert_rpc_ok(&response);

    let items = get_items(&response);
    assert_eq!(items.len(), 1);
    assert_eq!(
        items[0].get("name").and_then(|value| value.as_str()),
        Some("alpha.txt")
    );
}

#[test]
fn catalog_file_links_resolve_returns_items_for_absolute_visible_file_paths() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir(&mut router, ".hidden"));
    upload_file(
        &mut router,
        Some("/docs"),
        "Plan.md",
        vec![1],
        Some("text/markdown"),
    );
    upload_file(
        &mut router,
        Some("/.hidden"),
        "Hidden.md",
        vec![1],
        Some("text/markdown"),
    );

    let response = resolve_file_links(
        &mut router,
        &[
            "/docs/Plan.md",
            "/docs",
            "docs/Plan.md",
            "/.hidden/Hidden.md",
            "/docs/../Plan.md",
        ],
    );
    assert_rpc_ok(&response);

    let results = resolve_results(&response);
    assert_eq!(results.len(), 5);
    assert_eq!(
        results[0]
            .get("item")
            .and_then(|item| item.get("name"))
            .and_then(|value| value.as_str()),
        Some("Plan.md")
    );
    for result in results.iter().skip(1) {
        assert!(result.get("item").is_none());
    }
}

#[test]
fn document_links_follow_source_identity_and_preserve_ambiguity_and_visibility() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");
    for name in ["one", "two", ".hidden"] {
        assert_rpc_ok(&create_dir(&mut router, name));
    }
    let source = upload_file(
        &mut router,
        Some("/one"),
        "Origin.md",
        b"# Origin".to_vec(),
        Some("text/markdown"),
    );
    let source_id = source;
    let first = upload_file(
        &mut router,
        Some("/one"),
        "Sibling.md",
        vec![],
        Some("text/markdown"),
    );
    let second = upload_file(
        &mut router,
        Some("/two"),
        "Sibling.md",
        vec![],
        Some("text/markdown"),
    );
    let unique = upload_file(
        &mut router,
        Some("/two"),
        "Unique.markdown",
        vec![],
        Some("text/markdown"),
    );
    upload_file(
        &mut router,
        Some("/.hidden"),
        "Hidden.md",
        vec![],
        Some("text/markdown"),
    );
    let file = upload_file(
        &mut router,
        Some("/two"),
        "Guide.pdf",
        vec![],
        Some("application/pdf"),
    );
    let resolve = |router: &mut chromvoid_core::rpc::RpcRouter, path: &str, kind: &str| {
        let result = router.handle(&RpcRequest::new(
            "catalog:document:resolve-link",
            serde_json::json!({"source_node_id":source_id,"path":path,"kind":kind}),
        ));
        assert_rpc_ok(&result);
        result.result().unwrap().clone()
    };
    assert_eq!(
        resolve(&mut router, "sibling", "note")["item"]["node_id"],
        first
    );
    assert_eq!(
        resolve(&mut router, "two/Unique", "note")["item"]["node_id"],
        unique
    );
    assert_eq!(
        resolve(&mut router, "/two/Guide.pdf", "file")["item"]["node_id"],
        file
    );
    assert_eq!(
        resolve(&mut router, "elsewhere/Sibling", "note")["kind"],
        "ambiguous"
    );
    assert_eq!(resolve(&mut router, "Hidden", "note")["kind"], "missing");
    assert_eq!(
        resolve(&mut router, "/one/../two/Guide.pdf", "file")["kind"],
        "missing"
    );
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "catalog:move",
        serde_json::json!({"node_id":source_id,"new_parent_path":"/two","replace_existing":false}),
    )));
    assert_eq!(
        resolve(&mut router, "Sibling", "note")["item"]["node_id"],
        second
    );
    assert_eq!(
        resolve(&mut router, "../one/Sibling.md", "note")["item"]["node_id"],
        first
    );
    let invalid = router.handle(&RpcRequest::new(
        "catalog:document:resolve-link",
        serde_json::json!({"source_node_id":0,"path":"Sibling","kind":"note"}),
    ));
    assert!(!invalid.is_ok());
    lock_vault(&mut router);
    let locked = router.handle(&RpcRequest::new(
        "catalog:document:resolve-link",
        serde_json::json!({"source_node_id":source_id,"path":"Sibling","kind":"note"}),
    ));
    assert!(!locked.is_ok());
}
