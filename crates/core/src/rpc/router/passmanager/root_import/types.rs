use super::super::{group, tags};
use crate::catalog::CatalogManager;
use serde_json::Value;
use std::collections::BTreeMap;

pub(super) struct RootImportPayload<'a> {
    pub(super) folders: &'a [Value],
    pub(super) entries: &'a [Value],
    pub(super) ssh_keys: &'a [Value],
    pub(super) icons: &'a [Value],
    pub(super) imported_tags: Vec<String>,
    pub(super) imported_tag_meta: tags::TagCatalogMeta,
    pub(super) imported_group_meta: BTreeMap<String, group::GroupMetaValue>,
    pub(super) should_clear_existing: bool,
}

pub(super) struct PlannedChunk {
    pub(super) name: String,
    pub(super) encrypted: Vec<u8>,
}

pub(super) struct RootImportPlan {
    pub(super) created_entry_count: usize,
    pub(super) updated_entry_count: usize,
    pub(super) imported_ssh_key_count: usize,
    pub(super) catalog: CatalogManager,
    pub(super) chunks: Vec<PlannedChunk>,
    pub(super) legacy_ssh_cleanup_node_ids: Vec<u64>,
}
