//! Regression tests for catalog:folder:list.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use test_helpers::*;

const TEXT_SEARCH_LIMIT_BYTES: usize = 1_048_576;

fn upload_create_at(
    router: &mut chromvoid_core::rpc::RpcRouter,
    parent_path: &str,
    name: &str,
) -> RpcResponse {
    match router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": parent_path,
                "name": name,
                    "total_size": 1,
                    "offset": 0,
                "size": 1
            }),
        ),
        Some(RpcInputStream::from_bytes(vec![0])),
    ) {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

fn folder_list(
    router: &mut chromvoid_core::rpc::RpcRouter,
    path: &str,
    filter: serde_json::Value,
) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:folder:list",
        serde_json::json!({
            "path": path,
            "offset": 0,
            "limit": 20,
            "sort": {"by": "name", "direction": "asc"},
            "filter": filter
        }),
    ))
}

fn item_names(response: &RpcResponse) -> Vec<String> {
    get_items(response)
        .iter()
        .filter_map(|item| {
            item.get("name")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .collect()
}

#[test]
fn catalog_folder_list_returns_paged_sorted_children() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "beta"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "alpha"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", ".hidden"));

    let response = router.handle(&RpcRequest::new(
        "catalog:folder:list",
        serde_json::json!({
            "path": "/docs",
            "offset": 0,
            "limit": 1,
            "sort": {"by": "name", "direction": "asc"},
            "filter": {"include_hidden": false}
        }),
    ));
    assert_rpc_ok(&response);

    let result = response.result().expect("folder page result");
    assert_eq!(
        result.get("total_count").and_then(|value| value.as_u64()),
        Some(2)
    );
    assert_eq!(
        result.get("next_offset").and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        result
            .get("items")
            .and_then(|value| value.as_array())
            .and_then(|items| items.first())
            .and_then(|item| item.get("name"))
            .and_then(|value| value.as_str()),
        Some("alpha")
    );
}

#[test]
fn catalog_folder_list_defaults_to_directories_then_files_by_name() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&upload_create_at(&mut router, "/docs", "zeta.txt"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "Zeta"));
    assert_rpc_ok(&upload_create_at(&mut router, "/docs", "Alpha.txt"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "alpha"));
    assert_rpc_ok(&upload_create_at(&mut router, "/docs", "beta.txt"));

    let response = router.handle(&RpcRequest::new(
        "catalog:folder:list",
        serde_json::json!({
            "path": "/docs",
            "offset": 0,
            "limit": 10
        }),
    ));
    assert_rpc_ok(&response);

    let items = response
        .result()
        .expect("folder page result")
        .get("items")
        .and_then(|value| value.as_array())
        .expect("items array");
    let names = items
        .iter()
        .filter_map(|item| item.get("name").and_then(|value| value.as_str()))
        .collect::<Vec<_>>();
    let kinds = items
        .iter()
        .filter_map(|item| item.get("is_dir").and_then(|value| value.as_bool()))
        .collect::<Vec<_>>();

    assert_eq!(
        names,
        vec!["alpha", "Zeta", "Alpha.txt", "beta.txt", "zeta.txt"]
    );
    assert_eq!(kinds, vec![true, true, false, false, false]);
}

#[test]
fn catalog_folder_list_reports_stale_expected_version() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));

    let response = router.handle(&RpcRequest::new(
        "catalog:folder:list",
        serde_json::json!({
            "path": "/docs",
            "offset": 0,
            "limit": 10,
            "expected_version": 999999
        }),
    ));
    assert_rpc_ok(&response);

    let result = response.result().expect("folder page result");
    assert_eq!(
        result
            .get("reload_required")
            .and_then(|value| value.as_bool()),
        Some(true)
    );
    assert_eq!(
        result
            .get("items")
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(0)
    );
}

#[test]
fn catalog_folder_list_recursive_content_search_matches_nested_uppercase_text() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    upload_file(
        &mut router,
        Some("/docs/nested"),
        "PLAN.md",
        b"# Release\nLAUNCH checklist".to_vec(),
        Some("text/markdown"),
    );

    let response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "query": "launch",
            "recursive": true,
            "include_text_content": true
        }),
    );
    assert_rpc_ok(&response);

    let items = get_items(&response);
    assert_eq!(item_names(&response), vec!["PLAN.md"]);
    assert_eq!(
        items
            .first()
            .and_then(|item| item.get("path"))
            .and_then(|value| value.as_str()),
        Some("/docs/nested/PLAN.md")
    );
    assert_eq!(
        items
            .first()
            .and_then(|item| item.get("parent_path"))
            .and_then(|value| value.as_str()),
        Some("/docs/nested")
    );
}

#[test]
fn catalog_folder_list_query_uses_unicode_case_folding_for_name_path_and_text() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "unicode"));
    upload_file(
        &mut router,
        Some("/docs/unicode"),
        "ОТЧЕТ.md",
        b"plain body".to_vec(),
        Some("text/markdown"),
    );
    upload_file(
        &mut router,
        Some("/docs/unicode"),
        "body.txt",
        "ПРИВЕТ МИР".as_bytes().to_vec(),
        Some("text/plain"),
    );

    let name_response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "query": "отчет",
            "recursive": true,
            "include_text_content": true
        }),
    );
    assert_rpc_ok(&name_response);
    assert_eq!(item_names(&name_response), vec!["ОТЧЕТ.md"]);

    let text_response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "query": "привет",
            "recursive": true,
            "include_text_content": true
        }),
    );
    assert_rpc_ok(&text_response);
    assert_eq!(item_names(&text_response), vec!["body.txt"]);
}

#[test]
fn catalog_folder_list_skips_large_text_file_body_but_keeps_name_path_match() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    let mut large_body = vec![b'x'; TEXT_SEARCH_LIMIT_BYTES + 1];
    large_body.extend_from_slice(b" NEEDLE");
    upload_file(
        &mut router,
        Some("/docs/nested"),
        "huge.log",
        large_body,
        Some("text/plain"),
    );

    let body_response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "query": "needle",
            "recursive": true,
            "include_text_content": true
        }),
    );
    assert_rpc_ok(&body_response);
    assert!(item_names(&body_response).is_empty());

    let name_response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "query": "huge",
            "recursive": true,
            "include_text_content": true
        }),
    );
    assert_rpc_ok(&name_response);
    assert_eq!(item_names(&name_response), vec!["huge.log"]);
}

#[test]
fn catalog_folder_list_query_without_new_flags_stays_direct_child_search() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    upload_file(
        &mut router,
        Some("/docs/nested"),
        "Deep.md",
        b"LAUNCH only in nested file".to_vec(),
        Some("text/markdown"),
    );

    let response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "query": "launch"
        }),
    );
    assert_rpc_ok(&response);
    assert!(item_names(&response).is_empty());
}

#[test]
fn catalog_folder_list_filter_counts_include_nested_files_for_direct_pages() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    upload_file(
        &mut router,
        Some("/docs/nested"),
        "daily.md",
        b"# Daily".to_vec(),
        Some("text/markdown"),
    );
    upload_file(
        &mut router,
        Some("/docs"),
        "photo.jpg",
        vec![1, 2, 3],
        Some("image/jpeg"),
    );

    let response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "include_hidden": false
        }),
    );
    assert_rpc_ok(&response);

    let result = response.result().expect("folder page result");
    assert_eq!(item_names(&response), vec!["nested", "photo.jpg"]);
    assert_eq!(
        result
            .get("filter_counts")
            .and_then(|counts| counts.get("all"))
            .and_then(|value| value.as_u64()),
        Some(2)
    );
    assert_eq!(
        result
            .get("filter_counts")
            .and_then(|counts| counts.get("markdown"))
            .and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        result
            .get("filter_counts")
            .and_then(|counts| counts.get("images"))
            .and_then(|value| value.as_u64()),
        Some(1)
    );
}

#[test]
fn catalog_folder_list_recursive_type_filter_matches_nested_files() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    upload_file(
        &mut router,
        Some("/docs/nested"),
        "PLAN.md",
        b"# Release".to_vec(),
        Some("text/markdown"),
    );
    upload_file(
        &mut router,
        Some("/docs/nested"),
        "photo.jpg",
        vec![1, 2, 3],
        Some("image/jpeg"),
    );

    let response = folder_list(
        &mut router,
        "/docs",
        serde_json::json!({
            "file_types": ["markdown"],
            "recursive": true
        }),
    );
    assert_rpc_ok(&response);

    let result = response.result().expect("folder page result");
    assert_eq!(item_names(&response), vec!["PLAN.md"]);
    assert_eq!(
        result.get("total_count").and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        result
            .get("filter_counts")
            .and_then(|counts| counts.get("all"))
            .and_then(|value| value.as_u64()),
        Some(2)
    );
    assert_eq!(
        result
            .get("filter_counts")
            .and_then(|counts| counts.get("markdown"))
            .and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        get_items(&response)
            .first()
            .and_then(|item| item.get("path"))
            .and_then(|value| value.as_str()),
        Some("/docs/nested/PLAN.md")
    );
}
