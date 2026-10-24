use super::support::*;
use chromvoid_core::credential_import::CredentialImportMode;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

pub(super) fn storage_files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn visit(root: &Path, path: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in std::fs::read_dir(path).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(root, &path, files);
            } else {
                files.insert(
                    path.strip_prefix(root).unwrap().to_owned(),
                    std::fs::read(&path).unwrap(),
                );
            }
        }
    }
    let mut files = BTreeMap::new();
    visit(root, root, &mut files);
    files
}

fn replacement() -> Value {
    json!({"mode":"replace","folders":["Imported"],"entries":[{
        "id":"imported", "title":"Imported login", "folderPath":"Imported", "password":"synthetic import secret",
        "sshKeys":[{"id":"legacy-key","type":"ed25519","fingerprint":"SHA256:synthetic"}]
    }]})
}

fn preview(router: &mut RpcRouter, data: Value) -> Value {
    let response = router.handle(&RpcRequest::new("passmanager:root:import:preview", data));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}

#[test]
fn prepared_import_owns_caller_mode_and_exact_reviewed_content_without_writes() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "prepared import vault"));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({
            "entry_id":"existing", "title":"Existing", "secrets":{"password":"retained secret"}
        }),
    )));
    let before = storage_files(root.path());
    let mut source = replacement();
    source["allow_destructive"] = json!(true);
    source["allowDestructive"] = json!(true);
    source["expected_revision"] = json!("source must not supply review authority");
    let mut bytes = serde_json::to_vec(&source).unwrap();
    let prepared = router
        .prepare_credential_import(&bytes, CredentialImportMode::Merge, None)
        .unwrap();
    assert_eq!(prepared.preview().mode, "merge");
    assert_eq!(prepared.preview().entry_count, 1);
    assert_eq!(storage_files(root.path()), before);
    bytes.fill(0); // Commit must use the reviewed snapshot, not the source again.
    let request = prepared.into_commit_request();
    assert_eq!(request.data["mode"], "merge");
    assert!(request.data.get("allowDestructive").is_none());
    assert_rpc_ok(&router.handle(&request));
    let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_eq!(
        get_root_entry_by_id(&exported, "existing").unwrap()["password"],
        "retained secret"
    );
    assert_eq!(
        get_root_entry_by_id(&exported, "imported").unwrap()["password"],
        "synthetic import secret"
    );
}

#[test]
fn dropped_and_stale_prepared_imports_cannot_replace_credentials() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "prepared review lifecycle"));
    let bytes = serde_json::to_vec(&replacement()).unwrap();
    let before = storage_files(root.path());
    let unused = router
        .prepare_credential_import(&bytes, CredentialImportMode::Replace, None)
        .unwrap();
    assert_eq!(unused.preview().mode, "replace");
    drop(unused);
    assert_eq!(storage_files(root.path()), before);
    let stale = router
        .prepare_credential_import(&bytes, CredentialImportMode::Restore, None)
        .unwrap();
    assert_eq!(stale.preview().mode, "restore");
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({
            "entry_id":"later", "title":"Later", "secrets":{"password":"later secret"}
        }),
    )));
    let changed = storage_files(root.path());
    assert_eq!(
        router.handle(&stale.into_commit_request()).code(),
        Some("SYNC_CONFLICT")
    );
    assert_eq!(storage_files(root.path()), changed);
    let current = router
        .prepare_credential_import(&bytes, CredentialImportMode::Replace, None)
        .unwrap();
    assert_rpc_ok(&router.handle(&current.into_commit_request()));
    let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert!(get_root_entry_by_id(&exported, "later").is_none());
    assert!(get_root_entry_by_id(&exported, "imported").is_some());
}

#[test]
fn import_preview_validates_without_writing_or_authorizing_replacement() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "review vault");
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({
        "entry_id":"existing", "title":"Existing", "secrets":{"password":"synthetic existing secret"}
    }))));
    let before = storage_files(root.path());
    let review = preview(&mut router, replacement());
    assert_eq!(review["mode"], "replace");
    assert_eq!(review["entry_count"], 1);
    assert_eq!(review["folder_count"], 1);
    assert_eq!(review["ssh_key_count"], 1);
    assert_eq!(review.as_object().unwrap().len(), 7);
    assert_eq!(review["created_entry_count"], 1);
    assert_eq!(review["updated_entry_count"], 0);
    assert_eq!(review["revision"].as_str().unwrap().len(), 64);
    assert_eq!(storage_files(root.path()), before);
    let mut request = replacement();
    request["expected_revision"] = review["revision"].clone();
    assert_eq!(
        router
            .handle(&RpcRequest::new("passmanager:root:import", request.clone()))
            .code(),
        Some("ACCESS_DENIED")
    );
    assert_eq!(storage_files(root.path()), before);
    request["allow_destructive"] = json!(true);
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", request)));
    let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_rpc_ok(&exported);
    let entries = exported.result().unwrap()["root"]["entries"]
        .as_array()
        .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["id"], "imported");
    assert_eq!(entries[0]["password"], "synthetic import secret");
}

#[test]
fn import_review_is_invalidated_by_password_and_legacy_otp_changes() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "review vault");
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({
            "entry_id":"existing", "title":"Existing", "secrets":{"password":"before"}
        }),
    )));
    for change in [
        RpcRequest::new(
            "passmanager:secret:save",
            json!({"entry_id":"existing", "secret_type":"password", "value":"after"}),
        ),
        RpcRequest::new(
            "passmanager:otp:setSecret",
            json!({"entry_id":"existing", "label":"test", "secret":"JBSWY3DPEHPK3PXP", "encoding":"base32", "algorithm":"SHA1", "digits":6, "period":30}),
        ),
    ] {
        let review = preview(&mut router, replacement());
        assert_rpc_ok(&router.handle(&change));
        let after_change = storage_files(root.path());
        let mut request = replacement();
        request["allow_destructive"] = json!(true);
        request["expected_revision"] = review["revision"].clone();
        assert_eq!(
            router
                .handle(&RpcRequest::new("passmanager:root:import", request))
                .code(),
            Some("SYNC_CONFLICT")
        );
        assert_eq!(storage_files(root.path()), after_change);
    }
}

#[test]
fn invalid_preview_and_malformed_revision_do_not_mutate_storage() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "review vault");
    let before = storage_files(root.path());
    let bad = json!({"folders":[],"entries":[{"title":"Bad card","entry_type":"payment_card","card_pan":"invalid"}]});
    let preview = router.handle(&RpcRequest::new(
        "passmanager:root:import:preview",
        bad.clone(),
    ));
    let commit = router.handle(&RpcRequest::new("passmanager:root:import", bad));
    assert!(!preview.is_ok());
    assert_eq!(preview.code(), commit.code());
    for revision in [Value::Null, json!(1), json!(""), json!("x".repeat(64))] {
        let mut request = replacement();
        request["allow_destructive"] = json!(true);
        request["expected_revision"] = revision;
        assert_eq!(
            router
                .handle(&RpcRequest::new("passmanager:root:import", request))
                .code(),
            Some("EMPTY_PAYLOAD")
        );
    }
    assert_eq!(storage_files(root.path()), before);
    assert_rpc_ok(&router.handle(&RpcRequest::new("vault:lock", json!({}))));
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:root:import:preview",
                replacement()
            ))
            .code(),
        Some("VAULT_REQUIRED")
    );
}

#[test]
fn versioned_credential_documents_preserve_exported_login_card_and_otp_fields() {
    for version in 1..=4 {
        let (mut router, root) = create_test_router();
        unlock_vault(&mut router, "document fixture");
        let mut document = json!({"version":version, "folders":["Personal"],
        "foldersMeta":[{"path":"Personal","description":"Imported group"}],
        "tags":["Work"], "tagMeta":{"work":{"color_id":"blue"}},
        "entries":[
            {"id":"login","entryType":"login","title":"Login","folderPath":"Personal",
             "username":"alice","password":"synthetic-password","note":"synthetic note",
             "urls":[{"value":"https://example.org/login","match":"exact"}], "tags":["Work"],
             "otps":[{"id":"otp","label":"Main","secret":"JBSWY3DPEHPK3PXP", "encoding":"base32", "algorithm":"SHA1","digits":6,"period":30}]},
            {"id":"card","entryType":"payment_card","title":"Card","folderPath":null,
             "paymentCard":{"cardholderName":"Synthetic User","expMonth":12,"expYear":2030,"brand":"visa"},
             "cardPan":"4111111111111111","cardCvv":"123","note":"Card note"}
        ]});
        let before = storage_files(root.path());
        let reviewed = preview(&mut router, document.clone());
        assert_eq!(reviewed["entry_count"], 2);
        assert_eq!(storage_files(root.path()), before);
        document["expected_revision"] = reviewed["revision"].clone();
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", document)));
        let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
        assert_rpc_ok(&exported);
        let login = get_root_entry_by_id(&exported, "login").unwrap();
        assert_eq!(login["password"], "synthetic-password");
        assert_eq!(login["note"], "synthetic note");
        assert_eq!(login["username"], "alice");
        assert_eq!(login["otps"][0]["secret"], "JBSWY3DPEHPK3PXP");
        assert_eq!(login["urls"][0]["match"], "exact");
        let card = get_root_entry_by_id(&exported, "card").unwrap();
        assert_eq!(card["card_pan"], "4111111111111111");
        assert_eq!(card["card_cvv"], "123");
        assert_eq!(card["note"], "Card note");
    }
}

#[test]
fn unknown_document_versions_cannot_preview_or_modify_credentials() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "document fixture");
    let before = storage_files(root.path());
    for version in [json!(0), json!(5), json!("1"), Value::Null] {
        for command in ["passmanager:root:import:preview", "passmanager:root:import"] {
            let result = router.handle(&RpcRequest::new(command, json!({
                "version":version,"folders":[],"entries":[],"mode":"replace","allow_destructive":true
            })));
            assert_eq!(result.code(), Some("EMPTY_PAYLOAD"));
        }
    }
    assert_eq!(storage_files(root.path()), before);
}

#[test]
fn legacy_credential_document_preserves_groups_metadata_and_all_secret_types() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "legacy document fixture");
    let mut document: Value =
        serde_json::from_str(include_str!("fixtures/legacy-credentials.json")).unwrap();
    chromvoid_core::credential_import::normalize_json_document(&mut document).unwrap();
    let before = storage_files(root.path());
    let reviewed = preview(&mut router, document.clone());
    assert_eq!(reviewed["entry_count"], 3);
    assert_eq!(storage_files(root.path()), before);
    document["expected_revision"] = reviewed["revision"].clone();
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", document)));
    let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_rpc_ok(&exported);
    let root_login = get_root_entry_by_id(&exported, "root-login").unwrap();
    assert_eq!(root_login["password"], "synthetic-root-password");
    let login = get_root_entry_by_id(&exported, "group-login").unwrap();
    assert_eq!(login["folderPath"], "/Personal/Imported");
    assert_eq!(login["password"], "synthetic-group-password");
    assert_eq!(login["note"], "Group note");
    assert_eq!(login["otps"][0]["secret"], "JBSWY3DPEHPK3PXP");
    assert_eq!(login["urls"][0]["match"], "exact");
    assert_eq!(login["tags"], json!(["Work"]));
    let card = get_root_entry_by_id(&exported, "card").unwrap();
    assert_eq!(card["folderPath"], "/Personal/Imported");
    assert_eq!(card["card_pan"], "4111111111111111");
    assert_eq!(card["card_cvv"], "123");
    assert_eq!(card["note"], "Card note");
    let meta = exported.result().unwrap()["root"]["foldersMeta"]
        .as_array()
        .unwrap();
    assert!(meta
        .iter()
        .any(|group| group["path"] == "/Personal/Imported"
            && group["description"] == "Legacy group description"
            && group["iconRef"] == SAMPLE_FOLDER_ICON_REF));
    assert!(meta
        .iter()
        .any(|group| group["path"] == "/Empty" && group["description"] == "Keep this empty group"));
}

#[test]
fn malformed_legacy_structure_is_rejected_without_changing_input() {
    for mut document in [
        json!(null),
        json!([1]),
        json!([{"name":"Group"}]),
        json!([{"name":" ","entries":[]}]),
        json!([{"name":"Group","entries":[{"name":"Nested group","entries":[]}]}]),
        json!([{"title":"Valid first","password":"synthetic"},null]),
    ] {
        let original = document.clone();
        assert!(chromvoid_core::credential_import::normalize_json_document(&mut document).is_err());
        assert_eq!(document, original);
    }
    let mut current = replacement();
    let original = current.clone();
    chromvoid_core::credential_import::normalize_json_document(&mut current).unwrap();
    assert_eq!(current, original);
}

#[test]
fn import_merge_preserves_unrelated_group_metadata_while_replacement_discards_it() {
    for mode in ["merge", "replace", "restore"] {
        let (mut router, root) = create_test_router();
        unlock_vault(&mut router, "group metadata fixture");
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", json!({
            "folders":["Keep","Update"],"entries":[],
            "foldersMeta":[
                {"path":"Keep","description":"Keep this description","iconRef":SAMPLE_FOLDER_ICON_REF},
                {"path":"Update","description":"Old description"}
            ]
        }))));
        let mut document = json!({"mode":mode,"folders":["Update","New"],"entries":[],
            "foldersMeta":[{"path":"Update","description":"New description"},{"path":"New","iconRef":SAMPLE_ENTRY_ICON_REF}]});
        let before = storage_files(root.path());
        let reviewed = preview(&mut router, document.clone());
        assert_eq!(storage_files(root.path()), before);
        document["expected_revision"] = reviewed["revision"].clone();
        document["allow_destructive"] = json!(true);
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", document)));
        let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
        assert_rpc_ok(&exported);
        let meta = exported.result().unwrap()["root"]["foldersMeta"]
            .as_array()
            .unwrap();
        let preserved = meta.iter().find(|group| group["path"] == "/Keep");
        if mode == "merge" {
            let preserved = preserved.expect("Merge must retain unrelated group metadata");
            assert_eq!(preserved["description"], "Keep this description");
            assert_eq!(preserved["iconRef"], SAMPLE_FOLDER_ICON_REF);
        } else {
            assert!(preserved.is_none());
        }
        assert!(meta
            .iter()
            .any(|group| group["path"] == "/Update" && group["description"] == "New description"));
        assert!(meta
            .iter()
            .any(|group| group["path"] == "/New" && group["iconRef"] == SAMPLE_ENTRY_ICON_REF));
    }
}

#[test]
fn import_commit_emits_safe_invalidation_but_review_and_failure_do_not() {
    let (mut router, _root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "import events"));
    assert_rpc_ok(&router.handle(&RpcRequest::new("catalog:subscribe", json!({}))));
    router.take_events();
    let prepared = router
        .prepare_credential_import(
            br#"{"folders":[],"entries":[{"id":"event-import","title":"Account","password":"synthetic"}]}"#,
            CredentialImportMode::Merge,
            None,
        )
        .unwrap();
    assert!(
        router.take_events().is_empty(),
        "review must not notify a mutation"
    );
    assert_rpc_ok(&router.handle(&prepared.into_commit_request()));
    let events = router.take_events();
    assert!(!events.is_empty());
    for event in events {
        assert_eq!(event["command"], "update:state");
        let data = event["data"].as_object().unwrap();
        assert_eq!(data.len(), 2);
        assert!(data["TS"].is_u64());
        assert_eq!(data["serial_num"], "local");
    }
    let failed = router.handle(&RpcRequest::new("passmanager:entry:create", json!({})));
    assert!(!failed.is_ok());
    assert!(router.take_events().is_empty());
}
