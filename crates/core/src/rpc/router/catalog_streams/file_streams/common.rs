use std::time::{SystemTime, UNIX_EPOCH};

use crate::catalog::CatalogMediaInfo;
use crate::rpc::commands::{normalize_path, shard_id_from_path, shard_relative_path};

pub(super) fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(super) fn next_source_revision(previous: u64, now: u64) -> u64 {
    now.max(previous.saturating_add(1)).max(1)
}

pub(super) fn record_source_revision_delta(
    session: &mut crate::vault::VaultSession,
    node_id: u64,
    path: &str,
    modtime: u64,
    source_revision: u64,
    media_info: Option<Option<CatalogMediaInfo>>,
    media_inspected_revision: Option<u64>,
) {
    let normalized = normalize_path(path);
    let Some(shard_id) = shard_id_from_path(&normalized) else {
        return;
    };
    let Some(rel_path) = shard_relative_path(&shard_id, &normalized) else {
        return;
    };
    let mut fields = crate::catalog::PartialNode::default();
    fields.modtime = Some(modtime);
    fields.source_revision = Some(source_revision);
    fields.media_info = media_info;
    fields.media_inspected_revision = media_inspected_revision;
    session.record_delta(
        &shard_id,
        crate::catalog::DeltaEntry::update(0, rel_path, fields).with_node_id(node_id),
    );
}
