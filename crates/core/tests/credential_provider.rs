mod test_helpers;

use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
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

    let meta_resp = prepare_upload(
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

fn ensure_entry_with_raw_meta(router: &mut RpcRouter, dir_name: &str, meta: serde_json::Value) {
    set_bypass_system_shard_guards(true);

    if list_dir(router, "/.passmanager").is_ok() == false {
        assert_rpc_ok(&create_dir(router, ".passmanager"));
    }

    let created = create_dir_at(router, "/.passmanager", dir_name);
    assert_rpc_ok(&created);

    let parent = format!("/.passmanager/{dir_name}");
    let encoded = meta.to_string().into_bytes();

    let meta_resp = prepare_upload(
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

    let meta_resp = prepare_upload(
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
