use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};

use super::support::*;

fn audit_artifact() -> serde_json::Value {
    serde_json::json!({
        "version": 1,
        "algorithmVersion": 1,
        "revision": "catalog-revision-1",
        "generatedAt": 1_720_000_000_000_u64,
        "entries": {
            "login-1": {
                "entryId": "login-1",
                "weakPassword": true,
                "reusedPassword": false,
                "hasTwoFactor": true,
                "strengthScore": 1
            },
            "card-1": {
                "entryId": "card-1",
                "weakPassword": false,
                "reusedPassword": false,
                "hasTwoFactor": false,
                "strengthScore": null
            }
        },
        "failedEntryIds": ["login-2"]
    })
}

fn set_artifact(router: &mut RpcRouter, artifact: serde_json::Value) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "passmanager:securityAudit:set",
        serde_json::json!({"artifact": artifact}),
    ))
}

fn get_artifact(router: &mut RpcRouter) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "passmanager:securityAudit:get",
        serde_json::json!({}),
    ))
}

fn json_response(reply: RpcReply) -> RpcResponse {
    match reply {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => panic!("expected JSON response"),
    }
}

#[test]
fn test_passmanager_security_audit_missing_get_returns_null() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let response = get_artifact(&mut router);
    assert_rpc_ok(&response);
    assert_eq!(
        response.result().and_then(|result| result.get("artifact")),
        Some(&serde_json::Value::Null)
    );
}

#[test]
fn test_passmanager_security_audit_set_get_survives_reopen_and_stays_hidden() {
    let (mut router, tmp, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let artifact = audit_artifact();
    let set_response = json_response(router.handle_with_stream(
        &RpcRequest::new(
            "passmanager:securityAudit:set",
            serde_json::json!({"artifact": artifact.clone()}),
        ),
        None,
    ));
    assert_rpc_ok(&set_response);

    let groups = router.handle(&RpcRequest::new(
        "passmanager:group:list",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&groups);
    assert!(
        get_groups(&groups)
            .iter()
            .all(|group| !group.contains(".security-audit")),
        "hidden security audit directory must not be exposed as a group"
    );

    drop(router);
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).expect("storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));

    let response = json_response(reopened.handle_with_stream(
        &RpcRequest::new("passmanager:securityAudit:get", serde_json::json!({})),
        None,
    ));
    assert_rpc_ok(&response);
    assert_eq!(
        response.result().and_then(|result| result.get("artifact")),
        Some(&artifact)
    );
}

#[test]
fn test_passmanager_security_audit_malformed_stored_json_returns_null() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    assert_rpc_ok(&set_artifact(&mut router, audit_artifact()));

    let malformed = b"{not-valid-json".to_vec();
    set_bypass_system_shard_guards(true);
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/.passmanager/.security-audit",
                "name": "index.json",
                "total_size": malformed.len() as u64,
                "size": malformed.len() as u64,
                "offset": 0,
                "mime_type": "application/json"
            }),
        ),
        Some(RpcInputStream::from_bytes(malformed)),
    );
    set_bypass_system_shard_guards(false);
    let overwrite = match reply {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON")
        }
    };
    assert_rpc_ok(&overwrite);

    let response = get_artifact(&mut router);
    assert_rpc_ok(&response);
    assert_eq!(
        response.result().and_then(|result| result.get("artifact")),
        Some(&serde_json::Value::Null)
    );
}

#[test]
fn test_passmanager_security_audit_rejects_invalid_artifact_contracts() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let mut invalid_artifacts = Vec::new();

    let mut artifact = audit_artifact();
    artifact["version"] = serde_json::json!(2);
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["algorithmVersion"] = serde_json::json!(2);
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["revision"] = serde_json::json!("");
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["generatedAt"] = serde_json::json!(9_007_199_254_740_992_u64);
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["entries"]["login-1"]["strengthScore"] = serde_json::json!(5);
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["entries"]["login-1"]["entryId"] = serde_json::json!("other-entry");
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["entries"]["login-1"]["weakPassword"] = serde_json::json!(false);
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["failedEntryIds"] = serde_json::json!(["login-2", "login-2"]);
    invalid_artifacts.push(artifact);

    let mut artifact = audit_artifact();
    artifact["entries"]["login-1"]
        .as_object_mut()
        .expect("summary")
        .remove("strengthScore");
    invalid_artifacts.push(artifact);

    for artifact in invalid_artifacts {
        assert_rpc_error(&set_artifact(&mut router, artifact), "EMPTY_PAYLOAD");
    }

    let response = get_artifact(&mut router);
    assert_rpc_ok(&response);
    assert_eq!(
        response.result().and_then(|result| result.get("artifact")),
        Some(&serde_json::Value::Null),
        "invalid requests must not create an audit artifact"
    );
}

#[test]
fn test_passmanager_security_audit_rejects_secret_bearing_and_unknown_fields() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    for field in [
        "password",
        "hash",
        "passwordHash",
        "passwordFingerprint",
        "fingerprint",
        "unexpected",
    ] {
        let mut root_artifact = audit_artifact();
        root_artifact
            .as_object_mut()
            .expect("artifact")
            .insert(field.to_string(), serde_json::json!("secret-value"));
        assert_rpc_error(&set_artifact(&mut router, root_artifact), "EMPTY_PAYLOAD");

        let mut summary_artifact = audit_artifact();
        summary_artifact["entries"]["login-1"]
            .as_object_mut()
            .expect("summary")
            .insert(field.to_string(), serde_json::json!("secret-value"));
        assert_rpc_error(
            &set_artifact(&mut router, summary_artifact),
            "EMPTY_PAYLOAD",
        );
    }

    let wrapper_field = router.handle(&RpcRequest::new(
        "passmanager:securityAudit:set",
        serde_json::json!({"artifact": audit_artifact(), "password": "secret-value"}),
    ));
    assert_rpc_error(&wrapper_field, "EMPTY_PAYLOAD");

    let response = get_artifact(&mut router);
    assert_rpc_ok(&response);
    assert_eq!(
        response.result().and_then(|result| result.get("artifact")),
        Some(&serde_json::Value::Null),
        "rejected secret-bearing requests must not be persisted"
    );
}
