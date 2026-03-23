mod test_helpers;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use test_helpers::{assert_rpc_error, assert_rpc_ok, create_test_router, unlock_vault};

const PNG_ICON_A_BASE64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEAH+XDSwAAAABJRU5ErkJggg==";
const PNG_ICON_B_BASE64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6YhJkAAAAASUVORK5CYII=";
const SAMPLE_ENTRY_ICON_REF: &str =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SAMPLE_FOLDER_ICON_REF: &str =
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn get_node_id(response: &RpcResponse) -> u64 {
    response
        .result()
        .and_then(|r| r.get("node_id"))
        .and_then(|v| v.as_u64())
        .expect("node_id")
}

fn get_entries(response: &RpcResponse) -> Vec<serde_json::Value> {
    response
        .result()
        .expect("response should have result")
        .get("entries")
        .expect("result should have entries")
        .as_array()
        .expect("entries should be array")
        .clone()
}

fn get_groups(response: &RpcResponse) -> Vec<String> {
    response
        .result()
        .expect("response should have result")
        .get("groups")
        .expect("result should have groups")
        .as_array()
        .expect("groups should be array")
        .iter()
        .filter_map(|v| v.as_str().map(ToString::to_string))
        .collect()
}

#[test]
fn test_passmanager_domain_allows_root_list_while_generic_denies() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let generic = router.handle(&RpcRequest::new(
        "catalog:list",
        serde_json::json!({"path": "/.passmanager"}),
    ));
    assert_rpc_error(&generic, "ACCESS_DENIED");

    let pm = router.handle(&RpcRequest::new(
        "passmanager:entry:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&pm);
}

#[test]
fn test_passmanager_create_update_move_delete_flow() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let created_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/GroupA"}),
    ));
    assert_rpc_ok(&created_group);

    let created_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"title": "EntryA"}),
    ));
    assert_rpc_ok(&created_entry);
    let entry_id = created_entry
        .result()
        .and_then(|r| r.get("entry_id"))
        .and_then(|v| v.as_str())
        .expect("entry_id")
        .to_string();

    let updated = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"entry_id": entry_id.clone(), "title": "EntryRenamed"}),
    ));
    assert_rpc_ok(&updated);

    let read_updated = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": entry_id.clone()}),
    ));
    assert_rpc_ok(&read_updated);
    let read_entry = read_updated
        .result()
        .and_then(|r| r.get("entry"))
        .expect("entry");
    assert_eq!(
        read_entry.get("title").and_then(|v| v.as_str()),
        Some("EntryRenamed")
    );

    let moved = router.handle(&RpcRequest::new(
        "passmanager:entry:move",
        serde_json::json!({"entry_id": entry_id.clone(), "target_group_path": "/GroupA"}),
    ));
    assert_rpc_ok(&moved);

    let deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:delete",
        serde_json::json!({"entry_id": entry_id.clone()}),
    ));
    assert_rpc_ok(&deleted);

    let read_deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": entry_id.clone()}),
    ));
    assert_rpc_error(&read_deleted, "NODE_NOT_FOUND");
}

#[test]
fn test_passmanager_entry_domain_save_read_move_list_delete_flow() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_work = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/work"}),
    ));
    assert_rpc_ok(&ensure_work);

    let ensure_archive = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/archive"}),
    ));
    assert_rpc_ok(&ensure_archive);

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-1",
            "import_source": {
                "type": "keepass",
                "original_id": "keepass:entry-1"
            },
            "title": "Alpha",
            "group_path": "/work",
            "username": "alice",
            "urls": ["https://alpha.local"],
        }),
    ));
    assert_rpc_ok(&created);
    assert_eq!(
        created
            .result()
            .and_then(|r| r.get("entry_id"))
            .and_then(|v| v.as_str()),
        Some("entry-1")
    );

    let updated = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "entry-1",
            "title": "Alpha Updated",
            "groupPath": "/work",
            "username": "alice.updated",
            "urls": ["https://alpha-updated.local"],
        }),
    ));
    assert_rpc_ok(&updated);

    let read = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "entry-1"}),
    ));
    assert_rpc_ok(&read);
    let read_entry = read.result().and_then(|r| r.get("entry")).expect("entry");
    assert_eq!(
        read_entry.get("title").and_then(|v| v.as_str()),
        Some("Alpha Updated")
    );
    assert_eq!(
        read_entry.get("username").and_then(|v| v.as_str()),
        Some("alice.updated")
    );
    assert_eq!(
        read_entry
            .get("import_source")
            .and_then(|v| v.get("original_id"))
            .and_then(|v| v.as_str()),
        Some("keepass:entry-1")
    );

    let listed = router.handle(&RpcRequest::new(
        "passmanager:entry:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);
    let _entries = get_entries(&listed);

    let moved = router.handle(&RpcRequest::new(
        "passmanager:entry:move",
        serde_json::json!({"entry_id": "entry-1", "target_group_path": "/archive"}),
    ));
    assert_rpc_ok(&moved);

    let created_to_delete = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "entry-2",
            "title": "Delete Me",
            "group_path": "/work"
        }),
    ));
    assert_rpc_ok(&created_to_delete);

    let deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:delete",
        serde_json::json!({"entry_id": "entry-2"}),
    ));
    assert_rpc_ok(&deleted);

    let read_deleted = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "entry-2"}),
    ));
    assert_rpc_error(&read_deleted, "NODE_NOT_FOUND");
}

#[test]
fn test_passmanager_secret_domain_save_read_roundtrip() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-1", "title": "Secret Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let secret_save = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-1",
            "secret_type": "password",
            "value": "sup3r-secret"
        }),
    ));
    assert_rpc_ok(&secret_save);

    let secret_read = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "secret-entry-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&secret_read);
    assert_eq!(
        secret_read
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("sup3r-secret")
    );
}

#[test]
fn test_passmanager_secret_domain_empty_value_is_allowed() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-empty-1", "title": "Secret Empty Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let secret_save = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-empty-1",
            "secret_type": "password",
            "value": ""
        }),
    ));
    assert_rpc_ok(&secret_save);

    let secret_read = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "secret-entry-empty-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&secret_read);
    assert_eq!(
        secret_read
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("")
    );
}

#[test]
fn test_passmanager_secret_domain_save_rejects_missing_or_null_value() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-missing-1", "title": "Secret Missing Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let missing_value = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-missing-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_error(&missing_value, "EMPTY_PAYLOAD");

    let null_value = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-missing-1",
            "secret_type": "password",
            "value": null
        }),
    ));
    assert_rpc_error(&null_value, "EMPTY_PAYLOAD");
}

#[test]
fn test_passmanager_secret_domain_delete_removes_secret() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": "secret-entry-delete-1", "title": "Secret Delete Entry"}),
    ));
    assert_rpc_ok(&saved_entry);

    let secret_save = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": "secret-entry-delete-1",
            "secret_type": "password",
            "value": "to-be-deleted"
        }),
    ));
    assert_rpc_ok(&secret_save);

    let deleted = router.handle(&RpcRequest::new(
        "passmanager:secret:delete",
        serde_json::json!({
            "entry_id": "secret-entry-delete-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&deleted);

    let read_after_delete = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": "secret-entry-delete-1",
            "secret_type": "password"
        }),
    ));
    assert_rpc_error(&read_after_delete, "NODE_NOT_FOUND");
}

#[test]
fn test_passmanager_group_ensure_and_root_import_export_roundtrip() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensured = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/ops/platform"}),
    ));
    assert_rpc_ok(&ensured);

    let group_list = router.handle(&RpcRequest::new(
        "passmanager:group:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&group_list);
    let groups = get_groups(&group_list);
    assert!(groups.iter().any(|g| g == "/ops"));
    assert!(groups.iter().any(|g| g == "/ops/platform"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": ["/imported"],
            "entries": [
                {
                    "id": "import-entry-1",
                    "title": "Imported Entry",
                    "folderPath": "/imported",
                    "username": "import-user"
                }
            ]
        }),
    ));
    assert_rpc_ok(&imported);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");

    let folders = root
        .get("folders")
        .and_then(|v| v.as_array())
        .expect("folders");
    assert!(
        folders.iter().any(|v| v.as_str() == Some("/imported")),
        "exported folders should include imported folder"
    );

    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    let imported_entry = entries
        .iter()
        .find(|entry| entry.get("id").and_then(|v| v.as_str()) == Some("import-entry-1"))
        .expect("imported entry in export");
    assert_eq!(
        imported_entry.get("title").and_then(|v| v.as_str()),
        Some("Imported Entry")
    );
    assert_eq!(
        imported_entry.get("folderPath").and_then(|v| v.as_str()),
        Some("/imported")
    );
}

#[test]
fn test_passmanager_root_import_replace_mode_replaces_existing_entries_and_groups() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let seeded = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": ["/obsolete"],
            "entries": [
                {
                    "id": "obsolete-entry",
                    "title": "Obsolete Entry",
                    "folderPath": "/obsolete"
                }
            ]
        }),
    ));
    assert_rpc_ok(&seeded);

    let replaced = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "mode": "replace",
            "allow_destructive": true,
            "folders": [],
            "entries": []
        }),
    ));
    assert_rpc_ok(&replaced);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");
    let folders = root
        .get("folders")
        .and_then(|v| v.as_array())
        .expect("folders");
    assert!(
        folders.is_empty(),
        "folders should be empty after replacement import"
    );
    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    assert!(
        entries.is_empty(),
        "entries should be empty after replacement import"
    );

    let read_obsolete = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "obsolete-entry"}),
    ));
    assert_rpc_error(&read_obsolete, "NODE_NOT_FOUND");

    let groups = router.handle(&RpcRequest::new(
        "passmanager:group:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&groups);
    assert!(get_groups(&groups).is_empty());
}

#[test]
fn test_passmanager_root_import_defaults_to_merge_and_keeps_existing_entries() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let seeded = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": "keep-entry",
            "title": "Keep Entry",
            "group_path": "/"
        }),
    ));
    assert_rpc_ok(&seeded);

    let merged = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": [],
            "entries": []
        }),
    ));
    assert_rpc_ok(&merged);

    let read_kept = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "keep-entry"}),
    ));
    assert_rpc_ok(&read_kept);
}

#[test]
fn test_passmanager_root_import_replace_requires_explicit_confirmation() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let denied = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "mode": "replace",
            "folders": [],
            "entries": []
        }),
    ));
    assert_rpc_error(&denied, "ACCESS_DENIED");
}

#[test]
fn test_passmanager_root_import_restore_mode_allows_destructive_replace() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let seeded = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "mode": "replace",
            "allow_destructive": true,
            "folders": ["/obsolete"],
            "entries": [
                {
                    "id": "obsolete-entry-restore",
                    "title": "Obsolete Entry",
                    "folderPath": "/obsolete"
                }
            ]
        }),
    ));
    assert_rpc_ok(&seeded);

    let restored = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "mode": "restore",
            "allow_destructive": true,
            "folders": ["/restored"],
            "entries": [
                {
                    "id": "restored-entry",
                    "title": "Restored Entry",
                    "folderPath": "/restored"
                }
            ]
        }),
    ));
    assert_rpc_ok(&restored);

    let read_obsolete = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "obsolete-entry-restore"}),
    ));
    assert_rpc_error(&read_obsolete, "NODE_NOT_FOUND");

    let read_restored = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "restored-entry"}),
    ));
    assert_rpc_ok(&read_restored);
}

#[test]
fn test_passmanager_root_import_rejects_unknown_mode() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let invalid = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "mode": "unknown",
            "folders": [],
            "entries": []
        }),
    ));
    assert_rpc_error(&invalid, "EMPTY_PAYLOAD");
}

#[test]
fn test_passmanager_root_import_accepts_null_folder_path_as_root() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": ["ops"],
            "entries": [
                {
                    "id": "root-entry",
                    "title": "Root Entry",
                    "folderPath": serde_json::Value::Null,
                    "username": "root-user"
                }
            ]
        }),
    ));
    assert_rpc_ok(&imported);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");
    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    let imported_entry = entries
        .iter()
        .find(|entry| entry.get("id").and_then(|v| v.as_str()) == Some("root-entry"))
        .expect("root entry in export");
    assert_eq!(
        imported_entry.get("folderPath"),
        Some(&serde_json::Value::Null)
    );
}

#[test]
fn test_passmanager_secret_read_requires_entry_id() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let outside = router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name": "outside"}),
    ));
    assert_rpc_ok(&outside);
    let outside_node_id = get_node_id(&outside);

    let denied = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({"node_id": outside_node_id}),
    ));
    assert_rpc_error(&denied, "EMPTY_PAYLOAD");
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
    assert_rpc_error(&resp, "EMPTY_PAYLOAD");
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
    assert_rpc_error(&resp, "EMPTY_PAYLOAD");
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
    assert_rpc_error(&resp, "OTP_SECRET_NOT_FOUND");
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
    assert_rpc_error(&resp, "OTP_SECRET_NOT_FOUND");
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
    assert_rpc_error(&resp, "EMPTY_PAYLOAD");
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
    assert_rpc_error(&resp, "EMPTY_PAYLOAD");
}

#[test]
fn test_passmanager_entry_save_accepts_icon_ref_and_exports_icon_ref() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let saved = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "icon-entry-1",
            "title": "Icon Entry",
            "icon_ref": SAMPLE_ENTRY_ICON_REF
        }),
    ));
    assert_rpc_ok(&saved);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");
    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    let entry = entries
        .iter()
        .find(|item| item.get("id").and_then(|v| v.as_str()) == Some("icon-entry-1"))
        .expect("icon entry in export");
    assert_eq!(
        entry.get("iconRef").and_then(|v| v.as_str()),
        Some(SAMPLE_ENTRY_ICON_REF)
    );
}

#[test]
fn test_passmanager_meta_update_keeps_secret_icon_and_otp_links() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let put_icon = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put_icon);
    let icon_ref = put_icon
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("icon_ref")
        .to_string();

    let entry_id = "wave3-entry-1";
    let otp_id = "otp-wave3-1";

    let created = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": entry_id,
            "title": "Wave3 Entry",
            "username": "alice",
            "icon_ref": icon_ref.clone(),
            "otps": [
                {
                    "id": otp_id,
                    "label": "Main",
                    "algorithm": "SHA1",
                    "digits": 6,
                    "period": 30,
                    "encoding": "base32",
                    "type": "TOTP"
                }
            ]
        }),
    ));
    assert_rpc_ok(&created);

    let saved_password = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "password",
            "value": "pw-wave3"
        }),
    ));
    assert_rpc_ok(&saved_password);

    let saved_note = router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "note",
            "value": "note-wave3"
        }),
    ));
    assert_rpc_ok(&saved_note);

    let set_otp_secret = router.handle(&RpcRequest::new(
        "passmanager:otp:setSecret",
        serde_json::json!({
            "otp_id": otp_id,
            "secret": "JBSWY3DPEHPK3PXP",
            "encoding": "base32",
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30
        }),
    ));
    assert_rpc_ok(&set_otp_secret);

    let otp_before = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "otp_id": otp_id, "ts": 0}),
    ));
    assert_rpc_ok(&otp_before);

    let meta_only_update = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "entry_id": entry_id,
            "title": "Wave3 Entry Updated",
            "username": "alice.updated",
            "urls": ["https://updated.local"]
        }),
    ));
    assert_rpc_ok(&meta_only_update);

    let read_password = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "password"
        }),
    ));
    assert_rpc_ok(&read_password);
    assert_eq!(
        read_password
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("pw-wave3")
    );

    let read_note = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "note"
        }),
    ));
    assert_rpc_ok(&read_note);
    assert_eq!(
        read_note
            .result()
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_str()),
        Some("note-wave3")
    );

    let otp_after = router.handle(&RpcRequest::new(
        "passmanager:otp:generate",
        serde_json::json!({"entry_id": entry_id, "otp_id": otp_id, "ts": 0}),
    ));
    assert_rpc_ok(&otp_after);
    let otp_code = otp_after
        .result()
        .and_then(|r| r.get("otp"))
        .and_then(|v| v.as_str())
        .expect("otp code");
    assert_eq!(otp_code.len(), 6);
    assert!(otp_code.chars().all(|c| c.is_ascii_digit()));

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");
    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    let entry = entries
        .iter()
        .find(|item| item.get("id").and_then(|v| v.as_str()) == Some(entry_id))
        .expect("entry in export");

    assert_eq!(
        entry.get("title").and_then(|v| v.as_str()),
        Some("Wave3 Entry Updated")
    );
    assert_eq!(
        entry.get("iconRef").and_then(|v| v.as_str()),
        Some(icon_ref.as_str())
    );
    let otps = entry
        .get("otps")
        .and_then(|v| v.as_array())
        .expect("otps in export");
    assert!(otps
        .iter()
        .any(|item| item.get("id").and_then(|v| v.as_str()) == Some(otp_id)));

    let fetched_icon = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": icon_ref}),
    ));
    assert_rpc_ok(&fetched_icon);
}

#[test]
fn test_passmanager_root_import_accepts_folders_meta_payload() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": ["/imported"],
            "folders_meta": [{"path": "/imported", "icon_ref": SAMPLE_FOLDER_ICON_REF}],
            "entries": [
                {
                    "id": "icon-import-1",
                    "title": "Imported Icon Entry",
                    "folderPath": "/imported",
                    "iconRef": SAMPLE_ENTRY_ICON_REF
                }
            ]
        }),
    ));
    assert_rpc_ok(&imported);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let root = exported
        .result()
        .and_then(|r| r.get("root"))
        .expect("root in export response");
    let entries = root
        .get("entries")
        .and_then(|v| v.as_array())
        .expect("entries");
    let entry = entries
        .iter()
        .find(|item| item.get("id").and_then(|v| v.as_str()) == Some("icon-import-1"))
        .expect("imported icon entry in export");
    assert_eq!(
        entry.get("iconRef").and_then(|v| v.as_str()),
        Some(SAMPLE_ENTRY_ICON_REF)
    );

    let folders_meta = root
        .get("foldersMeta")
        .and_then(|v| v.as_array())
        .expect("foldersMeta");
    let imported_folder_meta = folders_meta
        .iter()
        .find(|item| item.get("path").and_then(|v| v.as_str()) == Some("/imported"))
        .expect("imported folder meta in export");
    assert_eq!(
        imported_folder_meta.get("iconRef").and_then(|v| v.as_str()),
        Some(SAMPLE_FOLDER_ICON_REF)
    );
}

#[test]
fn test_passmanager_icon_put_get_and_deduplicate_roundtrip() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let put_first = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put_first);

    let icon_ref = put_first
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("icon_ref from first put")
        .to_string();
    assert!(icon_ref.starts_with("sha256:"));

    let put_second = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put_second);
    assert_eq!(
        put_second
            .result()
            .and_then(|r| r.get("icon_ref"))
            .and_then(|v| v.as_str()),
        Some(icon_ref.as_str())
    );

    let fetched = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": icon_ref}),
    ));
    assert_rpc_ok(&fetched);
    assert_eq!(
        fetched
            .result()
            .and_then(|r| r.get("mime_type"))
            .and_then(|v| v.as_str()),
        Some("image/png")
    );

    let fetched_base64 = fetched
        .result()
        .and_then(|r| r.get("content_base64"))
        .and_then(|v| v.as_str())
        .expect("content_base64 from icon:get");
    let put_third = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": fetched_base64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put_third);
    assert_eq!(
        put_third
            .result()
            .and_then(|r| r.get("icon_ref"))
            .and_then(|v| v.as_str()),
        put_second
            .result()
            .and_then(|r| r.get("icon_ref"))
            .and_then(|v| v.as_str())
    );
}

#[test]
fn test_passmanager_icon_list_returns_uploaded_icons() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let first_put = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&first_put);
    let first_ref = first_put
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("first icon ref")
        .to_string();

    let second_put = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_B_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&second_put);
    let second_ref = second_put
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("second icon ref")
        .to_string();

    let listed = router.handle(&RpcRequest::new(
        "passmanager:icon:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed);

    let icons = listed
        .result()
        .and_then(|r| r.get("icons"))
        .and_then(|v| v.as_array())
        .expect("icons in passmanager:icon:list response");

    assert!(
        icons
            .iter()
            .any(|item| item.get("icon_ref").and_then(|v| v.as_str()) == Some(first_ref.as_str())),
        "first icon_ref must be present in list response"
    );
    assert!(
        icons
            .iter()
            .any(|item| item.get("icon_ref").and_then(|v| v.as_str()) == Some(second_ref.as_str())),
        "second icon_ref must be present in list response"
    );

    for icon in icons {
        assert!(icon.get("mime_type").and_then(|v| v.as_str()).is_some());
        assert!(icon.get("width").and_then(|v| v.as_u64()).is_some());
        assert!(icon.get("height").and_then(|v| v.as_u64()).is_some());
        assert!(icon.get("bytes").and_then(|v| v.as_u64()).is_some());
        assert!(icon.get("created_at").and_then(|v| v.as_u64()).is_some());
        assert!(icon.get("updated_at").and_then(|v| v.as_u64()).is_some());
    }
}

#[test]
fn test_passmanager_group_set_meta_set_reset_and_export_roundtrip() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let ensure_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/icons"}),
    ));
    assert_rpc_ok(&ensure_group);

    let icon_put = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&icon_put);
    let icon_ref = icon_put
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("icon_ref")
        .to_string();

    let set_meta = router.handle(&RpcRequest::new(
        "passmanager:group:setMeta",
        serde_json::json!({"path": "/icons", "icon_ref": icon_ref}),
    ));
    assert_rpc_ok(&set_meta);

    let exported_after_set = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported_after_set);

    let folders_meta_after_set = exported_after_set
        .result()
        .and_then(|r| r.get("root"))
        .and_then(|root| root.get("foldersMeta"))
        .and_then(|v| v.as_array())
        .expect("foldersMeta in export after set");
    let icon_group_meta = folders_meta_after_set
        .iter()
        .find(|item| item.get("path").and_then(|v| v.as_str()) == Some("/icons"))
        .expect("/icons meta exists after set");
    assert!(
        icon_group_meta
            .get("iconRef")
            .and_then(|v| v.as_str())
            .is_some(),
        "iconRef must exist after set"
    );

    let reset_meta = router.handle(&RpcRequest::new(
        "passmanager:group:setMeta",
        serde_json::json!({"path": "/icons", "icon_ref": serde_json::Value::Null}),
    ));
    assert_rpc_ok(&reset_meta);

    let exported_after_reset = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported_after_reset);

    let folders_meta_after_reset = exported_after_reset
        .result()
        .and_then(|r| r.get("root"))
        .and_then(|root| root.get("foldersMeta"))
        .and_then(|v| v.as_array())
        .expect("foldersMeta in export after reset");
    assert!(
        !folders_meta_after_reset
            .iter()
            .any(|item| item.get("path").and_then(|v| v.as_str()) == Some("/icons")),
        "foldersMeta should not contain /icons after reset"
    );
}

#[test]
fn test_passmanager_icon_gc_deletes_orphans_and_keeps_referenced() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let keep_put = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&keep_put);
    let keep_ref = keep_put
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("keep icon ref")
        .to_string();

    let orphan_put = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_B_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&orphan_put);
    let orphan_ref = orphan_put
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("orphan icon ref")
        .to_string();

    let ensure_group = router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/keep"}),
    ));
    assert_rpc_ok(&ensure_group);

    let set_group_icon = router.handle(&RpcRequest::new(
        "passmanager:group:setMeta",
        serde_json::json!({"path": "/keep", "icon_ref": keep_ref}),
    ));
    assert_rpc_ok(&set_group_icon);

    let gc_first = router.handle(&RpcRequest::new(
        "passmanager:icon:gc",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&gc_first);
    assert_eq!(
        gc_first
            .result()
            .and_then(|r| r.get("deleted"))
            .and_then(|v| v.as_u64()),
        Some(1)
    );

    let keep_get = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": keep_put
            .result()
            .and_then(|r| r.get("icon_ref"))
            .and_then(|v| v.as_str())}),
    ));
    assert_rpc_ok(&keep_get);

    let orphan_get = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": orphan_ref}),
    ));
    assert_rpc_error(&orphan_get, "NODE_NOT_FOUND");

    let gc_second = router.handle(&RpcRequest::new(
        "passmanager:icon:gc",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&gc_second);
    assert_eq!(
        gc_second
            .result()
            .and_then(|r| r.get("deleted"))
            .and_then(|v| v.as_u64()),
        Some(0)
    );
}

#[test]
fn test_passmanager_icons_persist_across_lock_unlock() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    // Upload an icon
    let put_resp = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put_resp);
    let icon_ref = put_resp
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("icon_ref from put")
        .to_string();

    // Verify icon can be retrieved in current session
    let get_before = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": &icon_ref}),
    ));
    assert_rpc_ok(&get_before);
    let content_before = get_before
        .result()
        .and_then(|r| r.get("content_base64"))
        .and_then(|v| v.as_str())
        .expect("content_base64 before lock")
        .to_string();

    // Lock vault
    let lock_resp = router.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
    assert_rpc_ok(&lock_resp);

    // Unlock vault again
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    // Verify icon can be retrieved after unlock
    let get_after = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": &icon_ref}),
    ));
    assert_rpc_ok(&get_after);
    let content_after = get_after
        .result()
        .and_then(|r| r.get("content_base64"))
        .and_then(|v| v.as_str())
        .expect("content_base64 after lock")
        .to_string();

    assert_eq!(
        content_before, content_after,
        "icon content must be identical after lock/unlock"
    );

    // Do a second lock/unlock cycle
    let lock_resp2 = router.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
    assert_rpc_ok(&lock_resp2);
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let get_after2 = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": &icon_ref}),
    ));
    assert_rpc_ok(&get_after2);
    let content_after2 = get_after2
        .result()
        .and_then(|r| r.get("content_base64"))
        .and_then(|v| v.as_str())
        .expect("content_base64 after second lock")
        .to_string();
    assert_eq!(
        content_before, content_after2,
        "icon content must survive multiple lock/unlock cycles"
    );
}
