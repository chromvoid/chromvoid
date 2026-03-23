mod test_helpers;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use test_helpers::*;

fn credential_status(router: &mut chromvoid_core::rpc::RpcRouter) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:status",
        serde_json::json!({}),
    ))
}

#[test]
fn test_credential_provider_status_exposes_capability_matrix_for_all_platforms() {
    let (mut router, _temp_dir) = create_test_router();

    let status = credential_status(&mut router);
    assert_rpc_ok(&status);

    let result = status
        .result()
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let matrix = result
        .get("capability_matrix")
        .and_then(|v| v.as_object())
        .expect("capability_matrix object");

    for platform in ["ios", "android", "macos", "windows"] {
        let caps = matrix
            .get(platform)
            .and_then(|v| v.as_object())
            .unwrap_or_else(|| panic!("missing platform capabilities for {platform}"));

        assert!(caps
            .get("password_provider")
            .and_then(|v| v.as_bool())
            .is_some());
        assert!(caps
            .get("passkeys_lite")
            .and_then(|v| v.as_bool())
            .is_some());
        assert!(caps
            .get("autofill_fallback")
            .and_then(|v| v.as_bool())
            .is_some());
        assert!(caps.get("unsupported_reason").is_some());
    }

    let ios = matrix
        .get("ios")
        .and_then(|v| v.as_object())
        .expect("ios caps");
    assert_eq!(
        ios.get("password_provider").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        ios.get("passkeys_lite").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        ios.get("autofill_fallback").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        ios.get("unsupported_reason").and_then(|v| v.as_str()),
        Some("passkeys_lite requires iOS 17+")
    );

    let android = matrix
        .get("android")
        .and_then(|v| v.as_object())
        .expect("android caps");
    assert_eq!(
        android.get("password_provider").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        android.get("passkeys_lite").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        android.get("autofill_fallback").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        android.get("unsupported_reason"),
        Some(&serde_json::Value::Null)
    );

    let macos = matrix
        .get("macos")
        .and_then(|v| v.as_object())
        .expect("macos caps");
    assert_eq!(
        macos.get("password_provider").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        macos.get("passkeys_lite").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        macos.get("autofill_fallback").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        macos.get("unsupported_reason").and_then(|v| v.as_str()),
        Some("passkeys_lite requires macOS 14+")
    );

    let windows = matrix
        .get("windows")
        .and_then(|v| v.as_object())
        .expect("windows caps");
    assert_eq!(
        windows.get("password_provider").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        windows.get("passkeys_lite").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        windows.get("autofill_fallback").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert_eq!(
        windows.get("unsupported_reason").and_then(|v| v.as_str()),
        Some("Credential provider adapter is not implemented on Windows")
    );
}

#[test]
fn test_credential_provider_status_exposes_deterministic_command_error_map() {
    let (mut router, _temp_dir) = create_test_router();

    let status = credential_status(&mut router);
    assert_rpc_ok(&status);
    let result = status
        .result()
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    let error_map = result
        .get("command_error_map")
        .and_then(|v| v.as_object())
        .expect("command_error_map object");

    let expected = vec![
        ("credential_provider:status", vec![]),
        (
            "credential_provider:session:open",
            vec![
                "PROVIDER_DISABLED",
                "VAULT_REQUIRED",
                "PROVIDER_UNAVAILABLE",
            ],
        ),
        ("credential_provider:session:close", vec!["EMPTY_PAYLOAD"]),
        (
            "credential_provider:list",
            vec!["PROVIDER_DISABLED", "VAULT_REQUIRED", "INVALID_CONTEXT"],
        ),
        (
            "credential_provider:search",
            vec!["PROVIDER_DISABLED", "VAULT_REQUIRED", "INVALID_CONTEXT"],
        ),
        (
            "credential_provider:getSecret",
            vec![
                "PROVIDER_DISABLED",
                "VAULT_REQUIRED",
                "EMPTY_PAYLOAD",
                "PROVIDER_SESSION_EXPIRED",
                "ACCESS_DENIED",
                "NO_MATCH",
                "INVALID_CONTEXT",
            ],
        ),
        (
            "credential_provider:recordUse",
            vec![
                "PROVIDER_DISABLED",
                "VAULT_REQUIRED",
                "EMPTY_PAYLOAD",
                "PROVIDER_SESSION_EXPIRED",
                "ACCESS_DENIED",
                "NO_MATCH",
                "INVALID_CONTEXT",
            ],
        ),
    ];

    for (command, expected_codes) in expected {
        let actual_codes: Vec<String> = error_map
            .get(command)
            .and_then(|v| v.as_array())
            .unwrap_or_else(|| panic!("missing command_error_map for {command}"))
            .iter()
            .filter_map(|v| v.as_str())
            .map(ToString::to_string)
            .collect();

        let expected_codes: Vec<String> = expected_codes
            .into_iter()
            .map(ToString::to_string)
            .collect();
        assert_eq!(
            actual_codes, expected_codes,
            "unexpected deterministic error map for command {command}"
        );
    }
}

#[test]
fn test_credential_provider_commands_use_deterministic_errors_when_locked_or_invalid() {
    let (mut router, _temp_dir) = create_test_router();

    let open = router.handle(&RpcRequest::new(
        "credential_provider:session:open",
        serde_json::json!({}),
    ));
    assert_rpc_error(&open, "VAULT_REQUIRED");

    let list = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
            "context": {
                "kind": "web",
                "origin": "https://example.com",
                "domain": "example.com"
            }
        }),
    ));
    assert_rpc_error(&list, "VAULT_REQUIRED");

    let search = router.handle(&RpcRequest::new(
        "credential_provider:search",
        serde_json::json!({ "query": "x" }),
    ));
    assert_rpc_error(&search, "VAULT_REQUIRED");

    let get_secret = router.handle(&RpcRequest::new(
        "credential_provider:getSecret",
        serde_json::json!({ "credential_id": "cred-example" }),
    ));
    assert_rpc_error(&get_secret, "VAULT_REQUIRED");

    let record_use = router.handle(&RpcRequest::new(
        "credential_provider:recordUse",
        serde_json::json!({ "credential_id": "cred-example" }),
    ));
    assert_rpc_error(&record_use, "VAULT_REQUIRED");

    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let close_missing_token = router.handle(&RpcRequest::new(
        "credential_provider:session:close",
        serde_json::json!({}),
    ));
    assert_rpc_error(&close_missing_token, "EMPTY_PAYLOAD");

    let list_invalid_context = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
            "context": {
                "kind": "web",
                "origin": "not-a-url",
                "domain": "example.com"
            }
        }),
    ));
    assert_rpc_error(&list_invalid_context, "INVALID_CONTEXT");

    let search_invalid_context = router.handle(&RpcRequest::new(
        "credential_provider:search",
        serde_json::json!({
            "query": "x",
            "context": {
                "kind": "web",
                "origin": "not-a-url",
                "domain": "example.com"
            }
        }),
    ));
    assert_rpc_error(&search_invalid_context, "INVALID_CONTEXT");

    let get_secret_empty_payload = router.handle(&RpcRequest::new(
        "credential_provider:getSecret",
        serde_json::json!({}),
    ));
    assert_rpc_error(&get_secret_empty_payload, "EMPTY_PAYLOAD");
}
