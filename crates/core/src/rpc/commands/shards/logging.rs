use serde_json::Value;
use tracing::info;

use crate::rpc::types::{
    CatalogSyncManifestResponse, ListShardsResponse, LoadShardResponse,
    CATALOG_FOLDER_BATCH_MAX_ITEMS, CATALOG_FOLDER_BATCH_MAX_PAGES,
    CATALOG_FOLDER_BATCH_SOFT_BYTES, CATALOG_FOLDER_PAGE_DEFAULT_ITEMS,
    CATALOG_FOLDER_PAGE_MAX_ITEMS, CATALOG_MANIFEST_BUDGET_BYTES,
};

fn count_compact_catalog_nodes(value: &Value) -> usize {
    let Some(object) = value.as_object() else {
        return 0;
    };
    let children = object
        .get("c")
        .and_then(|children| children.as_array())
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    1 + children
        .iter()
        .map(count_compact_catalog_nodes)
        .sum::<usize>()
}

pub(super) fn log_shard_list_payload(response: &ListShardsResponse) {
    let payload_bytes = serde_json::to_vec(response)
        .map(|bytes| bytes.len())
        .unwrap_or(0);
    let loaded_shard_count = response.shards.iter().filter(|shard| shard.loaded).count();
    info!(
        "perf:catalog_sync event=payload command=catalog:shard:list payload_bytes={} shard_count={} loaded_shard_count={} manifest_budget_bytes={} folder_page_default_items={} folder_page_max_items={} batch_max_pages={} batch_max_items={} batch_soft_bytes={}",
        payload_bytes,
        response.shards.len(),
        loaded_shard_count,
        CATALOG_MANIFEST_BUDGET_BYTES,
        CATALOG_FOLDER_PAGE_DEFAULT_ITEMS,
        CATALOG_FOLDER_PAGE_MAX_ITEMS,
        CATALOG_FOLDER_BATCH_MAX_PAGES,
        CATALOG_FOLDER_BATCH_MAX_ITEMS,
        CATALOG_FOLDER_BATCH_SOFT_BYTES
    );
}

pub(super) fn log_shard_load_payload(response: &LoadShardResponse) {
    let payload_bytes = serde_json::to_vec(response)
        .map(|bytes| bytes.len())
        .unwrap_or(0);
    let node_count = count_compact_catalog_nodes(&response.root);
    info!(
        "perf:catalog_sync event=payload command=catalog:shard:load shard_id={} payload_bytes={} node_count={} shard_version={}",
        response.shard_id, payload_bytes, node_count, response.version
    );
}

pub(super) fn log_manifest_payload(response: &CatalogSyncManifestResponse) {
    let payload_bytes = serde_json::to_vec(response)
        .map(|bytes| bytes.len())
        .unwrap_or(0);
    let loaded_shard_count = response.shards.iter().filter(|shard| shard.loaded).count();
    info!(
        "perf:catalog_sync event=payload command=catalog:sync:manifest payload_bytes={} shard_count={} loaded_shard_count={} root_summary_count={} manifest_budget_bytes={}",
        payload_bytes,
        response.shards.len(),
        loaded_shard_count,
        response.root_summaries.len(),
        response.manifest_budget_bytes
    );
}
