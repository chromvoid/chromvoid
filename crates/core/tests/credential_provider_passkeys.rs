mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

fn call_passkey_command(
    router: &mut chromvoid_core::rpc::RpcRouter,
    command: &str,
    platform: &str,
    platform_version_major: u64,
) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        command,
        serde_json::json!({
            "platform": platform,
            "platform_version_major": platform_version_major,
        }),
    ))
}

#[test]
fn test_passkeys_status_contract_includes_create_and_get_commands() {
    let (mut router, _temp_dir) = create_test_router();

    let status = router.handle(&RpcRequest::new(
        "credential_provider:status",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&status);

    let result = status
        .result()
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let error_map = result
        .get("command_error_map")
        .and_then(|v| v.as_object())
        .expect("command_error_map object");

    for command in [
        "credential_provider:passkey:create",
        "credential_provider:passkey:get",
    ] {
        let codes = error_map
            .get(command)
            .and_then(|v| v.as_array())
            .unwrap_or_else(|| panic!("missing command_error_map for {command}"));
        let codes: Vec<&str> = codes.iter().filter_map(|v| v.as_str()).collect();
        assert_eq!(codes, vec!["EMPTY_PAYLOAD", "PROVIDER_UNAVAILABLE"]);
    }
}

#[test]
fn test_passkeys_commands_return_deterministic_unsupported_for_platform_gates() {
    let (mut router, _temp_dir) = create_test_router();

    let cases = vec![
        ("ios", 16, "UNSUPPORTED: passkeys_lite requires iOS 17+"),
        (
            "android",
            33,
            "UNSUPPORTED: passkeys_lite requires Android API 34+",
        ),
        ("macos", 13, "UNSUPPORTED: passkeys_lite requires macOS 14+"),
        (
            "windows",
            11,
            "UNSUPPORTED: Credential provider adapter is not implemented on Windows",
        ),
    ];

    for (platform, version, expected_reason) in cases {
        for command in [
            "credential_provider:passkey:create",
            "credential_provider:passkey:get",
        ] {
            let response = call_passkey_command(&mut router, command, platform, version);
            assert_rpc_error(&response, "PROVIDER_UNAVAILABLE");
            assert_eq!(response.error_message(), Some(expected_reason));
        }
    }
}
