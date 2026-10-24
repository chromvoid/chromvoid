use serde::Serialize;

pub(super) use crate::rpc::types::PassmanagerEntrySaveResponse as EntrySaveResult;

#[derive(Serialize)]
pub(super) struct EntryReadResult {
    pub(super) entry: serde_json::Value,
}

impl EntryReadResult {
    pub(super) fn new(entry: serde_json::Value) -> Self {
        Self { entry }
    }
}

pub(super) use crate::rpc::types::PassmanagerEntryListResponse as EntryListResult;
