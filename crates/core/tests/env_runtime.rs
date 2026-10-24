mod test_helpers;

use std::collections::BTreeMap;

use chromvoid_core::env_runtime::{
    AgentProfileMetadataV1, AgentSecretMetadataV1, EnvRuntimeErrorCode,
    PrivateSpawnResolutionRequestV1,
};
use chromvoid_core::rpc::types::{
    EnvSecretRevealResponse, RpcCommand, RpcCommandResult, RpcRequest, RpcResponse,
};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use test_helpers::*;

const MASTER_PASSWORD: &str = "correct horse battery staple";
const VAULT_PASSWORD: &str = "env-runtime-vault-password";

fn setup_env_router() -> (RpcRouter, tempfile::TempDir) {
    let (mut router, temp) = create_test_router();
    setup_master_and_unlock(&mut router);
    (router, temp)
}

fn setup_master_and_unlock(router: &mut RpcRouter) {
    assert_rpc_ok(&rpc(
        router,
        "master:setup",
        json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&unlock_vault(router, VAULT_PASSWORD));
}

fn rpc(router: &mut RpcRouter, command: &str, data: Value) -> RpcResponse {
    router.handle(&RpcRequest::new(command, data))
}

fn decode_result<T: DeserializeOwned>(response: &RpcResponse) -> T {
    assert_rpc_ok(response);
    serde_json::from_value(response.result().expect("RPC result").clone())
        .expect("typed RPC result")
}

fn create_secret(router: &mut RpcRouter, label: &str, value: &str) -> AgentSecretMetadataV1 {
    let response = rpc(
        router,
        "env_runtime:secret:create",
        json!({"label": label, "value": value}),
    );
    assert!(
        response
            .result()
            .is_some_and(|result| result.get("value").is_none()),
        "secret create response must be metadata-only"
    );
    decode_result(&response)
}

fn create_profile(router: &mut RpcRouter, slug: &str, variables: Value) -> AgentProfileMetadataV1 {
    decode_result(&rpc(
        router,
        "env_runtime:profile:create",
        json!({
            "slug": slug,
            "label": "Development",
            "description": "Local development environment",
            "variables": variables,
        }),
    ))
}

/// `env_runtime:status` reports vault state and counts only; module access is
/// decided outside Core.
fn assert_status_fields(status: &RpcResponse) {
    let fields = status
        .result()
        .and_then(Value::as_object)
        .map(|object| object.keys().map(String::as_str).collect::<Vec<_>>())
        .expect("env_runtime:status result object");
    assert_eq!(
        fields,
        vec!["profile_count", "secret_count", "vault_unlocked"]
    );
}

#[test]
fn env_runtime_crud_references_revisions_and_private_resolution() {
    let (mut router, _temp) = setup_env_router();

    let status = rpc(&mut router, "env_runtime:status", json!({}));
    assert_eq!(
        status.result().and_then(|v| v.get("vault_unlocked")),
        Some(&json!(true))
    );
    assert_status_fields(&status);
    assert_eq!(
        status.result().and_then(|v| v.get("secret_count")),
        Some(&json!(0))
    );

    let first = create_secret(&mut router, "Primary token", "primary-secret");
    let second = create_secret(&mut router, "Secondary token", "secondary-secret");
    assert_eq!(first.revision, 1);
    assert_eq!(second.revision, 1);

    let secrets = rpc(&mut router, "env_runtime:secret:list", json!({}));
    let listed: Vec<AgentSecretMetadataV1> = decode_result(&secrets);
    assert_eq!(listed.len(), 2);
    assert!(secrets
        .result()
        .expect("secret list")
        .as_array()
        .expect("array")
        .iter()
        .all(|item| item.get("value").is_none()));

    let missing_ref = rpc(
        &mut router,
        "env_runtime:profile:create",
        json!({
            "slug": "missing-ref",
            "label": "Missing",
            "variables": [{"name": "TOKEN", "secret_id": "envsec_missing"}],
        }),
    );
    assert_rpc_error(&missing_ref, "ENV_RUNTIME_VALIDATION_FAILED");

    let profile = create_profile(
        &mut router,
        "local_dev",
        json!([
            {"name": "API_TOKEN", "secret_id": first.id},
            {"name": "SECOND_TOKEN", "secret_id": second.id},
        ]),
    );
    assert_eq!(profile.revision, 1);
    assert_eq!(profile.slug, "local_dev");

    let listed_profiles: Vec<AgentProfileMetadataV1> =
        decode_result(&rpc(&mut router, "env_runtime:profile:list", json!({})));
    assert_eq!(listed_profiles, vec![profile.clone()]);
    let fetched_profile: AgentProfileMetadataV1 = decode_result(&rpc(
        &mut router,
        "env_runtime:profile:get",
        json!({"profile": profile.slug}),
    ));
    assert_eq!(fetched_profile, profile);

    let listed: Vec<AgentSecretMetadataV1> =
        decode_result(&rpc(&mut router, "env_runtime:secret:list", json!({})));
    assert!(listed.iter().all(|secret| secret.usage_count == 1));

    let lease = router
        .resolve_for_tauri_spawn(PrivateSpawnResolutionRequestV1 {
            profile_id: profile.id.clone(),
            expected_profile_revision: profile.revision,
        })
        .expect("private spawn resolution");
    let resolved = lease.iter().collect::<BTreeMap<_, _>>();
    assert_eq!(resolved.get("API_TOKEN"), Some(&"primary-secret"));
    assert_eq!(resolved.get("SECOND_TOKEN"), Some(&"secondary-secret"));

    let stale_resolution = router.resolve_for_tauri_spawn(PrivateSpawnResolutionRequestV1 {
        profile_id: profile.id.clone(),
        expected_profile_revision: 99,
    });
    let stale_error = match stale_resolution {
        Ok(_) => panic!("stale resolution must fail"),
        Err(error) => error,
    };
    assert_eq!(stale_error.code(), EnvRuntimeErrorCode::RevisionConflict);

    let in_use = rpc(
        &mut router,
        "env_runtime:secret:delete",
        json!({"id": first.id, "base_revision": first.revision}),
    );
    assert_rpc_error(&in_use, "ENV_RUNTIME_SECRET_IN_USE");

    let updated_profile: AgentProfileMetadataV1 = decode_result(&rpc(
        &mut router,
        "env_runtime:profile:update",
        json!({
            "target": profile.slug,
            "base_revision": profile.revision,
            "draft": {
                "slug": "local_dev",
                "label": "Development updated",
                "description": null,
                "variables": [
                    {"name": "API_TOKEN", "secret_id": first.id},
                    {"name": "SECOND_TOKEN", "secret_id": second.id},
                ],
            },
        }),
    ));
    assert_eq!(updated_profile.id, profile.id);
    assert_eq!(updated_profile.revision, 2);

    let stale_profile = rpc(
        &mut router,
        "env_runtime:profile:update",
        json!({
            "target": updated_profile.id,
            "base_revision": 1,
            "draft": {
                "slug": "local_dev",
                "label": "Stale",
                "variables": [{"name": "API_TOKEN", "secret_id": first.id}],
            },
        }),
    );
    assert_rpc_error(&stale_profile, "ENV_RUNTIME_REVISION_CONFLICT");

    assert_rpc_ok(&rpc(
        &mut router,
        "env_runtime:profile:delete",
        json!({"target": updated_profile.id, "base_revision": 2}),
    ));

    let label_only: AgentSecretMetadataV1 = decode_result(&rpc(
        &mut router,
        "env_runtime:secret:update",
        json!({
            "id": first.id,
            "base_revision": 1,
            "label": "Primary renamed",
        }),
    ));
    assert_eq!(label_only.revision, 2);
    let revealed = rpc(
        &mut router,
        "env_runtime:secret:reveal",
        json!({"id": first.id, "master_password": MASTER_PASSWORD}),
    );
    assert_eq!(
        revealed
            .result()
            .and_then(|value| value.get("value"))
            .and_then(Value::as_str),
        Some("primary-secret")
    );

    let replaced: AgentSecretMetadataV1 = decode_result(&rpc(
        &mut router,
        "env_runtime:secret:update",
        json!({
            "id": first.id,
            "base_revision": label_only.revision,
            "value": "replacement-secret",
        }),
    ));
    assert_eq!(replaced.revision, 3);
    let revealed = rpc(
        &mut router,
        "env_runtime:secret:reveal",
        json!({"id": first.id, "master_password": MASTER_PASSWORD}),
    );
    assert_eq!(
        revealed
            .result()
            .and_then(|value| value.get("value"))
            .and_then(Value::as_str),
        Some("replacement-secret")
    );

    let stale_secret = rpc(
        &mut router,
        "env_runtime:secret:delete",
        json!({"id": first.id, "base_revision": 1}),
    );
    assert_rpc_error(&stale_secret, "ENV_RUNTIME_REVISION_CONFLICT");
    assert_rpc_ok(&rpc(
        &mut router,
        "env_runtime:secret:delete",
        json!({"id": first.id, "base_revision": replaced.revision}),
    ));
}

#[test]
fn env_runtime_reveal_uses_fresh_master_reauth_and_rate_limit() {
    let (mut router, _temp) = setup_env_router();
    let secret = create_secret(&mut router, "Reveal token", "never-log-this");

    let wrong = rpc(
        &mut router,
        "env_runtime:secret:reveal",
        json!({"id": secret.id, "master_password": "wrong-1"}),
    );
    assert_rpc_error(&wrong, "ENV_RUNTIME_REAUTH_FAILED");

    let success = rpc(
        &mut router,
        "env_runtime:secret:reveal",
        json!({"id": secret.id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_ok(&success);
    assert_eq!(
        success
            .result()
            .and_then(|value| value.get("value"))
            .and_then(Value::as_str),
        Some("never-log-this")
    );

    for attempt in 0..5 {
        let response = rpc(
            &mut router,
            "env_runtime:secret:reveal",
            json!({"id": secret.id, "master_password": format!("wrong-{attempt}")}),
        );
        assert_rpc_error(&response, "ENV_RUNTIME_REAUTH_FAILED");
        assert!(response
            .error_message()
            .is_none_or(|message| !message.contains("never-log-this")));
    }

    let locked = rpc(
        &mut router,
        "env_runtime:secret:reveal",
        json!({"id": secret.id, "master_password": MASTER_PASSWORD}),
    );
    assert_rpc_error(&locked, "ENV_RUNTIME_REAUTH_LOCKED");
}

#[test]
fn env_runtime_validates_inputs_hides_storage_and_has_no_public_resolver() {
    let (mut router, _temp) = setup_env_router();

    let empty_value = rpc(
        &mut router,
        "env_runtime:secret:create",
        json!({"label": "Empty", "value": ""}),
    );
    assert_rpc_error(&empty_value, "ENV_RUNTIME_VALIDATION_FAILED");

    let long_label = rpc(
        &mut router,
        "env_runtime:secret:create",
        json!({"label": "x".repeat(81), "value": "valid"}),
    );
    assert_rpc_error(&long_label, "ENV_RUNTIME_VALIDATION_FAILED");

    let secret = create_secret(&mut router, "Valid", "valid-value");
    let duplicate_names = rpc(
        &mut router,
        "env_runtime:profile:create",
        json!({
            "slug": "duplicate-names",
            "label": "Duplicate",
            "variables": [
                {"name": "TOKEN", "secret_id": secret.id},
                {"name": "TOKEN", "secret_id": secret.id},
            ],
        }),
    );
    assert_rpc_error(&duplicate_names, "ENV_RUNTIME_VALIDATION_FAILED");

    let invalid_slug = rpc(
        &mut router,
        "env_runtime:profile:create",
        json!({
            "slug": "Invalid Slug",
            "label": "Invalid",
            "variables": [{"name": "TOKEN", "secret_id": secret.id}],
        }),
    );
    assert_rpc_error(&invalid_slug, "ENV_RUNTIME_VALIDATION_FAILED");

    let root = list_dir(&mut router, "/");
    assert_rpc_ok(&root);
    assert!(!get_item_names(&get_items(&root))
        .iter()
        .any(|name| name == ".cv-env-runtime"));
    assert_rpc_error(&list_dir(&mut router, "/.cv-env-runtime"), "ACCESS_DENIED");
    assert_rpc_error(
        &create_dir_at(&mut router, "/.cv-env-runtime", "outside-domain"),
        "ACCESS_DENIED",
    );
    let upload = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            json!({
                "parent_path": "/.cv-env-runtime",
                "name": "leak.txt",
                "total_size": 4,
                "size": 4,
                "offset": 0,
            }),
        ),
        Some(RpcInputStream::from_bytes(b"leak".to_vec())),
    );
    let upload = match upload {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => panic!("unexpected upload stream"),
    };
    assert_rpc_error(&upload, "ACCESS_DENIED");
    let manifest = sync_init(&mut router);
    assert_rpc_ok(&manifest);
    assert!(
        !serde_json::to_string(manifest.result().expect("sync manifest"))
            .expect("manifest JSON")
            .contains(".cv-env-runtime")
    );
    assert!(chromvoid_core::catalog::is_system_path("/.cv-env-runtime"));
    assert!(!chromvoid_core::catalog::is_system_path(
        "/.cv-env-runtime2"
    ));

    for command in ["env_runtime:resolve", "env_runtime:resolve_for_tauri_spawn"] {
        let response = rpc(&mut router, command, json!({"profile_id": "x"}));
        assert_rpc_error(&response, "UNKNOWN_COMMAND");
        let encoded = json!({"command": command, "data": {"profile_id": "x"}});
        assert!(serde_json::from_value::<RpcCommand>(encoded).is_err());
    }

    let typed_create: RpcCommand = serde_json::from_value(json!({
        "command": "env_runtime:secret:create",
        "data": {"label": "Debug hygiene", "value": "raw-debug-secret"},
    }))
    .expect("typed secret create command");
    let debug = format!("{typed_create:?}");
    assert!(!debug.contains("raw-debug-secret"));
    assert!(debug.contains("[redacted]"));

    let typed_reveal = RpcCommandResult::EnvRuntimeSecretReveal(EnvSecretRevealResponse {
        id: "envsec_debug".to_string(),
        value: "raw-reveal-secret".to_string(),
        revealed_at_epoch_ms: 1,
    });
    let debug = format!("{typed_reveal:?}");
    assert!(!debug.contains("raw-reveal-secret"));
    assert!(debug.contains("[redacted]"));
}

#[test]
fn env_runtime_records_persist_and_resolve_without_any_licence() {
    let (mut router, temp, keystore) = create_test_router_with_keystore();
    setup_master_and_unlock(&mut router);
    let secret = create_secret(&mut router, "Persistent", "persistent-value");
    let profile = create_profile(
        &mut router,
        "persistent_profile",
        json!([{"name": "PERSISTENT_TOKEN", "secret_id": secret.id}]),
    );
    drop(router);

    let storage = Storage::new(temp.path()).expect("reopen storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, VAULT_PASSWORD));

    let status = rpc(&mut reopened, "env_runtime:status", json!({}));
    assert_rpc_ok(&status);
    assert_status_fields(&status);
    assert_eq!(
        status.result().and_then(|value| value.get("secret_count")),
        Some(&json!(1))
    );
    assert_eq!(
        status.result().and_then(|value| value.get("profile_count")),
        Some(&json!(1))
    );
    let secrets: Vec<AgentSecretMetadataV1> =
        decode_result(&rpc(&mut reopened, "env_runtime:secret:list", json!({})));
    assert_eq!(secrets.len(), 1);
    assert_eq!(secrets[0].id, secret.id);

    let lease = reopened
        .resolve_for_tauri_spawn(PrivateSpawnResolutionRequestV1 {
            profile_id: profile.id,
            expected_profile_revision: profile.revision,
        })
        .expect("persisted private resolution");
    assert_eq!(
        lease.iter().collect::<Vec<_>>(),
        vec![("PERSISTENT_TOKEN", "persistent-value")]
    );
}

#[test]
fn env_runtime_status_is_truthful_while_locked() {
    let (mut router, _temp) = create_test_router();
    let status = rpc(&mut router, "env_runtime:status", json!({}));
    assert_rpc_ok(&status);
    assert_eq!(
        status
            .result()
            .and_then(|value| value.get("vault_unlocked")),
        Some(&json!(false))
    );
    assert_eq!(
        status.result().and_then(|value| value.get("secret_count")),
        Some(&Value::Null)
    );
}
