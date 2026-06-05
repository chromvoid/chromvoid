use super::support::*;

#[test]
fn test_passmanager_root_import_preserves_tags() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": ["/imported"],
            "entries": [
                {
                    "id": "import-tag-entry",
                    "title": "Imported Tagged Entry",
                    "folderPath": "/imported",
                    "username": "import-user",
                    "tags": [" #Imported ", "Client   A", "client a"]
                }
            ]
        }),
    ));
    assert_rpc_ok(&imported);

    let read = router.handle(&RpcRequest::new(
        "passmanager:entry:read",
        serde_json::json!({"entry_id": "import-tag-entry"}),
    ));
    assert_rpc_ok(&read);
    let entry = read.result().and_then(|r| r.get("entry")).expect("entry");
    assert_eq!(entry_tags(entry), vec!["Imported", "Client A"]);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    let exported_entry =
        get_root_entry_by_id(&exported, "import-tag-entry").expect("exported imported entry");
    assert_eq!(entry_tags(exported_entry), vec!["Imported", "Client A"]);
    let root_tags = exported
        .result()
        .and_then(|r| r.get("root"))
        .and_then(|root| root.get("tags"))
        .and_then(|tags| tags.as_array())
        .expect("root tags");
    assert_eq!(
        root_tags
            .iter()
            .map(|tag| tag.as_str().expect("tag string"))
            .collect::<Vec<_>>(),
        vec!["Client A", "Imported"]
    );
}

#[test]
fn test_passmanager_root_import_export_preserves_zero_use_tags() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": [],
            "tags": ["Zero Use", " #Work ", "work"],
            "entries": []
        }),
    ));
    assert_rpc_ok(&imported);

    let exported = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);

    let root_tags = exported
        .result()
        .and_then(|r| r.get("root"))
        .and_then(|root| root.get("tags"))
        .and_then(|tags| tags.as_array())
        .expect("root tags");
    assert_eq!(
        root_tags
            .iter()
            .map(|tag| tag.as_str().expect("tag string"))
            .collect::<Vec<_>>(),
        vec!["Work", "Zero Use"]
    );
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
fn test_passmanager_root_import_survives_fresh_router() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": ["/persisted"],
            "entries": [{
                "id": "persisted-import-entry",
                "title": "Persisted Import Entry",
                "folderPath": "/persisted"
            }]
        }),
    ));
    assert_rpc_ok(&imported);
    drop(router);

    let storage = chromvoid_core::storage::Storage::new(tmp.path()).expect("storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));
    let exported = reopened.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported);
    assert!(
        get_root_entry_by_id(&exported, "persisted-import-entry").is_some(),
        "root import entry must survive a fresh router"
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
    assert_eq!(
        denied.error_message(),
        Some("destructive root import requires allow_destructive=true")
    );
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
    assert_eq!(
        invalid.error_message(),
        Some("mode must be one of: merge, replace, restore")
    );
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
fn test_passmanager_root_import_accepts_folders_meta_payload() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let imported = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        serde_json::json!({
            "folders": ["/imported"],
            "folders_meta": [{
                "path": "/imported",
                "icon_ref": SAMPLE_FOLDER_ICON_REF,
                "description": "Imported folder description"
            }],
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
    assert_eq!(
        imported_folder_meta
            .get("description")
            .and_then(|v| v.as_str()),
        Some("Imported folder description")
    );
}
