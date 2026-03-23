mod test_helpers;

use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use std::time::{SystemTime, UNIX_EPOCH};
use test_helpers::*;

fn prepare_upload(
    router: &mut RpcRouter,
    name: &str,
    size: u64,
    parent_path: &str,
    mime_type: &str,
) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": name,
            "size": size,
            "parent_path": parent_path,
            "mime_type": mime_type,
        }),
    ))
}

fn upload_bytes(router: &mut RpcRouter, node_id: u64, bytes: Vec<u8>) {
    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": bytes.len(),
            "offset": 0,
        }),
    );

    match router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(bytes))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }
}

fn secret_write_bytes(router: &mut RpcRouter, node_id: u64, bytes: Vec<u8>) {
    let write_request = RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({
            "node_id": node_id,
            "size": bytes.len(),
        }),
    );

    match router.handle_with_stream(&write_request, Some(RpcInputStream::from_bytes(bytes))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:secret:write must return JSON response"),
    }
}

fn ensure_entry(router: &mut RpcRouter) {
    set_bypass_system_shard_guards(true);

    if !list_dir(router, "/.passmanager").is_ok() {
        assert_rpc_ok(&create_dir(router, ".passmanager"));
    }

    let created = create_dir_at(router, "/.passmanager", "Example");
    assert_rpc_ok(&created);
    let entry_node_id = get_node_id(&created);

    let meta = serde_json::json!({
      "id": "cred-example",
      "title": "Example Account",
      "username": "alice@example.com",
      "urls": [
        {"value": "https://example.com/login", "match": "base_domain"}
      ],
      "otps": [
        {
          "label": "default",
          "algorithm": "SHA1",
          "digits": 6,
          "period": 30,
          "encoding": "base32"
        }
      ],
    })
    .to_string()
    .into_bytes();

    let meta_resp = prepare_upload(
        router,
        "meta.json",
        meta.len() as u64,
        "/.passmanager/Example",
        "application/json",
    );
    assert_rpc_ok(&meta_resp);
    upload_bytes(router, get_node_id(&meta_resp), meta);

    let pwd = b"correct horse battery staple".to_vec();
    let pwd_resp = prepare_upload(
        router,
        ".password",
        pwd.len() as u64,
        "/.passmanager/Example",
        "text/plain",
    );
    assert_rpc_ok(&pwd_resp);
    secret_write_bytes(router, get_node_id(&pwd_resp), pwd);

    let otp_set = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
          "entry_id": "cred-example",
          "label": "default",
          "secret": "JBSWY3DPEHPK3PXP",
          "encoding": "base32",
          "algorithm": "SHA1",
          "digits": 6,
          "period": 30,
        }),
    ));
    assert_rpc_ok(&otp_set);

    set_bypass_system_shard_guards(false);
}

fn provider_open_session(router: &mut RpcRouter) -> String {
    let open = router.handle(&RpcRequest::new(
        "credential_provider:session:open",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&open);
    open.result()
        .and_then(|v| v.get("provider_session"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn provider_list(router: &mut RpcRouter) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ))
}

fn get_secret(router: &mut RpcRouter, provider_session: &str) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:getSecret",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": "cred-example",
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ))
}

#[test]
fn test_record_use_cannot_bootstrap_allowlist() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);

    let provider_session = provider_open_session(&mut router);
    let record_use = router.handle(&RpcRequest::new(
        "credential_provider:recordUse",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": "cred-example",
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ));
    assert_rpc_error(&record_use, "ACCESS_DENIED");

    let provider_session = provider_open_session(&mut router);
    let denied_secret = get_secret(&mut router, &provider_session);
    assert_rpc_error(&denied_secret, "ACCESS_DENIED");

    let listed = provider_list(&mut router);
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let allowed_secret = get_secret(&mut router, &provider_session);
    assert_rpc_ok(&allowed_secret);
}

#[test]
fn test_get_secret_provider_session_is_single_use() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);

    let listed = provider_list(&mut router);
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let first = get_secret(&mut router, &provider_session);
    assert_rpc_ok(&first);

    let second = get_secret(&mut router, &provider_session);
    assert_rpc_error(&second, "PROVIDER_SESSION_EXPIRED");
}

#[test]
fn test_provider_session_ttl_is_60_seconds() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let before_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let open = router.handle(&RpcRequest::new(
        "credential_provider:session:open",
        serde_json::json!({}),
    ));
    let after_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    assert_rpc_ok(&open);
    let expires_at_ms = open
        .result()
        .and_then(|r| r.get("expires_at_ms"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let min_expected = before_ms + 59_000;
    let max_expected = after_ms + 61_000;
    assert!(
        expires_at_ms >= min_expected && expires_at_ms <= max_expected,
        "provider session TTL should be ~60s, got expires_at_ms={expires_at_ms}, expected [{min_expected}, {max_expected}]"
    );
}

#[test]
fn test_credential_provider_commands_fail_closed_when_vault_locked() {
    let (mut router, _temp_dir) = create_test_router();

    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);
    let provider_session = provider_open_session(&mut router);
    assert_rpc_ok(&lock_vault(&mut router));

    let open = router.handle(&RpcRequest::new(
        "credential_provider:session:open",
        serde_json::json!({}),
    ));
    assert_rpc_error(&open, "VAULT_REQUIRED");

    let list = provider_list(&mut router);
    assert_rpc_error(&list, "VAULT_REQUIRED");

    let search = router.handle(&RpcRequest::new(
        "credential_provider:search",
        serde_json::json!({
          "query": "example",
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ));
    assert_rpc_error(&search, "VAULT_REQUIRED");

    let get_secret = router.handle(&RpcRequest::new(
        "credential_provider:getSecret",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": "cred-example",
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ));
    assert_rpc_error(&get_secret, "VAULT_REQUIRED");

    let record_use = router.handle(&RpcRequest::new(
        "credential_provider:recordUse",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": "cred-example",
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ));
    assert_rpc_error(&record_use, "VAULT_REQUIRED");
}
