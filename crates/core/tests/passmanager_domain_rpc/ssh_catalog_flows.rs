use super::support::*;
use serde_json::{json, Value};

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let reply = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&reply);
    reply.result().unwrap().clone()
}

#[test]
fn ssh_catalog_pages_and_edits_preserve_identity_and_detect_changes() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    call(
        &mut router,
        "passmanager:entry:save",
        json!({"id":"source", "title":"Source"}),
    );
    for name in ["Bravo", "Alpha", "Charlie"] {
        call(
            &mut router,
            "passmanager:ssh:keygen",
            json!({"key_type":"ed25519", "name":name, "comment":"fixed-comment", "source_entry_id":"source"}),
        );
    }
    let first = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":0,"limit":2}),
    );
    assert_eq!(first["total_count"], 3);
    assert_eq!(first["next_offset"], 2);
    let second = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":2,"limit":2,"revision":first["revision"]}),
    );
    assert_eq!(second["keys"].as_array().unwrap().len(), 1);
    let mut names = first["keys"]
        .as_array()
        .unwrap()
        .iter()
        .chain(second["keys"].as_array().unwrap())
        .map(|row| row["key"]["name"].as_str().unwrap())
        .collect::<Vec<_>>();
    names.sort();
    assert_eq!(names, ["Alpha", "Bravo", "Charlie"]);
    assert!(second["next_offset"].is_null());
    let query = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":0,"limit":2,"query":"BRAV", "source_entry_id":"source"}),
    );
    assert_eq!(query["total_count"], 1);
    let empty = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":0,"limit":2,"source_entry_id":"other"}),
    );
    assert_eq!(empty["total_count"], 0);
    let row = &first["keys"][0];
    let mut request =
        json!({"key_id":row["key"]["id"], "revision":row["revision"], "name":"Renamed"});
    let edited = call(&mut router, "passmanager:ssh:key:edit", request.clone());
    for field in ["id", "type", "fingerprint", "comment", "createdTs"] {
        assert_eq!(
            edited["key"][field], row["key"][field],
            "immutable field {field}"
        );
    }
    assert_eq!(edited["key"]["name"], "Renamed");
    assert!(edited["key"]["sourceEntryId"].is_null());
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:key:edit",
            request.clone(),
        )),
        "SYNC_CONFLICT",
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:page",
            json!({"offset":2,"limit":2,"revision":first["revision"]}),
        )),
        "SYNC_CONFLICT",
    );
    request["revision"] = edited["revision"].clone();
    request["fingerprint"] = json!("tampered");
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:key:edit",
            request.clone(),
        )),
        "EMPTY_PAYLOAD",
    );
    request.as_object_mut().unwrap().remove("fingerprint");
    request["source_entry_id"] = json!("missing");
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:key:edit",
            request.clone(),
        )),
        "NODE_NOT_FOUND",
    );
    let unchanged = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":0,"limit":10,"query":"Renamed"}),
    );
    assert_eq!(unchanged["keys"][0], edited);
    call(
        &mut router,
        "passmanager:ssh:key:delete",
        json!({"key_id":row["key"]["id"]}),
    );
    request.as_object_mut().unwrap().remove("source_entry_id");
    assert_rpc_error(
        &router.handle(&RpcRequest::new("passmanager:ssh:key:edit", request)),
        "NODE_NOT_FOUND",
    );
}

#[test]
fn ssh_catalog_validates_bounds_and_requires_unlocked_vault() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:page",
            json!({"offset":0,"limit":10}),
        )),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    for data in [
        json!({"offset":0,"limit":0}),
        json!({"offset":0,"limit":101}),
        json!({"offset":0,"limit":10,"key_type":"dsa"}),
        json!({"offset":1,"limit":10}),
        json!({"offset":0,"limit":10,"query":"x".repeat(257)}),
        json!({"offset":0,"limit":10,"unexpected":true}),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:ssh:page", data)),
            "EMPTY_PAYLOAD",
        );
    }
    assert!(router
        .session()
        .unwrap()
        .catalog()
        .find_by_path("/.passmanager/.ssh")
        .is_none());
}

#[test]
fn ssh_catalog_filters_all_pages_and_tracks_linked_credential_context() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    call(
        &mut router,
        "passmanager:entry:save",
        json!({"id":"server", "title":"Deploy login", "group_path":"/Ops", "password":"never-in-ssh-summary"}),
    );
    for (id, kind, created, updated) in [
        ("z", "ed25519", 1, 10),
        ("b", "rsa", 5, 5),
        ("a", "ed25519", 3, 3),
        ("d", "ecdsa", 2, 2),
    ] {
        call(
            &mut router,
            "passmanager:ssh:key:update",
            json!({"key":{
                "id":id,"type":kind,"name":id,"fingerprint":format!("SHA256:{id}"),
                "createdTs":created,"updatedTs":updated,"sourceEntryId":"server"
            }}),
        );
    }
    let first = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":0,"limit":1,"key_type":"ed25519"}),
    );
    assert_eq!(first["total_count"], 2);
    assert_eq!(first["keys"][0]["key"]["id"], "z");
    assert_eq!(first["keys"][0]["source_title"], "Deploy login");
    assert_eq!(first["keys"][0]["source_path"], "/Ops/Deploy login");
    assert!(!first.to_string().contains("never-in-ssh-summary"));
    let next = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":1,"limit":1,"key_type":"ed25519","revision":first["revision"]}),
    );
    assert_eq!(next["keys"][0]["key"]["id"], "a");
    assert!(next["next_offset"].is_null());
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:page",
            json!({"offset":1,"limit":1,"key_type":"rsa","revision":first["revision"]}),
        )),
        "SYNC_CONFLICT",
    );
    for (query, count) in [("OPS/DEPLOY", 4), ("rsa", 1), ("missing", 0)] {
        let page = call(
            &mut router,
            "passmanager:ssh:page",
            json!({"offset":0,"limit":10,"query":query}),
        );
        assert_eq!(page["total_count"], count);
    }
    call(
        &mut router,
        "passmanager:entry:save",
        json!({"id":"server","title":"Production","group_path":"/Servers"}),
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:ssh:page",
            json!({"offset":1,"limit":1,"key_type":"ed25519","revision":first["revision"]}),
        )),
        "SYNC_CONFLICT",
    );
    let moved = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":0,"limit":10,"query":"servers/production"}),
    );
    assert_eq!(moved["total_count"], 4);
    assert_eq!(
        moved["keys"][0]["revision"], first["keys"][0]["revision"],
        "source rename must not invalidate an unchanged key edit revision"
    );
    call(
        &mut router,
        "passmanager:entry:delete",
        json!({"entry_id":"server"}),
    );
    let orphan = call(
        &mut router,
        "passmanager:ssh:page",
        json!({"offset":0,"limit":10}),
    );
    assert_eq!(orphan["total_count"], 4);
    assert!(orphan["keys"][0]["source_title"].is_null());
    assert!(orphan["keys"][0]["source_path"].is_null());
}
