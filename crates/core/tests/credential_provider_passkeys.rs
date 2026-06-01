mod test_helpers;

use base64::Engine as _;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::storage::Storage;
use test_helpers::*;

fn passkey_create_request() -> serde_json::Value {
    serde_json::json!({
        "platform": "android",
        "platform_version_major": 34,
        "request": {
            "rp": {
                "id": "github.com",
                "name": "GitHub"
            },
            "user": {
                "id": "dXNlci0x",
                "name": "alice@example.com",
                "displayName": "Alice"
            },
            "challenge": "Y2hhbGxlbmdlLTE",
            "origin": "https://github.com",
            "pubKeyCredParams": [
                { "type": "public-key", "alg": -7 }
            ],
            "attestation": "none"
        }
    })
}

fn passkey_get_request(credential_id: &str) -> serde_json::Value {
    serde_json::json!({
        "platform": "android",
        "platform_version_major": 34,
        "credentialIdB64Url": credential_id,
        "request": {
            "rpId": "github.com",
            "challenge": "Z2V0LWNoYWxsZW5nZQ",
            "origin": "https://github.com",
            "allowCredentials": [
                { "type": "public-key", "id": credential_id }
            ]
        }
    })
}

fn call(
    router: &mut chromvoid_core::rpc::RpcRouter,
    command: &str,
    data: serde_json::Value,
) -> RpcResponse {
    router.handle(&RpcRequest::new(command, data))
}

fn credential_id(response: &RpcResponse) -> String {
    response
        .result()
        .and_then(|result| result.get("credentialIdB64Url"))
        .and_then(|v| v.as_str())
        .expect("credential id")
        .to_string()
}

fn response_client_data_json(response: &RpcResponse) -> String {
    let encoded = response
        .result()
        .and_then(|result| result.pointer("/response/clientDataJSON"))
        .and_then(|v| v.as_str())
        .expect("clientDataJSON");
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .expect("clientDataJSON b64url");
    String::from_utf8(bytes).expect("clientDataJSON utf8")
}

fn client_data_hash(byte: u8) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode([byte; 32])
}

fn second_passkey_create_request() -> serde_json::Value {
    let mut request = passkey_create_request();
    request["request"]["rp"]["id"] = serde_json::json!("example.com");
    request["request"]["rp"]["name"] = serde_json::json!("Example");
    request["request"]["user"]["id"] = serde_json::json!("dXNlci0y");
    request["request"]["user"]["name"] = serde_json::json!("bob@example.com");
    request["request"]["user"]["displayName"] = serde_json::json!("Bob");
    request["request"]["challenge"] = serde_json::json!("Y2hhbGxlbmdlLTI");
    request["request"]["origin"] = serde_json::json!("https://example.com");
    request
}

#[test]
fn test_passkeys_status_contract_includes_create_get_and_query_commands() {
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
    assert_eq!(
        result
            .pointer("/passkeys_lite_status/android/create")
            .and_then(|v| v.as_str()),
        Some("SUPPORTED")
    );
    assert_eq!(
        result
            .pointer("/passkeys_lite_status/android/get")
            .and_then(|v| v.as_str()),
        Some("SUPPORTED")
    );
    assert_eq!(
        result
            .pointer("/passkeys_lite_status/ios/create")
            .and_then(|v| v.as_str()),
        Some("SUPPORTED")
    );
    assert_eq!(
        result
            .pointer("/passkeys_lite_status/ios/get")
            .and_then(|v| v.as_str()),
        Some("SUPPORTED")
    );

    let error_map = result
        .get("command_error_map")
        .and_then(|v| v.as_object())
        .expect("command_error_map object");

    for command in [
        "credential_provider:passkey:create",
        "credential_provider:passkey:get",
        "credential_provider:passkey:query",
    ] {
        let codes = error_map
            .get(command)
            .and_then(|v| v.as_array())
            .unwrap_or_else(|| panic!("missing command_error_map for {command}"));
        let codes: Vec<&str> = codes.iter().filter_map(|v| v.as_str()).collect();
        assert!(codes.contains(&"EMPTY_PAYLOAD"));
        assert!(codes.contains(&"VAULT_REQUIRED"));
        assert!(codes.contains(&"UNSUPPORTED"));
    }
}

#[test]
fn test_passkeys_commands_return_deterministic_unsupported_for_platform_gates() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

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
            "credential_provider:passkey:query",
        ] {
            let response = call(
                &mut router,
                command,
                serde_json::json!({
                    "platform": platform,
                    "platform_version_major": version,
                    "request": { "rpId": "github.com", "challenge": "Yw" },
                }),
            );
            assert_rpc_error(&response, "UNSUPPORTED");
            assert_eq!(response.error_message(), Some(expected_reason));
        }
    }
}

#[test]
fn test_passkeys_commands_support_apple_version_gates() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    for (platform, version) in [("ios", 17), ("macos", 14)] {
        let mut create_request = passkey_create_request();
        create_request["platform"] = serde_json::json!(platform);
        create_request["platform_version_major"] = serde_json::json!(version);

        let created = call(
            &mut router,
            "credential_provider:passkey:create",
            create_request,
        );
        assert_rpc_ok(&created);
        let credential_id = credential_id(&created);

        let mut get_request = passkey_get_request(&credential_id);
        get_request["platform"] = serde_json::json!(platform);
        get_request["platform_version_major"] = serde_json::json!(version);

        let queried = call(
            &mut router,
            "credential_provider:passkey:query",
            get_request.clone(),
        );
        assert_rpc_ok(&queried);

        let assertion = call(&mut router, "credential_provider:passkey:get", get_request);
        assert_rpc_ok(&assertion);
    }
}

#[test]
fn test_passkeys_delete_preserves_payload_validation_contract() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let missing = call(&mut router, "passkeys:delete", serde_json::json!({}));
    assert_rpc_error(&missing, "EMPTY_PAYLOAD");
    assert_eq!(
        missing.error_message(),
        Some("credentialIdB64Url is required")
    );

    let invalid = call(
        &mut router,
        "passkeys:delete",
        serde_json::json!({ "credentialIdB64Url": "not valid!" }),
    );
    assert_rpc_error(&invalid, "INVALID_CONTEXT");
    assert_eq!(
        invalid.error_message(),
        Some("credentialIdB64Url is invalid")
    );
}

#[test]
fn test_passkeys_delete_accepts_credential_id_aliases() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    for alias in ["credential_id_b64url", "credentialId"] {
        let created = call(
            &mut router,
            "credential_provider:passkey:create",
            passkey_create_request(),
        );
        assert_rpc_ok(&created);
        let credential_id = credential_id(&created);

        let deleted = call(
            &mut router,
            "passkeys:delete",
            serde_json::json!({ alias: credential_id }),
        );
        assert_rpc_ok(&deleted);
        assert_eq!(
            deleted
                .result()
                .and_then(|result| result.get("deleted"))
                .and_then(|v| v.as_bool()),
            Some(true)
        );
    }
}

#[test]
fn test_passkeys_list_orders_recently_used_first() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let first = call(
        &mut router,
        "credential_provider:passkey:create",
        passkey_create_request(),
    );
    assert_rpc_ok(&first);
    let first_id = credential_id(&first);

    std::thread::sleep(std::time::Duration::from_millis(2));
    let second = call(
        &mut router,
        "credential_provider:passkey:create",
        second_passkey_create_request(),
    );
    assert_rpc_ok(&second);

    std::thread::sleep(std::time::Duration::from_millis(2));
    let used_first = call(
        &mut router,
        "credential_provider:passkey:get",
        passkey_get_request(&first_id),
    );
    assert_rpc_ok(&used_first);

    let listed = call(&mut router, "passkeys:list", serde_json::json!({}));
    assert_rpc_ok(&listed);
    let passkeys = listed
        .result()
        .and_then(|result| result.get("passkeys"))
        .and_then(|v| v.as_array())
        .expect("passkeys");
    assert_eq!(passkeys.len(), 2);
    assert_eq!(
        passkeys[0]
            .get("credentialIdB64Url")
            .and_then(|v| v.as_str()),
        Some(first_id.as_str())
    );
}

#[test]
fn test_create_query_get_and_delete_vault_backed_passkey() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let created = call(
        &mut router,
        "credential_provider:passkey:create",
        passkey_create_request(),
    );
    assert_rpc_ok(&created);
    let credential_id = credential_id(&created);
    let create_result = created.result().expect("create result");
    assert_eq!(
        create_result
            .pointer("/response/publicKeyAlgorithm")
            .and_then(|v| v.as_i64()),
        Some(-7)
    );
    assert_eq!(
        create_result
            .get("authenticatorAttachment")
            .and_then(|v| v.as_str()),
        Some("platform")
    );
    let auth_data = create_result
        .pointer("/response/authenticatorData")
        .and_then(|v| v.as_str())
        .expect("authenticatorData");
    let auth_data = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(auth_data)
        .expect("auth data b64url");
    assert_eq!(
        auth_data[32], 0x5d,
        "registration must advertise UP|UV|BE|BS|AT"
    );

    let listed = call(&mut router, "passkeys:list", serde_json::json!({}));
    assert_rpc_ok(&listed);
    let passkeys = listed
        .result()
        .and_then(|result| result.get("passkeys"))
        .and_then(|v| v.as_array())
        .expect("passkeys");
    assert_eq!(passkeys.len(), 1);
    assert_eq!(
        passkeys[0]
            .get("credentialIdB64Url")
            .and_then(|v| v.as_str()),
        Some(credential_id.as_str())
    );
    assert_eq!(
        passkeys[0].get("storageKind").and_then(|v| v.as_str()),
        Some("vault")
    );
    assert_eq!(
        passkeys[0].get("portable").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert!(
        passkeys[0].get("privateKeyPkcs8B64Url").is_none(),
        "list summaries must not expose private key material"
    );

    let queried = call(
        &mut router,
        "credential_provider:passkey:query",
        passkey_get_request(&credential_id),
    );
    assert_rpc_ok(&queried);
    let query_passkeys = queried
        .result()
        .and_then(|result| result.get("passkeys"))
        .and_then(|v| v.as_array())
        .expect("query passkeys");
    assert_eq!(query_passkeys.len(), 1);

    let assertion = call(
        &mut router,
        "credential_provider:passkey:get",
        passkey_get_request(&credential_id),
    );
    assert_rpc_ok(&assertion);
    let assertion_result = assertion.result().expect("assertion result");
    let auth_data = assertion_result
        .pointer("/response/authenticatorData")
        .and_then(|v| v.as_str())
        .expect("assertion authenticatorData");
    let auth_data = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(auth_data)
        .expect("auth data b64url");
    assert_eq!(auth_data[32], 0x1d, "assertion must advertise UP|UV|BE|BS");
    assert_eq!(&auth_data[33..37], &[0, 0, 0, 0], "portable signCount is 0");
    assert_eq!(
        assertion_result
            .get("authenticatorAttachment")
            .and_then(|v| v.as_str()),
        Some("platform")
    );

    let deleted = call(
        &mut router,
        "passkeys:delete",
        serde_json::json!({ "credentialIdB64Url": credential_id }),
    );
    assert_rpc_ok(&deleted);
    assert_eq!(
        deleted
            .result()
            .and_then(|result| result.get("deleted"))
            .and_then(|v| v.as_bool()),
        Some(true)
    );

    let listed = call(&mut router, "passkeys:list", serde_json::json!({}));
    assert_rpc_ok(&listed);
    assert_eq!(
        listed
            .result()
            .and_then(|result| result.get("passkeys"))
            .and_then(|v| v.as_array())
            .map(Vec::len),
        Some(0)
    );
}

#[test]
fn test_passkey_responses_use_placeholder_client_data_json_when_android_hash_is_provided() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    let mut create_request = passkey_create_request();
    create_request["request"]["clientDataHash"] = serde_json::json!(client_data_hash(7));
    let created = call(
        &mut router,
        "credential_provider:passkey:create",
        create_request,
    );
    assert_rpc_ok(&created);
    assert_eq!(response_client_data_json(&created), "{}");
    assert_eq!(
        created
            .result()
            .and_then(|result| result.get("authenticatorAttachment"))
            .and_then(|v| v.as_str()),
        Some("platform")
    );

    let credential_id = credential_id(&created);
    let mut get_request = passkey_get_request(&credential_id);
    get_request["request"]["clientDataHash"] = serde_json::json!(client_data_hash(8));
    let assertion = call(&mut router, "credential_provider:passkey:get", get_request);
    assert_rpc_ok(&assertion);
    assert_eq!(response_client_data_json(&assertion), "{}");
    assert_eq!(
        assertion
            .result()
            .and_then(|result| result.get("authenticatorAttachment"))
            .and_then(|v| v.as_str()),
        Some("platform")
    );
}

#[test]
fn test_passkey_create_rejects_unsupported_attestation() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");
    let mut request = passkey_create_request();
    request["request"]["attestation"] = serde_json::json!("direct");

    let response = call(&mut router, "credential_provider:passkey:create", request);

    assert_rpc_error(&response, "UNSUPPORTED");
}

#[test]
fn test_vault_backed_passkey_survives_fresh_router_unlock() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    let created = call(
        &mut router,
        "credential_provider:passkey:create",
        passkey_create_request(),
    );
    assert_rpc_ok(&created);
    let credential_id = credential_id(&created);
    router.save().expect("save vault");

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut restored_router = chromvoid_core::rpc::RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut restored_router, password));

    let queried = call(
        &mut restored_router,
        "credential_provider:passkey:query",
        passkey_get_request(&credential_id),
    );
    assert_rpc_ok(&queried);
    assert_eq!(
        queried
            .result()
            .and_then(|result| result.get("passkeys"))
            .and_then(|v| v.as_array())
            .map(Vec::len),
        Some(1)
    );

    let assertion = call(
        &mut restored_router,
        "credential_provider:passkey:get",
        passkey_get_request(&credential_id),
    );
    assert_rpc_ok(&assertion);
}

#[test]
fn test_vault_backed_passkey_delete_survives_fresh_router_unlock() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    let password = "test_password";
    unlock_vault(&mut router, password);

    let created = call(
        &mut router,
        "credential_provider:passkey:create",
        passkey_create_request(),
    );
    assert_rpc_ok(&created);
    let credential_id = credential_id(&created);
    let deleted = call(
        &mut router,
        "passkeys:delete",
        serde_json::json!({ "credentialIdB64Url": credential_id }),
    );
    assert_rpc_ok(&deleted);
    drop(router);

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut restored_router = chromvoid_core::rpc::RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut restored_router, password));
    let queried = call(
        &mut restored_router,
        "credential_provider:passkey:query",
        passkey_get_request(&credential_id),
    );
    assert_rpc_ok(&queried);
    assert_eq!(
        queried
            .result()
            .and_then(|result| result.get("passkeys"))
            .and_then(|v| v.as_array())
            .map(Vec::len),
        Some(0)
    );
}
