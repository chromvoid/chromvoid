use super::support::*;
use serde_json::{json, Value};

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let result = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&result);
    result.result().unwrap().clone()
}

#[test]
fn group_pages_scope_search_and_rename_preserve_descendants_and_secrets() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "groups"));
    for path in ["/Work/Nested", "/Workplace", "/Empty"] {
        call(
            &mut router,
            "passmanager:group:ensure",
            json!({"path":path}),
        );
    }
    for (id, group) in [("inside", "/Work/Nested"), ("outside", "/Workplace")] {
        call(
            &mut router,
            "passmanager:entry:create",
            json!({"entry_id":id,"title":id,"group_path":group,"secrets":{"password":"synthetic secret"}}),
        );
    }
    call(
        &mut router,
        "passmanager:group:setMeta",
        json!({"path":"/Work/Nested","description":"Retained description"}),
    );
    let first = call(
        &mut router,
        "passmanager:group:page",
        json!({"parent":"/","offset":0,"limit":1}),
    );
    assert_eq!(first["groups"][0]["path"], "/Empty");
    assert_eq!(first["next_offset"], 1);
    let next = call(
        &mut router,
        "passmanager:group:page",
        json!({"parent":"/","offset":1,"limit":50}),
    );
    assert_eq!(next["groups"].as_array().unwrap().len(), 2);
    let child = call(
        &mut router,
        "passmanager:group:page",
        json!({"parent":"/Work","offset":0,"limit":50}),
    );
    assert_eq!(
        child["groups"],
        json!([{"path":"/Work/Nested","entry_count":1}])
    );
    let scoped = call(
        &mut router,
        "passmanager:entry:page",
        json!({"group_path":"/Work","query":"side","offset":0,"limit":50}),
    );
    assert_eq!(scoped["entries"].as_array().unwrap().len(), 1);
    assert_eq!(scoped["entries"][0]["id"], "inside");
    call(
        &mut router,
        "passmanager:group:rename",
        json!({"path":"/Work","name":"Работа"}),
    );
    let detail = call(
        &mut router,
        "passmanager:entry:detail",
        json!({"entry_id":"inside"}),
    );
    assert_eq!(detail["group_path"], "/Работа/Nested");
    assert_eq!(
        call(
            &mut router,
            "passmanager:secret:read",
            json!({"entry_id":"inside","secret_type":"password"})
        )["value"],
        "synthetic secret"
    );
    let exported = call(&mut router, "passmanager:root:export", json!({}));
    assert!(exported.to_string().contains("Retained description"));
    assert!(!exported.to_string().contains("/Work/Nested"));
    call(
        &mut router,
        "passmanager:group:delete",
        json!({"path":"/Работа"}),
    );
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:detail",
            json!({"entry_id":"inside"}),
        )),
        "NODE_NOT_FOUND",
    );
    assert_eq!(
        call(
            &mut router,
            "passmanager:entry:detail",
            json!({"entry_id":"outside"})
        )["group_path"],
        "/Workplace"
    );
}

#[test]
fn group_rename_rejects_root_entry_invalid_and_conflicting_targets_without_changes() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "groups"));
    call(
        &mut router,
        "passmanager:group:ensure",
        json!({"path":"/Work"}),
    );
    call(
        &mut router,
        "passmanager:group:ensure",
        json!({"path":"/Taken"}),
    );
    call(
        &mut router,
        "passmanager:entry:create",
        json!({"entry_id":"entry","title":"Login","group_path":"/Work"}),
    );
    for data in [
        json!({"path":"/","name":"Root"}),
        json!({"path":"/Work/Login","name":"Other"}),
        json!({"path":"/Work","name":"../Escape"}),
        json!({"path":"/Work","name":".hidden"}),
        json!({"path":"/Work","name":"Taken"}),
    ] {
        let result = router.handle(&RpcRequest::new("passmanager:group:rename", data));
        assert!(!result.is_ok());
    }
    assert_eq!(
        call(
            &mut router,
            "passmanager:entry:detail",
            json!({"entry_id":"entry"})
        )["group_path"],
        "/Work"
    );
    for parent in ["/Missing", "/Work/Login", "/.icons"] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                "passmanager:group:page",
                json!({"parent":parent,"offset":0,"limit":50}),
            )),
            "NODE_NOT_FOUND",
        );
    }
    call(&mut router, "vault:lock", json!({}));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:group:rename",
            json!({"path":"/Work","name":"Later"}),
        )),
        "VAULT_REQUIRED",
    );
}
