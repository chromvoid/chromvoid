mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_pong_command_exists_and_returns_ok() {
    let (mut router, _temp_dir) = create_test_router();

    let response = router.handle(&RpcRequest::new("pong", serde_json::json!({})));
    assert_rpc_ok(&response);

    let result = response.result().expect("pong must return result");
    assert!(result.is_null(), "ADR-004: pong result is null");
}
