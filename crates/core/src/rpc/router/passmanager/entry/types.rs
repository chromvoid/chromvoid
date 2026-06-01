use serde::Serialize;

#[derive(Serialize)]
pub(super) struct EntrySaveResult {
    pub(super) entry_id: String,
}

impl EntrySaveResult {
    pub(super) fn new(entry_id: String) -> Self {
        Self { entry_id }
    }
}

#[derive(Serialize)]
pub(super) struct EntryReadResult {
    pub(super) entry: serde_json::Value,
}

impl EntryReadResult {
    pub(super) fn new(entry: serde_json::Value) -> Self {
        Self { entry }
    }
}

#[derive(Serialize)]
pub(super) struct EntryListResult {
    pub(super) entries: Vec<serde_json::Value>,
    pub(super) folders: Vec<String>,
}

impl EntryListResult {
    pub(super) fn new(entries: Vec<serde_json::Value>, folders: Vec<String>) -> Self {
        Self { entries, folders }
    }
}
