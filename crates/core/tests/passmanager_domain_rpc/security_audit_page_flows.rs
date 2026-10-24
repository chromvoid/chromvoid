use super::support::*;
use chromvoid_core::rpc::{commands::set_bypass_system_shard_guards, RpcInputStream, RpcReply};
use serde_json::{json, Value};

fn page(router: &mut RpcRouter, data: Value) -> Value {
    let response = router.handle(&RpcRequest::new("passmanager:securityAudit:page", data));
    assert_rpc_ok(&response);
    response.result().unwrap().clone()
}

#[test]
fn audit_pages_match_v1_oracle_and_find_reuse_across_groups_before_filtering() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "audit-fixture"));
    let cases: Value = serde_json::from_str(include_str!(
        "../../../../packages/passmanager/src/service/__tests__/credential-audit-v1-cases.json"
    ))
    .unwrap();
    for entry in cases["entries"].as_array().unwrap() {
        let mut request = json!({"entry_id":entry["id"],"title":entry["id"],"entry_type":entry["entryType"],"group_path":format!("/Group/{}", entry["id"].as_str().unwrap()),"username":"alice","otps":if entry["otpCount"] == 1 { json!([{"id":"otp","type":"totp"}]) } else { json!([]) }});
        if entry["entryType"] == "payment_card" {
            request["payment_card"] = json!({"cardholder_name":"Synthetic", "exp_month":12,"exp_year":2030,"brand":"visa"});
            request["secrets"] = json!({"card_pan":"4111111111111111"});
        } else if entry.get("password").is_some() {
            request["secrets"] = json!({"password":entry["password"]});
        }
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", request)));
    }
    let first = page(&mut router, json!({"offset":0,"limit":2}));
    let revision = first["revision"].clone();
    let mut summaries = Vec::new();
    let mut next = Some(0);
    while let Some(offset) = next {
        let result = page(
            &mut router,
            json!({"offset":offset,"limit":2,"revision":revision}),
        );
        assert_eq!(result["algorithm_version"], 1);
        assert_eq!(result["total_count"], 14);
        assert_eq!(result["failed_count"], 0);
        assert_eq!(result["weak_password_count"], cases["counts"]["weak"]);
        assert_eq!(result["reused_password_count"], cases["counts"]["reused"]);
        assert_eq!(result["two_factor_count"], cases["counts"]["otp"]);
        for row in result["entries"].as_array().unwrap() {
            assert_eq!(row.as_object().unwrap().len(), 2);
            let id = row["credential"]["id"].as_str().unwrap();
            assert_eq!(
                row["credential"],
                json!({"id":id,"title":id,"username":if id=="card" {""} else {"alice"},"entry_type":if id=="card" {"payment_card"} else {"login"},"group_path":format!("/Group/{id}")})
            );
            summaries.push(row["audit"].clone());
        }
        next = result["next_offset"].as_u64();
    }
    let mut expected = cases["expected"].as_array().unwrap().clone();
    let sort = |a: &Value, b: &Value| a["entryId"].as_str().cmp(&b["entryId"].as_str());
    summaries.sort_by(sort);
    expected.sort_by(sort);
    assert_eq!(summaries, expected);
    for (issue, expected_ids) in [
        ("reused", vec!["weak", "weak-copy"]),
        (
            "weak",
            vec!["case", "cyrillic", "score1", "spaced", "weak", "weak-copy"],
        ),
        ("failed", vec![]),
        (
            "without_otp",
            vec![
                "case", "cyrillic", "empty", "missing", "mixed", "score1", "score2", "score3",
                "spaced", "strong", "unicode", "weak",
            ],
        ),
    ] {
        let result = page(&mut router, json!({"offset":0,"limit":100,"issue":issue}));
        let mut ids: Vec<_> = result["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["credential"]["id"].as_str().unwrap())
            .collect();
        ids.sort();
        assert_eq!(ids, expected_ids, "{issue}");
        assert_eq!(result["total_count"], 14);
    }
    assert_eq!(
        router
            .handle(&RpcRequest::new("passmanager:securityAudit:get", json!({})))
            .result()
            .unwrap()["artifact"],
        Value::Null
    );
    // Secret-only edits do not update entry metadata timestamps. They must invalidate pages.
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        json!({"entry_id":"weak-copy","secret_type":"password","value":"Changed!Synthetic!2026"}),
    )));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:securityAudit:page",
            json!({"offset":2,"limit":2,"revision":revision}),
        )),
        "SYNC_CONFLICT",
    );
    assert_eq!(
        page(&mut router, json!({"offset":0,"limit":100}))["reused_password_count"],
        0
    );
}

#[test]
fn audit_distinguishes_unreadable_password_from_absent_and_rechecks_after_repair() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "audit-fixture"));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({"entry_id":"broken","title":"Broken","secrets":{"password":"abc"}}),
    )));
    let before = page(&mut router, json!({"offset":0,"limit":100}));
    set_bypass_system_shard_guards(true);
    let reply = router.handle_with_stream(&RpcRequest::new("catalog:upload",json!({"parent_path":"/.passmanager/Broken","name":".password","total_size":1,"size":1,"offset":0,"mime_type":"text/plain"})), Some(RpcInputStream::from_bytes(vec![255])));
    set_bypass_system_shard_guards(false);
    match reply {
        RpcReply::Json(response) => assert_rpc_ok(&response),
        _ => panic!("Expected JSON"),
    }
    let result = page(
        &mut router,
        json!({"offset":0,"limit":100,"issue":"failed"}),
    );
    assert_eq!(result["failed_count"], 1);
    assert_eq!(result["weak_password_count"], 0);
    assert_eq!(
        result["entries"],
        json!([{"credential":{"id":"broken","title":"Broken","username":"","entry_type":"login","group_path":"/"},"audit":null}])
    );
    assert_ne!(result["revision"], before["revision"]);
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:secret:save",
        json!({"entry_id":"broken","secret_type":"password","value":"abc"}),
    )));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:securityAudit:page",
            json!({"offset":1,"limit":100,"revision":result["revision"]}),
        )),
        "SYNC_CONFLICT",
    );
    assert_eq!(
        page(&mut router, json!({"offset":0,"limit":100}))["failed_count"],
        0
    );
}

#[test]
fn audit_requires_session_valid_options_and_reports_empty_vault_without_writes() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:securityAudit:page",
            json!({"offset":0,"limit":10}),
        )),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "audit-fixture"));
    for data in [
        json!({"offset":0,"limit":0}),
        json!({"offset":0,"limit":101}),
        json!({"offset":1,"limit":10}),
        json!({"offset":0,"limit":10,"issue":"password"}),
        json!({"offset":0,"limit":10,"revision":"bad"}),
        json!({"offset":0,"limit":10,"secret":"forbidden"}),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:securityAudit:page", data)),
            "EMPTY_PAYLOAD",
        );
    }
    let result = page(&mut router, json!({"offset":0,"limit":10}));
    assert_eq!(result["entries"], json!([]));
    assert_eq!(result["total_count"], 0);
    assert_eq!(result["failed_count"], 0);
    assert_eq!(result["next_offset"], Value::Null);
    let streamed = router.handle_with_stream(
        &RpcRequest::new(
            "passmanager:securityAudit:page",
            json!({"offset":0,"limit":10}),
        ),
        None,
    );
    match streamed {
        RpcReply::Json(response) => {
            assert_rpc_ok(&response);
            assert_eq!(response.result().unwrap(), &result);
        }
        _ => panic!("Expected JSON"),
    }
    assert_rpc_ok(&router.handle(&RpcRequest::new("vault:lock", json!({}))));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:securityAudit:page",
            json!({"offset":0,"limit":10}),
        )),
        "VAULT_REQUIRED",
    );
}
