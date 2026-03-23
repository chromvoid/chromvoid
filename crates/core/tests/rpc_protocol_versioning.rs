//! ADR-004: protocol versioning contract.

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

#[test]
fn test_unsupported_protocol_version_is_typed_error() {
    let (mut router, _temp_dir) = create_test_router();

    let mut request = RpcRequest::new("ping", serde_json::json!({}));
    request.v = 2;

    let response = router.handle(&request);
    assert_rpc_error(&response, "INTERNAL_ERROR");

    assert!(
        response
            .error_message()
            .unwrap_or_default()
            .contains("unsupported protocol version"),
        "error message must mention unsupported protocol version"
    );
}
