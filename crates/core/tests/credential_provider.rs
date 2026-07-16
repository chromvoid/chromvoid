mod test_helpers;

use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use test_helpers::*;

fn upload_create(
    router: &mut RpcRouter,
    name: &str,
    size: u64,
    parent_path: &str,
    mime_type: &str,
) -> RpcResponse {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "name": name,
                    "total_size": size,
                "size": size,
                    "offset": 0,
                "parent_path": parent_path,
                "mime_type": mime_type,
            }),
        ),
        Some(RpcInputStream::from_bytes(vec![0; size as usize])),
    );
    match reply {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
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
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
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
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:secret:write must return JSON response")
        }
    }
}

fn ensure_entry(router: &mut RpcRouter) {
    set_bypass_system_shard_guards(true);

    if list_dir(router, "/.passmanager").is_ok() == false {
        assert_rpc_ok(&create_dir(router, ".passmanager"));
    }

    let created = create_dir_at(router, "/.passmanager", "Example");
    assert_rpc_ok(&created);
    let _entry_node_id = get_node_id(&created);

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

    let meta_resp = upload_create(
        router,
        "meta.json",
        meta.len() as u64,
        "/.passmanager/Example",
        "application/json",
    );
    assert_rpc_ok(&meta_resp);
    upload_bytes(router, get_node_id(&meta_resp), meta);

    let pwd = b"correct horse battery staple".to_vec();
    let pwd_resp = upload_create(
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

fn ensure_entry_with_meta(
    router: &mut RpcRouter,
    dir_name: &str,
    credential_id: &str,
    title: &str,
    username: &str,
    url: &str,
) {
    set_bypass_system_shard_guards(true);

    if list_dir(router, "/.passmanager").is_ok() == false {
        assert_rpc_ok(&create_dir(router, ".passmanager"));
    }

    let created = create_dir_at(router, "/.passmanager", dir_name);
    assert_rpc_ok(&created);

    let parent = format!("/.passmanager/{dir_name}");
    let meta = serde_json::json!({
      "id": credential_id,
      "title": title,
      "username": username,
      "urls": [
        {"value": url, "match": "base_domain"}
      ],
      "otps": []
    })
    .to_string()
    .into_bytes();

    let meta_resp = upload_create(
        router,
        "meta.json",
        meta.len() as u64,
        &parent,
        "application/json",
    );
    assert_rpc_ok(&meta_resp);
    upload_bytes(router, get_node_id(&meta_resp), meta);

    set_bypass_system_shard_guards(false);
}

fn ensure_entry_with_meta_and_password(
    router: &mut RpcRouter,
    dir_name: &str,
    credential_id: &str,
    title: &str,
    username: &str,
    url: &str,
    password: &str,
) {
    ensure_entry_with_meta(router, dir_name, credential_id, title, username, url);
    set_bypass_system_shard_guards(true);

    let parent = format!("/.passmanager/{dir_name}");
    let password_bytes = password.as_bytes().to_vec();
    let pwd_resp = upload_create(
        router,
        ".password",
        password_bytes.len() as u64,
        &parent,
        "text/plain",
    );
    assert_rpc_ok(&pwd_resp);
    secret_write_bytes(router, get_node_id(&pwd_resp), password_bytes);

    set_bypass_system_shard_guards(false);
}

fn ensure_entry_with_meta_and_password_bytes(
    router: &mut RpcRouter,
    dir_name: &str,
    credential_id: &str,
    title: &str,
    username: &str,
    url: &str,
    password: &[u8],
) {
    ensure_entry_with_meta(router, dir_name, credential_id, title, username, url);
    add_password_bytes(router, dir_name, password);
}

fn add_password_bytes(router: &mut RpcRouter, dir_name: &str, password: &[u8]) {
    set_bypass_system_shard_guards(true);

    let parent = format!("/.passmanager/{dir_name}");
    let pwd_resp = upload_create(
        router,
        ".password",
        password.len() as u64,
        &parent,
        "text/plain",
    );
    assert_rpc_ok(&pwd_resp);
    secret_write_bytes(router, get_node_id(&pwd_resp), password.to_vec());

    set_bypass_system_shard_guards(false);
}

fn ensure_entry_with_raw_meta(router: &mut RpcRouter, dir_name: &str, meta: serde_json::Value) {
    set_bypass_system_shard_guards(true);

    if list_dir(router, "/.passmanager").is_ok() == false {
        assert_rpc_ok(&create_dir(router, ".passmanager"));
    }

    let created = create_dir_at(router, "/.passmanager", dir_name);
    assert_rpc_ok(&created);

    let parent = format!("/.passmanager/{dir_name}");
    let encoded = meta.to_string().into_bytes();

    let meta_resp = upload_create(
        router,
        "meta.json",
        encoded.len() as u64,
        &parent,
        "application/json",
    );
    assert_rpc_ok(&meta_resp);
    upload_bytes(router, get_node_id(&meta_resp), encoded);

    set_bypass_system_shard_guards(false);
}

fn ensure_entry_with_raw_meta_bytes(router: &mut RpcRouter, dir_name: &str, meta_bytes: &[u8]) {
    set_bypass_system_shard_guards(true);

    if list_dir(router, "/.passmanager").is_ok() == false {
        assert_rpc_ok(&create_dir(router, ".passmanager"));
    }

    let created = create_dir_at(router, "/.passmanager", dir_name);
    assert_rpc_ok(&created);

    let parent = format!("/.passmanager/{dir_name}");
    let meta_resp = upload_create(
        router,
        "meta.json",
        meta_bytes.len() as u64,
        &parent,
        "application/json",
    );
    assert_rpc_ok(&meta_resp);
    upload_bytes(router, get_node_id(&meta_resp), meta_bytes.to_vec());

    set_bypass_system_shard_guards(false);
}

fn ensure_entry_with_otps(
    router: &mut RpcRouter,
    dir_name: &str,
    entry_id: &str,
    otps: serde_json::Value,
    secrets: &[(&str, &str)],
) {
    set_bypass_system_shard_guards(true);

    if list_dir(router, "/.passmanager").is_ok() == false {
        assert_rpc_ok(&create_dir(router, ".passmanager"));
    }

    let created = create_dir_at(router, "/.passmanager", dir_name);
    assert_rpc_ok(&created);

    let parent = format!("/.passmanager/{dir_name}");
    let meta = serde_json::json!({
      "id": entry_id,
      "title": dir_name,
      "username": "otp-user@example.com",
      "urls": [
        {"value": "https://otp.example.com/verify", "match": "exact"}
      ],
      "otps": otps,
    })
    .to_string()
    .into_bytes();

    let meta_resp = upload_create(
        router,
        "meta.json",
        meta.len() as u64,
        &parent,
        "application/json",
    );
    assert_rpc_ok(&meta_resp);
    upload_bytes(router, get_node_id(&meta_resp), meta);

    for (otp_id, secret) in secrets {
        let otp_set = router.handle(&RpcRequest::new(
            "passmanager:otp:setSecret",
            serde_json::json!({
              "entry_id": entry_id,
              "otp_id": otp_id,
              "secret": secret,
              "encoding": "base32",
              "algorithm": "SHA1",
              "digits": 6,
              "period": 30,
            }),
        ));
        assert_rpc_ok(&otp_set);
    }

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
    provider_list_with_debug(router, false)
}

fn provider_list_with_debug(router: &mut RpcRouter, include_debug: bool) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "include_debug": include_debug,
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ))
}

fn first_candidate(list_resp: &RpcResponse) -> serde_json::Value {
    list_resp
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}))
}

fn provider_get_secret(
    router: &mut RpcRouter,
    provider_session: &str,
    credential_id: &str,
    otp_id: Option<&str>,
) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:getSecret",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": credential_id,
          "otp_id": otp_id,
          "context": {
            "kind": "web",
            "origin": "https://app.example.com/login",
            "domain": "app.example.com",
          }
        }),
    ))
}

fn provider_get_secret_for_web(
    router: &mut RpcRouter,
    provider_session: &str,
    credential_id: &str,
    origin: &str,
    domain: &str,
) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:getSecret",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": credential_id,
          "context": {
            "kind": "web",
            "origin": origin,
            "domain": domain,
          }
        }),
    ))
}

fn provider_get_one_time_code(
    router: &mut RpcRouter,
    provider_session: &str,
    credential_id: &str,
    otp_id: &str,
    origin: &str,
    domain: &str,
) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:getOneTimeCode",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": credential_id,
          "otp_id": otp_id,
          "context": {
            "kind": "web",
            "origin": origin,
            "domain": domain,
          }
        }),
    ))
}

fn provider_search_all(router: &mut RpcRouter) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "credential_provider:search",
        serde_json::json!({ "query": "" }),
    ))
}

#[test]
fn test_credential_provider_status_and_session_gating() {
    let (mut router, _temp_dir) = create_test_router();

    let status_locked = router.handle(&RpcRequest::new(
        "credential_provider:status",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&status_locked);
    assert_eq!(
        status_locked
            .result()
            .and_then(|v| v.get("vault_open"))
            .and_then(|v| v.as_bool()),
        Some(false)
    );

    let open_locked = router.handle(&RpcRequest::new(
        "credential_provider:session:open",
        serde_json::json!({}),
    ));
    assert_rpc_error(&open_locked, "VAULT_REQUIRED");

    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);

    let status_unlocked = router.handle(&RpcRequest::new(
        "credential_provider:status",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&status_unlocked);
    assert_eq!(
        status_unlocked
            .result()
            .and_then(|v| v.get("vault_open"))
            .and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        status_unlocked
            .result()
            .and_then(|value| value.pointer("/capability_matrix/macos/one_time_codes"))
            .and_then(|value| value.as_bool()),
        Some(true)
    );
    assert!(status_unlocked
        .result()
        .and_then(|value| {
            value.pointer("/command_error_map/credential_provider:getOneTimeCode")
        })
        .and_then(|value| value.as_array())
        .is_some_and(|codes| {
            codes
                .iter()
                .any(|code| code.as_str() == Some("HOTP_AUTOFILL_UNSUPPORTED"))
        }));
}

#[test]
fn test_credential_provider_get_secret_requires_allowlist_and_returns_secret() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);

    let provider_session = provider_open_session(&mut router);

    let denied = router.handle(&RpcRequest::new(
        "credential_provider:getSecret",
        serde_json::json!({
          "provider_session": provider_session,
          "credential_id": "cred-example",
        }),
    ));
    assert_rpc_error(&denied, "ACCESS_DENIED");

    let listed = provider_list(&mut router);
    assert_rpc_ok(&listed);
    let candidate = first_candidate(&listed);
    assert_eq!(
        candidate.get("credential_id").and_then(|v| v.as_str()),
        Some("cred-example")
    );

    let provider_session = provider_open_session(&mut router);
    let secret = provider_get_secret(&mut router, &provider_session, "cred-example", None);
    assert_rpc_ok(&secret);

    let result = secret
        .result()
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    assert_eq!(
        result.get("password").and_then(|v| v.as_str()),
        Some("correct horse battery staple")
    );
    assert_eq!(
        result.get("username").and_then(|v| v.as_str()),
        Some("alice@example.com")
    );
    assert_eq!(
        result
            .get("otp")
            .and_then(|v| v.as_str())
            .map(|otp| otp.len()),
        Some(6)
    );
}

#[test]
fn test_credential_provider_list_debug_reports_web_context_miss() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);

    let listed_without_debug = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://github.com/login",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed_without_debug);
    assert!(listed_without_debug
        .result()
        .and_then(|value| value.get("debug"))
        .is_none());

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "include_debug": true,
          "context": {
            "kind": "web",
            "origin": "https://github.com/login",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let result = listed
        .result()
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let candidates = result
        .get("candidates")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    assert!(candidates.is_empty());

    let debug = result.get("debug").expect("debug diagnostics");
    assert!(result
        .get("candidates")
        .and_then(|value| value.as_array())
        .is_some());
    assert!(debug
        .get("context")
        .and_then(|value| value.as_object())
        .is_some());
    assert!(debug
        .get("collection")
        .and_then(|value| value.as_object())
        .is_some());
    assert_eq!(
        debug.get("entry_count").and_then(|value| value.as_u64()),
        Some(1)
    );
    assert_eq!(
        debug
            .get("candidate_count")
            .and_then(|value| value.as_u64()),
        Some(0)
    );

    let entry = debug
        .get("entries")
        .and_then(|value| value.as_array())
        .and_then(|items| items.first())
        .expect("debug entry");
    assert_eq!(
        entry.get("matched").and_then(|value| value.as_bool()),
        Some(false)
    );
    assert_eq!(
        entry
            .get("rejection_reason")
            .and_then(|value| value.as_str()),
        Some("web_context_miss")
    );
}

#[test]
fn test_credential_provider_list_includes_multiple_otp_options() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_otps(
        &mut router,
        "OtpSelector",
        "cred-otp-multi",
        serde_json::json!([
            {"id": "otp-main", "label": "Main", "type": "TOTP"},
            {"id": "otp-backup", "label": "Backup", "type": "TOTP"}
        ]),
        &[
            ("otp-main", "JBSWY3DPEHPK3PXP"),
            ("otp-backup", "KRUGS4ZANFZSAYJA"),
        ],
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://otp.example.com/verify",
            "domain": "otp.example.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let candidate = listed
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .and_then(|items| {
            items.iter().find(|item| {
                item.get("credential_id").and_then(|v| v.as_str()) == Some("cred-otp-multi")
            })
        })
        .cloned()
        .expect("OTP candidate");
    let otp_options = candidate
        .get("otp_options")
        .and_then(|v| v.as_array())
        .cloned()
        .expect("otp_options array");
    assert_eq!(otp_options.len(), 2);
    assert_eq!(
        otp_options[0].get("id").and_then(|v| v.as_str()),
        Some("otp-main")
    );
    assert_eq!(
        otp_options[1].get("id").and_then(|v| v.as_str()),
        Some("otp-backup")
    );
}

#[test]
fn test_credential_provider_get_secret_uses_selected_otp_id() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_otps(
        &mut router,
        "OtpSelector",
        "cred-otp-multi",
        serde_json::json!([
            {"id": "otp-main", "label": "Main", "type": "TOTP"},
            {"id": "otp-backup", "label": "Backup", "type": "TOTP"}
        ]),
        &[
            ("otp-main", "JBSWY3DPEHPK3PXP"),
            ("otp-backup", "KRUGS4ZANFZSAYJA"),
        ],
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://otp.example.com/verify",
            "domain": "otp.example.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let secret_main = provider_get_secret(
        &mut router,
        &provider_session,
        "cred-otp-multi",
        Some("otp-main"),
    );
    assert_rpc_ok(&secret_main);
    let provider_session = provider_open_session(&mut router);
    let secret_backup = provider_get_secret(
        &mut router,
        &provider_session,
        "cred-otp-multi",
        Some("otp-backup"),
    );
    assert_rpc_ok(&secret_backup);

    let otp_main = secret_main
        .result()
        .and_then(|v| v.get("otp"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let otp_backup = secret_backup
        .result()
        .and_then(|v| v.get("otp"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    assert!(!otp_main.is_empty());
    assert!(!otp_backup.is_empty());
    assert_ne!(otp_main, otp_backup);

    let provider_session = provider_open_session(&mut router);
    let secret_missing = provider_get_secret(
        &mut router,
        &provider_session,
        "cred-otp-multi",
        Some("otp-missing"),
    );
    assert_rpc_error(&secret_missing, "NO_MATCH");
    assert_eq!(secret_missing.error_message(), Some("No OTP match"));
}

#[test]
fn test_credential_provider_get_one_time_code_returns_only_requested_totp() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_otps(
        &mut router,
        "OtpSelector",
        "cred-otp-multi",
        serde_json::json!([
            {"id": "otp-main", "label": "Main", "type": "TOTP"},
            {"id": "otp-backup", "label": "Backup", "type": "TOTP"}
        ]),
        &[
            ("otp-main", "JBSWY3DPEHPK3PXP"),
            ("otp-backup", "KRUGS4ZANFZSAYJA"),
        ],
    );
    add_password_bytes(&mut router, "OtpSelector", &[0xff, 0xfe, 0xfd]);

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://otp.example.com/verify",
            "domain": "otp.example.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let response = provider_get_one_time_code(
        &mut router,
        &provider_session,
        "cred-otp-multi",
        "otp-backup",
        "https://otp.example.com/verify",
        "otp.example.com",
    );
    assert_rpc_ok(&response);

    let result = response.result().expect("one-time-code result");
    let object = result.as_object().expect("one-time-code object");
    assert_eq!(object.len(), 4);
    assert_eq!(
        object.get("credential_id").and_then(|value| value.as_str()),
        Some("cred-otp-multi")
    );
    assert_eq!(
        object.get("otp_id").and_then(|value| value.as_str()),
        Some("otp-backup")
    );
    assert_eq!(
        object
            .get("code")
            .and_then(|value| value.as_str())
            .map(str::len),
        Some(6)
    );
    assert!(!object.contains_key("password"));
    assert!(!object.contains_key("username"));
    assert!(!object.contains_key("secret"));

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock after epoch")
        .as_millis() as u64;
    let valid_until_ms = object
        .get("valid_until_ms")
        .and_then(|value| value.as_u64())
        .expect("valid_until_ms");
    assert!(valid_until_ms > now_ms);
    assert!(valid_until_ms <= now_ms + 30_000);
}

#[test]
fn test_credential_provider_get_one_time_code_requires_exact_context_and_ids() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);
    assert_rpc_ok(&provider_list(&mut router));

    let provider_session = provider_open_session(&mut router);
    let missing_otp = router.handle(&RpcRequest::new(
        "credential_provider:getOneTimeCode",
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
    assert_rpc_error(&missing_otp, "EMPTY_PAYLOAD");

    let provider_session = provider_open_session(&mut router);
    let wrong_context = provider_get_one_time_code(
        &mut router,
        &provider_session,
        "cred-example",
        "default",
        "https://attacker.example/login",
        "attacker.example",
    );
    assert_rpc_error(&wrong_context, "ACCESS_DENIED");

    let provider_session = provider_open_session(&mut router);
    let missing_id = provider_get_one_time_code(
        &mut router,
        &provider_session,
        "cred-example",
        "missing",
        "https://app.example.com/login",
        "app.example.com",
    );
    assert_rpc_error(&missing_id, "NO_MATCH");
}

#[test]
fn test_credential_provider_get_one_time_code_rejects_hotp() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry_with_otps(
        &mut router,
        "OtpHotp",
        "cred-otp-hotp",
        serde_json::json!([
            {"id": "otp-counter", "label": "Counter", "type": "HOTP"}
        ]),
        &[("otp-counter", "JBSWY3DPEHPK3PXP")],
    );
    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://otp.example.com/verify",
            "domain": "otp.example.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let response = provider_get_one_time_code(
        &mut router,
        &provider_session,
        "cred-otp-hotp",
        "otp-counter",
        "https://otp.example.com/verify",
        "otp.example.com",
    );
    assert_rpc_error(&response, "HOTP_AUTOFILL_UNSUPPORTED");
}

#[test]
fn test_credential_provider_get_secret_rejects_hotp_option() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_otps(
        &mut router,
        "OtpHotp",
        "cred-otp-hotp",
        serde_json::json!([
            {"id": "otp-counter", "label": "Counter", "type": "HOTP"}
        ]),
        &[("otp-counter", "JBSWY3DPEHPK3PXP")],
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://otp.example.com/verify",
            "domain": "otp.example.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let hotp_secret = provider_get_secret(
        &mut router,
        &provider_session,
        "cred-otp-hotp",
        Some("otp-counter"),
    );
    assert_rpc_error(&hotp_secret, "OTP_GENERATE_FAILED");
}

#[test]
fn test_credential_provider_get_secret_degrades_missing_default_otp_to_null() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_otps(
        &mut router,
        "OtpMissingSecret",
        "cred-otp-missing-secret",
        serde_json::json!([
            {"id": "otp-main", "label": "Main", "type": "TOTP"}
        ]),
        &[],
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://otp.example.com/verify",
            "domain": "otp.example.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let secret = provider_get_secret(
        &mut router,
        &provider_session,
        "cred-otp-missing-secret",
        None,
    );
    assert_rpc_ok(&secret);
    assert_eq!(
        secret.result().and_then(|value| value.get("otp")),
        Some(&serde_json::Value::Null)
    );
}

#[test]
fn test_credential_provider_record_use_updates_last_used_and_lock_is_fail_closed() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry(&mut router);

    let list_before = provider_list(&mut router);
    assert_rpc_ok(&list_before);
    let before = first_candidate(&list_before);
    assert_eq!(before.get("last_used_at").and_then(|v| v.as_u64()), None);

    let provider_session = provider_open_session(&mut router);
    let recorded = router.handle(&RpcRequest::new(
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
    assert_rpc_ok(&recorded);

    let list_after = provider_list(&mut router);
    assert_rpc_ok(&list_after);
    let after = first_candidate(&list_after);
    assert!(
        after
            .get("last_used_at")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            > 0
    );

    assert_rpc_ok(&lock_vault(&mut router));
    let list_locked = provider_list(&mut router);
    assert_rpc_error(&list_locked, "VAULT_REQUIRED");
}

#[test]
fn test_credential_provider_list_keeps_entries_with_duplicate_meta_id() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_meta(
        &mut router,
        "GitHub Personal",
        "cred-github",
        "GitHub Personal",
        "alice@personal",
        "https://github.com/login",
    );
    ensure_entry_with_meta(
        &mut router,
        "GitHub Work",
        "cred-github",
        "GitHub Work",
        "alice@work",
        "https://github.com/session",
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://github.com/settings/profile",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let candidates = listed
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    assert_eq!(
        candidates.len(),
        2,
        "both github entries should be visible in popup list"
    );

    let mut ids: Vec<String> = candidates
        .iter()
        .filter_map(|c| {
            c.get("credential_id")
                .and_then(|v| v.as_str())
                .map(ToString::to_string)
        })
        .collect();
    ids.sort();
    assert_eq!(ids.len(), 2);
    assert_ne!(
        ids[0], ids[1],
        "credential ids must be unique for provider actions"
    );
    assert!(ids.iter().all(|id| id.starts_with("cred-github")));

    let mut usernames: Vec<String> = candidates
        .iter()
        .filter_map(|c| {
            c.get("username")
                .and_then(|v| v.as_str())
                .map(ToString::to_string)
        })
        .collect();
    usernames.sort();
    assert_eq!(
        usernames,
        vec!["alice@personal".to_string(), "alice@work".to_string()]
    );
}

#[test]
fn test_credential_provider_list_supports_legacy_string_url_entries() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_meta(
        &mut router,
        "GitHub Object Url",
        "cred-gh-obj",
        "GitHub Object Url",
        "alice@object",
        "https://github.com/login",
    );

    ensure_entry_with_raw_meta(
        &mut router,
        "GitHub String Url",
        serde_json::json!({
          "id": "cred-gh-str",
          "title": "GitHub String Url",
          "username": "alice@string",
          "urls": ["github.com", "https://github.com/session"],
          "otps": []
        }),
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://github.com/settings/profile",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let candidates = listed
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    assert_eq!(
        candidates.len(),
        2,
        "legacy string url entry and object-rule entry should both match github"
    );

    let mut usernames: Vec<String> = candidates
        .iter()
        .filter_map(|c| {
            c.get("username")
                .and_then(|v| v.as_str())
                .map(ToString::to_string)
        })
        .collect();
    usernames.sort();
    assert_eq!(
        usernames,
        vec!["alice@object".to_string(), "alice@string".to_string()]
    );
}

#[test]
fn test_credential_provider_list_tolerates_scalar_url_and_object_otp_meta() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_raw_meta(
        &mut router,
        "GitHub Scalar Url",
        serde_json::json!({
          "id": "cred-gh-scalar",
          "title": "GitHub Scalar Url",
          "username": "alice@scalar",
          "urls": "https://github.com/login",
          "otps": {
            "label": "default",
            "type": "TOTP"
          }
        }),
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://github.com/settings/profile",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let candidates = listed
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    assert_eq!(candidates.len(), 1);
    assert_eq!(
        candidates[0].get("credential_id").and_then(|v| v.as_str()),
        Some("cred-gh-scalar")
    );
    assert_eq!(
        candidates[0].get("username").and_then(|v| v.as_str()),
        Some("alice@scalar")
    );
}

#[test]
fn test_credential_provider_list_supports_url_rules_alias_and_app_id_alias() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_raw_meta(
        &mut router,
        "GitHub Url Rules Alias",
        serde_json::json!({
          "entry_id": "cred-gh-rules",
          "title": "GitHub Url Rules Alias",
          "username": "alice@rules",
          "appId": "com.github.android",
          "url_rules": [
            {"value": "https://github.com/session", "match": "base_domain"}
          ],
          "otps": []
        }),
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://github.com/settings/profile",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let candidates = listed
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    assert_eq!(candidates.len(), 1);
    assert_eq!(
        candidates[0].get("credential_id").and_then(|v| v.as_str()),
        Some("cred-gh-rules")
    );
}

#[test]
fn test_credential_provider_public_suffix_tenants_do_not_cross_match() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_meta_and_password(
        &mut router,
        "Alice Pages",
        "cred-alice-pages",
        "Alice Pages",
        "alice@pages",
        "https://alice.github.io/login",
        "alice-secret",
    );
    ensure_entry_with_meta_and_password(
        &mut router,
        "Bob Pages",
        "cred-bob-pages",
        "Bob Pages",
        "bob@pages",
        "https://bob.github.io/login",
        "bob-secret",
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://alice.github.io/settings",
            "domain": "alice.github.io",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let candidates = listed
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    assert_eq!(candidates.len(), 1);
    assert_eq!(
        candidates[0].get("credential_id").and_then(|v| v.as_str()),
        Some("cred-alice-pages")
    );

    let searched = provider_search_all(&mut router);
    assert_rpc_ok(&searched);
    let searched_candidates = searched
        .result()
        .and_then(|r| r.get("candidates"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    assert_eq!(searched_candidates.len(), 2);

    let provider_session = provider_open_session(&mut router);
    let denied = provider_get_secret_for_web(
        &mut router,
        &provider_session,
        "cred-bob-pages",
        "https://alice.github.io/settings",
        "alice.github.io",
    );
    assert_rpc_error(&denied, "ACCESS_DENIED");

    let provider_session = provider_open_session(&mut router);
    let allowed = provider_get_secret_for_web(
        &mut router,
        &provider_session,
        "cred-alice-pages",
        "https://alice.github.io/settings",
        "alice.github.io",
    );
    assert_rpc_ok(&allowed);
    assert_eq!(
        allowed
            .result()
            .and_then(|r| r.get("password"))
            .and_then(|v| v.as_str()),
        Some("alice-secret")
    );
}

#[test]
fn test_credential_provider_get_secret_rejects_invalid_utf8_password() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_meta_and_password_bytes(
        &mut router,
        "Invalid Utf8",
        "cred-invalid-utf8",
        "Invalid Utf8",
        "alice@invalid",
        "https://invalid.example/login",
        &[0xff, 0xfe, 0xfd],
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://invalid.example/login",
            "domain": "invalid.example",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let provider_session = provider_open_session(&mut router);
    let secret = provider_get_secret_for_web(
        &mut router,
        &provider_session,
        "cred-invalid-utf8",
        "https://invalid.example/login",
        "invalid.example",
    );

    assert_rpc_error(&secret, "INVALID_SECRET_ENCODING");
    assert_eq!(
        secret.error_message(),
        Some("Credential password secret is not valid UTF-8")
    );
}

#[test]
fn test_credential_provider_debug_reports_invalid_meta_json() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_raw_meta_bytes(
        &mut router,
        "Broken Meta",
        br#"{"id":"cred-broken","title":"Broken Meta","urls":["https://github.com",]}"#,
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "include_debug": true,
          "context": {
            "kind": "web",
            "origin": "https://github.com/login",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let debug = listed
        .result()
        .and_then(|result| result.get("debug"))
        .cloned()
        .expect("debug diagnostics");
    assert_eq!(
        debug.get("entry_count").and_then(|value| value.as_u64()),
        Some(0)
    );
    assert_eq!(
        debug
            .get("collection")
            .and_then(|value| value.get("meta_parse_failed_count"))
            .and_then(|value| value.as_u64()),
        Some(1)
    );
}

#[test]
fn test_credential_provider_debug_reports_non_object_meta_root() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    ensure_entry_with_raw_meta_bytes(
        &mut router,
        "Array Meta Root",
        br#"[{"id":"cred-array-root"}]"#,
    );

    let listed = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "include_debug": true,
          "context": {
            "kind": "web",
            "origin": "https://github.com/login",
            "domain": "github.com",
          }
        }),
    ));
    assert_rpc_ok(&listed);

    let debug = listed
        .result()
        .and_then(|result| result.get("debug"))
        .cloned()
        .expect("debug diagnostics");
    let sampled_skip = debug
        .get("collection")
        .and_then(|value| value.get("sampled_skips"))
        .and_then(|value| value.as_array())
        .and_then(|items| items.first())
        .cloned()
        .expect("sampled skip");
    assert_eq!(
        sampled_skip.get("reason").and_then(|value| value.as_str()),
        Some("meta_parse_failed")
    );
    assert_eq!(
        sampled_skip
            .get("details")
            .and_then(|value| value.get("serde_error"))
            .and_then(|value| value.as_str()),
        Some("meta root is not a JSON object")
    );
}

#[test]
fn test_credential_provider_web_context_derives_domain_and_rejects_mismatch() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));
    ensure_entry_with_meta(
        &mut router,
        "Context Domain",
        "cred-context-domain",
        "Context Domain",
        "alice@example.com",
        "https://example.com/login",
    );

    let derived = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://www.example.com/login"
          }
        }),
    ));
    assert_rpc_ok(&derived);
    assert_eq!(
        first_candidate(&derived)
            .get("credential_id")
            .and_then(|value| value.as_str()),
        Some("cred-context-domain")
    );

    let mismatched = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "https://example.com/login",
            "domain": "attacker.example"
          }
        }),
    ));
    assert_rpc_error(&mismatched, "INVALID_CONTEXT");

    let hostless = router.handle(&RpcRequest::new(
        "credential_provider:list",
        serde_json::json!({
          "context": {
            "kind": "web",
            "origin": "file:///tmp/login.html"
          }
        }),
    ));
    assert_rpc_error(&hostless, "INVALID_CONTEXT");
}

#[test]
fn test_credential_provider_site_results_use_deterministic_order() {
    let (mut router, _temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    let entries = [
        (
            "Exact Used",
            "cred-exact-used",
            "Zulu",
            "https://login.accounts.example.com",
        ),
        (
            "Exact Unused",
            "cred-exact-unused",
            "Alpha",
            "https://login.accounts.example.com",
        ),
        (
            "Sub B",
            "cred-sub-b",
            "Same",
            "https://accounts.example.com",
        ),
        (
            "Sub A",
            "cred-sub-a",
            "Same",
            "https://accounts.example.com",
        ),
        (
            "Sub Alpha",
            "cred-sub-alpha",
            "Alpha",
            "https://accounts.example.com",
        ),
        (
            "Etld Used",
            "cred-etld-used",
            "Zulu",
            "https://shop.example.com",
        ),
        (
            "Etld Unused",
            "cred-etld-unused",
            "Alpha",
            "https://admin.example.com",
        ),
    ];
    for (dir_name, credential_id, title, url) in entries {
        ensure_entry_with_meta(
            &mut router,
            dir_name,
            credential_id,
            title,
            "alice@example.com",
            url,
        );
    }

    let list = || {
        RpcRequest::new(
            "credential_provider:list",
            serde_json::json!({
              "context": {
                "kind": "web",
                "origin": "https://login.accounts.example.com/session",
                "domain": "login.accounts.example.com"
              }
            }),
        )
    };
    assert_rpc_ok(&router.handle(&list()));

    for credential_id in ["cred-exact-used", "cred-etld-used"] {
        let provider_session = provider_open_session(&mut router);
        let recorded = router.handle(&RpcRequest::new(
            "credential_provider:recordUse",
            serde_json::json!({
              "provider_session": provider_session,
              "credential_id": credential_id,
              "context": {
                "kind": "web",
                "origin": "https://login.accounts.example.com/session",
                "domain": "login.accounts.example.com"
              }
            }),
        ));
        assert_rpc_ok(&recorded);
    }

    let listed = router.handle(&list());
    assert_rpc_ok(&listed);
    let ids = listed
        .result()
        .and_then(|result| result.get("candidates"))
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .filter_map(|candidate| {
            candidate
                .get("credential_id")
                .and_then(|value| value.as_str())
        })
        .collect::<Vec<_>>();
    assert_eq!(
        ids,
        vec![
            "cred-exact-used",
            "cred-exact-unused",
            "cred-sub-alpha",
            "cred-sub-a",
            "cred-sub-b",
            "cred-etld-used",
            "cred-etld-unused",
        ]
    );
}
