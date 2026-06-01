pub(super) use crate::test_helpers::{
    assert_rpc_error, assert_rpc_ok, create_test_router, create_test_router_with_keystore,
    unlock_vault,
};
pub(super) use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
pub(super) use chromvoid_core::rpc::RpcRouter;

pub(super) const PNG_ICON_A_BASE64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEAH+XDSwAAAABJRU5ErkJggg==";
pub(super) const PNG_ICON_B_BASE64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6YhJkAAAAASUVORK5CYII=";
pub(super) const SAMPLE_ENTRY_ICON_REF: &str =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub(super) const SAMPLE_FOLDER_ICON_REF: &str =
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
pub(super) const CREDENTIAL_TAG_NORMALIZATION_CASES: &str = include_str!(
    "../../../../packages/passmanager/src/service/__tests__/credential-tag-normalization-cases.json"
);

pub(super) fn get_node_id(response: &RpcResponse) -> u64 {
    response
        .result()
        .and_then(|r| r.get("node_id"))
        .and_then(|v| v.as_u64())
        .expect("node_id")
}

pub(super) fn get_entries(response: &RpcResponse) -> Vec<serde_json::Value> {
    response
        .result()
        .expect("response should have result")
        .get("entries")
        .expect("result should have entries")
        .as_array()
        .expect("entries should be array")
        .clone()
}

pub(super) fn get_groups(response: &RpcResponse) -> Vec<String> {
    response
        .result()
        .expect("response should have result")
        .get("groups")
        .expect("result should have groups")
        .as_array()
        .expect("groups should be array")
        .iter()
        .filter_map(|v| v.as_str().map(ToString::to_string))
        .collect()
}

pub(super) fn get_root_entry_by_id<'a>(
    response: &'a RpcResponse,
    entry_id: &str,
) -> Option<&'a serde_json::Value> {
    response
        .result()
        .and_then(|r| r.get("root"))
        .and_then(|root| root.get("entries"))
        .and_then(|entries| entries.as_array())
        .and_then(|entries| {
            entries.iter().find(|entry| {
                entry
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|value| value == entry_id)
                    .unwrap_or(false)
            })
        })
}

pub(super) fn entry_tags(entry: &serde_json::Value) -> Vec<String> {
    entry
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|tags| {
            tags.iter()
                .map(|tag| tag.as_str().expect("tag should be string").to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub(super) fn tag_key(label: &str) -> String {
    label
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}
