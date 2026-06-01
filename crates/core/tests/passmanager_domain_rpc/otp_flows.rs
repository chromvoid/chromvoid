use super::support::*;

fn assert_rpc_error_message(response: &RpcResponse, expected_code: &str, expected_message: &str) {
    assert_rpc_error(response, expected_code);
    assert_eq!(response.error_message(), Some(expected_message));
}

#[test]
fn test_passmanager_otp_commands_require_unlocked_vault() {
    let (mut router, _tmp) = create_test_router();

    let set_secret = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "otp-locked",
            "secret": "JBSWY3DPEHPK3PXP",
        }),
    ));
    assert_rpc_error_message(&set_secret, "VAULT_REQUIRED", "Vault not unlocked");

    let generate = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"otp_id": "otp-locked"}),
    ));
    assert_rpc_error_message(&generate, "VAULT_REQUIRED", "Vault not unlocked");

    let remove = router.handle(&RpcRequest::new(
        "passmanager:otp:removeSecret",
        serde_json::json!({"otp_id": "otp-locked"}),
    ));
    assert_rpc_error_message(&remove, "VAULT_REQUIRED", "Vault not unlocked");
}

#[test]
fn test_passmanager_otp_generate_supports_otp_id() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let created_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "title": "WithOTP",
            "otps": [{"id": "otp-ext-1", "label": "123"}],
        }),
    ));
    assert_rpc_ok(&created_entry);
    let set_secret = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "otp-ext-1",
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30,
        }),
    ));
    assert_rpc_ok(&set_secret);

    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"otp_id": "otp-ext-1", "ts": 0}),
    ));
    assert_rpc_ok(&generated);
    let otp = generated
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp");
    assert_eq!(otp.len(), 6);
    assert!(otp.chars().all(|c| c.is_ascii_digit()));
    // removeSecret via otp_id (domain-ID path)
    let removed = router.handle(&RpcRequest::new(
        "passmanager:otp:removeSecret",
        serde_json::json!({"otp_id": "otp-ext-1"}),
    ));
    assert_rpc_ok(&removed);

    // generate should now fail after removal
    let after_remove = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"otp_id": "otp-ext-1", "ts": 0}),
    ));
    assert_rpc_error(&after_remove, "OTP_SECRET_NOT_FOUND");
}

#[test]
fn test_passmanager_otp_generate_supports_entry_id_with_label() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let created_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "title": "WithOTPEntryId",
            "otps": [{"id": "otp-ext-2", "label": "123"}],
        }),
    ));
    assert_rpc_ok(&created_entry);
    let entry_id = created_entry
        .result()
        .and_then(|r| r.get("entry_id"))
        .and_then(|v| v.as_str())
        .expect("entry_id")
        .to_string();
    let set_secret = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "entry_id": entry_id.clone(),
            "label": "123",
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30,
        }),
    ));
    assert_rpc_ok(&set_secret);

    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "label": "123", "ts": 0}),
    ));
    assert_rpc_ok(&generated);
    let otp = generated
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp");
    assert_eq!(otp.len(), 6);
    assert!(otp.chars().all(|c| c.is_ascii_digit()));
    // removeSecret via entry_id + label (domain-ID path)
    let removed = router.handle(&RpcRequest::new(
        "passmanager:otp:removeSecret",
        serde_json::json!({"entry_id": entry_id, "label": "123"}),
    ));
    assert_rpc_ok(&removed);

    // generate should now fail after removal
    let after_remove = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "label": "123", "ts": 0}),
    ));
    assert_rpc_error(&after_remove, "OTP_SECRET_NOT_FOUND");
}

#[test]
fn test_passmanager_otp_generate_scopes_otp_id_by_entry_id_when_both_are_provided() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let shared_otp_id = "otp-duplicated";

    let first_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-without-secret",
            "title": "WithoutSecret",
            "otps": [{"id": shared_otp_id, "label": "First"}],
        }),
    ));
    assert_rpc_ok(&first_entry);

    let second_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-with-secret",
            "title": "WithSecret",
            "otps": [{"id": shared_otp_id, "label": "Second"}],
        }),
    ));
    assert_rpc_ok(&second_entry);

    let set_secret = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "entry_id": "entry-with-secret",
            "label": "Second",
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30,
        }),
    ));
    assert_rpc_ok(&set_secret);

    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({
            "otp_id": shared_otp_id,
            "entry_id": "entry-with-secret",
            "ts": 0,
        }),
    ));
    assert_rpc_ok(&generated);
    let otp = generated
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp");
    assert_eq!(otp.len(), 6);
    assert!(otp.chars().all(|c| c.is_ascii_digit()));
}

#[test]
fn test_passmanager_otp_set_secret_rejects_missing_identifiers() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    // No node_id, otp_id, or entry_id → EMPTY_PAYLOAD
    let resp = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
        }),
    ));
    assert_rpc_error_message(&resp, "EMPTY_PAYLOAD", "otp_id or entry_id is required");
}

#[test]
fn test_passmanager_otp_remove_secret_rejects_missing_identifiers() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    // No node_id, otp_id, or entry_id → EMPTY_PAYLOAD
    let resp = router.handle(&RpcRequest::new(
        "passmanager:otp:removeSecret",
        serde_json::json!({}),
    ));
    assert_rpc_error_message(&resp, "EMPTY_PAYLOAD", "otp_id or entry_id is required");
}

#[test]
fn test_passmanager_otp_set_secret_rejects_missing_secret() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let created_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "title": "MissingOtpSecret",
            "otps": [{"id": "otp-missing-secret", "label": "Main"}],
        }),
    ));
    assert_rpc_ok(&created_entry);

    let resp = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({"otp_id": "otp-missing-secret"}),
    ));
    assert_rpc_error_message(&resp, "EMPTY_PAYLOAD", "secret is required");
}

#[test]
fn test_passmanager_otp_set_secret_rejects_invalid_settings() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let created_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "title": "InvalidOtpSettings",
            "otps": [{"id": "otp-invalid-settings", "label": "Main"}],
        }),
    ));
    assert_rpc_ok(&created_entry);

    let invalid_algorithm = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "otp-invalid-settings",
            "secret": "JBSWY3DPEHPK3PXP",
            "algorithm": "MD5",
        }),
    ));
    assert_rpc_error_message(
        &invalid_algorithm,
        "OTP_SETTINGS_INVALID",
        "Invalid algorithm",
    );

    let invalid_digits = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "otp-invalid-settings",
            "secret": "JBSWY3DPEHPK3PXP",
            "digits": 7,
        }),
    ));
    assert_rpc_error_message(
        &invalid_digits,
        "OTP_SETTINGS_INVALID",
        "digits must be 6 or 8",
    );
}

#[test]
fn test_passmanager_otp_set_secret_rejects_unresolved_otp_id() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    // otp_id that does not match any entry → OTP_SECRET_NOT_FOUND
    let resp = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": "nonexistent-otp-999",
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
        }),
    ));
    assert_rpc_error_message(&resp, "OTP_SECRET_NOT_FOUND", "OTP secret not found");
}

#[test]
fn test_passmanager_otp_remove_secret_rejects_unresolved_entry_id() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    // entry_id that does not match any entry → OTP_SECRET_NOT_FOUND
    let resp = router.handle(&RpcRequest::new(
        "passmanager:otp:removeSecret",
        serde_json::json!({
            "entry_id": "nonexistent-entry-999",
            "label": "missing",
        }),
    ));
    assert_rpc_error_message(&resp, "OTP_SECRET_NOT_FOUND", "OTP secret not found");
}

#[test]
fn test_passmanager_otp_set_secret_rejects_node_id_only_payload() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let resp = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "node_id": 1,
            "label": "test",
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
        }),
    ));
    assert_rpc_error_message(&resp, "EMPTY_PAYLOAD", "otp_id or entry_id is required");
}

/// Regression test: OTP_SECRET_NOT_FOUND when `entry_id` + `otp_id` are sent to
/// `passmanager:otp:generate` but the entry's `meta.json` no longer contains the OTP
/// in its `otps` array (e.g., the entry was re-saved without preserving the OTP list).
///
/// Root cause: `resolve_from_entries` returned `None` when `entry_id` matched but
/// `otp_id` was absent from `entry.otps` and no `fallback_label` was provided.
/// The fix: fall back to `otp_id` as the label so the secret stored under that label
/// can still be found.
#[test]
fn test_passmanager_otp_generate_with_entry_id_when_otp_absent_from_meta() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let otp_id = "otp-absent-from-meta";

    // 1. Create entry with the OTP recorded in meta.json.
    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "title": "EntryForAbsentOtp",
            "otps": [{"id": otp_id, "label": ""}],
        }),
    ));
    assert_rpc_ok(&created);
    let entry_id = created
        .result()
        .and_then(|r| r.get("entry_id"))
        .and_then(|v| v.as_str())
        .expect("entry_id")
        .to_string();

    // 2. Store OTP secret via otp_id only — resolves to the entry through meta.json,
    //    stores the secret with label = otp_id (since entry's OTP label is empty).
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": otp_id,
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30,
        }),
    )));

    // 3. Re-save entry meta with an empty `otps` array — simulates the frontend
    //    overwriting meta.json without preserving the OTP list (e.g., after a title edit).
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": entry_id.clone(),
            "title": "EntryForAbsentOtp",
            "otps": [],
        }),
    )));

    // 4. Generate OTP using entry_id + otp_id (the frontend never sends `label` here).
    //    Before the fix this returned OTP_SECRET_NOT_FOUND because resolve_from_entries
    //    found no match; after the fix it falls back to otp_id as the label.
    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "otp_id": otp_id, "ts": 0}),
    ));
    assert_rpc_ok(&generated);
    let otp = generated
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp code");
    assert_eq!(otp.len(), 6);
    assert!(otp.chars().all(|c| c.is_ascii_digit()));
}

/// When `entry_id` and `otp_id` are both provided to `passmanager:otp:setSecret`
/// and the OTP is absent from meta.json, the backend should still accept the request
/// and store the secret using `otp_id` as the label.
#[test]
fn test_passmanager_otp_set_secret_with_entry_id_when_otp_absent_from_meta() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let otp_id = "otp-set-absent-from-meta";

    // Create entry WITHOUT any otps in meta.json.
    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"title": "EntryNoOtpMeta"}),
    ));
    assert_rpc_ok(&created);
    let entry_id = created
        .result()
        .and_then(|r| r.get("entry_id"))
        .and_then(|v| v.as_str())
        .expect("entry_id")
        .to_string();

    // setSecret with entry_id + otp_id — otp not in meta, fix falls back to otp_id as label.
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "entry_id": entry_id.clone(),
            "otp_id": otp_id,
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30,
        }),
    )));

    // generate should work with the same entry_id + otp_id (secret stored under otp_id label).
    let generated = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "otp_id": otp_id, "ts": 0}),
    ));
    assert_rpc_ok(&generated);
    let otp = generated
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp code");
    assert_eq!(otp.len(), 6);
    assert!(otp.chars().all(|c| c.is_ascii_digit()));
}

#[test]
fn test_passmanager_otp_remove_secret_rejects_node_id_only_payload() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    // removeSecret with node_id only (no otp_id or entry_id) → EMPTY_PAYLOAD
    let resp = router.handle(&RpcRequest::new(
        "passmanager:otp:removeSecret",
        serde_json::json!({
            "node_id": 1,
            "label": "test",
        }),
    ));
    assert_rpc_error_message(&resp, "EMPTY_PAYLOAD", "otp_id or entry_id is required");
}
