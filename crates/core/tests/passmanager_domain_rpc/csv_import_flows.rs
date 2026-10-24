use super::support::*;
use chromvoid_core::rpc::types::CredentialImportWarningCode as Warning;
use serde_json::{json, Value};

const FIXTURE: &[u8] = include_bytes!("fixtures/credentials.csv");
fn export(router: &mut RpcRouter) -> Value {
    let result = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_rpc_ok(&result);
    result.result().unwrap()["root"].clone()
}
#[test]
fn csv_import_preserves_quoted_secrets_and_repeats_as_new_credentials() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "csv synthetic vault");
    for expected_count in [2, 4] {
        let before = super::import_review_flows::storage_files(root.path());
        let (mut document, info) = router
            .prepare_credential_import_document(FIXTURE, true)
            .unwrap();
        assert_eq!(info.source.as_deref(), Some("csv"));
        assert_eq!(
            info.warnings
                .iter()
                .map(|warning| (warning.code, warning.count))
                .collect::<Vec<_>>(),
            vec![(Warning::InvalidRows, 1), (Warning::UnmappedColumns, 1)]
        );
        let review = router.handle(&RpcRequest::new(
            "passmanager:root:import:preview",
            document.clone(),
        ));
        assert_rpc_ok(&review);
        assert_eq!(review.result().unwrap()["entry_count"], 2);
        assert_eq!(
            super::import_review_flows::storage_files(root.path()),
            before
        );
        document["expected_revision"] = review.result().unwrap()["revision"].clone();
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", document)));
        let saved = export(&mut router);
        let entries = saved["entries"].as_array().unwrap();
        assert_eq!(entries.len(), expected_count);
        let quoted: Vec<_> = entries
            .iter()
            .filter(|entry| entry["username"] == "alice@example.test")
            .collect();
        assert_eq!(quoted.len(), expected_count / 2);
        for entry in quoted {
            assert_eq!(entry["password"], "  synthetic,\"quoted\"\npassword  ");
            assert_eq!(entry["note"], "First line\nSecond line");
            assert_eq!(entry["folderPath"], "/Imported/CSV");
            assert_eq!(entry["tags"], json!(["Work", "Client"]));
            assert_eq!(
                entry["urls"],
                json!([{"value":"https://example.test","match":"base_domain"}])
            );
        }
        let ids: std::collections::BTreeSet<_> = entries
            .iter()
            .map(|entry| entry["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids.len(), expected_count);
    }
}

#[test]
fn csv_delimiters_bom_aliases_and_empty_export_are_supported() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "csv variants vault");
    for delimiter in [',', ';', '\t'] {
        let text=format!("\u{feff}Title{delimiter}Pass{delimiter}User{delimiter}Grouping\r\nExample{delimiter}   {delimiter}alice{delimiter}Work\\Mail\r\n");
        let (document, info) = router
            .prepare_credential_import_document(text.as_bytes(), true)
            .unwrap();
        assert!(info.warnings.is_empty());
        assert_eq!(document["entries"][0]["password"], "   ");
        assert_eq!(document["entries"][0]["folderPath"], "Work/Mail");
    }
    let (mut empty, _) = router
        .prepare_credential_import_document(b"name,password", false)
        .unwrap();
    empty["mode"] = json!("replace");
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import:preview", empty)));
}

#[test]
fn csv_invalid_headers_and_all_invalid_records_cannot_prepare_replacement() {
    let (mut router, root) = create_test_router();
    unlock_vault(&mut router, "csv rejection vault");
    let before = super::import_review_flows::storage_files(root.path());
    for bytes in [
        b"name,notes\nExample,No password".as_slice(),
        b"name,password\nExample,",
        b"name,title,password\nA,B,secret",
        b"name,password\nToo,many,columns",
        b"name,password\nInvalid,\xff",
        b"{not json}",
        b"",
        b"name,password\n,synthetic",
        b"name,password\n,",
    ] {
        assert!(
            router
                .prepare_credential_import_document(bytes, false)
                .is_err(),
            "{bytes:?}"
        );
        assert_eq!(
            super::import_review_flows::storage_files(root.path()),
            before
        );
    }
}

#[test]
fn csv_limits_and_unequal_rows_report_omissions_without_truncating_secrets() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "csv bounded vault");
    let text = format!(
        "name,password\nBad,{}\nToo,many,columns\nGood,synthetic\n",
        "x".repeat(10001)
    );
    let (document, info) = router
        .prepare_credential_import_document(text.as_bytes(), true)
        .unwrap();
    assert_eq!(document["entries"].as_array().unwrap().len(), 1);
    assert_eq!(info.warnings.len(), 1);
    assert_eq!(info.warnings[0].code, Warning::InvalidRows);
    assert_eq!(info.warnings[0].count, 2);
    let mut text = "name,password\n".to_string();
    for index in 0..10002 {
        text.push_str(&format!("Entry {index},synthetic\n"));
    }
    let (document, info) = router
        .prepare_credential_import_document(text.as_bytes(), true)
        .unwrap();
    assert_eq!(document["entries"].as_array().unwrap().len(), 10000);
    assert_eq!(info.warnings[0].code, Warning::EntryLimit);
    assert_eq!(info.warnings[0].count, 2);
}

#[test]
fn csv_does_not_treat_an_unmapped_id_column_as_update_authority() {
    let (mut router, _root) = create_test_router();
    unlock_vault(&mut router, "csv identity vault");
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import",json!({"folders":[],"entries":[
        {"id":"existing","title":"Existing","password":"keep","import_source":{"original_id":"shared-source"}},
        {"id":"another","title":"Another","password":"keep too","import_source":{"original_id":"shared-source"}}
    ]}))));
    let (document, info) = router
        .prepare_credential_import_document(b"name,password,id\nExisting,imported,existing", true)
        .unwrap();
    assert_eq!(info.warnings[0].code, Warning::UnmappedColumns);
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", document)));
    let saved = export(&mut router);
    let entries = saved["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 3);
    assert_eq!(
        entries
            .iter()
            .find(|entry| entry["id"] == "existing")
            .unwrap()["password"],
        "keep"
    );
}
