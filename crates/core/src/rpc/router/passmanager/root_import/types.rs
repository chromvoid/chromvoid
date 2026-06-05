use super::super::group;
use crate::catalog::CatalogManager;
use serde_json::Value;
use std::collections::BTreeMap;

pub(super) struct RootImportPayload<'a> {
    pub(super) folders: &'a [Value],
    pub(super) entries: &'a [Value],
    pub(super) imported_tags: Vec<String>,
    pub(super) imported_group_meta: BTreeMap<String, group::GroupMetaValue>,
    pub(super) should_clear_existing: bool,
}

pub(super) struct PlannedChunk {
    pub(super) name: String,
    pub(super) encrypted: Vec<u8>,
}

pub(super) struct RootImportPlan {
    pub(super) catalog: CatalogManager,
    pub(super) chunks: Vec<PlannedChunk>,
}
