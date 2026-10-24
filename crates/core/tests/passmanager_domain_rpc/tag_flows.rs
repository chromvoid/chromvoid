use super::support::*;
use serde_json::{json, Value};

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let response = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}
fn page(router: &mut RpcRouter) -> Value {
    call(
        router,
        "passmanager:tag:page",
        json!({"offset":0,"limit":100}),
    )
}
fn create(router: &mut RpcRouter, id: &str, group: &str, tags: Value) {
    call(
        router,
        "passmanager:entry:create",
        json!({"entry_id":id,"title":id,"username":"alice","group_path":group,"tags":tags,"secrets":{"password":"retained-password","note":"retained-note"}}),
    );
}

#[test]
fn tag_pages_merge_unused_catalog_and_assigned_labels_without_secret_reads() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:tag:page",
            json!({"offset":0,"limit":1}),
        )),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic-tags"));
    assert_eq!(page(&mut router)["tags"], json!([]));
    for data in [
        json!({"offset":0,"limit":0}),
        json!({"offset":0,"limit":101}),
        json!({"offset":0,"limit":1,"extra":true}),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:tag:page", data)),
            "EMPTY_PAYLOAD",
        );
    }
    call(
        &mut router,
        "passmanager:tags:setCatalog",
        json!({"tags":["Unused"],"tagMeta":{"unused":{"colorId":"cyan"}}}),
    );
    create(
        &mut router,
        "first",
        "/Work",
        json!(["Ｗｏｒｋ", "work", "Личное", "😀"]),
    );
    create(
        &mut router,
        "second",
        "/Personal",
        json!(["work", "Личное"]),
    );
    let all = page(&mut router);
    let tags = all["tags"].as_array().unwrap();
    assert_eq!(tags.len(), 4);
    assert_eq!(
        tags[0],
        json!({"key":"unused","label":"Unused","color_id":"cyan","count":0})
    );
    assert_eq!(tags[1]["key"], "work");
    assert_eq!(tags[1]["count"], 2);
    assert_eq!(tags[2]["key"], "личное");
    assert_eq!(tags[2]["count"], 2);
    // UTF-16 surrogate pair hash matches existing JS behavior: (55357*31+56832)%7=2.
    assert_eq!(tags[3]["color_id"], "blue");
    let mut paged = Vec::new();
    let mut offset = 0;
    loop {
        let result = call(
            &mut router,
            "passmanager:tag:page",
            json!({"offset":offset,"limit":1}),
        );
        paged.extend(result["tags"].as_array().unwrap().clone());
        if result["next_offset"].is_null() {
            break;
        }
        let next = result["next_offset"].as_u64().unwrap();
        assert!(next > offset);
        offset = next;
    }
    assert_eq!(paged, *tags);
    let wire = all.to_string();
    assert!(
        !wire.contains("retained-password")
            && !wire.contains("retained-note")
            && !wire.contains("username")
    );
}

#[test]
fn tag_rename_delete_update_assignments_atomically_and_preserve_secrets_and_export() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic-tags"));
    create(
        &mut router,
        "first",
        "/Work/Nested",
        json!(["Ｗｏｒｋ", "Keep"]),
    );
    create(&mut router, "second", "/Personal", json!(["work"]));
    let saved = call(
        &mut router,
        "passmanager:tag:save",
        json!({"source_key":"work","label":"# Личное   дело ","color_id":"pink"}),
    );
    assert_eq!(
        saved,
        json!({"key":"личное-дело","label":"Личное дело","color_id":"pink","count":2})
    );
    for id in ["first", "second"] {
        let detail = call(
            &mut router,
            "passmanager:entry:detail",
            json!({"entry_id":id}),
        );
        assert_eq!(detail["username"], "alice");
        assert!(detail["tags"]
            .as_array()
            .unwrap()
            .contains(&json!("Личное дело")));
        for (kind, value) in [("password", "retained-password"), ("note", "retained-note")] {
            assert_eq!(
                call(
                    &mut router,
                    "passmanager:secret:read",
                    json!({"entry_id":id,"secret_type":kind})
                )["value"],
                value
            );
        }
    }
    let filtered = call(
        &mut router,
        "passmanager:entry:page",
        json!({"offset":0,"limit":1,"query":"alice","sort":"name","descending":true,"entry_type":"login","group_path":"/Work","tag_key":"ЛИЧНОЕ ДЕЛО"}),
    );
    assert_eq!(filtered["entries"].as_array().unwrap().len(), 1);
    assert_eq!(filtered["entries"][0]["id"], "first");
    let exported = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_rpc_ok(&exported);
    assert_eq!(root_tag_meta(&exported)["личное-дело"]["colorId"], "pink");
    assert_eq!(
        entry_tags(get_root_entry_by_id(&exported, "first").unwrap()),
        ["Личное дело", "Keep"]
    );
    call(
        &mut router,
        "passmanager:tag:delete",
        json!({"key":"личное-дело"}),
    );
    assert_eq!(page(&mut router)["tags"].as_array().unwrap().len(), 1);
    let detail = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"first"}),
    );
    assert_eq!(detail["tags"], json!(["Keep"]));
    assert_eq!(detail["group_path"], "/Work/Nested");
    assert_eq!(
        call(
            &mut router,
            "passmanager:secret:read",
            json!({"entry_id":"first","secret_type":"password"})
        )["value"],
        "retained-password"
    );
    assert_eq!(
        call(
            &mut router,
            "passmanager:entry:detail",
            json!({"entry_id":"second"})
        )["tags"],
        json!([])
    );
}

#[test]
fn tag_conflicts_and_invalid_mutations_leave_authoritative_state_unchanged() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic-tags"));
    create(&mut router, "first", "/", json!(["Work", "Keep"]));
    let before = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"first"}),
    );
    for (data, code) in [
        (json!({"label":"work","color_id":"cyan"}), "NAME_EXIST"),
        (
            json!({"source_key":"work","label":"Keep","color_id":"cyan"}),
            "NAME_EXIST",
        ),
        (
            json!({"source_key":"missing","label":"New","color_id":"cyan"}),
            "NODE_NOT_FOUND",
        ),
        (
            json!({"source_key":"work","label":" ","color_id":"cyan"}),
            "EMPTY_PAYLOAD",
        ),
        (
            json!({"source_key":"work","label":"x".repeat(33),"color_id":"cyan"}),
            "EMPTY_PAYLOAD",
        ),
        (
            json!({"source_key":"work","label":"New","color_id":"invalid"}),
            "EMPTY_PAYLOAD",
        ),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:tag:save", data)),
            code,
        );
        assert_eq!(
            call(
                &mut router,
                "passmanager:entry:detail",
                json!({"entry_id":"first"})
            ),
            before
        );
    }
    call(
        &mut router,
        "passmanager:tag:save",
        json!({"source_key":"work","label":"WORK","color_id":"green"}),
    );
    let renamed = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"first"}),
    );
    assert_eq!(renamed["tags"], json!(["WORK", "Keep"]));
    call(
        &mut router,
        "passmanager:tag:save",
        json!({"source_key":"work","label":"WORK","color_id":"blue"}),
    );
    assert_eq!(
        call(
            &mut router,
            "passmanager:entry:detail",
            json!({"entry_id":"first"})
        ),
        renamed
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:tag:delete",
            json!({"key":"missing"}),
        )),
        "NODE_NOT_FOUND",
    );
}

#[test]
fn selected_tag_keys_create_update_and_clear_without_changing_secrets() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic-tags"));
    call(
        &mut router,
        "passmanager:tags:setCatalog",
        json!({"tags":["Ｗｏｒｋ", "Личное дело"]}),
    );
    call(
        &mut router,
        "passmanager:entry:create",
        json!({"entry_id":"assigned", "title":"Assigned", "tag_keys":["личное-дело", "work"], "tags":null, "username":"alice", "secrets":{"password":"keep-secret", "note":"keep-note"}}),
    );
    let detail = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"assigned"}),
    );
    assert_eq!(detail["tags"], json!(["Личное дело", "Work"]));
    assert_eq!(detail["tag_keys"], json!(["личное-дело", "work"]));
    call(
        &mut router,
        "passmanager:entry:update",
        json!({"entry_id":"assigned", "revision":detail["revision"], "tag_keys":["work"]}),
    );
    let updated = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"assigned"}),
    );
    assert_eq!(updated["tag_keys"], json!(["work"]));
    assert_eq!(updated["username"], "alice");
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:update",
            json!({"entry_id":"assigned", "revision":detail["revision"], "tag_keys":[]}),
        )),
        "SYNC_CONFLICT",
    );
    call(
        &mut router,
        "passmanager:entry:update",
        json!({"entry_id":"assigned", "revision":updated["revision"], "tag_keys":[]}),
    );
    let cleared = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"assigned"}),
    );
    assert_eq!(cleared["tags"], json!([]));
    assert_eq!(cleared["tag_keys"], json!([]));
    for (kind, value) in [("password", "keep-secret"), ("note", "keep-note")] {
        assert_eq!(
            call(
                &mut router,
                "passmanager:secret:read",
                json!({"entry_id":"assigned", "secret_type":kind})
            )["value"],
            value
        );
    }
}

#[test]
fn invalid_tag_selections_do_not_partially_create_or_update_entries() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic-tags"));
    let labels: Vec<_> = (0..13).map(|i| format!("Tag{i}")).collect();
    call(
        &mut router,
        "passmanager:tags:setCatalog",
        json!({"tags":labels}),
    );
    create(&mut router, "existing", "/", json!(["Tag0"]));
    let before = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"existing"}),
    );
    for keys in [
        json!(["missing"]),
        json!(["tag0", "tag0"]),
        json!(["TAG0"]),
        json!(12),
        json!((0..13).map(|i| format!("tag{i}")).collect::<Vec<_>>()),
    ] {
        assert_rpc_error(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({"entry_id":"rejected", "title":"Rejected", "group_path":"/MustNotExist", "tag_keys":keys, "secrets":{"password":"never-written"}}))), "EMPTY_PAYLOAD");
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                "passmanager:entry:detail",
                json!({"entry_id":"rejected"}),
            )),
            "NODE_NOT_FOUND",
        );
        assert_rpc_error(&router.handle(&RpcRequest::new("passmanager:entry:update", json!({"entry_id":"existing", "revision":before["revision"], "title":"MustNotChange", "tag_keys":keys}))), "EMPTY_PAYLOAD");
        assert_eq!(
            call(
                &mut router,
                "passmanager:entry:detail",
                json!({"entry_id":"existing"})
            ),
            before
        );
    }
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:create",
            json!({"entry_id":"mixed", "title":"Mixed", "tags":["Tag0"], "tag_keys":["tag0"]}),
        )),
        "EMPTY_PAYLOAD",
    );
    // Older callers may omit both fields, and explicit null keys preserve legacy labels.
    call(
        &mut router,
        "passmanager:entry:create",
        json!({"entry_id":"legacy", "title":"Legacy", "tag_keys":null, "tags":["Tag0"]}),
    );
    assert_eq!(
        call(
            &mut router,
            "passmanager:entry:detail",
            json!({"entry_id":"legacy"})
        )["tag_keys"],
        json!(["tag0"])
    );
}
