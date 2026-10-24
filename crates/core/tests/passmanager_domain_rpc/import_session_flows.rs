use super::{import_review_flows::storage_files, support::*};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let response = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}

fn upload(router: &mut RpcRouter, bytes: &[u8]) -> String {
    let started = call(
        router,
        "passmanager:import:start",
        json!({"byte_count":bytes.len(),"mode":"merge"}),
    );
    let id = started["import_id"].as_str().unwrap().to_owned();
    let mut offset = 0;
    for chunk in bytes.chunks(1024) {
        let received = call(
            router,
            "passmanager:import:append",
            json!({"import_id":id,"offset":offset,"chunk_base64":STANDARD.encode(chunk)}),
        );
        offset += chunk.len();
        assert_eq!(received["received_bytes"], offset);
    }
    id
}

#[test]
fn import_rpc_reviews_and_commits_all_external_formats_through_one_transaction() {
    let fixtures: [(&[u8], &str, Option<&str>, usize); 4] = [
        (
            include_bytes!("fixtures/bitwarden-credentials.json"),
            "bitwarden",
            None,
            5,
        ),
        (
            include_bytes!("fixtures/1password-credentials.1pux"),
            "1password",
            None,
            7,
        ),
        (
            include_bytes!("fixtures/keepass-4.kdbx"),
            "keepass",
            Some("synthetic-keepass-password"),
            2,
        ),
        (include_bytes!("fixtures/credentials.csv"), "csv", None, 2),
    ];
    for (bytes, source, password, count) in fixtures {
        let (mut router, root) = create_test_router();
        assert_rpc_ok(&unlock_vault(&mut router, "synthetic RPC import"));
        for run in 1..=2 {
            let before = storage_files(root.path());
            let id = upload(&mut router, bytes);
            let preview = call(
                &mut router,
                "passmanager:import:review",
                json!({"import_id":id,"source_password":password}),
            );
            assert_eq!(preview["entry_count"], count);
            assert_eq!(preview["source"], source);
            let updates = if source != "csv" && run == 2 {
                count
            } else {
                0
            };
            assert_eq!(preview["created_entry_count"], count - updates);
            assert_eq!(preview["updated_entry_count"], updates);
            assert!(preview.get("entries").is_none());
            assert_eq!(storage_files(root.path()), before);
            assert_eq!(
                router
                    .handle(&RpcRequest::new(
                        "passmanager:import:commit",
                        json!({"import_id":id,"confirm":false})
                    ))
                    .code(),
                Some("CONFIRM_REQUIRED")
            );
            assert_eq!(storage_files(root.path()), before);
            call(
                &mut router,
                "passmanager:import:commit",
                json!({"import_id":id,"confirm":true}),
            );
            let exported = call(&mut router, "passmanager:root:export", json!({}));
            assert_eq!(
                exported["root"]["entries"].as_array().unwrap().len(),
                if source == "csv" { count * run } else { count }
            );
            assert_eq!(
                router
                    .handle(&RpcRequest::new(
                        "passmanager:import:commit",
                        json!({"import_id":id,"confirm":true})
                    ))
                    .code(),
                Some("NODE_NOT_FOUND")
            );
        }
    }
}

#[test]
fn import_rpc_password_retry_cancel_and_lock_invalidate_old_resources_without_writes() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic import lifecycle"));
    let before = storage_files(root.path());
    let bytes = include_bytes!("fixtures/keepass-4.kdbx");
    for (password, code) in [
        (None, "CREDENTIAL_IMPORT_PASSWORD_REQUIRED"),
        (Some("wrong"), "CREDENTIAL_IMPORT_PASSWORD_INVALID"),
    ] {
        let id = upload(&mut router, bytes);
        assert_eq!(
            router
                .handle(&RpcRequest::new(
                    "passmanager:import:review",
                    json!({"import_id":id,"source_password":password})
                ))
                .code(),
            Some(code)
        );
        assert_eq!(
            router
                .handle(&RpcRequest::new(
                    "passmanager:import:commit",
                    json!({"import_id":id,"confirm":true})
                ))
                .code(),
            Some("NODE_NOT_FOUND")
        );
        assert_eq!(storage_files(root.path()), before);
    }
    let canceled = upload(&mut router, bytes);
    call(
        &mut router,
        "passmanager:import:cancel",
        json!({"import_id":canceled}),
    );
    call(
        &mut router,
        "passmanager:import:cancel",
        json!({"import_id":canceled}),
    );
    assert_eq!(storage_files(root.path()), before);
    let ready = upload(&mut router, bytes);
    call(
        &mut router,
        "passmanager:import:review",
        json!({"import_id":ready,"source_password":"synthetic-keepass-password"}),
    );
    call(&mut router, "vault:lock", json!({}));
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic import lifecycle"));
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:commit",
                json!({"import_id":ready,"confirm":true})
            ))
            .code(),
        Some("NODE_NOT_FOUND")
    );
    assert!(
        call(&mut router, "passmanager:root:export", json!({}))["root"]["entries"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn import_rpc_enforces_limits_offsets_and_tokens_before_a_review_can_be_committed() {
    let (mut router, root) = create_test_router();
    let limits = call(&mut router, "passmanager:import:limits", json!({}));
    assert_eq!(limits["max_input_bytes"], 50 * 1024 * 1024);
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:start",
                json!({"byte_count":3,"mode":"merge"})
            ))
            .code(),
        Some("VAULT_REQUIRED")
    );
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic import limits"));
    let before = storage_files(root.path());
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:start",
                json!({"byte_count":50 * 1024 * 1024 + 1,"mode":"merge"})
            ))
            .code(),
        Some("CREDENTIAL_IMPORT_TOO_LARGE")
    );
    let id = call(
        &mut router,
        "passmanager:import:start",
        json!({"byte_count":3,"mode":"merge"}),
    )["import_id"]
        .clone();
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:start",
                json!({"byte_count":3,"mode":"merge"})
            ))
            .code(),
        Some("CREDENTIAL_IMPORT_BUSY")
    );
    call(
        &mut router,
        "passmanager:import:cancel",
        json!({"import_id":"another import"}),
    );
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:append",
                json!({"import_id":"another import","offset":0,"chunk_base64":"YWJj"})
            ))
            .code(),
        Some("NODE_NOT_FOUND")
    );
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:append",
                json!({"import_id":id,"offset":1,"chunk_base64":"YWJj"})
            ))
            .code(),
        Some("INVALID_OFFSET")
    );
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:review",
                json!({"import_id":id})
            ))
            .code(),
        Some("NODE_NOT_FOUND")
    );
    assert_eq!(storage_files(root.path()), before);
    let incomplete = call(
        &mut router,
        "passmanager:import:start",
        json!({"byte_count":3,"mode":"merge"}),
    )["import_id"]
        .clone();
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:review",
                json!({"import_id":incomplete})
            ))
            .code(),
        Some("EMPTY_PAYLOAD")
    );
    assert_eq!(storage_files(root.path()), before);
}

#[test]
fn import_rpc_adopts_unique_legacy_ids_once_and_preserves_the_existing_location() {
    // KeePass ID was read independently with the old kdbxweb reader from this synthetic fixture.
    let fixtures: [(&[u8], &str, Option<&str>, &str, usize); 2] = [
        (
            include_bytes!("fixtures/keepass-4.kdbx"),
            "YflJaZxrUqNi3RRxZgNEbQ==",
            Some("synthetic-keepass-password"),
            "KeePass Mail",
            2,
        ),
        (
            include_bytes!("fixtures/1password-credentials.1pux"),
            "identity",
            None,
            "1Password Identity",
            7,
        ),
    ];
    for (bytes, original, password, title, count) in fixtures {
        let (mut router, _root) = create_test_router();
        assert_rpc_ok(&unlock_vault(&mut router, "synthetic legacy migration"));
        call(
            &mut router,
            "passmanager:root:import",
            json!({"folders":["User choice"],"entries":[{
                "id":"old-entry-id", "title":"Earlier import", "folderPath":"User choice", "password":"earlier secret",
                "import_source":{"original_id":original,"type":"login"}
            }]}),
        );
        for run in 0..2 {
            let id = upload(&mut router, bytes);
            let preview = call(
                &mut router,
                "passmanager:import:review",
                json!({"import_id":id,"source_password":password}),
            );
            assert_eq!(
                preview["updated_entry_count"],
                if run == 0 { 1 } else { count }
            );
            assert_eq!(
                preview["created_entry_count"],
                if run == 0 { count - 1 } else { 0 }
            );
            let legacy_warning = preview["warnings"]
                .as_array()
                .unwrap()
                .iter()
                .find(|warning| warning["code"] == "legacy_identifiers_matched");
            assert_eq!(
                legacy_warning.map(|warning| warning["count"].as_u64().unwrap()),
                if run == 0 { Some(1) } else { None }
            );
            call(
                &mut router,
                "passmanager:import:commit",
                json!({"import_id":id,"confirm":true}),
            );
            let exported = call(&mut router, "passmanager:root:export", json!({}));
            let entries = exported["root"]["entries"].as_array().unwrap();
            assert_eq!(entries.len(), count);
            let matched = entries
                .iter()
                .find(|entry| entry["id"] == "old-entry-id")
                .unwrap();
            assert_eq!(matched["title"], title);
            assert_eq!(matched["folderPath"], "/User choice");
            assert_ne!(matched["import_source"]["original_id"], original);
            assert!(matched["import_source"]["format"].is_string());
        }
    }
}

#[test]
fn import_rpc_rejects_ambiguous_legacy_sources_and_does_not_match_manual_records() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic legacy collision"));
    call(
        &mut router,
        "passmanager:root:import",
        json!({"folders":[],"entries":[{
            "id":"legacy", "title":"Earlier import", "password":"keep this secret",
            "import_source":{"original_id":"shared-item","type":"login"}
        }]}),
    );
    let before = storage_files(root.path());
    let id = upload(
        &mut router,
        include_bytes!("fixtures/1password-credentials.1pux"),
    );
    let failure = router.handle(&RpcRequest::new(
        "passmanager:import:review",
        json!({"import_id":id}),
    ));
    assert_eq!(failure.code(), Some("EMPTY_PAYLOAD"));
    assert!(failure
        .error_message()
        .unwrap()
        .contains("share a legacy record identifier"));
    assert_eq!(storage_files(root.path()), before);
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:commit",
                json!({"import_id":id,"confirm":true})
            ))
            .code(),
        Some("NODE_NOT_FOUND")
    );

    call(
        &mut router,
        "passmanager:root:import",
        json!({"folders":[],"entries":[{
            "id":"YflJaZxrUqNi3RRxZgNEbQ==", "title":"Manual entry", "password":"manual secret"
        }]}),
    );
    let id = upload(&mut router, include_bytes!("fixtures/keepass-4.kdbx"));
    let preview = call(
        &mut router,
        "passmanager:import:review",
        json!({"import_id":id,"source_password":"synthetic-keepass-password"}),
    );
    assert_eq!(preview["updated_entry_count"], 0);
    call(
        &mut router,
        "passmanager:import:commit",
        json!({"import_id":id,"confirm":true}),
    );
    let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_eq!(
        get_root_entry_by_id(&exported, "YflJaZxrUqNi3RRxZgNEbQ==").unwrap()["password"],
        "manual secret"
    );
}

#[test]
fn import_rpc_rejects_malformed_and_oversized_chunks_without_retaining_the_resource() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic invalid upload"));
    let before = storage_files(root.path());
    // max+1 shares the same encoded length as max because of base64 padding.
    for (chunk, code) in [
        ("not base64!".to_owned(), "EMPTY_PAYLOAD"),
        (
            STANDARD.encode(vec![0_u8; 512 * 1024 + 1]),
            "CREDENTIAL_IMPORT_TOO_LARGE",
        ),
        (
            STANDARD.encode(vec![0_u8; 512 * 1024 + 3]),
            "CREDENTIAL_IMPORT_TOO_LARGE",
        ),
    ] {
        let id = call(
            &mut router,
            "passmanager:import:start",
            json!({"byte_count":1024*1024,"mode":"merge"}),
        )["import_id"]
            .clone();
        let response = router.handle(&RpcRequest::new(
            "passmanager:import:append",
            json!({"import_id":id,"offset":0,"chunk_base64":chunk}),
        ));
        assert_eq!(response.code(), Some(code));
        assert_eq!(
            router
                .handle(&RpcRequest::new(
                    "passmanager:import:review",
                    json!({"import_id":id})
                ))
                .code(),
            Some("NODE_NOT_FOUND")
        );
    }
    assert_eq!(storage_files(root.path()), before);
}

#[test]
fn import_rpc_expiry_and_stale_revision_never_commit_a_previous_review() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic review expiry"));
    let bytes = include_bytes!("fixtures/credentials.csv");
    let id = upload(&mut router, bytes);
    call(
        &mut router,
        "passmanager:import:review",
        json!({"import_id":id}),
    );
    call(
        &mut router,
        "passmanager:root:import",
        json!({"entries":[{"id":"later", "title":"Created after review", "password":"preserve this"}],"folders":[]}),
    );
    let before = storage_files(root.path());
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:commit",
                json!({"import_id":id,"confirm":true})
            ))
            .code(),
        Some("SYNC_CONFLICT")
    );
    assert_eq!(storage_files(root.path()), before);
    let id = upload(&mut router, bytes);
    call(
        &mut router,
        "passmanager:import:review",
        json!({"import_id":id}),
    );
    let mut router = router.with_long_running_session_idle_ttl_ms(1);
    std::thread::sleep(std::time::Duration::from_millis(3));
    assert_eq!(
        router
            .handle(&RpcRequest::new(
                "passmanager:import:commit",
                json!({"import_id":id,"confirm":true})
            ))
            .code(),
        Some("NODE_NOT_FOUND")
    );
    assert_eq!(storage_files(root.path()), before);
}
