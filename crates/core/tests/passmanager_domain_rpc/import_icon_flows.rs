use super::support::*;
use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};

fn asset(base64: &str) -> Value {
    let bytes = general_purpose::STANDARD.decode(base64).unwrap();
    json!({"content_base64":base64,"mime_type":"image/png",
        "icon_ref":format!("sha256:{}",chromvoid_core::crypto::sha256_hex(&bytes))})
}
fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let result = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&result);
    result.result().unwrap().clone()
}
fn document(icon: Value) -> Value {
    json!({"folders":["Imported"],"folders_meta":[{"path":"Imported","icon_ref":icon["icon_ref"]}],
        "entries":[{"id":"with-icon","title":"Imported entry","folderPath":"Imported",
        "icon_ref":icon["icon_ref"],"password":"synthetic"}],"icons":[icon]})
}

#[test]
fn import_icons_review_is_read_only_and_commit_keeps_assets_with_entry_and_group() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic icons"));
    let icon = asset(PNG_ICON_A_BASE64);
    let mut data = document(icon.clone());
    let before = super::import_review_flows::storage_files(root.path());
    let review = call(&mut router, "passmanager:root:import:preview", data.clone());
    assert_eq!(
        super::import_review_flows::storage_files(root.path()),
        before
    );
    assert_eq!(
        call(&mut router, "passmanager:icon:list", json!({}))["icons"],
        json!([])
    );
    data["expected_revision"] = review["revision"].clone();
    call(&mut router, "passmanager:root:import", data);
    let saved = call(&mut router, "passmanager:root:export", json!({}));
    assert_eq!(saved["root"]["entries"][0]["icon_ref"], icon["icon_ref"]);
    assert_eq!(saved["root"]["foldersMeta"][0]["iconRef"], icon["icon_ref"]);
    let read = call(
        &mut router,
        "passmanager:icon:get",
        json!({"icon_ref":icon["icon_ref"]}),
    );
    assert_eq!(
        general_purpose::STANDARD_NO_PAD
            .decode(read["content_base64"].as_str().unwrap())
            .unwrap(),
        general_purpose::STANDARD.decode(PNG_ICON_A_BASE64).unwrap()
    );
    call(&mut router, "passmanager:root:import", document(icon));
    assert_eq!(
        call(&mut router, "passmanager:icon:list", json!({}))["icons"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn import_icons_merge_preserves_other_assets_and_replace_recreates_supplied_digest() {
    let (mut router, _root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic icon merge"));
    let mut first = asset(PNG_ICON_A_BASE64);
    first["background_color"] = json!("#ffee00");
    call(&mut router, "passmanager:icon:put", first.clone());
    let second = asset(PNG_ICON_B_BASE64);
    call(&mut router, "passmanager:icon:put", second.clone());
    let mut data = document(asset(PNG_ICON_A_BASE64));
    call(&mut router, "passmanager:root:import", data.clone());
    let icons = call(&mut router, "passmanager:icon:list", json!({}));
    assert_eq!(icons["icons"].as_array().unwrap().len(), 2);
    let first_read = call(
        &mut router,
        "passmanager:icon:get",
        json!({"icon_ref":first["icon_ref"]}),
    );
    assert_eq!(first_read["background_color"], "#ffee00");
    data["mode"] = json!("replace");
    data["allow_destructive"] = json!(true);
    call(&mut router, "passmanager:root:import", data);
    call(
        &mut router,
        "passmanager:icon:get",
        json!({"icon_ref":first["icon_ref"]}),
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:icon:get",
            json!({"icon_ref":second["icon_ref"]}),
        )),
        "NODE_NOT_FOUND",
    );
    assert_eq!(
        call(&mut router, "passmanager:icon:list", json!({}))["icons"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn import_icons_invalid_assets_cannot_mutate_or_authorize_replacement() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic invalid icons"));
    call(
        &mut router,
        "passmanager:root:import",
        document(asset(PNG_ICON_A_BASE64)),
    );
    let before = super::import_review_flows::storage_files(root.path());
    let valid = asset(PNG_ICON_B_BASE64);
    let mut mismatched = valid.clone();
    mismatched["icon_ref"] = json!(SAMPLE_ENTRY_ICON_REF);
    for icons in [
        json!({}),
        json!([null]),
        json!([mismatched]),
        json!([valid.clone(), valid]),
        json!([{"content_base64":"not base64","icon_ref":SAMPLE_ENTRY_ICON_REF}]),
    ] {
        let mut data = document(asset(PNG_ICON_A_BASE64));
        data["icons"] = icons;
        data["mode"] = json!("replace");
        data["allow_destructive"] = json!(true);
        for command in ["passmanager:root:import:preview", "passmanager:root:import"] {
            assert!(!router
                .handle(&RpcRequest::new(command, data.clone()))
                .is_ok());
            assert_eq!(
                super::import_review_flows::storage_files(root.path()),
                before
            );
        }
    }
}

#[test]
fn import_icon_metadata_change_invalidates_review() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic stale icons"));
    let icon = asset(PNG_ICON_A_BASE64);
    call(&mut router, "passmanager:icon:put", icon.clone());
    let mut data = document(icon.clone());
    let review = call(&mut router, "passmanager:root:import:preview", data.clone());
    call(
        &mut router,
        "passmanager:icon:setMeta",
        json!({"icon_ref":icon["icon_ref"],"background_color":"#123456"}),
    );
    let before = super::import_review_flows::storage_files(root.path());
    data["expected_revision"] = review["revision"].clone();
    assert_rpc_error(
        &router.handle(&RpcRequest::new("passmanager:root:import", data)),
        "SYNC_CONFLICT",
    );
    assert_eq!(
        super::import_review_flows::storage_files(root.path()),
        before
    );
}

#[test]
fn import_icons_enforce_count_and_combined_asset_budget_before_writes() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic icon limits"));
    let before = super::import_review_flows::storage_files(root.path());
    let too_many = json!({"entries":[],"folders":[],"icons":vec![Value::Null;10_001]});
    let result = router.handle(&RpcRequest::new("passmanager:root:import", too_many));
    assert_eq!(result.error_message(), Some("Too many imported icons"));
    let icons: Vec<_> = (0..129)
        .map(|index| {
            // Valid, distinct 64 KiB SVG assets exercise the combined budget, not the per-icon limit.
            let prefix = format!(
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"><!--{index:03}"
            );
            let svg = format!("{prefix}{}--></svg>", "x".repeat(65_536 - prefix.len() - 9));
            assert_eq!(svg.len(), 65_536);
            json!({"content_base64":general_purpose::STANDARD.encode(svg.as_bytes()),
            "mime_type":"image/svg+xml",
            "icon_ref":format!("sha256:{}",chromvoid_core::crypto::sha256_hex(svg.as_bytes()))})
        })
        .collect();
    let result = router.handle(&RpcRequest::new(
        "passmanager:root:import",
        json!({"entries":[],"folders":[],"icons":icons}),
    ));
    assert_eq!(result.error_message(), Some("Imported icons exceed 8 MiB"));
    assert_eq!(
        super::import_review_flows::storage_files(root.path()),
        before
    );
}
