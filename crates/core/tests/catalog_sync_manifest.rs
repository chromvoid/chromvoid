//! Regression tests for catalog:sync:manifest.

mod test_helpers;

use chromvoid_core::catalog::RootIndex;
use chromvoid_core::crypto::{decrypt, encrypt, root_index_chunk_name};
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::storage::Storage;
use test_helpers::*;

fn read_root_index(storage: &Storage, vault_key: &[u8; 32]) -> RootIndex {
    let root_name = root_index_chunk_name(vault_key, 0);
    let encrypted = storage
        .read_chunk(&root_name)
        .expect("read root index chunk");
    let plaintext =
        decrypt(&encrypted, vault_key, root_name.as_bytes()).expect("decrypt root index chunk");
    serde_json::from_slice::<RootIndex>(&plaintext).expect("root index json")
}

fn write_root_index(storage: &Storage, vault_key: &[u8; 32], root_index: &RootIndex) {
    let root_name = root_index_chunk_name(vault_key, 0);
    let plaintext = serde_json::to_vec(root_index).expect("root index serialize");
    let encrypted =
        encrypt(&plaintext, vault_key, root_name.as_bytes()).expect("encrypt root index chunk");
    storage
        .write_chunk(&root_name, &encrypted)
        .expect("write root index chunk");
}

fn write_corrupt_root_index(storage: &Storage, vault_key: &[u8; 32]) {
    let root_name = root_index_chunk_name(vault_key, 0);
    let encrypted =
        encrypt(b"not-json", vault_key, root_name.as_bytes()).expect("encrypt root index chunk");
    storage
        .write_chunk(&root_name, &encrypted)
        .expect("write corrupt root index chunk");
}

#[test]
fn catalog_sync_manifest_returns_bounded_root_summaries() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test_password");

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    assert_rpc_ok(&create_dir_at(&mut router, "/docs", "nested"));
    assert_rpc_ok(&create_dir(&mut router, "media"));
    router.save().expect("save");

    let response = router.handle(&RpcRequest::new(
        "catalog:sync:manifest",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&response);

    let result = response.result().expect("manifest result");
    assert_eq!(
        result.get("format").and_then(|value| value.as_str()),
        Some("manifest")
    );
    assert!(
        result
            .get("manifest_budget_bytes")
            .and_then(|value| value.as_u64())
            .is_some(),
        "manifest must expose its payload budget"
    );

    let summaries = result
        .get("root_summaries")
        .and_then(|value| value.as_array())
        .expect("root_summaries array");
    let docs = summaries
        .iter()
        .find(|node| node.get("n").and_then(|value| value.as_str()) == Some("docs"))
        .expect("docs summary");
    assert_eq!(docs.get("h").and_then(|value| value.as_bool()), Some(true));
    assert!(
        docs.get("c").is_none(),
        "manifest root summaries must not include descendants"
    );
    assert!(
        !summaries
            .iter()
            .any(|node| node.get("n").and_then(|value| value.as_str()) == Some(".passmanager")),
        "system shards stay hidden"
    );

    let shards = result
        .get("shards")
        .and_then(|value| value.as_array())
        .expect("shards array");
    assert!(shards
        .iter()
        .any(|shard| { shard.get("shard_id").and_then(|value| value.as_str()) == Some("docs") }));
}

#[test]
fn catalog_sync_manifest_does_not_drop_session_roots_when_index_summaries_are_partial() {
    let (mut router, temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test_password"));

    assert_rpc_ok(&create_dir(&mut router, "Work"));
    assert_rpc_ok(&create_dir_at(&mut router, "/Work", "docs"));
    assert_rpc_ok(&create_dir(&mut router, "Personal"));
    assert_rpc_ok(&create_dir_at(&mut router, "/Personal", "notes"));
    router.save().expect("save");

    let vault_key = *router.session().expect("session").vault_key();
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut root_index = read_root_index(&storage, &vault_key);
    assert!(
        root_index
            .get_shard("Work")
            .and_then(|meta| meta.root_summary.as_ref())
            .is_some(),
        "save should publish at least one root summary"
    );
    root_index
        .get_shard_mut("Personal")
        .expect("Personal shard meta")
        .root_summary = None;
    write_root_index(&storage, &vault_key, &root_index);

    let response = router.handle(&RpcRequest::new(
        "catalog:sync:manifest",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&response);

    let summaries = response
        .result()
        .and_then(|result| result.get("root_summaries"))
        .and_then(|value| value.as_array())
        .expect("root summaries");
    let names = summaries
        .iter()
        .filter_map(|node| node.get("n").and_then(|value| value.as_str()))
        .collect::<Vec<_>>();
    assert!(
        names.contains(&"Work") && names.contains(&"Personal"),
        "manifest must reflect the loaded session root, not only shards with index summaries: {names:?}"
    );

    let personal = summaries
        .iter()
        .find(|node| node.get("n").and_then(|value| value.as_str()) == Some("Personal"))
        .expect("Personal summary");
    assert_eq!(
        personal.get("h").and_then(|value| value.as_bool()),
        Some(true)
    );
    assert!(
        personal.get("c").is_none(),
        "manifest root summaries must stay compact"
    );
}

#[test]
fn shard_rpc_reports_corrupt_root_index_as_internal_error() {
    let (mut router, temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test_password"));

    assert_rpc_ok(&create_dir(&mut router, "docs"));
    router.save().expect("save");

    let vault_key = *router.session().expect("session").vault_key();
    let storage = Storage::new(temp_dir.path()).expect("storage");
    write_corrupt_root_index(&storage, &vault_key);

    let manifest = router.handle(&RpcRequest::new(
        "catalog:sync:manifest",
        serde_json::json!({}),
    ));
    assert_rpc_error(&manifest, "INTERNAL_ERROR");

    let shard_list = router.handle(&RpcRequest::new(
        "catalog:shard:list",
        serde_json::json!({}),
    ));
    assert_rpc_error(&shard_list, "INTERNAL_ERROR");

    let shard_sync = router.handle(&RpcRequest::new(
        "catalog:sync:shard",
        serde_json::json!({
            "shard_id": "docs",
            "from_version": 0
        }),
    ));
    assert_rpc_error(&shard_sync, "INTERNAL_ERROR");
}
