use super::support::*;

#[test]
fn test_passmanager_icon_put_get_and_deduplicate_roundtrip() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let put_first = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({
            "content_base64": PNG_ICON_A_BASE64,
            "mime_type": "image/png",
            "background_color": "#FfEE00"
        }),
    ));
    assert_rpc_ok(&put_first);

    let icon_ref = put_first
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("icon_ref from first put")
        .to_string();
    assert!(icon_ref.starts_with("sha256:"));
    assert_eq!(
        put_first
            .result()
            .and_then(|r| r.get("background_color"))
            .and_then(|v| v.as_str()),
        Some("#ffee00")
    );

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
    assert_eq!(
        put_second
            .result()
            .and_then(|r| r.get("background_color"))
            .and_then(|v| v.as_str()),
        Some("#ffee00")
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
    assert_eq!(
        fetched
            .result()
            .and_then(|r| r.get("background_color"))
            .and_then(|v| v.as_str()),
        Some("#ffee00")
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
        serde_json::json!({
            "content_base64": PNG_ICON_A_BASE64,
            "mime_type": "image/png",
            "background_color": "#123ABC"
        }),
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
    let first_item = icons
        .iter()
        .find(|item| item.get("icon_ref").and_then(|v| v.as_str()) == Some(first_ref.as_str()))
        .expect("first icon in list");
    assert_eq!(
        first_item.get("background_color").and_then(|v| v.as_str()),
        Some("#123abc")
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
fn test_passmanager_icon_set_meta_updates_background_without_touching_timestamps() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let put = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        serde_json::json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put);
    let icon_ref = put
        .result()
        .and_then(|r| r.get("icon_ref"))
        .and_then(|v| v.as_str())
        .expect("icon_ref")
        .to_string();

    let listed_before = router.handle(&RpcRequest::new(
        "passmanager:icon:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed_before);
    let updated_at_before = listed_before
        .result()
        .and_then(|r| r.get("icons"))
        .and_then(|v| v.as_array())
        .and_then(|icons| icons.first())
        .and_then(|icon| icon.get("updated_at"))
        .and_then(|v| v.as_u64())
        .expect("updated_at before setMeta");

    let set_meta = router.handle(&RpcRequest::new(
        "passmanager:icon:setMeta",
        serde_json::json!({"icon_ref": icon_ref, "background_color": "#ABCDEF"}),
    ));
    assert_rpc_ok(&set_meta);

    let fetched = router.handle(&RpcRequest::new(
        "passmanager:icon:get",
        serde_json::json!({"icon_ref": icon_ref}),
    ));
    assert_rpc_ok(&fetched);
    assert_eq!(
        fetched
            .result()
            .and_then(|r| r.get("background_color"))
            .and_then(|v| v.as_str()),
        Some("#abcdef")
    );

    let listed_after = router.handle(&RpcRequest::new(
        "passmanager:icon:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&listed_after);
    let updated_at_after = listed_after
        .result()
        .and_then(|r| r.get("icons"))
        .and_then(|v| v.as_array())
        .and_then(|icons| icons.first())
        .and_then(|icon| icon.get("updated_at"))
        .and_then(|v| v.as_u64())
        .expect("updated_at after setMeta");
    assert_eq!(updated_at_before, updated_at_after);

    let invalid = router.handle(&RpcRequest::new(
        "passmanager:icon:setMeta",
        serde_json::json!({"icon_ref": icon_ref, "background_color": "blue"}),
    ));
    assert_rpc_error(&invalid, "EMPTY_PAYLOAD");
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
        serde_json::json!({
            "path": "/icons",
            "icon_ref": icon_ref,
            "description": "Folder icon metadata"
        }),
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
    assert_eq!(
        icon_group_meta.get("description").and_then(|v| v.as_str()),
        Some("Folder icon metadata")
    );

    let update_description = router.handle(&RpcRequest::new(
        "passmanager:group:setMeta",
        serde_json::json!({"path": "/icons", "description": "Updated description"}),
    ));
    assert_rpc_ok(&update_description);

    let exported_after_description_update = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported_after_description_update);

    let folders_meta_after_description_update = exported_after_description_update
        .result()
        .and_then(|r| r.get("root"))
        .and_then(|root| root.get("foldersMeta"))
        .and_then(|v| v.as_array())
        .expect("foldersMeta in export after description update");
    let updated_meta = folders_meta_after_description_update
        .iter()
        .find(|item| item.get("path").and_then(|v| v.as_str()) == Some("/icons"))
        .expect("/icons meta exists after description update");
    assert!(
        updated_meta
            .get("iconRef")
            .and_then(|v| v.as_str())
            .is_some(),
        "iconRef must be preserved when updating description only"
    );
    assert_eq!(
        updated_meta.get("description").and_then(|v| v.as_str()),
        Some("Updated description")
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
    let description_only_meta = folders_meta_after_reset
        .iter()
        .find(|item| item.get("path").and_then(|v| v.as_str()) == Some("/icons"))
        .expect("/icons meta should remain after icon reset because description still exists");
    assert!(description_only_meta.get("iconRef").is_none());
    assert_eq!(
        description_only_meta
            .get("description")
            .and_then(|v| v.as_str()),
        Some("Updated description")
    );

    let clear_description = router.handle(&RpcRequest::new(
        "passmanager:group:setMeta",
        serde_json::json!({"path": "/icons", "description": serde_json::Value::Null}),
    ));
    assert_rpc_ok(&clear_description);

    let exported_after_description_clear = router.handle(&RpcRequest::new(
        "passmanager:root:export",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&exported_after_description_clear);

    let folders_meta_after_description_clear = exported_after_description_clear
        .result()
        .and_then(|r| r.get("root"))
        .and_then(|root| root.get("foldersMeta"))
        .and_then(|v| v.as_array())
        .expect("foldersMeta in export after description clear");
    assert!(
        !folders_meta_after_description_clear
            .iter()
            .any(|item| item.get("path").and_then(|v| v.as_str()) == Some("/icons")),
        "foldersMeta should not contain /icons after icon and description are cleared"
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
