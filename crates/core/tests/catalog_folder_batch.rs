//! Regression tests for catalog:folder:batch.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn catalog_folder_batch_dedupes_duplicate_pages() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "alpha"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "beta"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "gamma"));

    let page = serde_json::json!({
        "path": "/docs",
        "offset": 0,
        "limit": 2,
        "sort": {"by": "name", "direction": "asc"},
        "filter": {"include_hidden": false}
    });
    let response = router.handle(&RpcRequest::new(
        "catalog:folder:batch",
        serde_json::json!({
            "pages": [
                page,
                page,
                {
                    "path": "/docs",
                    "offset": 2,
                    "limit": 2,
                    "sort": {"by": "name", "direction": "asc"},
                    "filter": {"include_hidden": false}
                }
            ]
        }),
    ));
    assert_rpc_ok(&response);

    let result = response.result().expect("folder batch result");
    let pages = result
        .get("pages")
        .and_then(|value| value.as_array())
        .expect("pages array");
    assert_eq!(pages.len(), 2);
    assert_eq!(
        pages[0].get("next_offset").and_then(|value| value.as_u64()),
        Some(2)
    );
}
