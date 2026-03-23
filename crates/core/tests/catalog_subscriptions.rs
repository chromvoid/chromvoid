//! ADR-004 catalog subscription contract.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_catalog_subscribe_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

#[test]
fn test_catalog_subscribe_unsubscribe_contract() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let subscribe = router.handle(&RpcRequest::new("catalog:subscribe", serde_json::json!({})));
    assert_rpc_ok(&subscribe);
    assert!(
        subscribe
            .result()
            .expect("subscribe must return result")
            .is_null(),
        "ADR-004: subscribe result is null"
    );

    let unsubscribe = router.handle(&RpcRequest::new(
        "catalog:unsubscribe",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&unsubscribe);
    assert!(
        unsubscribe
            .result()
            .expect("unsubscribe must return result")
            .is_null(),
        "ADR-004: unsubscribe result is null"
    );
}
