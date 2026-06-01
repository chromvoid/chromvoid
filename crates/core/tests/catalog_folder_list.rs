//! Regression tests for catalog:folder:list.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use test_helpers::*;

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
